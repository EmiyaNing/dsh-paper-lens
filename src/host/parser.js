/**
 * A deliberately small LaTeX block parser.
 *
 * It is not a TeX engine: it walks the document body, keeps prose, replaces
 * commands/math/citations with typed placeholders, and records source ranges.
 * Anything it does not understand is skipped as a whole and reported as a
 * warning instead of being guessed at.
 */

import { createHash } from 'node:crypto'

const SECTION_LEVELS = {
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 6,
}

const MATH_ENVS = new Set([
  'equation', 'equation*', 'align', 'align*', 'gather', 'gather*',
  'multline', 'multline*', 'eqnarray', 'eqnarray*', 'displaymath', 'math',
  'IEEEeqnarray', 'IEEEeqnarray*',
])

const FLOAT_ENVS = new Set(['figure', 'figure*', 'table', 'table*', 'algorithm', 'algorithm*', 'wrapfigure'])

const SKIP_ENVS = new Set([
  'tikzpicture', 'lstlisting', 'verbatim', 'verbatim*', 'minted', 'comment',
  'thebibliography', 'filecontents', 'filecontents*',
])

const TEXT_ENVS = new Set([
  'abstract', 'quote', 'quotation', 'theorem', 'lemma', 'proof', 'definition',
  'corollary', 'remark', 'example', 'proposition', 'claim', 'assumption',
])

// IEEEtran-specific environments. Keywords and biographies are prose that
// should be translated; biography optional/author arguments are not body text.
const IEEE_TEXT_ENVS = new Set(['IEEEkeywords', 'IEEEbiography', 'IEEEbiographynophoto', 'IEEEproof'])

const LIST_ENVS = new Set(['itemize', 'enumerate', 'description'])

const FORMAT_COMMANDS = new Set([
  'textbf', 'textit', 'textsl', 'textsc', 'texttt', 'textsf', 'textrm',
  'emph', 'underline', 'textsuperscript', 'textsubscript', 'mbox', 'hbox',
  'text', 'mathrm', 'mathbf', 'mathit', 'mathsf', 'mathtt', 'operatorname',
  'ensuremath', 'textnormal', 'textup', 'textmd', 'uline', 'MakeUppercase',
  'MakeLowercase',
])

const CITE_COMMANDS = new Set([
  'cite', 'citep', 'citet', 'citealp', 'citeauthor', 'citeyear', 'citeyearpar',
  'parencite', 'textcite', 'autocite', 'footcite', 'supercite', 'nocite',
])

const REF_COMMANDS = new Set([
  'ref', 'eqref', 'autoref', 'cref', 'Cref', 'pageref', 'nameref', 'vref',
  'labelcref', 'subref',
])

const SPACE_COMMANDS = new Set(['quad', 'qquad', 'space', 'enspace', 'thinspace', 'medspace', 'thickspace'])

const ACCENTS = {
  "'": { a: 'á', e: 'é', i: 'í', o: 'ó', u: 'ú', y: 'ý', c: 'ć', n: 'ń', s: 'ś', z: 'ź', A: 'Á', E: 'É', I: 'Í', O: 'Ó', U: 'Ú', Y: 'Ý', C: 'Ć', N: 'Ń', S: 'Ś', Z: 'Ź' },
  '`': { a: 'à', e: 'è', i: 'ì', o: 'ò', u: 'ù', A: 'À', E: 'È', I: 'Ì', O: 'Ò', U: 'Ù' },
  '"': { a: 'ä', e: 'ë', i: 'ï', o: 'ö', u: 'ü', y: 'ÿ', A: 'Ä', E: 'Ë', I: 'Ï', O: 'Ö', U: 'Ü' },
  '^': { a: 'â', e: 'ê', i: 'î', o: 'ô', u: 'û', A: 'Â', E: 'Ê', I: 'Î', O: 'Ô', U: 'Û' },
  '~': { a: 'ã', n: 'ñ', o: 'õ', A: 'Ã', N: 'Ñ', O: 'Õ' },
  c: { c: 'ç', C: 'Ç', s: 'ş', S: 'Ş', t: 'ţ', T: 'Ţ' },
  v: { c: 'č', C: 'Č', s: 'š', S: 'Š', z: 'ž', Z: 'Ž', r: 'ř', R: 'Ř', e: 'ě', E: 'Ě' },
  u: { a: 'ă', A: 'Ă', e: 'ĕ', E: 'Ĕ', g: 'ğ', G: 'Ğ' },
  H: { o: 'ő', O: 'Ő', u: 'ű', U: 'Ű' },
  r: { a: 'å', A: 'Å', u: 'ů', U: 'Ů' },
  k: { a: 'ą', A: 'Ą', e: 'ę', E: 'Ę' },
}

const SYMBOLS = {
  LaTeX: 'LaTeX',
  TeX: 'TeX',
  XeLaTeX: 'XeLaTeX',
  pdfLaTeX: 'pdfLaTeX',
  ldots: '…',
  dots: '…',
  textellipsis: '…',
  textendash: '–',
  textemdash: '—',
  textasciitilde: '~',
  textbackslash: '\\',
  textbar: '|',
  textless: '<',
  textgreater: '>',
  copyright: '©',
  textcopyright: '©',
  textregistered: '®',
  texttrademark: '™',
  S: '§',
  P: '¶',
  dag: '†',
  ddag: '‡',
  pounds: '£',
  euro: '€',
  textdegree: '°',
  times: '×',
  pm: '±',
  mp: '∓',
  leq: '≤',
  geq: '≥',
  neq: '≠',
  approx: '≈',
  infty: '∞',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  epsilon: 'ε',
  lambda: 'λ',
  mu: 'μ',
  sigma: 'σ',
  theta: 'θ',
  phi: 'φ',
  omega: 'ω',
  to: '→',
  rightarrow: '→',
  leftarrow: '←',
  leftrightarrow: '↔',
}

function hashId(kind, text) {
  return 'b' + createHash('sha1').update(kind).update('\0').update(text).digest('hex').slice(0, 10)
}

function normalizeSpace(value) {
  return value
    .replace(/---/g, '—')
    .replace(/--/g, '–')
    .replace(/[\t\f\v]+/g, ' ')
    .replace(/ *\n */g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

function extractMacros(source) {
  const macros = new Map()
  const patterns = [
    /\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand)\s*\{?\\([A-Za-z@]+)\}?\s*(?:\[[0-9]\])?\s*\{([^{}]*)\}/g,
    /\\def\s*\\([A-Za-z@]+)\s*\{([^{}]*)\}/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source)) !== null) {
      const value = match[2].trim()
      if (!value || value.includes('#') || value.length > 160) continue
      if (!macros.has(match[1])) macros.set(match[1], value)
    }
  }
  return macros
}

function readBalanced(source, index) {
  let i = index
  while (i < source.length && /\s/.test(source[i])) i += 1
  if (source[i] !== '{') return null
  const start = i
  let depth = 0
  for (; i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '\\') {
      i += 1
      continue
    }
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return { content: source.slice(start + 1, i), end: i + 1 }
    }
  }
  return null
}

/**
 * Math macros are passed to KaTeX so formulas using the paper's own
 * \newcommand / \DeclareMathOperator definitions can render without a TeX
 * installation. Prose macro expansion is separate because prose needs the
 * expanded text, not the definition.
 */
function extractMathMacros(source) {
  const macros = {}
  const skip = new Set([
    'arraystretch', 'baselinestretch', 'thefigure', 'thetable', 'theequation',
    'thesection', 'thesubsection', 'thesubsubsection', 'thechapter',
    'paragraph', 'section', 'subsection', 'subsubsection', 'chapter',
    'title', 'author', 'date', 'maketitle', 'caption', 'label', 'ref', 'cite',
  ])

  const commandRe = /\\(?:newcommand|renewcommand|providecommand|DeclareRobustCommand)\s*\{?\s*\\([A-Za-z@]+)\s*\}?\s*(?:\[(\d+)\])?\s*/g
  let match
  while ((match = commandRe.exec(source)) !== null) {
    const group = readBalanced(source, commandRe.lastIndex)
    if (!group) continue
    commandRe.lastIndex = group.end
    const body = group.content.trim()
    if (!body || body.length > 800 || skip.has(match[1])) continue
    macros['\\' + match[1]] = body
  }

  const operatorRe = /\\(DeclareMathOperator\*?)\s*\{?\s*\\([A-Za-z@]+)\s*\}?\s*/g
  while ((match = operatorRe.exec(source)) !== null) {
    const group = readBalanced(source, operatorRe.lastIndex)
    if (!group) continue
    operatorRe.lastIndex = group.end
    macros['\\' + match[2]] = `\\operatorname{${group.content.trim()}}`
  }

  const defRe = /\\def\s*\\([A-Za-z@]+)\s*/g
  while ((match = defRe.exec(source)) !== null) {
    const group = readBalanced(source, defRe.lastIndex)
    if (!group) continue
    defRe.lastIndex = group.end
    const body = group.content.trim()
    if (body && body.length <= 800 && !skip.has(match[1])) macros['\\' + match[1]] = body
  }

  if (macros['\\xspace'] === undefined) macros['\\xspace'] = ''
  if (macros['\\bm'] === undefined) macros['\\bm'] = '\\boldsymbol'
  if (macros['\\Bbb'] === undefined) macros['\\Bbb'] = '\\mathbb'
  return macros
}

export function parseLatex(source) {
  if (typeof source !== 'string') throw new TypeError('source must be a string')
  const normalized = source.replace(/\r\n?/g, '\n')
  return new LatexParser(normalized, extractMacros(normalized), extractMathMacros(normalized)).parse()
}

class LatexParser {
  constructor(source, macros = new Map(), mathMacros = {}) {
    this.s = source
    this.macros = macros
    this.mathMacros = mathMacros
    this.blocks = []
    this.outline = []
    this.warnings = []
    this.sectionPath = []
    this.usedIds = new Map()
    this.lineStarts = [0]
    for (let i = 0; i < source.length; i += 1) {
      if (source.charCodeAt(i) === 10) this.lineStarts.push(i + 1)
    }
  }

  parse() {
    const begin = this.s.indexOf('\\begin{document}')
    const end = this.s.lastIndexOf('\\end{document}')
    const start = begin >= 0 ? begin + '\\begin{document}'.length : 0
    const stop = end > start ? end : this.s.length

    this.scanRange(start, stop, { kind: 'paragraph', section: '' })

    const stats = { blocks: this.blocks.length, translatable: 0, characters: 0, kinds: {} }
    for (const block of this.blocks) {
      stats.kinds[block.kind] = (stats.kinds[block.kind] ?? 0) + 1
      if (block.translatable) {
        stats.translatable += 1
        stats.characters += block.text.length
      }
    }
    return {
      blocks: this.blocks,
      outline: this.outline,
      warnings: this.warnings,
      stats,
      mathMacros: this.mathMacros,
      totalLines: this.lineStarts.length,
    }
  }

  warn(code, message, offset = 0) {
    const line = this.lineOf(offset)
    const key = code + ':' + message
    if (this.warnings.some((w) => w.code + ':' + w.message === key)) return
    this.warnings.push({ code, message, line })
    if (this.warnings.length > 40) this.warnings.pop()
  }

  lineOf(offset) {
    let lo = 0
    let hi = this.lineStarts.length - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.lineStarts[mid] <= offset) lo = mid + 1
      else hi = mid - 1
    }
    return hi + 1
  }

  currentSection() {
    return this.sectionPath.filter(Boolean).join(' / ')
  }

  newState() {
    return { placeholders: [], counts: { M: 0, C: 0, R: 0, U: 0 } }
  }

  placeholder(state, type, data = {}) {
    state.counts[type] += 1
    const token = `⟦${type}${state.counts[type]}⟧`
    state.placeholders.push({ token, type, ...data })
    return token
  }

  pushBlock(block) {
    const text = normalizeSpace(block.text ?? '')
    if (block.translatable && (!text || !/[A-Za-z\u3400-\u9fff]/.test(text))) return null
    const id = hashId(block.kind, text || block.latex || '')
    const seen = this.usedIds.get(id) ?? 0
    this.usedIds.set(id, seen + 1)
    const finalId = seen === 0 ? id : `${id}-${seen + 1}`
    const entry = {
      id: finalId,
      kind: block.kind,
      section: block.section || this.currentSection(),
      text,
      source: (block.source ?? '').trim().slice(0, 20000),
      line: block.line,
      endLine: block.endLine,
      translatable: block.translatable !== false,
      placeholders: block.placeholders ?? [],
      ...(block.level ? { level: block.level } : {}),
      ...(block.label ? { label: block.label } : {}),
      ...(block.refLabels?.length ? { refLabels: block.refLabels } : {}),
      ...(block.latex ? { latex: block.latex, env: block.env } : {}),
    }
    this.blocks.push(entry)
    return entry
  }

  scanRange(start, end, ctx) {
    const s = this.s
    const state = this.newState()
    let buf = ctx.prefix ? ctx.prefix + ': ' : ''
    let bufStart = start
    let i = start

    const flush = (at) => {
      if (buf.trim()) {
        let sourceStart = bufStart
        while (sourceStart < at && /\s/.test(s[sourceStart])) sourceStart += 1
        this.pushBlock({
          kind: ctx.kind,
          section: ctx.section,
          text: buf,
          source: s.slice(sourceStart, at),
          line: this.lineOf(sourceStart),
          endLine: this.lineOf(Math.max(sourceStart, at - 1)),
          translatable: true,
          placeholders: state.placeholders,
        })
      }
      buf = ''
      bufStart = at
      state.placeholders = []
      state.counts = { M: 0, C: 0, R: 0, U: 0 }
    }

    while (i < end) {
      const ch = s[i]

      if (ch === '%') {
        const nl = s.indexOf('\n', i)
        i = nl < 0 || nl > end ? end : nl
        continue
      }

      if (ch === '\n') {
        const blank = /^\n[ \t]*\n/.exec(s.slice(i, Math.min(end, i + 64)))
        if (blank) {
          flush(i)
          i += blank[0].length
          bufStart = i
          continue
        }
        buf += ' '
        i += 1
        continue
      }

      if (ch === '\\') {
        if (s.startsWith('\\begin{', i)) {
          const env = this.readEnvName(i)
          if (env) {
            flush(i)
            const envEnd = this.findEnvEnd(env.name, env.end)
            this.handleEnv(env.name, i, env.end, envEnd, ctx, state)
            i = envEnd
            bufStart = i
            continue
          }
        }
        if (s.startsWith('\\end{', i)) {
          const close = s.indexOf('}', i)
          i = close < 0 ? end : close + 1
          continue
        }
        if (s.startsWith('\\[', i)) {
          const math = this.readDelimitedMath(i, '\\[', '\\]')
          if (math) {
            flush(i)
            this.addMathBlock(math.latex, 'displaymath', i, math.end)
            i = math.end
            bufStart = i
            continue
          }
        }
        if (s.startsWith('$$', i)) {
          const math = this.readDollarMath(i, end)
          if (math) {
            flush(i)
            this.addMathBlock(math.latex, 'displaymath', i, math.end)
            i = math.end
            bufStart = i
            continue
          }
        }
        if (SECTION_LEVELS[this.peekCommandName(i)] !== undefined) {
          flush(i)
          i = this.parseHeading(i)
          ctx.section = this.currentSection()
          bufStart = i
          continue
        }
        if (this.peekCommandName(i) === 'caption') {
          flush(i)
          i = this.parseCaption(i)
          bufStart = i
          continue
        }
        if (this.peekCommandName(i) === 'par') {
          flush(i)
          i += 4
          bufStart = i
          continue
        }
        if (s.startsWith('\\(', i)) {
          const math = this.readDelimitedMath(i, '\\(', '\\)')
          if (math) {
            buf += this.placeholder(state, 'M', { latex: math.latex, display: false })
            i = math.end
            continue
          }
        }
        if (s.startsWith('\\\\', i)) {
          buf += ' '
          i += 2
          if (s[i] === '[') {
            const rb = s.indexOf(']', i)
            if (rb > 0 && rb < i + 32) i = rb + 1
          }
          continue
        }
        const inline = this.consumeInline(s, i, state)
        if (inline) {
          buf += inline.text
          i = inline.next
          continue
        }
      }

      if (ch === '$') {
        const math = this.readDollarMath(i, end)
        if (math) {
          buf += this.placeholder(state, 'M', { latex: math.latex, display: math.display })
          i = math.end
          continue
        }
      }

      if (ch === '\\(') {
        const math = this.readDelimitedMath(i, '\\(', '\\)')
        if (math) {
          buf += this.placeholder(state, 'M', { latex: math.latex, display: false })
          i = math.end
          continue
        }
      }

      if (ch === '{' || ch === '}' || ch === '&') {
        i += 1
        continue
      }

      if (ch === '~') {
        buf += ' '
        i += 1
        continue
      }

      buf += ch
      i += 1
    }

    flush(end)
  }

  peekCommandName(i) {
    const cmd = this.readCommand(this.s, i)
    return cmd?.name ?? ''
  }

  readCommand(str, i) {
    if (str[i] !== '\\' || i + 1 >= str.length) return null
    const next = str[i + 1]
    if (/[A-Za-z]/.test(next)) {
      let j = i + 1
      while (j < str.length && /[A-Za-z]/.test(str[j])) j += 1
      const name = str.slice(i + 1, j)
      if (str[j] === '*') j += 1
      return { name, end: j, escaped: false }
    }
    return { name: next, end: i + 2, escaped: true }
  }

  readEnvName(i) {
    const start = i + '\\begin{'.length
    const close = this.s.indexOf('}', start)
    if (close < 0) return null
    return { name: this.s.slice(start, close).trim(), end: close + 1 }
  }

  findEnvEnd(name, from) {
    let depth = 1
    let i = from
    const beginToken = '\\begin{' + name + '}'
    const endToken = '\\end{' + name + '}'
    while (i < this.s.length) {
      const b = this.s.indexOf(beginToken, i)
      const e = this.s.indexOf(endToken, i)
      if (e < 0) return this.s.length
      if (b >= 0 && b < e) {
        depth += 1
        i = b + beginToken.length
        continue
      }
      depth -= 1
      i = e + endToken.length
      if (depth === 0) return i
    }
    return this.s.length
  }

  readGroup(str, i) {
    let j = i
    while (j < str.length && /\s/.test(str[j])) j += 1
    if (str[j] !== '{') return null
    const start = j
    let depth = 1
    j += 1
    while (j < str.length) {
      const ch = str[j]
      if (ch === '\\') {
        j += 2
        continue
      }
      if (ch === '{') depth += 1
      else if (ch === '}') {
        depth -= 1
        if (depth === 0) {
          return { content: str.slice(start + 1, j), end: j + 1, start }
        }
      }
      j += 1
    }
    return { content: str.slice(start + 1), end: str.length, start }
  }

  readOptional(str, i) {
    let j = i
    while (j < str.length && /\s/.test(str[j])) j += 1
    if (str[j] !== '[') return null
    let depth = 1
    j += 1
    const start = j
    while (j < str.length) {
      const ch = str[j]
      if (ch === '\\') {
        j += 2
        continue
      }
      if (ch === '[') depth += 1
      else if (ch === ']') {
        depth -= 1
        if (depth === 0) return { content: str.slice(start, j), end: j + 1 }
      }
      j += 1
    }
    return { content: str.slice(start), end: str.length }
  }

  readDollarMath(i, end) {
    const s = this.s
    if (s.startsWith('$$', i)) {
      const close = this.findClosing(s, i + 2, '$$', end)
      if (close < 0) return null
      return { latex: s.slice(i + 2, close), end: close + 2, display: true }
    }
    const close = this.findClosing(s, i + 1, '$', end)
    if (close < 0) return null
    return { latex: s.slice(i + 1, close), end: close + 1, display: false }
  }

  readDelimitedMath(i, open, closeToken) {
    const start = i + open.length
    const close = this.s.indexOf(closeToken, start)
    if (close < 0) return null
    return { latex: this.s.slice(start, close), end: close + closeToken.length }
  }

  findClosing(str, from, token, end) {
    let i = from
    while (i < end) {
      const found = str.indexOf(token, i)
      if (found < 0 || found >= end) return -1
      let slashes = 0
      for (let k = found - 1; k >= 0 && str[k] === '\\'; k -= 1) slashes += 1
      if (slashes % 2 === 0) return found
      i = found + token.length
    }
    return -1
  }

  consumeInline(str, i, state) {
    if (str[i] !== '\\') return null
    const cmd = this.readCommand(str, i)
    if (!cmd) return null

    if (cmd.escaped) {
      const ch = cmd.name
      const map = { '%': '%', '&': '&', _: '_', '#': '#', '{': '{', '}': '}', $: '$', ' ': ' ', '\\': ' ', ',': '', ';': ' ', ':': ' ', '!': '', '-': '' }
      return { text: map[ch] ?? '', next: cmd.end }
    }

    const name = cmd.name
    let j = cmd.end

    if (name === 'input' || name === 'include' || name === 'includeonly') {
      const group = this.readGroup(str, j)
      this.warn('input', '检测到 \\input / \\include；v1 只解析主文件，未展开子文件。', i)
      return { text: '', next: group ? group.end : j }
    }

    if (CITE_COMMANDS.has(name)) {
      let optional = this.readOptional(str, j)
      while (optional) {
        j = optional.end
        optional = this.readOptional(str, j)
      }
      const group = this.readGroup(str, j)
      if (!group) return { text: '', next: j }
      const key = normalizeSpace(group.content)
      return { text: this.placeholder(state, 'C', { key, command: name }), next: group.end }
    }

    if (REF_COMMANDS.has(name)) {
      const group = this.readGroup(str, j)
      if (!group) return { text: '', next: j }
      return { text: this.placeholder(state, 'R', { key: normalizeSpace(group.content), command: name }), next: group.end }
    }

    if (name === 'url') {
      const group = this.readGroup(str, j)
      if (!group) return { text: '', next: j }
      return { text: this.placeholder(state, 'U', { url: normalizeSpace(group.content) }), next: group.end }
    }

    if (name === 'href') {
      const url = this.readGroup(str, j)
      if (!url) return { text: '', next: j }
      const text = this.readGroup(str, url.end)
      if (!text) return { text: '', next: url.end }
      const rendered = this.renderInline(text.content)
      return {
        text: rendered.text,
        next: text.end,
      }
    }

    if (name === 'footnote' || name === 'thanks' || name === 'footnotetext') {
      const optional = this.readOptional(str, j)
      if (optional) j = optional.end
      const group = this.readGroup(str, j)
      return { text: '', next: group ? group.end : j }
    }

    if (name === 'label' || name === 'index' || name === 'glossary') {
      const group = this.readGroup(str, j)
      return { text: '', next: group ? group.end : j }
    }

    if (name === 'includegraphics') {
      let optional = this.readOptional(str, j)
      while (optional) {
        j = optional.end
        optional = this.readOptional(str, j)
      }
      const group = this.readGroup(str, j)
      return { text: '', next: group ? group.end : j }
    }

    if (name === 'sep') {
      return { text: ', ', next: j }
    }

    if (name === 'IEEEPARstart' || name === 'PARstart') {
      const first = this.readGroup(str, j)
      if (!first) return { text: '', next: j }
      const second = this.readGroup(str, first.end)
      return {
        text: first.content + (second?.content ?? ''),
        next: second?.end ?? first.end,
      }
    }

    if (FORMAT_COMMANDS.has(name)) {
      const group = this.readGroup(str, j)
      if (!group) return { text: '', next: j }
      const rendered = this.renderInline(group.content)
      return { text: rendered.text, next: group.end }
    }

    if (name === 'textcolor' || name === 'colorbox' || name === 'fcolorbox') {
      const first = this.readGroup(str, j)
      if (!first) return { text: '', next: j }
      const second = this.readGroup(str, first.end)
      if (!second) return { text: '', next: first.end }
      const rendered = this.renderInline(second.content)
      return { text: rendered.text, next: second.end }
    }

    if (name === 'footnotemark' || name === 'nocite' || name === 'bibliography' || name === 'bibliographystyle') {
      const group = this.readGroup(str, j)
      return { text: '', next: group ? group.end : j }
    }

    if (name === 'caption' || name === 'captionof') {
      const optional = this.readOptional(str, j)
      if (optional) j = optional.end
      if (name === 'captionof') {
        const kind = this.readGroup(str, j)
        if (kind) j = kind.end
      }
      const group = this.readGroup(str, j)
      return { text: '', next: group ? group.end : j }
    }

    if (SPACE_COMMANDS.has(name)) {
      return { text: ' ', next: j }
    }

    if (name === 'newline' || name === 'linebreak' || name === 'par') {
      return { text: ' ', next: j }
    }

    if (ACCENTS[name]) {
      let target = str[j]
      if (target === '{') {
        const group = this.readGroup(str, j)
        target = group ? group.content[0] : ''
        j = group ? group.end : j
      } else if (target) {
        j += 1
      }
      const mapped = target ? ACCENTS[name][target] : undefined
      return { text: mapped ?? target ?? '', next: j }
    }

    if (SYMBOLS[name] !== undefined) {
      return { text: SYMBOLS[name], next: j }
    }

    if (name === 'begin' || name === 'end') {
      const group = this.readGroup(str, j)
      return { text: '', next: group ? group.end : j }
    }

    if (this.macros.has(name)) {
      const replacement = this.macros.get(name)
      let next = j
      const group = this.readGroup(str, next)
      if (group && group.content.trim() === '') next = group.end
      const rendered = this.renderInline(replacement)
      return { text: rendered.text, next }
    }

    // Unknown command: keep a single braced argument as prose, drop the rest.
    let optional = this.readOptional(str, j)
    while (optional) {
      j = optional.end
      optional = this.readOptional(str, j)
    }
    const group = this.readGroup(str, j)
    if (group) {
      const rendered = this.renderInline(group.content)
      return { text: rendered.text, next: group.end }
    }
    return { text: '', next: j }
  }

  renderInline(raw) {
    if (!raw) return { text: '', placeholders: [] }
    const state = this.newState()
    let out = ''
    let i = 0
    while (i < raw.length) {
      const ch = raw[i]
      if (raw.startsWith('\\(', i)) {
        const close = raw.indexOf('\\)', i + 2)
        if (close >= 0) {
          out += this.placeholder(state, 'M', { latex: raw.slice(i + 2, close), display: false })
          i = close + 2
          continue
        }
      }
      if (raw.startsWith('\\[', i)) {
        const close = raw.indexOf('\\]', i + 2)
        if (close >= 0) {
          out += this.placeholder(state, 'M', { latex: raw.slice(i + 2, close), display: true })
          i = close + 2
          continue
        }
      }
      if (ch === '$') {
        const math = this.readDollarMathIn(raw, i)
        if (math) {
          out += this.placeholder(state, 'M', { latex: math.latex, display: math.display })
          i = math.end
          continue
        }
      }
      if (ch === '\\') {
        const inline = this.consumeInline(raw, i, state)
        if (inline) {
          out += inline.text
          i = inline.next
          continue
        }
      }
      if (ch === '{' || ch === '}' || ch === '&') {
        i += 1
        continue
      }
      if (ch === '~') {
        out += ' '
        i += 1
        continue
      }
      out += ch
      i += 1
    }
    return { text: normalizeSpace(out), placeholders: state.placeholders }
  }

  readDollarMathIn(str, i) {
    if (str.startsWith('$$', i)) {
      const close = str.indexOf('$$', i + 2)
      if (close < 0) return null
      return { latex: str.slice(i + 2, close), end: close + 2, display: true }
    }
    let close = str.indexOf('$', i + 1)
    while (close >= 0 && str[close - 1] === '\\') close = str.indexOf('$', close + 1)
    if (close < 0) return null
    return { latex: str.slice(i + 1, close), end: close + 1, display: false }
  }

  parseHeading(i) {
    const cmd = this.readCommand(this.s, i)
    if (!cmd) return i
    const level = SECTION_LEVELS[cmd.name]
    let j = cmd.end
    const optional = this.readOptional(this.s, j)
    if (optional) j = optional.end
    const group = this.readGroup(this.s, j)
    if (!group) return j
    const rendered = this.renderInline(group.content)
    if (rendered.text) {
      this.sectionPath = this.sectionPath.slice(0, level - 1).filter(Boolean)
      this.sectionPath[level - 1] = rendered.text
      const section = this.currentSection()
      this.outline.push({ level, title: rendered.text, line: this.lineOf(i) })
      this.pushBlock({
        kind: 'heading',
        section,
        text: rendered.text,
        source: this.s.slice(i, group.end),
        line: this.lineOf(i),
        endLine: this.lineOf(group.end),
        translatable: true,
        placeholders: rendered.placeholders,
        level,
      })
    }
    return group.end
  }

  parseCaption(i) {
    const cmd = this.readCommand(this.s, i)
    if (!cmd) return i
    let j = cmd.end
    const optional = this.readOptional(this.s, j)
    if (optional) j = optional.end
    const group = this.readGroup(this.s, j)
    if (!group) return j
    const rendered = this.renderInline(group.content)
    if (rendered.text) {
      this.pushBlock({
        kind: 'caption',
        text: rendered.text,
        source: this.s.slice(i, group.end),
        line: this.lineOf(i),
        endLine: this.lineOf(group.end),
        translatable: true,
        placeholders: rendered.placeholders,
        label: 'Caption',
      })
    }
    return group.end
  }

  addMathBlock(latex, env, start, end) {
    const trimmed = latex.trim()
    if (!trimmed) return
    this.pushBlock({
      kind: 'math',
      text: '',
      source: this.s.slice(start, end),
      line: this.lineOf(start),
      endLine: this.lineOf(end),
      translatable: false,
      latex: trimmed,
      env,
    })
  }

  handleEnv(name, envStart, contentStart, envEnd, ctx, state) {
    const closeToken = '\\end{' + name + '}'
    const close = this.s.indexOf(closeToken, contentStart)
    const contentEnd = close >= 0 && close < envEnd ? close : envEnd

    if (MATH_ENVS.has(name)) {
      let mathStart = contentStart
      if (name === 'IEEEeqnarray' || name === 'IEEEeqnarray*') {
        // IEEEeqnarray takes a column specification immediately after egin.
        const spec = this.readGroup(this.s, mathStart)
        if (spec) mathStart = spec.end
      }
      const content = close >= 0 && close < envEnd ? this.s.slice(mathStart, close) : ''
      this.addMathBlock(content, name, envStart, envEnd)
      return
    }

    if (FLOAT_ENVS.has(name)) {
      const label = name.startsWith('figure') ? 'Figure' : name.startsWith('table') ? 'Table' : 'Algorithm'
      this.extractCaptions(contentStart, contentEnd, label)
      return
    }

    if (LIST_ENVS.has(name)) {
      this.parseList(contentStart, contentEnd, name, ctx)
      return
    }

    if (IEEE_TEXT_ENVS.has(name)) {
      if (name === 'IEEEkeywords') {
        this.scanRange(contentStart, contentEnd, {
          kind: 'keywords',
          section: 'Keywords',
          allowBreak: false,
        })
        return
      }
      if (name === 'IEEEbiography' || name === 'IEEEbiographynophoto') {
        let bodyStart = contentStart
        const photo = this.readOptional(this.s, bodyStart)
        if (photo) bodyStart = photo.end
        const authorGroup = this.readGroup(this.s, bodyStart)
        const author = authorGroup ? normalizeSpace(this.renderInline(authorGroup.content).text) : ''
        if (authorGroup) bodyStart = authorGroup.end
        this.scanRange(bodyStart, contentEnd, {
          kind: 'biography',
          section: author ? `Biography — ${author}` : 'Biography',
          allowBreak: false,
        })
        return
      }
      this.scanRange(contentStart, contentEnd, {
        kind: 'paragraph',
        section: ctx.section,
        allowBreak: false,
      })
      return
    }

    if (TEXT_ENVS.has(name)) {
      const section = name === 'abstract' ? 'Abstract' : ctx.section
      this.scanRange(contentStart, contentEnd, {
        kind: name === 'abstract' ? 'abstract' : 'paragraph',
        section,
        allowBreak: false,
      })
      return
    }

    if (SKIP_ENVS.has(name)) {
      this.warn('skip-env', `跳过环境 \\begin{${name}}。`, envStart)
      return
    }

    this.warn('unknown-env', `未识别的环境 \\begin{${name}}，已整块跳过。`, envStart)
  }

  parseList(start, end, envName, ctx) {
    const s = this.s
    const items = []
    let from = start
    while (from < end) {
      const at = s.indexOf('\\item', from)
      if (at < 0 || at >= end) break
      const after = s[at + 5]
      if (after !== undefined && /[A-Za-z]/.test(after)) {
        from = at + 5
        continue
      }
      items.push(at)
      from = at + 5
    }
    if (items.length === 0) {
      this.scanRange(start, end, { kind: 'item', section: ctx.section, allowBreak: false })
      return
    }
    for (let k = 0; k < items.length; k += 1) {
      const itemStart = items[k] + '\\item'.length
      const itemEnd = k + 1 < items.length ? items[k + 1] : end
      let j = itemStart
      while (j < itemEnd && /\s/.test(s[j])) j += 1
      let prefix = ''
      if (envName === 'description' && s[j] === '[') {
        const opt = this.readOptional(s, j)
        if (opt) {
          prefix = normalizeSpace(this.renderInline(opt.content).text)
          j = opt.end
        }
      }
      this.scanRange(j, itemEnd, {
        kind: 'item',
        section: ctx.section,
        allowBreak: false,
        prefix,
      })
    }
  }

  extractCaptions(start, end, label) {
    const s = this.s
    const re = /\\caption\s*(?:\[[^\]]*\]\s*)?\{/g
    const slice = s.slice(start, end)
    let match
    while ((match = re.exec(slice)) !== null) {
      const braceAt = start + match.index + match[0].length - 1
      const group = this.readGroup(s, braceAt)
      if (!group) continue
      const rendered = this.renderInline(group.content)
      if (rendered.text) {
        this.pushBlock({
          kind: 'caption',
          text: rendered.text,
          source: s.slice(start + match.index, group.end),
          line: this.lineOf(start + match.index),
          endLine: this.lineOf(group.end),
          translatable: true,
          placeholders: rendered.placeholders,
          label,
          refLabels: [...slice.matchAll(/\\label\s*\{([^{}]+)\}/g)].map(item => item[1]),
        })
      }
      re.lastIndex = group.end - start
    }
  }
}
