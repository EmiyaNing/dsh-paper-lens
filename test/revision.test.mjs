import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { registerRoutes } from '../src/host/routes.js'
import { retrievePassages } from '../src/host/retrieval.js'
import { analyzeRebuttal } from '../src/host/rebuttal.js'
import { anchorFor, issuesFromAnalysis, resolveMatch, responseMarkdown } from '../src/shared/reviews.js'

const source = 'We use a fixed threshold at test time.'
const proposal = 'We select the threshold on the validation set and keep it fixed at test time.'
const chinese = '阈值在验证集上选定，测试阶段保持不变。'

function model(answer) {
  return {
    async *stream({ messages }) {
      const payload = JSON.parse(messages[0].content[0].text)
      yield { type: 'text-delta', text: JSON.stringify(answer(payload)) }
      yield { type: 'usage', usage: { input: 11, output: 7 } }
      yield { type: 'finish', reason: { kind: 'stop' } }
    }
  }
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'paper-lens-tests-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const path = join(root, 'sections.tex')
  await writeFile(join(root, 'main.tex'), '\\documentclass{article}\n\\begin{document}\n\\input{sections}\n\nAfter the included text.\n\\end{document}\n')
  await writeFile(path, '\\section{Evaluation}\r\n\r\n' + source + '\r\n')
  const routes = new Map()
  let calls = 0
  const llm = model(payload => {
    calls++
    return { translations: payload.blocks.map(block => ({ id: block.id, text: payload.targetLanguage === 'en' ? proposal : chinese })) }
  })
  registerRoutes({ llm, effect: fn => fn(), connection: { fetch: { register: route => { routes.set(route.path, route.fetch); return () => { } } } } }, { model: 'demo', targetLanguage: 'zh-CN', provider: 'fixture', pricing: {} })
  async function post(path, body) {
    const url = 'http://localhost/api/paper-translator/' + path
    const response = await routes.get(new URL(url).pathname)(new Request(url, { method: 'POST', body: JSON.stringify(body) }))
    return { status: response.status, ...await response.json() }
  }
  const project = await post('project/open', { root, mainFile: 'main.tex' })
  assert.equal(project.status, 200)
  const block = project.blocks.find(item => item.source === source)
  assert.equal(block.fileLine, 3)
  assert.equal(project.blocks.find(item => item.source === 'After the included text.').fileLine, 5)
  const base = { projectId: project.projectId, blockId: block.id, file: block.file, fileLine: block.fileLine, original: block.source }
  return { root, path, post, project, block, base, calls: () => calls }
}

test('preview, exact acceptance, preserved independent edits, durable record, stable anchors and undo', async t => {
  const { root, path, post, project, block, base, calls } = await fixture(t)
  const initial = await readFile(path, 'utf8')
  const preview = await post('block/preview', { ...base, chineseText: chinese })
  assert.equal(preview.englishSource, proposal)
  assert.equal(await readFile(path, 'utf8'), initial)
  await writeFile(path, initial + '\r\nIndependent correction.\r\n')
  const apply = await post('block/rewrite', { ...base, englishSource: preview.englishSource, chineseText: chinese })
  assert.equal(apply.status, 200, JSON.stringify(apply.error))
  assert.equal(calls(), 1)
  assert.equal(await readFile(path, 'utf8'), initial.replace(source, proposal) + '\r\nIndependent correction.\r\n')
  const issue = { id: 'm1', scope: 'passage', blockId: block.id, anchor: anchorFor(block), quote: 'Which threshold?', reply: 'We clarified the choice.', replied: true, revisionIds: [apply.history[0].id] }
  assert.equal(resolveMatch(issue, apply.blocks, apply.history).source, proposal)
  const workspace = { reviewers: [{ id: 'r1', name: 'Reviewer 1', text: issue.quote, issues: [issue] }], overview: null, glossary: { threshold: '阈值' } }
  assert.equal((await post('review/save', { projectId: project.projectId, workspace, version: 0 })).version, 1)
  assert.equal((await post('review/save', { projectId: project.projectId, workspace: { ...workspace, reviewers: [] }, version: 0 })).status, 409)
  const reopen = await post('project/open', { root, mainFile: 'main.tex' })
  assert.deepEqual(reopen.review.workspace, workspace)
  assert.equal(reopen.review.history.length, 1)
  assert.match(responseMarkdown(workspace.reviewers, reopen.blocks, reopen.review.history, 'Paper'), /We clarified the choice/)
  const undo = await post('block/undo', { projectId: project.projectId, revisionId: apply.history[0].id })
  assert.equal(undo.status, 200)
  assert.equal(undo.history[0].undone, true)
  assert.equal(await readFile(path, 'utf8'), initial + '\r\nIndependent correction.\r\n')
  assert.equal(resolveMatch(issue, undo.blocks, undo.history).id, block.id)
  assert.doesNotMatch(responseMarkdown(workspace.reviewers, undo.blocks, undo.history, 'Paper'), /Accepted change/)
})

test('parallel acceptance and external edits cannot overwrite a changed original', async t => {
  const { post, base, path } = await fixture(t)
  const requests = await Promise.all([proposal, 'We hold the cutoff fixed during testing.'].map(englishSource =>
    post('block/rewrite', { ...base, englishSource, chineseText: chinese })))
  assert.deepEqual(requests.map(r => r.status).sort(), [200, 409])
  const accepted = requests.find(r => r.status === 200)
  await writeFile(path, '\\section{Evaluation}\n\nAn external replacement.\n')
  const undo = await post('block/undo', { projectId: base.projectId, revisionId: accepted.history[0].id })
  assert.equal(undo.status, 409)
  assert.match(await readFile(path, 'utf8'), /external replacement/)
})

test('retrieval covers appendix and long passage, requires verifiable excerpts, retains unanswered concerns', async () => {
  const blocks = Array.from({ length: 165 }, (_, i) => ({ id: 'b' + i, file: 'main.tex', translatable: true, section: 'Methods', text: 'The same common description.', source: 'The same common description.' }))
  const evidence = 'Our rare zebra calibration uses independent validation.'
  blocks.push({ id: 'appendix', file: 'appendix.tex', fileLine: 4, section: 'Appendix A', translatable: true, text: 'More results. '.repeat(160) + evidence, source: evidence })
  const text = 'Explain the rare zebra calibration.\n\nPlease run a new trial.'
  assert(retrievePassages(blocks, [text]).some(block => block.id === 'appendix' && block.text.includes(evidence)))
  const llm = model(() => ({
    matches: [{ id: 'm', scope: 'passage', blockId: 'appendix', evidence, quote: 'Explain the rare zebra calibration.' },
    { id: 'n', blockId: 'appendix', quote: 'Please run a new trial.', evidence: 'Invented sentence' }],
    segments: [{ paragraph: 1, matchId: 'm', text: '解释校准。' }, { paragraph: 2, matchId: 'n', text: '请补充实验，给出新的验证结果。' }]
  }))
  const out = await analyzeRebuttal({ llm }, {}, { data: { blocks } }, text, 'zh-CN')
  assert.equal(out.matches[0].anchor.file, 'appendix.tex')
  assert.equal(out.matches[1].scope, 'unlocated')
  const previous = [{ ...out.matches[0], reply: 'Author response', replied: true }]
  const issues = issuesFromAnalysis(out, text, previous)
  assert.equal(issues[0].reply, 'Author response')
  assert.equal(resolveMatch(issues[0], [{ ...blocks.at(-1), id: 'new', source: 'Edited', text: 'No quote' }]), null)
})

test('invalid multi-paragraph changes restore the exact original file', async t => {
  const { path, post, base } = await fixture(t)
  const before = await readFile(path)
  const result = await post('block/rewrite', { ...base, englishSource: 'First passage.\n\nSecond passage.', chineseText: chinese })
  assert.equal(result.error.code, 'rewrite/reparse-failed')
  assert.deepEqual(await readFile(path), before)
})

test('two reviewers can share one edit and keep independent replies and evidence tasks', async t => {
  const { post, block, base } = await fixture(t)
  const linked = { id: 'm1', quote: 'Where was the threshold chosen?', scope: 'passage', anchor: anchorFor(block) }
  const change = await post('block/rewrite', {
    ...base, englishSource: proposal, chineseText: chinese,
    issueLink: { reviewerId: 'r1', issueId: 'm1', quote: linked.quote }
  })
  const reviewers = [
    { id: 'r1', name: 'Reviewer 1', issues: [{ ...linked, reply: 'We clarified this in Evaluation.', replied: true }] },
    {
      id: 'r2', name: 'Reviewer 2', issues: [{ ...linked, revisionIds: [change.revisionId], reply: '' },
      { id: 'm2', scope: 'experiment', quote: 'Add an ablation.', reply: 'We will include it.', replied: true }]
    },
  ]
  const markdown = responseMarkdown(reviewers, change.blocks, change.history, 'Example')
  assert.equal(markdown.match(/\*\*Accepted change\*\*/g).length, 2)
  assert.equal(markdown.match(/finalize reply/g).length, 1)
  assert.match(markdown, /supply experimental evidence/)
  const experiment = reviewers[1].issues[1]
  experiment.experimentEvidence = 'Table A2, appendix.'
  assert.match(responseMarkdown(reviewers, change.blocks, change.history, 'Example'), /Table A2, appendix/)
})
