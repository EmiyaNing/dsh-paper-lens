import fs from 'node:fs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
process.env.NODE_ENV = 'production'
const require = createRequire(import.meta.url)
const { JSDOM } = require('jsdom')
const React = require('react')
const { createRoot } = require('react-dom/client')

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://127.0.0.1:53754/' })
dom.window.HTMLElement.prototype.focus = function focus() {}
dom.window.Element.prototype.scrollIntoView = function scrollIntoView() {}
dom.window.Element.prototype.scrollTo = function scrollTo() {}
globalThis.window = dom.window
globalThis.document = dom.window.document
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true })
globalThis.localStorage = dom.window.localStorage
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)
globalThis.cancelAnimationFrame = (id) => clearTimeout(id)
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
globalThis.HTMLElement = dom.window.HTMLElement

localStorage.setItem('paperTranslator.root', '/tmp/demo')
localStorage.setItem('paperTranslator.main', 'main.tex')

const block = (id, line, text) => ({ id, line, file:'main.tex', fileLine:line, source:text, text, translatable: true, kind: 'paragraph', label: '', env: '' })
const project = {
  projectId: 'p1', root: '/tmp/demo', mainFile: 'main.tex', title: 'Demo Paper', totalLines: 120,
  source: '\\section{Intro}\nHello world.\n',
  texFiles: ['main.tex', 'supp.tex'],
  blocks: [
    block('b1', 1, 'Introduction'),
    block('b2', 2, 'Hello world.'),
    { ...block('b3', 3, '我们提出⟦C1⟧的方法。'), placeholders: [{ token: '⟦C1⟧', type: 'C', key: 'zhang2024,li2023' }] },
  ],
  translations: { b2: '你好，世界。', b3: '我们提出⟦C1⟧的方法。' },
  pdf: { exists: false },
  warnings: [],
  usage: { input: 100, output: 50, cacheRead: 10, cacheWrite: 0, calls: 2, costUsd: 0.001, costCny: 0.007 },
  globalUsage: { input: 1000, output: 500, calls: 10, costUsd: 0.01 },
}
const opened = []
let statSig = '1'
let refreshBlocks = null
const routes = {
  '/api/paper-translator/health': { ok: true, model: 'deepseek-chat' },
  '/api/paper-translator/project/list': { files: ['main.tex', 'supp.tex'] },
  '/api/paper-translator/directory/pick': { kind: 'native', path: '/tmp/other' },
  '/api/paper-translator/rebuttal/load': { reviewers: [], overview: null },
  '/api/paper-translator/settings': {},
  '/api/paper-translator/stat': { sig: '1' },
  '/api/paper-translator/translate': {},
}
const fetched = []
globalThis.fetch = async (url, init) => {
  const path = String(url).replace(/^https?:\/\/[^/]+/, '').split('?')[0]
  fetched.push(path)
  let payload = routes[path] ?? {}
  if (path.endsWith('/stat')) payload = { sig: statSig }
  if (path.endsWith('/project/open') || path.endsWith('/project/refresh')) {
    let body = {}
    try { body = JSON.parse(init?.body ?? '{}') } catch {}
    const main = body.mainFile || 'main.tex'
    opened.push(main)
    const root = body.root || '/tmp/demo'
    const title = root === '/tmp/other' ? 'Other Project' : (main === 'supp.tex' ? 'Supplement' : 'Demo Paper')
    payload = { ...project, root, mainFile: main, title }
    if (path.endsWith('/project/refresh') && refreshBlocks) {
      payload = { ...payload, blocks: refreshBlocks, changed: ['b4'], removed: [] }
    }
  }
  return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } })
}
dom.window.fetch = globalThis.fetch

let mod = null
const loader = { load(def) { mod = def.factory((name) => { if (name === 'react') return React; throw new Error('external ' + name) }) } }
globalThis.__ModuleLoader__ = loader
dom.window.__ModuleLoader__ = loader
;(0, eval)(fs.readFileSync(new URL('../client.js', import.meta.url), 'utf8'))

let App = null
const panelSelections = []
const layoutStub = { selectPanel: (id) => panelSelections.push(id) }
const ctx = {
  layout: layoutStub,
  get: (name) => (name === 'layout' ? layoutStub : undefined),
  effect(fn) { const d = fn(); return typeof d === 'function' ? d : () => {} },
  locale: { register: () => () => {}, bind: () => (k) => k },
  slots: { inject(name, cb) { cb() }, register(opts, comp) { if (opts.name === 'main') App = comp; return () => {} } },
}
mod.apply(ctx)

const errors = []
const originalError = console.error
console.error = (...args) => { errors.push(args.map(String).join(' ')); originalError(...args) }

createRoot(document.getElementById('root')).render(React.createElement(App))
await new Promise((resolve) => setTimeout(resolve, 800))

const html = document.body.innerHTML
console.log('mounted html length', html.length)
for (const marker of ['pt-cmdbar', 'pt-viewseg', 'pt-statusbar', 'pt-main', 'pt-proj']) {
  console.log(marker, html.includes(marker))
}
console.log('react errors:', errors.length ? errors.slice(0, 3) : 'none')
const cite = document.querySelector('.pt-cite')
console.log('citation marker:', cite?.textContent, '| tooltip:', cite?.getAttribute('title'))

// File watch: a changed signature must repaint without a manual reload.
await new Promise((r) => setTimeout(r, 2300))
statSig = '2'
refreshBlocks = [...project.blocks, block('b4', 4, 'Auto-refreshed paragraph.')]
await new Promise((r) => setTimeout(r, 2600))
console.log('auto refresh:', document.body.textContent.includes('Auto-refreshed paragraph'), '| blocks after:', document.querySelectorAll('.pt-block').length)

const click = async (el) => { el.click(); await new Promise((r) => setTimeout(r, 60)) }
const byText = (sel, text) => [...document.querySelectorAll(sel)].find((el) => el.textContent.trim() === text)

const pdfBtn = byText('.pt-viewseg button', 'PDF')
await click(pdfBtn)
console.log('single view panes:', document.querySelectorAll('.pt-pane').length)

console.log('viewseg buttons:', [...document.querySelectorAll('.pt-viewseg button')].map((el) => JSON.stringify(el.textContent)))
const splitBtn = byText('.pt-viewseg button', 'Split')
await click(splitBtn)
console.log('split view panes:', document.querySelectorAll('.pt-pane').length)

await click(document.querySelector('.pt-proj'))
console.log('project menu:', Boolean(document.querySelector('.pt-menu-left')))

await click(document.querySelector('.pt-more'))
const more = document.querySelector('.pt-menu-right')
console.log('more menu:', Boolean(more))
const settingsItem = [...(more?.querySelectorAll('.pt-menu-item') ?? [])].find((el) => el.textContent.includes('Settings'))
await click(settingsItem)
console.log('settings dock:', Boolean(document.querySelector('.pt-dock')))

await click(document.querySelector('.pt-usage'))
console.log('usage popover:', Boolean(document.querySelector('.pt-usage-pop')))

await click(document.querySelector('.pt-back'))
console.log('back to conversation:', panelSelections.includes(null))

const select = document.querySelector('.pt-mainfile')
const setValue = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(select), 'value').set
setValue.call(select, 'supp.tex')
select.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
await new Promise((r) => setTimeout(r, 300))
console.log('main file reopen:', opened.includes('supp.tex'), '| header:', document.querySelector('.pt-proj-name')?.textContent)

await click(document.querySelector('.pt-more'))
const menu2 = document.querySelector('.pt-menu-right')
const switchItem = [...(menu2?.querySelectorAll('.pt-menu-item') ?? [])].find((el) => el.textContent.includes('Switch project'))
await click(switchItem)
await new Promise((r) => setTimeout(r, 300))
console.log('switch project -> empty state:', Boolean(document.querySelector('.pt-empty')))
const recentItem = document.querySelector('.pt-recent-item')
await click(recentItem)
await new Promise((r) => setTimeout(r, 500))
console.log('reopen from recent:', !document.querySelector('.pt-empty'), '| header:', document.querySelector('.pt-proj-name')?.textContent)
await click(document.querySelector('.pt-back'))
console.log('back after switch:', panelSelections.includes(null))

const menu3 = (await click(document.querySelector('.pt-more')), document.querySelector('.pt-menu-right'))
const rebuttalItem = [...(menu3?.querySelectorAll('.pt-menu-item') ?? [])].find((el) => el.textContent.includes('Rebuttal'))
await click(rebuttalItem)
console.log('rebuttal dock:', Boolean(document.querySelector('.pt-dock-wide')))

// A v0.2 browser-only review opens in the new workspace and is copied to the project.
localStorage.setItem('paperTranslator.rebuttal.p1', JSON.stringify({reviewers:[{
  id:'r1',name:'Reviewer 1',text:'Where is the comparison?',target:'zh-CN',
  result:{segments:[{text:'对比在哪里？',paragraph:1,matchId:'m1'}],
    matches:[{id:'m1',blockId:'b2',quote:'Where is the comparison?'}]}
}]}))
await click(document.querySelector('.pt-workmodes button'))
await click(document.querySelector('.pt-more'))
await click([...document.querySelectorAll('.pt-menu-item')].find(el=>el.textContent.includes('Switch project')))
await click(document.querySelector('.pt-recent-item'))
await new Promise(resolve=>setTimeout(resolve,400))
await click(byText('.pt-workmodes button','Review'))
assert.equal(document.querySelector('.pt-review-quote').textContent,'Where is the comparison?')
assert.equal(document.querySelector('.pt-workmodes button[aria-pressed="true"]').textContent,'Review')
assert(fetched.some(path=>path.endsWith('/review/save')))
const preWrites=fetched.filter(path=>path.endsWith('/block/rewrite')).length
routes['/api/paper-translator/block/preview']={englishSource:'Hello to the world.'}
await click(byText('.pt-issue button','Revise passage'))
await click(byText('.pt-edit-actions button','Preview English changes'))
assert(document.querySelector('.pt-word-diff ins'))
assert(document.querySelector('.pt-edit-inline'))
assert(document.querySelector('.pt-dock-wide'))
assert.equal(fetched.filter(path=>path.endsWith('/block/rewrite')).length,preWrites)
await click(byText('.pt-edit-actions button','Cancel'))
console.log('legacy review migration and read-only revision preview: passed')
process.exit(errors.length ? 1 : 0)
