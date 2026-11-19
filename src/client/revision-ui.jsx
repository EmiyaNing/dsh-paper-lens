import { anchorFor, linkedEdits, resolveMatch } from '../shared/reviews.js'

export const label = (zh, en) => /^zh/i.test(globalThis.navigator?.language || '') ? zh : en

// Preserve whitespace and TeX commands. Use a bounded LCS for the changed middle.
export function wordDiff(before, after) {
  const tokenize = text => text.match(/\\[a-zA-Z]+|[\p{L}\p{N}_]+|\s+|[^\s]/gu) || []
  const a = tokenize(before), b = tokenize(after)
  let start = 0, end = 0
  while (start < a.length && start < b.length && a[start] === b[start]) start++
  while (end < a.length - start && end < b.length - start && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
  const x = a.slice(start, a.length - end), y = b.slice(start, b.length - end)
  const runs = []
  const add = (kind, value) => {
    if (!value) return
    if (runs.at(-1)?.kind === kind) runs.at(-1).text += value
    else runs.push({ kind, text: value })
  }
  add('same', a.slice(0, start).join(''))
  if (x.length * y.length <= 500000) {
    const width = y.length + 1
    const lcs = new Uint32Array((x.length + 1) * width)
    for (let i = x.length - 1; i >= 0; i--) for (let j = y.length - 1; j >= 0; j--) {
      lcs[i * width + j] = x[i] === y[j] ? 1 + lcs[(i + 1) * width + j + 1] : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1])
    }
    let i = 0, j = 0
    while (i < x.length || j < y.length) {
      if (i < x.length && x[i] === y[j]) { add('same', x[i++]); j++ }
      else if (j === y.length || (i < x.length && lcs[(i + 1) * width + j] >= lcs[i * width + j + 1])) add('del', x[i++])
      else add('ins', y[j++])
    }
  } else { add('del', x.join('')); add('ins', y.join('')) }
  add('same', end ? a.slice(-end).join('') : '')
  return runs
}

export function createRevisionUI(React) {
  const { useState } = React
  function Diff({ before, after }) {
    const important = /(\b(?:\d+(?:\.\d+)?%?|no|not|never|only|all|any|may|might|must|can|does|always|than|baseline|compared|higher|lower|better|worse|more|less|significant(?:ly)?)\b)/gi
    return <div className="pt-word-diff" lang="en">{wordDiff(before, after).map(({ kind, text }, i) => {
      if (kind === 'same') return <React.Fragment key={i}>{text}</React.Fragment>
      const Tag = kind
      return <Tag key={i}>{text.split(important).map((part, j) => j % 2 ? <strong key={j}>{part}</strong> : part)}</Tag>
    })}</div>
  }
  function IssueDetail({ reviewerId, editing, issues, selected, onSelect, onChange, blocks, history, activeBlock, onEdit }) {
    const index = Math.max(0, issues.findIndex(issue => issue.id === selected))
    const issue = issues[index]
    if (!issue) return null
    const block = resolveMatch(issue, blocks, history)
    const edits = linkedEdits(issue, reviewerId, history)
    const other = block && history.filter(change => !change.undone && change.file === block.file && change.afterId === block.id && !edits.some(edit => edit.id === change.id)).at(-1)
    return <section className="pt-issue" aria-label={label('当前意见', 'Current comment')}>
      <div className="pt-issue-nav">
        {issues.length === 1 ? <strong>{label('意见 1', 'Comment 1')}</strong> : <><select aria-label={label('选择意见', 'Select comment')} value={issue.id} onChange={e => onSelect(issues.find(item => item.id === e.target.value))}>
          {issues.map((item, i) => <option key={item.id} value={item.id}>{i + 1} / {issues.length} · {item.quote?.slice(0, 65)}</option>)}
        </select>
          <button className="pt-btn" aria-label={label('上一条', 'Previous comment')} disabled={!index} onClick={() => onSelect(issues[index - 1])}>‹</button>
          <button className="pt-btn" aria-label={label('下一条', 'Next comment')} disabled={index === issues.length - 1} onClick={() => onSelect(issues[index + 1])}>›</button></>}
      </div>
      <blockquote className="pt-review-quote">{issue.quote}</blockquote>
      <div className="pt-issue-flags"><span>{edits.length ? label('正文已改', 'Manuscript revised') : label('尚无关联修改', 'No linked edit')}</span><span>{issue.replied ? label('已回复', 'Replied') : label('待回复', 'Reply pending')}</span></div>
      <label>{label('原文位置', 'Manuscript location')}
        <select value={block ? 'passage' : issue.scope === 'passage' ? 'unlocated' : issue.scope || 'unlocated'} onChange={e => onChange(issue, { scope: e.target.value, blockId: null, anchor: null, evidence: '', manual: true })}>
          {block && <option value="passage">{block.file} · L{block.fileLine}</option>}
          <option value="unlocated">{label('待核对', 'Verify location')}</option>
          <option value="general">{label('全文性意见', 'General comment')}</option>
          <option value="experiment">{label('需要新增实验', 'New experiment needed')}</option>
        </select>
      </label>
      {block && <div className="pt-paper-evidence"><button className="pt-link" onClick={() => onSelect(issue)}>{block.section || block.file} ↗</button>
        <p>{issue.evidence && block.text?.includes(issue.evidence) ? <mark>{issue.evidence}</mark> : block.text}</p></div>}
      <div className="pt-issue-actions">
        {block && !editing && <button className="pt-btn pt-btn-primary" onClick={() => onEdit(block, issue)}>{label('修改这一段', 'Revise passage')}</button>}
        {activeBlock?.translatable && activeBlock.id !== block?.id && <button className="pt-btn" onClick={() => onChange(issue, { scope: 'passage', blockId: activeBlock.id, anchor: anchorFor(activeBlock), evidence: '', manual: true })}>{label('绑定当前选段', 'Bind selected passage')}</button>}
        {other && <button className="pt-btn" onClick={() => onChange(issue, { revisionIds: [...(issue.revisionIds || []), other.id] })}>{label('关联本段已有修改', 'Link existing edit')}</button>}
      </div>
      {edits.map(edit => <details key={edit.id}><summary>{label('已采纳的英文改动', 'Accepted English change')}</summary><Diff before={edit.before} after={edit.after} /></details>)}
      {issue.scope === 'experiment' && <label>{label('实验结果或证据位置', 'Experimental result or evidence location')}
        <input type="text" value={issue.experimentEvidence || ''} onChange={e => onChange(issue, { experimentEvidence: e.target.value })} /></label>}
      <label>{label('逐点回复草稿', 'Response draft')}<textarea value={issue.reply || ''} onChange={e => onChange(issue, { reply: e.target.value, replied: false })} /></label>
      <label className="pt-inline"><input type="checkbox" checked={Boolean(issue.replied)} disabled={!issue.reply?.trim()} onChange={e => onChange(issue, { replied: e.target.checked })} />{label('标记已回复', 'Mark as replied')}</label>
    </section>
  }
  function Glossary({ glossary, setGlossary, selected, blocks, translations, onLocate }) {
    const [term, setTerm] = useState(selected || '')
    const [meaning, setMeaning] = useState(glossary[selected] || '')
    const folded = term.trim().toLowerCase()
    const hits = folded ? blocks.filter(block => (block.source || block.text || '').toLowerCase().includes(folded)) : []
    const mismatches = hits.filter(block => translations[block.id]?.text && meaning.trim() && !translations[block.id].text.includes(meaning.trim()))
    return <section className="pt-gloss"><h4>{label('项目术语', 'Project glossary')}</h4>
      <div className="pt-gloss-fields"><label>{label('英文术语', 'English term')}<input value={term} onChange={e => { setTerm(e.target.value); setMeaning(glossary[e.target.value] || '') }} /></label>
        <label>{label('固定译法', 'Preferred translation')}<input value={meaning} onChange={e => setMeaning(e.target.value)} /></label></div>
      <button className="pt-btn" disabled={!term.trim() || !meaning.trim()} onClick={() => setGlossary({ ...glossary, [term.trim()]: meaning.trim() })}>{label('保存术语', 'Save term')}</button>
      {Object.entries(glossary).map(([key, value]) => <div className="pt-term" key={key}><button className="pt-link" onClick={() => { setTerm(key); setMeaning(value) }}>{key} → {value}</button>
        <button className="pt-btn pt-mini" aria-label={label('删除术语 ', 'Remove term ') + key} onClick={() => { const next = { ...glossary }; delete next[key]; setGlossary(next) }}>×</button></div>)}
      {folded && meaning && <details open={mismatches.length > 0}><summary>{label('译法待核对', 'Check translation')} · {mismatches.length}</summary>
        {mismatches.map(block => <button key={block.id} className="pt-match-link" onClick={() => onLocate(block.id)}>{block.file} · L{block.fileLine} — {translations[block.id].text.slice(0, 90)}</button>)}</details>}
    </section>
  }
  return { Diff, IssueDetail, Glossary }
}
