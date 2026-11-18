/**
 * Cross-reviewer synthesis: overlapping vs reviewer-specific concerns and each
 * reviewer's attitude toward the paper. The output is advisory: the model must
 * quote the input and never invent a concern or reviewer.
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

function targetLabel(target) {
  return target === 'en' ? 'English' : 'Simplified Chinese'
}

function text(value, limit = 600) {
  return typeof value === 'string' ? value.trim().slice(0, limit) : ''
}

function normalizeResult(raw, reviewers) {
  if (!raw || typeof raw !== 'object') return null
  const ids = new Set(reviewers.map((reviewer) => reviewer.id))
  const attitudes = []
  const attitudeById = new Map()
  for (const item of Array.isArray(raw.reviewers) ? raw.reviewers : []) {
    if (!item || typeof item !== 'object') continue
    const id = text(item.id, 40)
    if (!ids.has(id) || attitudeById.has(id)) continue
    const attitude = ['positive', 'neutral', 'negative', 'mixed'].includes(item.attitude) ? item.attitude : 'neutral'
    const score = Number(item.score)
    const entry = {
      id,
      attitude,
      score: Number.isFinite(score) ? Math.max(-2, Math.min(2, score)) : 0,
      summary: text(item.summary, 1200),
      evidence: (Array.isArray(item.evidence) ? item.evidence : [])
        .map((quote) => text(quote, 500))
        .filter(Boolean)
        .slice(0, 5),
    }
    attitudes.push(entry)
    attitudeById.set(id, entry)
  }
  if (!attitudes.length) return null

  const overlaps = []
  for (const item of Array.isArray(raw.overlaps) ? raw.overlaps : []) {
    if (!item || typeof item !== 'object') continue
    const reviewerIds = [...new Set((Array.isArray(item.reviewerIds) ? item.reviewerIds : []).filter((id) => ids.has(id)))]
    if (reviewerIds.length < 2) continue
    overlaps.push({
      id: text(item.id, 40) || `o${overlaps.length + 1}`,
      title: text(item.title, 300),
      summary: text(item.summary, 1600),
      severity: item.severity === 'major' ? 'major' : 'minor',
      reviewerIds,
      quotes: (Array.isArray(item.quotes) ? item.quotes : [])
        .map((quote) => ({ reviewerId: text(quote?.reviewerId, 40), text: text(quote?.text, 500) }))
        .filter((quote) => ids.has(quote.reviewerId) && quote.text)
        .slice(0, 8),
    })
  }

  const unique = []
  for (const item of Array.isArray(raw.unique) ? raw.unique : []) {
    if (!item || typeof item !== 'object') continue
    const reviewerId = text(item.reviewerId, 40)
    if (!ids.has(reviewerId)) continue
    unique.push({
      id: text(item.id, 40) || `u${unique.length + 1}`,
      reviewerId,
      title: text(item.title, 300),
      summary: text(item.summary, 1600),
      severity: item.severity === 'major' ? 'major' : 'minor',
      quote: text(item.quote, 500),
    })
  }

  return {
    summary: text(raw.summary, 2000),
    reviewers: attitudes,
    overlaps,
    unique,
  }
}

export async function analyzeOverview(ctx, cfg, entry, reviewers, target, signal) {
  const input = reviewers.map((reviewer) => ({
    id: reviewer.id,
    name: reviewer.name,
    text: String(reviewer.text ?? '').slice(0, 20000),
  }))
  const system = `You compare multiple reviewer reports for one paper.

## Tasks
1. For each reviewer, infer their attitude toward the paper from their own
   language: positive, neutral, negative, or mixed. Give a score from -2
   (strong reject) to 2 (strong accept), a short summary, and up to five
   verbatim evidence quotes. Use reviewer follow-up replies when present, but
   ignore the authors' defense language: never score the authors' rebuttal as
   the reviewer's attitude.
2. Build overlap groups: substantive concerns raised by two or more reviewers.
   For each group give a title, a concise synthesis, severity major/minor, the
   reviewer ids, and short quotes from each reviewer.
3. Build unique groups: substantive concerns raised by exactly one reviewer.
   Give reviewerId, title, summary, severity, and one quote.
4. Give an overall summary of the review set.

Only use the supplied reviews. Never invent a reviewer id, quote, number, or
concern. If there is no clear overlap, return an empty overlaps array.

## Output
Return JSON only:
{"summary":"...","reviewers":[{"id":"r1","attitude":"negative","score":-1,"summary":"...","evidence":["quote"]}],"overlaps":[{"id":"o1","title":"...","summary":"...","severity":"major","reviewerIds":["r1","r2"],"quotes":[{"reviewerId":"r1","text":"quote"}]}],"unique":[{"id":"u1","reviewerId":"r1","title":"...","summary":"...","severity":"minor","quote":"quote"}]}

Write the summary, group summaries, and attitude summaries in
${targetLabel(target)}. Keep quotes in their original language. Return every
reviewer exactly once in reviewers.`

  const payload = {
    targetLanguage: targetLabel(target),
    paper: { title: entry.data.title ?? '', mainFile: entry.data.mainFile },
    reviewers: input,
  }

  let usage = null
  let lastFailure = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await callModel(
      ctx,
      cfg,
      attempt === 0
        ? system
        : `${system}\n\nThe previous answer was invalid (${lastFailure}). Return strict JSON with every reviewer exactly once, valid ids, and valid attitudes.`,
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
    const result = normalizeResult(parsed, input)
    if (result && new Set(result.reviewers.map((item) => item.id)).size === input.length) {
      return { ...result, usage }
    }
    lastFailure = 'schema, reviewer ids or attitude fields'
  }
  throw new TranslationError('rebuttal/overview-invalid', `审稿意见总览未通过校验：${lastFailure || 'unknown'}`)
}
