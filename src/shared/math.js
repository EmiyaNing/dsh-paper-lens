/** Small KaTeX compatibility layer shared by the browser and tests. */

export function sanitizeMath(latex) {
  let value = String(latex ?? '')
  value = value.replace(/\\label\s*\{[^{}]*\}/g, '')
  value = value.replace(/\\nonumber\b|\\notag\b/g, '')
  value = value.replace(/\\tag\*?\s*\{([^{}]*)\}/g, '\\qquad\\text{($1)}')
  value = value.replace(/\\index\s*\{[^{}]*\}/g, '')
  value = value.replace(/\\footnote\s*\{[^{}]*\}/g, '')
  value = value.replace(/\\intertext\s*\{([^{}]*)\}/g, '\\text{$1}')
  value = value.replace(/\\shortintertext\s*\{([^{}]*)\}/g, '\\text{$1}')
  value = value.replace(/\\allowbreak\b|\\displaybreak\b(\[[^\]]*\])?/g, '')
  value = value.replace(/\\operatorname\*/g, '\\operatorname')
  return value.replace(/[ \t]+/g, ' ').trim()
}

export function wrapMathEnv(latex, env) {
  const value = String(latex ?? '').trim()
  if (!value || !env) return value
  if (/^align/.test(env)) {
    if (/^\\begin\{aligned\}/.test(value)) return value
    return `\\begin{aligned}${value}\\end{aligned}`
  }
  if (/^(gather|multline)/.test(env)) {
    if (/^\\begin\{gathered\}/.test(value)) return value
    return `\\begin{gathered}${value}\\end{gathered}`
  }
  if (/^eqnarray/.test(env)) {
    if (/^\\begin\{aligned\}/.test(value)) return value
    return `\\begin{aligned}${value}\\end{aligned}`
  }
  return value
}

export function prepareMath(latex, env) {
  return wrapMathEnv(sanitizeMath(latex), env)
}
