import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dirname, resolve } from 'node:path'
import { stat } from 'node:fs/promises'

const execute = promisify(execFile)

export async function syncLocation(project, query, signal) {
  if (!project.synctex || !project.pdf) return null
  const blocks = project.blocks.filter(block => block.file && block.translatable)
  const block = blocks.find(item => item.id === query.blockId)
  const reverse = !block && Number.isInteger(query.page) && query.page > 0 &&
    [query.x, query.y].every(value => Number.isFinite(value) && value >= 0)
  if (!block && !reverse) return null
  const cwd = dirname(project.mainPath)
  const args = block
    ? ['view', '-i', `${block.fileLine}:0:${resolve(project.root, block.file)}`, '-o', project.pdf.path]
    : ['edit', '-o', `${query.page}:${query.x}:${query.y}:${project.pdf.path}`]
  try {
    const files = block ? [block.file] : [...new Set(blocks.map(item => item.file))]
    const mtimes = await Promise.all(files.map(file => stat(resolve(project.root, file))))
    if (mtimes.some(info => info.mtimeMs > project.pdf.mtime)) return null
    const options = { cwd, signal, timeout: 2200, maxBuffer: 256 * 1024 }
    let stdout
    try {
      ; ({ stdout } = await execute('synctex', args, options))
    } catch (error) {
      if (process.platform !== 'darwin' || error.code !== 'ENOENT') throw error
        ; ({ stdout } = await execute('/Library/TeX/texbin/synctex', args, options))
    }
    if (block) {
      const page = Number(/^Page:(\d+)/m.exec(stdout)?.[1])
      const x = Number(/^x:([\d.-]+)/m.exec(stdout)?.[1])
      const y = Number(/^y:([\d.-]+)/m.exec(stdout)?.[1])
      return page > 0 && Number.isFinite(x) && Number.isFinite(y) ? { page, x, y } : null
    }
    const file = /^Input:(.+)$/m.exec(stdout)?.[1]?.trim()
    const line = Number(/^Line:(\d+)/m.exec(stdout)?.[1])
    if (!file || !line) return null
    const candidates = blocks.filter(item => resolve(project.root, item.file) === resolve(cwd, file))
    const distance = item => Math.max(item.fileLine - line, line - (item.fileLine + item.endLine - item.line), 0)
    candidates.sort((a, b) => distance(a) - distance(b))
    return candidates.length ? { blockId: candidates[0].id } : null
  } catch {
    return null
  }
}
