// Budget the model input after retrieval, so late sections and long paragraphs compete equally.
const stop = new Set('a an the to of in on for from by and or is are was were be have has how what this that do does paper authors please would could should clarify'.split(' '))
function tokens(value) {
  return (String(value).toLowerCase().match(/[\p{L}\d]+/gu) ?? []).filter(term => !stop.has(term))
}

export function retrievePassages(blocks, queries) {
  const passages = []
  const counts = new Map()
  const captions = new Map()
  const sectionNumbers = []
  for (const block of blocks) {
    if (!block.translatable || !block.text) continue
    let reference = ''
    if (block.kind === 'heading') {
      const level = Math.max(0, (block.level || 2) - 2)
      sectionNumbers.length = level + 1
      sectionNumbers[level] = (sectionNumbers[level] || 0) + 1
    }
    if (block.kind === 'caption' && block.label) {
      const n = (captions.get(block.label) || 0) + 1
      captions.set(block.label, n)
      reference = block.label + ' ' + n
    }
    const meta = [block.file, block.section, 'Section ' + sectionNumbers.join('.'), reference, ...(block.refLabels || []), ...(block.placeholders ?? []).map(p => p.key || '')].join(' ')
    for (let start = 0; start < block.text.length; start += 760) {
      const text = block.text.slice(start, start + 1000)
      const terms = new Set(tokens(text + ' ' + meta))
      for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1)
      passages.push({ id: block.id, section: block.section, file: block.file, text, referenceHint: reference, meta, terms })
      if (start + 1000 >= block.text.length) break
    }
  }
  if (!passages.length) return []
  const chosen = new Set()
  const rank = query => {
    const terms = [...new Set(tokens(query))]
    const refs = query.toLowerCase().replace(/\bfig\.?\s*(?=\d)/g, 'figure ').match(/(?:figure|table|section|algorithm)\s+\d+(?:\.\d+)*/g) || []
    return passages.map((passage, i) => {
      let score = 0
      for (const term of terms) if (passage.terms.has(term)) score += Math.log(1 + passages.length / counts.get(term))
      for (const ref of refs) if ((passage.meta.toLowerCase() + ' ').includes(ref + ' ')) score += 12
      return { i, score }
    }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 24)
  }
  const ranked = queries.map(rank)
  for (let k = 0; k < 24 && chosen.size < 72; k++) {
    for (const list of ranked) if (list[k] && chosen.size < 72) chosen.add(list[k].i)
  }
  const remaining = Math.min(72 - chosen.size, passages.length)
  for (let k = 0; k < remaining; k++) chosen.add(Math.round(k * (passages.length - 1) / Math.max(1, remaining - 1)))
  return [...chosen].sort((a, b) => a - b).map(i => {
    const { id, section, file, text, referenceHint } = passages[i]
    return { id, section, file, text, referenceHint }
  })
}
