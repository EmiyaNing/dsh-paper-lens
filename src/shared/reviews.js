export function anchorFor(block) {
  return block ? { id: block.id, file: block.file, fileLine: block.fileLine, source: block.source, section: block.section } : null
}

export function resolveMatch(match, blocks, history = []) {
  if (match.scope && match.scope !== 'passage') return null
  const anchor = match.anchor
  let id = anchor?.id || match.blockId
  let source = anchor?.source
  let file = anchor?.file
  if (!id) return null
  // Follow chains in either direction, including an undo of several edits.
  const visited = new Set()
  while (!visited.has(id)) {
    visited.add(id)
    const change = history.findLast(item => {
      if (file && item.file !== file) return false
      const fromId = item.undone ? item.afterId : item.beforeId
      const fromText = item.undone ? item.after : item.before
      return fromId === id && (!source || source === fromText)
    })
    if (!change) break
    file = change.file
    id = change.undone ? change.beforeId : change.afterId
    source = change.undone ? change.before : change.after
  }
  const inFile = file ? blocks.filter(block => block.file === file) : blocks
  const exact = inFile.filter(block => (source ? block.source === source : block.id === id))
  if (exact.length === 1) return exact[0]
  if (exact.length) return exact.find(block => block.id === id && block.fileLine === anchor?.fileLine) ?? null
  if (file && match.evidence) {
    const quoted = inFile.filter(block => block.text?.includes(match.evidence))
    if (quoted.length === 1) return quoted[0]
  }
  return null
}

export function reviewIssues(reviewer) {
  if (!reviewer) return []
  if (Array.isArray(reviewer.issues)) return reviewer.issues
  return issuesFromAnalysis(reviewer.result, reviewer.text)
}

export function issuesFromAnalysis(result, rawText, previous = []) {
  if (!result) return []
  const issues = (result.matches ?? []).map(match => ({ ...match, scope: match.blockId ? 'passage' : (match.scope || 'unlocated') }))
  let paragraphs = String(rawText ?? '').trim().split(/\n\s*\n/).filter(Boolean)
  if (paragraphs.length === 1) paragraphs = paragraphs[0].split(/\n+/)
  const covered = new Set((result.segments ?? []).filter(segment => issues.some(issue => issue.id === segment.matchId)).map(segment => segment.paragraph))
  for (const [index, paragraph] of paragraphs.entries()) {
    if (!covered.has(index + 1) && paragraph.trim()) issues.push({ id: 'unmapped-' + (index + 1), quote: paragraph.trim(), scope: 'unlocated' })
  }
  const seen = new Set()
  const merged = issues.map(issue => {
    const old = previous.find(candidate => !seen.has(candidate) && candidate.quote === issue.quote)
    if (!old) return issue
    seen.add(old)
    return { ...issue, ...old, id: issue.id, ...(old.manual ? {} : { blockId: issue.blockId, anchor: issue.anchor, evidence: issue.evidence, scope: issue.scope }) }
  })
  // Keep author work even when a later analysis segments the report differently.
  for (const old of previous) {
    if (!seen.has(old) && (old.manual || old.reply || old.replied || old.revisionIds?.length)) {
      merged.push({ ...old, id: 'saved-' + (merged.length + 1) })
    }
  }
  return merged
}

export function linkedEdits(issue, reviewerId, history) {
  return history.filter(change => !change.undone && (issue.revisionIds?.includes(change.id) ||
    (change.issue?.reviewerId === reviewerId && change.issue?.quote === issue.quote)))
}

export function responseMarkdown(reviewers, blocks, history, title) {
  const lines = ['# Response to reviewers', '', title || '', '']
  for (const reviewer of reviewers.filter(item => item.text?.trim() || reviewIssues(item).length)) {
    lines.push('## ' + reviewer.name, '')
    const issues = reviewIssues(reviewer)
    if (!issues.length) lines.push(reviewer.text, '', '**TODO** — Review and respond.', '')
    for (const [index, issue] of issues.entries()) {
      const block = resolveMatch(issue, blocks, history)
      const edits = linkedEdits(issue, reviewer.id, history)
      lines.push('### Comment ' + (index + 1), '', ...String(issue.quote || '').split('\n').map(line => '> ' + line), '',
        '**Response**', '', issue.reply?.trim() || '[TODO: author response]', '')
      if (block) lines.push('**Manuscript location**  ' + [block.section, block.file + ':' + block.fileLine].filter(Boolean).join(' · '), '')
      if (issue.scope === 'experiment') lines.push(issue.experimentEvidence?.trim() ? '**Experimental evidence**  ' + issue.experimentEvidence.trim() : '[TODO: supply experimental evidence]', '')
      if (issue.scope === 'unlocated' || (issue.scope === 'passage' && !block)) lines.push('[TODO: verify manuscript location]', '')
      for (const edit of edits) lines.push('**Accepted change**', '', '- Before: ' + edit.before, '- After: ' + edit.after, '')
      if (!issue.replied) lines.push('[TODO: finalize reply]', '')
    }
  }
  return lines.join('\n')
}
