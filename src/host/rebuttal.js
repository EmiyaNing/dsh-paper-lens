/**
 * Rebuttal translation + block correspondence.
 *
 * The model sees a compact map of the paper's translatable blocks and returns
 * translated segments with optional match IDs. Each match points at exactly
 * one block; the browser turns that into a numbered highlight in the rebuttal
 * translation and a pin on the corresponding paper block.
 */

import { callModel, TranslationError } from './translator.js'

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

function paperBlocks(entry) {
  return entry.data.blocks
    .filter((block) => block.translatable && block.text)
    .slice(0, 140)
    .map((block) => ({
      id: block.id,
      section: block.section || '',
      kind: block.kind || 'paragraph',
      text: String(block.text).slice(0, 900),
    }))
}

function targetLabel(target) {
  return target === 'en' ? 'English' : 'Simplified Chinese'
}

function splitParagraphs(text) {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n').trim()
  if (!normalized) return []
  let parts = normalized.split(/\n[ \t]*\n+/).map((part) => part.trim()).filter(Boolean)
  // If the author used single newlines instead of blank lines, keep each line
  // as its own paragraph rather than silently joining every comment.
  if (parts.length === 1 && /\n/.test(parts[0])) {
    parts = parts[0].split(/\n+/).map((part) => part.trim()).filter(Boolean)
  }
  return parts
}

function normalizeResult(raw, blocks, text, paragraphCount) {
  if (!raw || typeof raw !== 'object') return null
  const ids = new Set(blocks.map((block) => block.id))
  const matchMap = new Map()
  for (const match of Array.isArray(raw.matches) ? raw.matches : []) {
    if (!match || typeof match !== 'object') continue
    const id = typeof match.id === 'string' ? match.id.trim() : ''
    const blockId = typeof match.blockId === 'string' ? match.blockId.trim() : ''
    if (!id || !blockId || !ids.has(blockId) || matchMap.has(id)) continue
    matchMap.set(id, {
      id,
      blockId,
      quote: typeof match.quote === 'string' ? match.quote.trim() : '',
      reason: typeof match.reason === 'string' ? match.reason.trim() : '',
    })
  }
  const segments = []
  const seenParagraphs = new Set()
  for (const segment of Array.isArray(raw.segments) ? raw.segments : []) {
    if (!segment || typeof segment !== 'object') continue
    const value = typeof segment.text === 'string' ? segment.text : ''
    if (!value) continue
    const paragraph = Number(segment.paragraph)
    if (!Number.isInteger(paragraph) || paragraph < 1 || paragraph > paragraphCount) continue
    const matchId = typeof segment.matchId === 'string' && matchMap.has(segment.matchId) ? segment.matchId : null
    segments.push({ text: value, matchId, paragraph })
    seenParagraphs.add(paragraph)
  }
  if (!segments.length || seenParagraphs.size !== paragraphCount) return null
  segments.sort((a, b) => a.paragraph - b.paragraph)
  const translation = segments.map((segment) => segment.text).join('')
  if (translation.trim().length < Math.min(20, String(text ?? '').trim().length * 0.2)) return null
  return { segments, matches: [...matchMap.values()] }
}

export async function analyzeRebuttal(ctx, cfg, entry, text, target, signal) {
  const blocks = paperBlocks(entry)
  if (!blocks.length) throw new TranslationError('rebuttal/no-blocks', '当前论文没有可匹配的正文段落')
  const system = `You translate and cross-reference paper rebuttals.

## Task
Translate the reviewer rebuttal / response text into ${targetLabel(target)}.
The rebuttal is supplied as an ordered array of paragraphs. Preserve that
paragraph structure exactly: one or more consecutive segments per paragraph,
no paragraph merged with another, and no paragraph omitted. A segment may be a
sentence or a clause; do not omit, summarize, or reorder content.

For each segment that refers to a specific place in the paper, attach a match.
Each match must point at exactly one paper block id from the supplied list.
Use the original rebuttal quote for the match, and a one-sentence reason.

## Rules
1. Return JSON only:
   {"segments":[{"text":"translated text","paragraph":1,"matchId":"m1"}],"matches":[{"id":"m1","quote":"original rebuttal excerpt","blockId":"b12","reason":"why this block"}]}
2. Every segment must include paragraph, a 1-based integer from the supplied
   paragraphs array. Every paragraph 1..N must have at least one segment.
   Do not merge or split paragraphs across these indices.
3. Every matchId in a segment must exist in matches. Omit matchId when the
   segment is general and does not point at a paper block.
4. Only use blockId values from the supplied paper blocks. Never invent ids.
5. A match's quote must be copied from the rebuttal, not translated.
6. Matches are one-to-one: one match points at one block. Do not attach two
   matches to the same block unless the rebuttal clearly needs it.
7. Do not add commentary, markdown fences, or fields other than the schema.
8. Preserve formulas, citations, numbers, and technical terms accurately.
9. Write each reason in the target language.

Return the complete translation in ${targetLabel(target)}.`

  const paragraphs = splitParagraphs(text)
  const payload = {
    targetLanguage: targetLabel(target),
    rebuttal: String(text ?? ''),
    paragraphs: paragraphs.map((paragraph, index) => ({ index: index + 1, text: paragraph })),
    paper: {
      title: entry.data.title ?? '',
      mainFile: entry.data.mainFile,
      blocks,
    },
    glossary: cfg.glossary ?? {},
  }

  let usage = null
  let lastFailure = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await callModel(
      ctx,
      cfg,
      attempt === 0
        ? system
        : `${system}\n\nThe previous answer was invalid (${lastFailure}). Return strict JSON with valid block ids, a paragraph index on every translated segment, and non-empty translated segments.`,
      [{ role: 'user', content: [{ type: 'text', text: JSON.stringify(payload) }] }],
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
    const parsed = extractJson(reply.text)
    const result = normalizeResult(parsed, blocks, text, paragraphs.length)
    if (result) return { ...result, usage }
    lastFailure = 'schema, paragraph indices or block ids'
  }
  throw new TranslationError('rebuttal/invalid-output', `返修意见分析结果未通过校验：${lastFailure || 'unknown'}`)
}
