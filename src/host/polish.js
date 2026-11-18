/**
 * Best-Paper-Writing polish adapter.
 *
 * The vendored skill prompt supplies paragraph-level style rules; this module
 * only handles one block at a time, validates that protected LaTeX content did
 * not change, and never writes files. The review-then-save flow stays in the
 * browser.
 */

import { readFile } from 'node:fs/promises'
import { callModel, TranslationError } from './translator.js'

let promptPromise = null
function skillPrompt() {
  if (!promptPromise) {
    promptPromise = readFile(new URL('../../skills/best-paper-writing/POLISH.md', import.meta.url), 'utf8')
  }
  return promptPromise
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

function collect(text) {
  const value = String(text ?? '')
  return {
    math: [...value.matchAll(/\$\$[\s\S]*?\$\$|\$[^$]*\$|\\\[[\s\S]*?\\\]|\\\([\s\S]*?\\\)/g)].map((m) => m[0]),
    commands: [...value.matchAll(/\\[A-Za-z]+|\\[^A-Za-z]/g)].map((m) => m[0]),
    refs: [...value.matchAll(/\\(?:cite|citep|citet|citealp|ref|eqref|autoref|cref|Cref|label|url|href)\s*(?:\[[^\]]*\]\s*)*\{[^{}]*\}/g)].map((m) => m[0]),
    numbers: [...value.matchAll(/\d+(?:\.\d+)?%?/g)].map((m) => m[0]),
    placeholders: [...value.matchAll(/⟦[A-Z]\d+⟧/g)].map((m) => m[0]),
  }
}

function sameMultiset(left, right) {
  if (left.length !== right.length) return false
  const a = [...left].sort()
  const b = [...right].sort()
  return a.every((value, index) => value === b[index])
}

function cjkRatio(value) {
  const text = String(value ?? '').replace(/⟦[A-Z]\d+⟧/g, '')
  const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length
  const letters = (text.match(/[A-Za-z\u3400-\u9fff]/g) ?? []).length
  return letters === 0 ? 0 : cjk / letters
}

function hasDash(value) {
  return /—|\s–\s|\s---\s/.test(String(value ?? ''))
}

function validateRaw(original, polished) {
  if (typeof polished !== 'string' || polished.trim().length < 2) return 'empty'
  const before = collect(original)
  const after = collect(polished)
  for (const key of ['math', 'commands', 'refs', 'numbers', 'placeholders']) {
    if (!sameMultiset(before[key], after[key])) return `protected-${key}`
  }
  if (hasDash(polished)) return 'dash'
  if (cjkRatio(polished) > 0.05) return 'not-english'
  const ratio = polished.length / Math.max(1, original.length)
  if (ratio < 0.5 || ratio > 2) return 'length-outlier'
  return null
}

function validateEnglishTranslation(chinese, english, tokens) {
  if (typeof english !== 'string' || english.trim().length < 2) return 'empty'
  if (!sameMultiset(collect(chinese).placeholders, collect(english).placeholders)) return 'placeholder-mismatch'
  if (tokens && !sameMultiset(tokens, collect(english).placeholders)) return 'placeholder-mismatch'
  if (!sameMultiset(collect(chinese).numbers, collect(english).numbers)) return 'number-mismatch'
  if (/\\[A-Za-z]+/.test(english)) return 'latex-command-leak'
  if (cjkRatio(english) > 0.05) return 'not-english'
  if (hasDash(english)) return 'dash'
  const ratio = english.length / Math.max(1, chinese.length)
  if (ratio < 0.35 || ratio > 8) return 'length-outlier'
  return null
}

function contextBlock(context = {}) {
  const lines = []
  if (context.title) lines.push(`Paper title: ${context.title}`)
  if (context.section) lines.push(`Section: ${context.section}`)
  if (context.prevSource) lines.push(`Previous source: ${String(context.prevSource).slice(0, 600)}`)
  if (context.prevTranslation) lines.push(`Previous translation: ${String(context.prevTranslation).slice(0, 400)}`)
  if (context.nextSource) lines.push(`Next source: ${String(context.nextSource).slice(0, 400)}`)
  if (context.referenceSource) lines.push(`Original block (may be outdated): ${String(context.referenceSource).slice(0, 600)}`)
  if (context.glossary && Object.keys(context.glossary).length) {
    lines.push(`Glossary: ${Object.entries(context.glossary).slice(0, 60).map(([a, b]) => `${a} => ${b}`).join('; ')}`)
  }
  return lines.join('\n')
}

async function runTask(ctx, cfg, system, payload, validate, signal) {
  let usage = null
  let lastFailure = null
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await callModel(
      ctx,
      cfg,
      attempt === 0
        ? system
        : `${system}\n\nThe previous answer was invalid (${lastFailure ?? 'unparseable'}). Preserve every protected LaTeX token, number and placeholder, and return strict JSON only.`,
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
    const text = parsed && typeof parsed.text === 'string' ? parsed.text : null
    const error = validate(text)
    if (!error) return { text, usage }
    lastFailure = error
  }
  throw new TranslationError('polish/invalid-output', `润色结果未通过校验：${lastFailure ?? 'unknown'}`)
}

export async function polishRawLatex(ctx, cfg, raw, context, signal) {
  const base = await skillPrompt()
  const system = `${base}

## Task: polish an English LaTeX fragment

Rewrite the prose of the supplied fragment so it reads like a CVPR/ICCV/NeurIPS
award paper, following every rule above. The fragment is one paragraph of a
larger paper. Keep all LaTeX commands, math expressions, citations, references,
labels, URLs and numbers unchanged. Do not add or remove facts. Return JSON
{"text":"<complete polished LaTeX fragment>"} only.

${contextBlock(context)}`
  return runTask(ctx, cfg, system, { text: String(raw ?? '') }, (text) => validateRaw(raw, text), signal)
}

export async function polishChineseToEnglish(ctx, cfg, chinese, placeholders, context, signal) {
  const base = await skillPrompt()
  const system = `${base}

## Task: translate Chinese into polished English

Translate the supplied Chinese paragraph into English academic prose and apply
the style rules above. Preserve every ⟦M1⟧-style placeholder exactly once and
in order; the caller restores them into LaTeX. Do not add facts, numbers,
baselines, citations or claims. Return JSON {"text":"<English text with placeholders>"} only.

${contextBlock(context)}`
  return runTask(
    ctx,
    cfg,
    system,
    { text: String(chinese ?? '') },
    (text) => validateEnglishTranslation(chinese, text, placeholders),
    signal,
  )
}
