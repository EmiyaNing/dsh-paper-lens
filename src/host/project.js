/**
 * Project loading and \\input / \\include expansion.
 *
 * The browser gets one virtual source so its line-number view stays simple.
 * Every block is mapped back to its physical file and file-local line, which
 * is what a later SyncTeX pass needs.
 */

import { readFile, readdir, realpath, stat } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { parseLatex } from './parser.js'

const MAX_FILE_BYTES = 2 * 1024 * 1024
const MAX_TOTAL_BYTES = 4 * 1024 * 1024
const MAX_INCLUDE_DEPTH = 4
const MAX_FILES = 80

const INPUT_RE = /^\s*\\(?:input|include)\s*\{([^}]+)\}\s*(?:%.*)?$/

function toPosix(value) {
  return value.split(sep).join('/')
}

function isInside(root, target) {
  const rel = relative(root, target)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

async function readText(file) {
  const info = await stat(file)
  if (!info.isFile()) throw new Error('不是普通文件')
  if (info.size > MAX_FILE_BYTES) throw new Error(`文件超过 ${MAX_FILE_BYTES} 字节`)
  return readFile(file, 'utf8')
}

async function resolveTexFile(root, fromFile, spec) {
  const cleaned = spec.trim().replace(/^"|"$/g, '')
  const candidates = []
  const add = (base, value) => {
    candidates.push(value.endsWith('.tex') ? value : value + '.tex')
    candidates.push(value)
  }
  if (isAbsolute(cleaned)) add(root, cleaned)
  else {
    add(root, join(root, cleaned))
    add(dirname(fromFile), join(dirname(fromFile), cleaned))
  }
  for (const candidate of candidates) {
    try {
      const real = await realpath(candidate)
      if (!isInside(root, real)) continue
      const info = await stat(real)
      if (info.isFile()) return real
    } catch {
      // try the next candidate
    }
  }
  return null
}

/**
 * Expand one physical file into the shared line array. Nested expansions are
 * written in place; each physical file records its own virtual line range.
 */
async function expandFile(root, file, depth, seen, state) {
  if (depth > MAX_INCLUDE_DEPTH) {
    state.warnings.push({ code: 'include-depth', message: `\\input 嵌套超过 ${MAX_INCLUDE_DEPTH} 层，已停止展开。` })
    return
  }
  if (seen.has(file)) {
    state.warnings.push({ code: 'include-cycle', message: `检测到循环 \\input：${toPosix(relative(root, file))}` })
    return
  }
  if (state.ranges.length >= MAX_FILES) {
    state.warnings.push({ code: 'include-count', message: `\\input 文件超过 ${MAX_FILES} 个，其余已跳过。` })
    return
  }
  seen.add(file)

  let text
  try {
    text = await readText(file)
  } catch (error) {
    state.warnings.push({ code: 'read-failed', message: `读取 ${toPosix(relative(root, file))} 失败：${error.message}` })
    seen.delete(file)
    return
  }
  state.budget += text.length
  if (state.budget > MAX_TOTAL_BYTES) {
    state.warnings.push({ code: 'include-size', message: '展开后的源码超过 4 MB，后续内容已跳过。' })
    seen.delete(file)
    return
  }

  const relPath = toPosix(relative(root, file))
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  state.out.push(`% ==== paper-translator: begin ${relPath} ====`)
  const startLine = state.out.length + 1
  for (const [index, line] of lines.entries()) {
    state.locations[state.out.length + 1] = { file: relPath, fileLine: index + 1 }
    const match = INPUT_RE.exec(line)
    if (match && !line.trimStart().startsWith('%')) {
      const target = await resolveTexFile(root, file, match[1])
      if (!target) {
        state.warnings.push({ code: 'include-missing', message: `找不到 \\input{${match[1]}}（来自 ${relPath}）。` })
        state.out.push(line)
        continue
      }
      await expandFile(root, target, depth + 1, seen, state)
      continue
    }
    state.out.push(line)
  }
  const endLine = state.out.length
  state.out.push(`% ==== paper-translator: end ${relPath} ====`)
  state.ranges.push({ path: relPath, startLine, endLine })
  seen.delete(file)
}

export async function listTexFiles(root) {
  const results = []
  const skip = new Set(['.git', 'node_modules', 'build', 'dist', '.dsh'])
  async function walk(dir, depth) {
    if (depth > 3 || results.length >= 80) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || skip.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) await walk(full, depth + 1)
      else if (entry.isFile() && entry.name.endsWith('.tex')) {
        results.push(toPosix(relative(root, full)))
        if (results.length >= 80) return
      }
    }
  }
  await walk(root, 0)
  return results.sort()
}

/**
 * Load a project, expand includes, parse, and map blocks back to files.
 */
export async function loadProject(rootInput, mainFileInput) {
  if (typeof rootInput !== 'string' || !rootInput.trim()) throw new Error('缺少项目目录')
  if (typeof mainFileInput !== 'string' || !mainFileInput.trim()) throw new Error('缺少主 TeX 文件')
  let root = await realpath(resolve(rootInput.trim()))
  let main = isAbsolute(mainFileInput) ? mainFileInput : resolve(root, mainFileInput.trim())
  main = await realpath(main)
  if (!isInside(root, main)) throw new Error('主文件不在项目目录内')
  if (!main.endsWith('.tex')) throw new Error('主文件必须是 .tex')

  const state = { out: [], ranges: [], locations: [], warnings: [], budget: 0 }
  await expandFile(root, main, 0, new Set(), state)
  const virtual = state.out.join('\n')
  const parsed = parseLatex(virtual)

  for (const block of parsed.blocks) {
    Object.assign(block, state.locations[block.line] ?? { file: toPosix(relative(root, main)), fileLine: block.line })
  }

  parsed.warnings = [...state.warnings, ...parsed.warnings]
  parsed.files = state.ranges

  const pdfPath = main.replace(/\.tex$/i, '.pdf')
  let pdf = null
  try {
    const info = await stat(pdfPath)
    pdf = { path: pdfPath, bytes: info.size, mtime: info.mtimeMs }
  } catch {
    pdf = null
  }
  const synctexPath = main.replace(/\.tex$/i, '.synctex.gz')
  let synctex = false
  try {
    synctex = (await stat(synctexPath)).isFile()
  } catch {
    synctex = false
  }

  const titleMatch = /\\title\s*\{([^{}]*)\}/.exec(virtual)
  const title = titleMatch
    ? titleMatch[1].replace(/\\[A-Za-z]+\s*/g, '').replace(/[{}]/g, '').trim().slice(0, 300)
    : ''

  return {
    root,
    title,
    mainFile: toPosix(relative(root, main)),
    mainPath: main,
    source: virtual,
    blocks: parsed.blocks,
    outline: parsed.outline,
    warnings: parsed.warnings,
    stats: parsed.stats,
    mathMacros: parsed.mathMacros ?? {},
    totalLines: parsed.totalLines,
    files: state.ranges,
    texFiles: await listTexFiles(root),
    pdf,
    synctex,
  }
}
