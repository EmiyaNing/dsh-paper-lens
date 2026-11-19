/**
 * Host HTTP routes. All paths live under /api/paper-translator and are
 * registered through DSH's authenticated connection Fetch registry, so the
 * browser session cookie is required and a non-owner Peer receives 403.
 */

import { readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { readRevisionStore, writeRevisionStore, withRevisionLock } from './revision-store.js'
import { syncLocation } from './synctex.js'
import { join, resolve } from 'node:path'
import { compileProject } from './compile.js'
import { shortHash } from './cache.js'
import { renderMarkdown, writeMarkdown } from './markdown.js'
import { polishChineseToEnglish, polishRawLatex } from './polish.js'
import { analyzeOverview } from './overview.js'
import { analyzeRebuttal } from './rebuttal.js'
import { estimateCost } from './pricing.js'
import { emptyUsage, ProjectSidecar, sidecarPaths } from './sidecar.js'
import { cacheKeyFor, translateBatch, TranslationError } from './translator.js'
import { listTexFiles, loadProject } from './project.js'

const MAX_PROJECTS = 8

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}

function fail(status, code, message, details = {}) {
  return json({ error: { code, message, ...details } }, status)
}

async function readJson(request) {
  const text = await request.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new TranslationError('bad-request', '请求体不是合法 JSON')
  }
}

function projectIdFor(root, mainFile) {
  return shortHash(root + '\u0000' + mainFile).slice(0, 12)
}

function globalUsageView(ledger, cfg) {
  const totals = ledger?.totalsView?.() ?? emptyUsage()
  const usdToCny = Number.isFinite(cfg.pricing?.usdToCny) ? cfg.pricing.usdToCny : 7.2
  return { ...totals, costCny: totals.costUsd * usdToCny, currency: 'USD' }
}

function usageTotals(entry, cfg) {
  const usage = entry.sidecar?.usage ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, calls: 0 }
  const usdToCny = Number.isFinite(cfg.pricing?.usdToCny) ? cfg.pricing.usdToCny : 7.2
  return { ...usage, costCny: usage.costUsd * usdToCny, currency: 'USD' }
}

async function addModelUsage(entry, cfg, usage, ledger) {
  if (!usage) return
  const { costUsd } = estimateCost(usage, cfg)
  entry.sidecar.addUsage(usage, costUsd)
  if (ledger) {
    await ledger.add(entry.id, usage, costUsd)
    await ledger.flush().catch(() => {})
  }
}

function serialize(entry, extra = {}) {
  const data = entry.data
  return {
    projectId: entry.id,
    root: data.root,
    title: data.title ?? '',
    mainFile: data.mainFile,
    source: data.source,
    blocks: data.blocks,
    outline: data.outline,
    mathMacros: data.mathMacros ?? {},
    warnings: data.warnings,
    stats: data.stats,
    totalLines: data.totalLines,
    files: data.files,
    texFiles: data.texFiles,
    pdf: data.pdf ? { exists: true, bytes: data.pdf.bytes, mtime: data.pdf.mtime } : { exists: false },
    synctex: Boolean(data.synctex),
    ...extra,
  }
}

async function maxMtime(files) {
  let max = 0
  for (const file of files) {
    try {
      const info = await stat(file)
      if (info.mtimeMs > max) max = info.mtimeMs
    } catch {
      // ignore missing files
    }
  }
  return max
}

function validateRoot(root) {
  if (typeof root !== 'string' || !root.trim()) throw new TranslationError('bad-request', '缺少项目目录')
  return resolve(root.trim())
}

function cachedTranslations(entry, cfg, target = cfg.targetLanguage, glossary = {}) {
  const translations = {}
  for (const block of entry.data.blocks) {
    if (!block.translatable || !block.text) continue
    const key = cacheKeyFor(cfg, target, glossary, block.text)
    const text = entry.sidecar.get(key)
    if (text) translations[block.id] = text
  }
  return translations
}

function markdownTranslations(entry, cfg, target = cfg.targetLanguage) {
  const translations = {}
  for (const block of entry.data.blocks) {
    if (!block.translatable || !block.text) continue
    const key = cacheKeyFor(cfg, target, {}, block.text)
    const text = entry.sidecar.get(key) || entry.sidecar.textForBlock(block.id)
    if (text) translations[block.id] = text
  }
  return translations
}

async function refreshMarkdown(entry, cfg, translations = null, target = cfg.targetLanguage) {
  try {
    const map = translations ?? markdownTranslations(entry, cfg, target)
    if (Object.keys(map).length === 0) return
    const content = renderMarkdown({
      title: entry.data.title,
      model: cfg.model,
      mainFile: entry.data.mainFile,
      blocks: entry.data.blocks,
      translations: map,
    })
    await writeMarkdown(sidecarPaths(entry.data.mainPath).md, content)
  } catch (error) {
    console.error('[paper-translator] markdown write failed:', error.message)
  }
}

async function clearLegacyCache(legacyDir) {
  if (!legacyDir) return
  try {
    for (const name of await readdir(legacyDir)) {
      if (name.endsWith('.json')) await unlink(join(legacyDir, name)).catch(() => {})
    }
  } catch {
    // no legacy cache
  }
}


function tokensOfText(value) {
  return [...String(value ?? '').matchAll(/⟦[A-Z]\d+⟧/g)].map((match) => match[0])
}

function sameTokens(a, b) {
  const left = tokensOfText(a)
  const right = tokensOfText(b)
  if (left.length !== right.length) return false
  return left.every((token, index) => token === right[index])
}

function escapeLatexProse(value) {
  const marker = '\u0000'
  return String(value ?? '')
    .replace(/\\/g, marker)
    .replace(/([%&#_${}])/g, '\\$1')
    .replace(/~/g, '\\textasciitilde{}')
    .replace(/\^/g, '\\textasciicircum{}')
    .replaceAll(marker, '\\textbackslash{}')
}

function reconstructSource(block, englishText) {
  const map = new Map((block.placeholders ?? []).map((item) => [item.token, item]))
  const body = String(englishText ?? '')
    .split(/(⟦[A-Z]\d+⟧)/g)
    .map((part) => {
      const placeholder = map.get(part)
      if (!placeholder) return part.includes('⟦') ? '' : escapeLatexProse(part)
      if (placeholder.type === 'M') {
        return placeholder.display ? `\\[${placeholder.latex}\\]` : `$${placeholder.latex}$`
      }
      if (placeholder.type === 'C') return `\\${placeholder.command || 'cite'}{${placeholder.key ?? ''}}`
      if (placeholder.type === 'R') return `\\${placeholder.command || 'ref'}{${placeholder.key ?? ''}}`
      if (placeholder.type === 'U') return `\\url{${placeholder.url ?? ''}}`
      return ''
    })
    .join('')

  if (block.kind === 'heading') {
    const match = /^\\(chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)/.exec(block.source ?? '')
    const command = match ? `\\${match[1]}${match[2] ?? ''}` : '\\section'
    return `${command}{${body}}`
  }
  if (block.kind === 'caption') return `\\caption{${body}}`
  if (block.kind === 'item') return `\\item ${body}`
  return body
}

async function locateBlockInFile(project, block) {
  if (!block.source) throw new TranslationError('rewrite/no-source', '这个 block 没有可定位的源片段')
  const path = resolve(project.root, block.file)
  const raw = await readFile(path, 'utf8')
  const content = raw.replace(/\r\n?/g, '\n')
  const needle = block.source
  const lineStarts = [0]
  for (let i = 0; i < content.length; i += 1) if (content.charCodeAt(i) === 10) lineStarts.push(i + 1)
  const target = lineStarts[Math.max(0, (block.fileLine ?? 1) - 1)] ?? 0
  let best = -1
  let bestDistance = Number.POSITIVE_INFINITY
  let index = content.indexOf(needle)
  while (index >= 0) {
    const distance = Math.abs(index - target)
    if (distance < bestDistance) {
      best = index
      bestDistance = distance
    }
    index = content.indexOf(needle, index + 1)
  }
  if (best < 0 || best >= (lineStarts[block.fileLine] ?? Infinity) || best < target) {
    throw new TranslationError('rewrite/not-located', '源文件里找不到该段落的原始内容，可能已被修改；请刷新后重试')
  }
  return { path, raw, content, start: best, end: best + needle.length }
}

async function swapFile(path, expected, bytes) {
  const tmp = path + '.' + randomUUID() + '.tmp'
  await writeFile(tmp, bytes, { mode: (await stat(path)).mode })
  try {
    if (await readFile(path, 'utf8') !== expected) {
      throw new TranslationError('rewrite/conflict', '源文件已变化，请刷新 / Source changed; refresh the preview')
    }
    await rename(tmp, path)
  } finally {
    await unlink(tmp).catch(() => {})
  }
}

async function replaceSource(located, replacement) {
  const { raw, start, end } = located
  // Parser offsets count CRLF as one character. Slice the original bytes so
  // unrelated lines retain their own line endings, including in mixed files.
  let physical = 0
  let begin = 0
  for (let normalized = 0; normalized < end; normalized++) {
    if (normalized === start) begin = physical
    if (raw[physical] === '\r' && raw[physical + 1] === '\n') physical++
    physical++
  }
  const newline = raw.slice(begin).match(/\r\n|[\r\n]/)?.[0] ?? '\n'
  const bytes = raw.slice(0, begin) + replacement.replace(/\r\n?|\n/g, newline) + raw.slice(physical)
  await swapFile(located.path, raw, bytes)
  return bytes
}

function chineseFor(entry, cfg, block, glossary = {}) {
  if (!block?.text) return ''
  return entry.sidecar.get(cacheKeyFor(cfg, 'zh-CN', glossary, block.text)) ?? ''
}

function rewriteContext(entry, cfg, block, mode, glossary = {}) {
  const index = entry.data.blocks.findIndex((item) => item.id === block.id)
  const previous = index > 0 ? entry.data.blocks[index - 1] : null
  const next = index >= 0 && index + 1 < entry.data.blocks.length ? entry.data.blocks[index + 1] : null
  if (mode === 'zh') {
    return {
      title: entry.data.title ?? '',
      section: block.section ?? '',
      prevSource: chineseFor(entry, cfg, previous, glossary) || previous?.text || '',
      prevTranslation: previous?.text ?? '',
      nextSource: chineseFor(entry, cfg, next, glossary) || next?.text || '',
      referenceSource: block.text ?? '',
      glossary,
    }
  }
  return {
    title: entry.data.title ?? '',
    section: block.section ?? '',
    prevSource: previous?.text ?? '',
    prevTranslation: chineseFor(entry, cfg, previous, glossary),
    nextSource: next?.text ?? '',
    referenceSource: chineseFor(entry, cfg, block, glossary) || '',
    glossary,
  }
}

export function registerRoutes(ctx, cfg, options = {}) {
  const projects = new Map()
  const legacyDir = options.legacyDir ?? null
  const ledger = options.ledger ?? {
    totalsView: () => emptyUsage(),
    add: async () => emptyUsage(),
    syncProject: async () => emptyUsage(),
    flush: async () => {},
  }

  const register = (path, methods, handler) => {
    if (typeof ctx.connection?.fetch?.register !== 'function') {
      throw new Error('当前 DSH 版本没有 ctx.connection.fetch.register，无法注册论文对照路由')
    }
    return ctx.connection.fetch.register({
      path,
      methods,
      requestBody: 'buffered',
      fetch: handler,
    })
  }

  const safe = (handler) => async (request) => {
    try {
      return await handler(request)
    } catch (error) {
      if (error instanceof TranslationError) return fail(400, error.code, error.message, error.details)
      console.error('[paper-translator] route error:', error)
      return fail(500, 'internal', error?.message ?? '内部错误')
    }
  }

  const getEntry = (projectId) => {
    const entry = projects.get(projectId)
    if (!entry) return null
    entry.lastAccess = Date.now()
    return entry
  }

  const putEntry = (entry) => {
    projects.set(entry.id, entry)
    if (projects.size > MAX_PROJECTS) {
      const oldest = [...projects.values()].sort((a, b) => a.lastAccess - b.lastAccess)[0]
      if (oldest && oldest.id !== entry.id) {
        oldest.sidecar?.flush().catch(() => {})
        projects.delete(oldest.id)
      }
    }
    return entry
  }

  const disposers = []
  ctx.effect(() => {
    disposers.push(register('/api/paper-translator/health', ['GET'], safe(async () => {
      let models = []
      let available = false
      let modelError = null
      try {
        const list = await ctx.llm.listModels(cfg.provider)
        models = (Array.isArray(list) ? list : []).map((item) => item?.id ?? item).filter(Boolean)
        available = models.includes(cfg.model) || models.length === 0
      } catch (error) {
        modelError = error?.message ?? String(error)
      }
      return json({
        ok: available,
        provider: cfg.provider,
        model: cfg.model,
        models,
        error: modelError,
      })
    })))

    disposers.push(register('/api/paper-translator/directory/pick', ['POST'], safe(async (request) => {
      if (typeof ctx.directoryPicker?.capability !== 'function') {
        return fail(503, 'directory-picker/unavailable', '当前 DSH 组合没有目录选择服务')
      }
      const capability = ctx.directoryPicker.capability()
      if (capability.kind !== 'native') {
        return json({ kind: capability.kind, path: null, message: '当前运行环境使用应用内目录浏览，暂未接入' })
      }
      const path = await capability.pick(request.signal)
      return json({ kind: 'native', path: path ?? null })
    })))

    disposers.push(register('/api/paper-translator/project/list', ['POST'], safe(async (request) => {
      const body = await readJson(request)
      const root = validateRoot(body.root)
      const files = await listTexFiles(root)
      return json({ root, files })
    })))

    disposers.push(register('/api/paper-translator/project/open', ['POST'], safe(async (request) => {
      const body = await readJson(request)
      const root = validateRoot(body.root)
      const data = await loadProject(root, body.mainFile ?? 'main.tex')
      const id = projectIdFor(data.root, data.mainFile)
      const sidecar = getEntry(id)?.sidecar ?? await new ProjectSidecar(data.mainPath, legacyDir).load()
      const entry = putEntry(Object.assign(getEntry(id) ?? {}, { id, root: data.root, mainFile: data.mainFile, data, sidecar, lastAccess: Date.now() }))
      await ledger.syncProject(entry.id, entry.sidecar.usage)
      await ledger.flush().catch(() => {})
      const review = await readRevisionStore(data.mainPath)
      const translations = cachedTranslations(entry, cfg, body.target, review.workspace?.glossary ?? body.glossary)
      await refreshMarkdown(entry, cfg)
      return json(serialize(entry, {
        translations, review,
        usage: usageTotals(entry, cfg),
        globalUsage: globalUsageView(ledger, cfg),
      }))
    })))

    disposers.push(register('/api/paper-translator/project/refresh', ['POST'], safe(async (request) => {
      const body = await readJson(request)
      const entry = getEntry(body.projectId)
      if (!entry) return fail(404, 'project/not-found', '项目已失效，请重新打开')
      const data = await loadProject(entry.root, entry.mainFile)
      const oldIds = new Set(entry.data.blocks.map((block) => block.id))
      const newIds = new Set(data.blocks.map((block) => block.id))
      const changed = data.blocks.filter((block) => !oldIds.has(block.id)).map((block) => block.id)
      const removed = entry.data.blocks.filter((block) => !newIds.has(block.id)).map((block) => block.id)
      entry.data = data
      entry.lastAccess = Date.now()
      await ledger.syncProject(entry.id, entry.sidecar.usage)
      await ledger.flush().catch(() => {})
      const translations = cachedTranslations(entry, cfg, body.target, body.glossary)
      await refreshMarkdown(entry, cfg)
      return json(serialize(entry, {
        changed,
        removed,
        history: (await readRevisionStore(data.mainPath)).history,
        translations,
        usage: usageTotals(entry, cfg),
        globalUsage: globalUsageView(ledger, cfg),
      }))
    })))

    disposers.push(register('/api/paper-translator/stat', ['GET'], safe(async (request) => {
      const url = new URL(request.url)
      const entry = getEntry(url.searchParams.get('projectId'))
      if (!entry) return fail(404, 'project/not-found', '项目已失效，请重新打开')
      const files = [entry.data.mainPath, ...entry.data.files.map((range) => resolve(entry.root, range.path))]
      const texMtime = await maxMtime(files)
      const pdfMtime = await maxMtime([entry.data.mainPath.replace(/\.tex$/i, '.pdf')])
      return json({ texMtime, pdfMtime, pdfExists: Boolean(entry.data.pdf), sig: `${texMtime}:${pdfMtime}` })
    })))

    disposers.push(register('/api/paper-translator/translate', ['POST'], safe(async (request) => {
      const body = await readJson(request)
      const entry = getEntry(body.projectId)
      if (!entry) return fail(404, 'project/not-found', '项目已失效，请重新打开')
      const target = typeof body.target === 'string' && body.target.trim() ? body.target.trim() : cfg.targetLanguage
      const glossary = body.glossary && typeof body.glossary === 'object' ? body.glossary : {}
      const byId = new Map(entry.data.blocks.map((block) => [block.id, block]))
      const requested = []
      for (const item of Array.isArray(body.blocks) ? body.blocks : []) {
        const id = typeof item === 'string' ? item : item?.id
        const block = byId.get(id)
        if (block && block.translatable && block.text) requested.push(block)
      }
      if (!requested.length) return json({ results: [], usage: null, cachedCount: 0 })

      const results = []
      const misses = []
      for (const block of requested) {
        const key = cacheKeyFor(cfg, target, glossary, block.text)
        const cached = body.bypassCache === true ? null : entry.sidecar.get(key)
        if (cached) results.push({ id: block.id, text: cached, cached: true })
        else misses.push({ block, key })
      }

      let usage = null
      if (misses.length > 0) {
        const first = misses[0]?.block
        const index = first ? entry.data.blocks.findIndex((block) => block.id === first.id) : -1
        const previous = index > 0 ? entry.data.blocks[index - 1] : null
        const next = index >= 0 && index + 1 < entry.data.blocks.length ? entry.data.blocks[index + 1] : null
        const previousKey = previous?.text ? cacheKeyFor(cfg, target, glossary, previous.text) : ''
        const previousTranslation = previousKey ? entry.sidecar.get(previousKey) ?? '' : ''
        const context = {
          title: entry.data.title ?? '',
          section: first?.section ?? requested[0]?.section ?? '',
          prevSource: previous?.text || (typeof body.prevSource === 'string' ? body.prevSource : ''),
          prevTranslation: previousTranslation,
          nextSource: next?.text ?? '',
          glossary,
        }
        let batch
        try {
          batch = await translateBatch(ctx, { ...cfg, targetLanguage: target }, misses.map((item) => item.block), context, request.signal)
        } catch (error) {
          if (error instanceof TranslationError) {
            return fail(error.code === 'cancelled' ? 499 : 502, error.code, error.message, error.details)
          }
          throw error
        }
        usage = batch.usage
        await addModelUsage(entry, cfg, usage, ledger)
        const byResult = new Map(batch.results.map((item) => [item.id, item]))
        for (const miss of misses) {
          const result = byResult.get(miss.block.id)
          if (result?.text) {
            entry.sidecar.set(miss.key, result.text, miss.block.id)
            results.push({ id: miss.block.id, text: result.text, cached: false })
          } else {
            results.push({ id: miss.block.id, error: result?.error ?? 'missing' })
          }
        }
      }

      const order = new Map(requested.map((block, index) => [block.id, index]))
      results.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
      if (misses.length > 0) {
        await entry.sidecar.flush().catch((error) => {
          console.error('[paper-translator] sidecar write failed:', error.message)
        })
        await refreshMarkdown(entry, cfg, null, target)
      }
      return json({
        results,
        usage,
        totals: usageTotals(entry, cfg),
        globalTotals: globalUsageView(ledger, cfg),
        model: cfg.model,
        cachedCount: results.filter((item) => item.cached).length,
      })
    })))



    disposers.push(register('/api/paper-translator/block/polish', ['POST'], safe(async (request) => {
      const body = await readJson(request)
      const entry = getEntry(body.projectId)
      if (!entry) return fail(404, 'project/not-found', '项目已失效，请重新打开')
      const block = entry.data.blocks.find((item) => item.id === body.blockId)
      if (!block) return fail(404, 'block/not-found', '找不到对应的段落，请刷新后重试')
      if (!block.translatable) return fail(400, 'block/not-translatable', '这个 block 不支持文本润色')
      const mode = body.mode === 'zh' ? 'zh' : body.mode === 'en' ? 'en' : ''
      const text = typeof body.text === 'string' ? body.text : ''
      if (!mode) return fail(400, 'polish/bad-request', 'mode 必须是 zh 或 en')
      if (!text.trim()) return fail(400, 'polish/empty', '内容为空')
      const glossary = body.glossary && typeof body.glossary === 'object' ? body.glossary : {}
      const context = rewriteContext(entry, cfg, block, mode, glossary)

      try {
        let out
        let englishSource
        if (mode === 'en') {
          out = await polishRawLatex(ctx, cfg, text, context, request.signal)
          englishSource = out.text
        } else {
          if (!sameTokens(text, block.text)) {
            return fail(400, 'polish/placeholder-mismatch', '中文内容里的 ⟦M1⟧ 占位符数量/顺序必须与原段落一致')
          }
          out = await polishChineseToEnglish(ctx, cfg, text, tokensOfText(block.text), context, request.signal)
          englishSource = reconstructSource(block, out.text)
        }
        await addModelUsage(entry, cfg, out.usage, ledger)
        await entry.sidecar.flush().catch(() => {})
        return json({
          mode: 'en',
          englishSource,
          usage: out.usage,
          totals: usageTotals(entry, cfg),
          globalTotals: globalUsageView(ledger, cfg),
          skill: 'best-paper-writing@v1.2',
        })
      } catch (error) {
        if (error instanceof TranslationError) return fail(502, error.code, error.message)
        throw error
      }
    })))

    async function preview(entry, block, body, signal) {
      if (typeof body.chineseText !== 'string') {
        if (!body.englishSource?.trim()) throw new TranslationError('rewrite/empty', '英文内容为空')
        return { englishSource: body.englishSource }
      }
      if (!body.chineseText.trim() || !sameTokens(body.chineseText, block.text)) {
        throw new TranslationError('rewrite/placeholder-mismatch', '请保留公式、引用占位符及其顺序 / Preserve placeholders in order')
      }
      const out = await translateBatch(ctx, { ...cfg, sourceLanguage: 'zh-CN', targetLanguage: 'en' },
        [{ ...block, text: body.chineseText }], rewriteContext(entry, cfg, block, 'zh', body.glossary), signal)
      await addModelUsage(entry, cfg, out.usage, ledger)
      const translated = out.results?.[0]?.text
      if (!translated || !sameTokens(translated, block.text)) throw new TranslationError('rewrite/translation', '英文生成失败 / Invalid English output')
      return { englishSource: reconstructSource(block, translated) }
    }

    function revisionRoute(path, handler) {
      disposers.push(register('/api/paper-translator/' + path, ['POST'], safe(async request => {
        const body = await readJson(request)
        const entry = getEntry(body.projectId)
        if (!entry) return fail(404, 'project/not-found', '项目已失效，请重新打开')
        return handler(entry, body, request.signal)
      })))
    }

    revisionRoute('review/save', (entry, body) => withRevisionLock(async () => {
      const store = await readRevisionStore(entry.data.mainPath)
      if (body.version !== store.version) return fail(409, 'review/conflict', '另一窗口已更新返修记录，请重新打开项目后合并 / Review changed in another window')
      const workspace = body.workspace
      if (!Array.isArray(workspace?.reviewers) || workspace.reviewers.length > 8 || !workspace.glossary || typeof workspace.glossary !== 'object') {
        return fail(400, 'review/invalid', '无效的返修记录 / Invalid workspace')
      }
      store.workspace = workspace
      store.version++
      await writeRevisionStore(entry.data.mainPath, store)
      return json({ version: store.version })
    }))

    revisionRoute('synctex', async (entry, body, signal) => json({ location: await syncLocation(entry.data, body, signal) }))

    revisionRoute('block/preview', async (entry, body, signal) => {
      const block = entry.data.blocks.find(item => item.id === body.blockId)
      if (!block?.translatable || block.source !== body.original) return fail(409, 'rewrite/conflict', '原段落已改变，请刷新 / Source changed')
      const proposal = await preview(entry, block, body, signal)
      return json({ ...proposal, totals: usageTotals(entry, cfg), globalTotals: globalUsageView(ledger, cfg) })
    })

    async function commit(entry, body, replacement, chinese, undoId, signal) {
      const result = await withRevisionLock(async () => {
        const data = await loadProject(entry.root, entry.mainFile)
        const store = await readRevisionStore(data.mainPath)
        const previous = undoId && store.history.find(item => item.id === undoId && !item.undone)
        if (undoId && !previous) return fail(409, 'rewrite/no-undo', '该修改已撤销 / Revision already undone')
        const original = previous ? previous.after : body.original
        const id = previous ? previous.afterId : body.blockId
        const block = data.blocks.find(item => item.id === id && item.source === original &&
          (!body.file || item.file === body.file) && (!previous || item.file === previous.file))
        if (!block?.translatable) return fail(409, 'rewrite/conflict', '原段落已变化，请重新核对 / Source has changed')
        if (block.source.length >= 20000) return fail(400,'rewrite/truncated','该源段落超过编辑长度上限 / Source fragment exceeds the editor limit')
        const duplicates = data.blocks.filter(item => item.source === original && item.file === block.file)
        if (duplicates.length > 1 && (block.fileLine !== (previous?.fileLine ?? body.fileLine) || duplicates.filter(item => item.fileLine === block.fileLine).length > 1)) return fail(409, 'rewrite/ambiguous', '有多个相同段落，请重新核对 / Ambiguous paragraph')
        if (previous) {
          replacement = previous.before
          chinese = previous.beforeChinese
        }
        if (typeof replacement !== 'string' || !replacement.trim() || replacement === original) return fail(400, 'rewrite/empty', '段落没有改动 / No change')
        const located = await locateBlockInFile(data, block)
        const written = await replaceSource(located, replacement)
        let updated, next
        try {
          updated = await loadProject(entry.root, entry.mainFile)
          next = updated.blocks.find(item => item.file === block.file && item.fileLine === block.fileLine && item.source === replacement.trim() && item.translatable)
          if (!next) throw new TranslationError('rewrite/reparse-failed', '修改须保留一个可定位的 LaTeX 段落 / Keep one valid LaTeX block')
          if (previous) previous.undone = true
          else store.history.push({ id: randomUUID(), file: block.file, fileLine: next.fileLine, section: block.section, beforeId: block.id,
            afterId: next.id, before: original, after: next.source, beforeChinese: chineseFor(entry, cfg, block, body.glossary),
            chinese: chinese || '', issue: body.issueLink || null, time: Date.now() })
          await writeRevisionStore(data.mainPath, store)
        } catch (error) {
          if (await readFile(located.path, 'utf8') === written) {
            await swapFile(located.path, written, located.raw)
          }
          throw error
        }
        entry.data = updated
        return { oldId:block.id, next, revisionId:previous?.id ?? store.history.at(-1).id }
      })
      if (result instanceof Response) return result
      const {oldId, next, revisionId} = result
      let translationError = null
      if (!chinese && !undoId) {
        try {
          const out = await translateBatch(ctx, { ...cfg, sourceLanguage: 'en', targetLanguage: 'zh-CN' }, [next], rewriteContext(entry, cfg, next, 'en', body.glossary), signal)
          await addModelUsage(entry, cfg, out.usage, ledger)
          chinese = out.results?.[0]?.text
          if (!chinese) translationError = out.results?.[0]?.error || 'Translation unavailable'
        } catch (error) { translationError = error.message }
      }
      if (chinese) entry.sidecar.set(cacheKeyFor(cfg, 'zh-CN', body.glossary ?? {}, next.text), chinese, next.id)
      await entry.sidecar.flush().catch(() => {})
      await refreshMarkdown(entry, cfg, null, 'zh-CN')
      return json(serialize(entry, { rewrittenBlockId: next.id, history: (await readRevisionStore(entry.data.mainPath)).history, revisionId, removed: [oldId],
        translations: cachedTranslations(entry, cfg, 'zh-CN', body.glossary), translationError,
        changed: true, usage: usageTotals(entry, cfg), globalUsage: globalUsageView(ledger, cfg) }))
    }

    revisionRoute('block/undo', (entry, body, signal) => commit(entry, body, null, null, body.revisionId || 'missing', signal))
    revisionRoute('block/rewrite', async (entry, body, signal) => {
      const block = entry.data.blocks.find(item => item.id === body.blockId)
      if (!block?.translatable) return fail(409, 'rewrite/conflict', '未找到原段落 / Source block unavailable')
      // Accept the reviewed bytes. Legacy clients still send just one draft field.
      const result = typeof body.englishSource === 'string' ? body : await preview(entry, block, body, signal)
      return commit(entry, { ...body, original: body.original ?? block.source, file: body.file ?? block.file,
        fileLine: body.fileLine ?? block.fileLine }, result.englishSource, body.chineseText, null, signal)
    })

    disposers.push(register('/api/paper-translator/rebuttal', ['POST'], safe(async (request) => {
      const body = await readJson(request)
      const entry = getEntry(body.projectId)
      if (!entry) return fail(404, 'project/not-found', '项目已失效，请重新打开')
      const text = typeof body.text === 'string' ? body.text.trim() : ''
      if (!text) return fail(400, 'rebuttal/empty', '返修意见为空')
      if (text.length > 30000) return fail(400, 'rebuttal/too-long', '返修意见过长（最多 30000 字符）')
      const target = body.target === 'en' ? 'en' : 'zh-CN'
      const glossary = body.glossary && typeof body.glossary === 'object' ? body.glossary : {}
      try {
        const out = await analyzeRebuttal(
          ctx,
          { ...cfg, maxOutputTokens: Math.max(cfg.maxOutputTokens ?? 4096, 8192), glossary },
          entry,
          text,
          target,
          request.signal,
        )
        await addModelUsage(entry, cfg, out.usage, ledger)
        await entry.sidecar.flush().catch(() => {})
        return json({
          target,
          segments: out.segments,
          matches: out.matches,
          usage: out.usage,
          totals: usageTotals(entry, cfg),
          globalTotals: globalUsageView(ledger, cfg),
        })
      } catch (error) {
        if (error instanceof TranslationError) return fail(502, error.code, error.message)
        throw error
      }
    })))


    disposers.push(register('/api/paper-translator/rebuttal/overview', ['POST'], safe(async (request) => {
      const body = await readJson(request)
      const entry = getEntry(body.projectId)
      if (!entry) return fail(404, 'project/not-found', '项目已失效，请重新打开')
      const rawReviewers = Array.isArray(body.reviewers) ? body.reviewers : []
      const seen = new Set()
      const reviewers = []
      for (const reviewer of rawReviewers.slice(0, 10)) {
        if (!reviewer || typeof reviewer !== 'object') continue
        const id = typeof reviewer.id === 'string' ? reviewer.id.trim().slice(0, 40) : ''
        const text = typeof reviewer.text === 'string' ? reviewer.text.trim() : ''
        if (!id || !text || seen.has(id)) continue
        seen.add(id)
        reviewers.push({
          id,
          name: typeof reviewer.name === 'string' && reviewer.name.trim() ? reviewer.name.trim().slice(0, 80) : id,
          text,
        })
      }
      if (!reviewers.length) return fail(400, 'rebuttal/overview-empty', '还没有可汇总的审稿意见')
      const target = body.target === 'en' ? 'en' : 'zh-CN'
      try {
        const out = await analyzeOverview(
          ctx,
          { ...cfg, maxOutputTokens: Math.max(cfg.maxOutputTokens ?? 4096, 8192) },
          entry,
          reviewers,
          target,
          request.signal,
        )
        await addModelUsage(entry, cfg, out.usage, ledger)
        await entry.sidecar.flush().catch(() => {})
        return json({
          target,
          summary: out.summary,
          reviewers: out.reviewers,
          overlaps: out.overlaps,
          unique: out.unique,
          usage: out.usage,
          totals: usageTotals(entry, cfg),
          globalTotals: globalUsageView(ledger, cfg),
        })
      } catch (error) {
        if (error instanceof TranslationError) return fail(502, error.code, error.message)
        throw error
      }
    })))

    disposers.push(register('/api/paper-translator/compile', ['POST'], safe(async (request) => {
      const body = await readJson(request)
      const entry = getEntry(body.projectId)
      if (!entry) return fail(404, 'project/not-found', '项目已失效，请重新打开')
      if (cfg.compile === false) return fail(400, 'compile/disabled', '编译功能已在插件配置中关闭')
      const result = await compileProject(entry.data, cfg, request.signal)
      if (result.ok) {
        try {
          entry.data = await loadProject(entry.root, entry.mainFile)
        } catch {
          // keep the old parse if the re-read fails
        }
      }
      return json({ ...result, pdf: entry.data.pdf ? { exists: true, mtime: entry.data.pdf.mtime, bytes: entry.data.pdf.bytes } : { exists: false } })
    })))

    disposers.push(register('/api/paper-translator/pdf', ['GET'], safe(async (request) => {
      const url = new URL(request.url)
      const entry = getEntry(url.searchParams.get('projectId'))
      if (!entry?.data?.pdf?.path) return fail(404, 'pdf/not-found', '没有可用的 PDF')
      const buffer = await readFile(entry.data.pdf.path)
      return new Response(buffer, {
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(buffer.byteLength),
          'cache-control': 'no-store',
        },
      })
    })))

    disposers.push(register('/api/paper-translator/asset/pdf.worker.mjs', ['GET'], safe(async () => {
      try {
        const buffer = await readFile(new URL('../../assets/pdf.worker.mjs', import.meta.url))
        return new Response(buffer, {
          headers: {
            'content-type': 'text/javascript; charset=utf-8',
            'cache-control': 'public, max-age=3600',
          },
        })
      } catch {
        return fail(404, 'asset/not-found', 'PDF worker 未打包')
      }
    })))

    disposers.push(register('/api/paper-translator/cache/clear', ['POST'], safe(async (request) => {
      const body = await readJson(request)
      if (body.all === true) {
        for (const entry of projects.values()) await entry.sidecar?.clear()
        await clearLegacyCache(legacyDir)
      } else if (body.projectId) {
        const entry = getEntry(body.projectId)
        if (entry) await entry.sidecar.clear()
      } else {
        for (const entry of projects.values()) await entry.sidecar?.clear()
      }
      return json({ ok: true })
    })))

    return () => {
      for (const entry of projects.values()) entry.sidecar?.flush().catch(() => {})
      for (const dispose of disposers.splice(0)) {
        try {
          dispose()
        } catch {
          // already disposed
        }
      }
    }
  }, 'paper-translator: HTTP routes')
}
