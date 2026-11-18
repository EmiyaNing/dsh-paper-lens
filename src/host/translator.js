/**
 * Translation engine: prompt assembly, DeepSeek Flash call, JSON parsing,
 * placeholder validation, and one repair attempt.
 */

import { shortHash } from './cache.js'

export const PROMPT_VERSION = 'p1'

const PLACEHOLDER_RE = /⟦[A-Z]\d+⟧/g
const LATEX_COMMAND_RE = /\\[A-Za-z]+/

export class TranslationError extends Error {
  constructor(code, message, details = {}) {
    super(message)
    this.name = 'TranslationError'
    this.code = code
    this.details = details
  }
}

function tokensOf(value) {
  return [...String(value).matchAll(PLACEHOLDER_RE)].map((match) => match[0])
}

function normalizePlaceholderSpacing(value) {
  return String(value ?? '').replace(/⟦\s*([A-Z])\s*(\d+)\s*⟧/g, '⟦$1$2⟧')
}

function cjkRatio(value) {
  const text = String(value).replace(PLACEHOLDER_RE, '')
  const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length
  const letters = (text.match(/[A-Za-z\u3400-\u9fff]/g) ?? []).length
  return letters === 0 ? 0 : cjk / letters
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== 'object') return null
  const number = (value) => (Number.isFinite(value) ? value : 0)
  const input = usage.inputTokens ?? usage.promptTokens ?? usage.input_tokens ?? usage.prompt_tokens ?? usage.input
  const output = usage.outputTokens ?? usage.completionTokens ?? usage.output_tokens ?? usage.completion_tokens ?? usage.output
  const cacheRead = usage.cacheReadTokens ?? usage.cache_read_input_tokens ?? usage.cacheRead ?? usage.prompt_cache_hit_tokens
  const cacheWrite = usage.cacheWriteTokens ?? usage.cache_creation_input_tokens ?? usage.cacheWrite ?? usage.prompt_cache_miss_tokens
  return {
    input: number(input),
    output: number(output),
    cacheRead: number(cacheRead),
    cacheWrite: number(cacheWrite),
    calls: 1,
  }
}

function validateTranslation(block, translated, targetLanguage = 'zh-CN') {
  if (typeof translated !== 'string' || translated.trim().length < 2) return 'empty'
  const sourceTokens = tokensOf(block.text)
  const outputTokens = tokensOf(translated)
  if (outputTokens.length !== sourceTokens.length) return 'placeholder-count'
  // Natural target-language word order may move a citation/formula within the
  // sentence. Require the same multiset of tokens, but do not reject a
  // translation merely because two placeholders swapped order.
  const sourceCounts = new Map()
  for (const token of sourceTokens) sourceCounts.set(token, (sourceCounts.get(token) ?? 0) + 1)
  for (const token of outputTokens) {
    const left = sourceCounts.get(token) ?? 0
    if (left === 0) return 'placeholder-mismatch'
    sourceCounts.set(token, left - 1)
  }
  if (LATEX_COMMAND_RE.test(translated)) return 'latex-command-leak'
  const placeholderChars = sourceTokens.join('').length
  const density = placeholderChars / Math.max(1, block.text.length)
  const toChinese = /^zh/i.test(targetLanguage)
  if (toChinese) {
    if (density < 0.08 && cjkRatio(translated) < 0.12) return 'not-chinese'
  } else if (cjkRatio(translated) > 0.2) {
    return 'not-english'
  }
  const ratio = translated.length / Math.max(1, block.text.length)
  // Headings and short captions are naturally much shorter in Chinese;
  // English from Chinese is usually longer, so the bounds are direction-aware.
  const minRatio = toChinese
    ? (block.kind === 'heading' ? 0.04 : block.kind === 'caption' ? 0.08 : block.text.length < 80 ? 0.12 : 0.2)
    : (block.kind === 'heading' ? 0.15 : block.kind === 'caption' ? 0.3 : 0.45)
  const maxRatio = toChinese ? (block.text.length < 40 ? 6 : 3.2) : 8
  if (ratio < minRatio || ratio > maxRatio) return 'length-outlier'
  return null
}

function languageName(code) {
  if (code === 'zh-TW' || code === 'zh-Hant') return 'Traditional Chinese'
  if (code === 'zh-CN' || code === 'zh-Hans' || code === 'zh') return 'Simplified Chinese'
  if (code === 'en') return 'English'
  return code || 'Simplified Chinese'
}

function buildSystemPrompt(context = {}, targetLanguage = 'zh-CN', sourceLanguage = 'en') {
  const target = languageName(targetLanguage)
  const source = languageName(sourceLanguage)
  const glossary = context.glossary && typeof context.glossary === 'object'
    ? Object.entries(context.glossary)
        .filter(([key, value]) => key && typeof value === 'string' && value.trim())
        .slice(0, 120)
        .map(([key, value]) => `- ${key} => ${value}`)
        .join('\n')
    : ''
  return [
    'You are a professional academic translator working on LaTeX papers.',
    `Translate the ${source} prose of each block into ${target}.`,
    '',
    'Rules:',
    '1. Return JSON only: {"translations":[{"id":"...","text":"..."}]}.',
    '2. Keep every placeholder such as ⟦M1⟧, ⟦C2⟧, ⟦R3⟧ exactly as-is and exactly once. Natural target-language word order may move placeholders within the sentence; never drop, duplicate, or invent one.',
    '3. Never translate, add, or remove LaTeX commands, math, citation keys, labels, or URLs. Do not wrap the output in Markdown or code fences.',
    '4. Do not explain, summarize, or add information.',
    `5. Use formal academic ${target}. Preserve terminology and logical connectives.`,
    /^zh/i.test(targetLanguage)
      ? '6. If a term is ambiguous, keep the English term in parentheses on first use.'
      : '6. Use consistent academic English; do not add Chinese characters.',
    '',
    glossary ? `Glossary (use these translations consistently):\n${glossary}` : 'Glossary: (none)',
    '',
    'Paper context:',
    `Title: ${context.title ?? ''}`,
    `Section: ${context.section ?? ''}`,
    `Previous paragraph (source): ${(context.prevSource ?? '').slice(0, 800)}`,
    `Previous paragraph (translation, if any): ${(context.prevTranslation ?? '').slice(0, 600)}`,
    `Next paragraph (source): ${(context.nextSource ?? '').slice(0, 600)}`,
    context.referenceSource ? `Reference (original text of this block, may be outdated): ${context.referenceSource.slice(0, 800)}` : '',
  ].filter(Boolean).join('\n')
}

function buildUserPayload(blocks, targetLanguage, sourceLanguage) {
  return JSON.stringify({
    sourceLanguage,
    targetLanguage,
    blocks: blocks.map((block) => ({ id: block.id, kind: block.kind, text: block.text })),
  })
}

function extractJson(text) {
  if (typeof text !== 'string') return null
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text)
  const body = fenced ? fenced[1] : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}

function normalizeTranslations(payload) {
  if (!payload) return null
  if (Array.isArray(payload)) return payload
  if (Array.isArray(payload.translations)) return payload.translations
  if (payload.translations && typeof payload.translations === 'object') {
    return Object.entries(payload.translations).map(([id, text]) => ({ id, text }))
  }
  if (typeof payload === 'object') {
    const entries = Object.entries(payload).filter(([, value]) => typeof value === 'string')
    if (entries.length > 0) return entries.map(([id, text]) => ({ id, text }))
  }
  return null
}

export async function callModel(ctx, cfg, system, messages, signal) {
  const base = {
    provider: cfg.provider,
    model: cfg.model,
    maxTokens: cfg.maxOutputTokens,
    ...(cfg.temperature === 0 ? {} : { temperature: cfg.temperature }),
  }
  let stream = null
  let effective = base

  if (typeof ctx.llm.prepareCall === 'function') {
    try {
      const prepared = await ctx.llm.prepareCall(
        { provider: cfg.provider, model: cfg.model, reasoningEffort: 'off', maxTokens: cfg.maxOutputTokens },
        signal,
      )
      effective = { ...prepared.config }
      stream = prepared.stream({ ...effective, system, messages, signal })
    } catch (error) {
      if (error?.code === 'NO_ADAPTER' || error?.code === 'MISSING_CREDENTIAL' || error?.code === 'AUTH') throw error
      // The route may not accept `reasoningEffort: "off"`; retry with defaults.
      stream = null
    }
  }

  if (!stream) {
    stream = ctx.llm.stream({ ...base, system, messages, signal })
  }

  let text = ''
  let usage = null
  let finish = null
  let reasoning = 0
  for await (const chunk of stream) {
    if (signal?.aborted) throw new TranslationError('cancelled', '翻译已取消')
    if (chunk?.type === 'text-delta') {
      text += chunk.text ?? ''
    } else if (chunk?.type === 'usage') {
      usage = normalizeUsage(chunk.usage)
    } else if (chunk?.type === 'reasoning-delta') {
      reasoning += 1
    } else if (chunk?.type === 'finish') {
      finish = chunk.reason ?? null
    }
  }
  if (finish?.kind === 'aborted') throw new TranslationError('cancelled', '翻译已取消')
  if (finish?.kind === 'error') {
    const failure = finish.failure ?? {}
    throw new TranslationError(failure.code ? `model/${failure.code}` : 'model/error', failure.message ?? '模型调用失败', {
      provider: effective.provider ?? cfg.provider,
      model: effective.model ?? cfg.model,
    })
  }
  if (!finish) throw new TranslationError('model/no-finish', '模型没有返回结束标记')
  return { text, usage, reasoningChunks: reasoning }
}

/**
 * Translate one batch of blocks. The caller owns batching and cache writes.
 */
export async function translateBatch(ctx, cfg, blocks, context, signal) {
  if (!blocks.length) return { results: [], usage: null, model: cfg.model }
  const targetLanguage = cfg.targetLanguage ?? 'zh-CN'
  const sourceLanguage = cfg.sourceLanguage ?? 'en'
  const system = buildSystemPrompt(context ?? {}, targetLanguage, sourceLanguage)
  const messages = [{ role: 'user', content: [{ type: 'text', text: buildUserPayload(blocks, targetLanguage, sourceLanguage) }] }]

  let usage = null
  let lastFailure = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await callModel(
      ctx,
      cfg,
      attempt === 0
        ? system
        : `${system}\n\nYour previous answer was invalid (${lastFailure ?? 'unparseable'}). Return strict JSON only. Keep every ⟦…⟧ placeholder token exactly once; do not drop, duplicate, or change token numbers.`,
      messages,
      signal,
    )
    if (reply.usage) {
      usage = {
        input: (usage?.input ?? 0) + (reply.usage.input ?? 0),
        output: (usage?.output ?? 0) + (reply.usage.output ?? 0),
        cacheRead: (usage?.cacheRead ?? 0) + (reply.usage.cacheRead ?? 0),
        cacheWrite: (usage?.cacheWrite ?? 0) + (reply.usage.cacheWrite ?? 0),
        calls: (usage?.calls ?? 0) + (reply.usage.calls ?? 1),
      }
    }
    const payload = extractJson(reply.text)
    const list = normalizeTranslations(payload)
    if (!list) {
      lastFailure = 'invalid-json'
      continue
    }
    const byId = new Map()
    for (const item of list) {
      if (item && typeof item.id === 'string' && typeof item.text === 'string') byId.set(item.id, item.text)
    }
    const results = []
    let validCount = 0
    for (const block of blocks) {
      const translated = normalizePlaceholderSpacing(byId.get(block.id))
      const error = validateTranslation(block, translated, targetLanguage)
      if (error) results.push({ id: block.id, error })
      else {
        validCount += 1
        results.push({ id: block.id, text: translated })
      }
    }
    if (validCount === 0 && attempt === 0) {
      lastFailure = results.find((item) => item.error)?.error ?? 'invalid'
      continue
    }
    return { results, usage, model: cfg.model }
  }
  throw new TranslationError('invalid-output', `模型输出未通过校验：${lastFailure ?? 'unknown'}`)
}

export function cacheKeyFor(cfg, targetLanguage, glossary, text) {
  return shortHash([
    PROMPT_VERSION,
    cfg.provider,
    cfg.model,
    targetLanguage,
    shortHash(JSON.stringify(glossary ?? {})),
    text,
  ].join('\u0000'))
}
