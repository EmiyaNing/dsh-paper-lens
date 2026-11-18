/** Render the translated paper as a human-readable Markdown/LaTeX document. */

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

function placeholderToMarkdown(placeholder) {
  if (!placeholder) return ''
  if (placeholder.type === 'M') {
    const latex = placeholder.latex ?? ''
    return placeholder.display ? `\n\n$$\n${latex}\n$$\n\n` : `$${latex}$`
  }
  if (placeholder.type === 'C') return `\\cite{${placeholder.key ?? ''}}`
  if (placeholder.type === 'R') return `\\ref{${placeholder.key ?? ''}}`
  if (placeholder.type === 'U') return `\\url{${placeholder.url ?? ''}}`
  return ''
}

function renderText(text, placeholders) {
  const map = new Map((placeholders ?? []).map((item) => [item.token, item]))
  return String(text ?? '').replace(/⟦[A-Z]\d+⟧/g, (token) => placeholderToMarkdown(map.get(token)))
}

function renderBlock(block, translated) {
  const text = translated || block.text || ''
  const body = renderText(text, block.placeholders)
  if (block.kind === 'math') return `$$\n${block.latex}\n$$`
  if (block.kind === 'heading') {
    const level = Math.min(6, Math.max(1, Number(block.level) || 2))
    return `${'#'.repeat(level)} ${body}`
  }
  if (block.kind === 'item') return `- ${body}`
  if (block.kind === 'caption') return `**${block.label ?? 'Caption'}.** ${body}`
  if (block.kind === 'abstract') return `> ${body}`
  return body
}

export function renderMarkdown({ title, model, mainFile, blocks, translations, date = new Date() }) {
  const lines = []
  lines.push(`# ${title || mainFile || 'Paper translation'}`)
  lines.push('')
  lines.push(`> Paper Lens translation · ${model} · ${date.toISOString().slice(0, 10)}`)
  if (mainFile) lines.push(`> Source: \`${mainFile}\``)
  lines.push('')
  for (const block of blocks) {
    if (!block.translatable && block.kind !== 'math') continue
    const translated = translations[block.id] ?? block.text ?? ''
    if (!translated && block.kind !== 'math') continue
    lines.push(renderBlock(block, translated))
    lines.push('')
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}

export async function writeMarkdown(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, content, { mode: 0o644 })
  await rename(tmp, path)
}
