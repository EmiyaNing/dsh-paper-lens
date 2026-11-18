/** Best-effort LaTeX compilation. */

import { spawn } from 'node:child_process'
import { copyFile, stat, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'

function run(command, args, cwd, timeoutMs, signal) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
    } catch (error) {
      resolve({ code: -1, log: error.message, missing: error.code === 'ENOENT' })
      return
    }
    let log = ''
    let settled = false
    let timer = null
    const append = (chunk) => {
      log += chunk.toString()
      if (log.length > 24000) log = log.slice(-24000)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    const finish = (result) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      resolve(result)
    }
    child.on('error', (error) => finish({ code: -1, log: log + '\n' + error.message, missing: error.code === 'ENOENT' }))
    child.on('close', (code) => finish({ code: code ?? -1, log }))
    timer = setTimeout(() => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      finish({ code: -2, log: log + '\n[timeout]', timedOut: true })
    }, timeoutMs)
    if (timer.unref) timer.unref()
    signal?.addEventListener('abort', () => {
      try {
        child.kill('SIGKILL')
      } catch {
        // ignore
      }
      finish({ code: -3, log: log + '\n[cancelled]' })
    }, { once: true })
  })
}

async function exists(file) {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}


async function runPdfLatex(runs, main, root, timeoutMs, signal) {
  let log = ''
  const count = Math.max(1, Math.min(4, Number(runs) || 2))
  for (let pass = 1; pass <= count; pass += 1) {
    const result = await run(
      'pdflatex',
      ['-interaction=nonstopmode', '-synctex=1', '-file-line-error', basename(main)],
      root,
      timeoutMs,
      signal,
    )
    log += `\n[pdflatex pass ${pass}]\n${result.log ?? ''}`
    if (result.missing) return { ...result, log }
    if (result.code !== 0) return { code: result.code, log, timedOut: result.timedOut }
  }
  return { code: 0, log }
}

/**
 * Compile the project's main file. Backs up the previous PDF and restores it
 * when compilation fails, so a failed run cannot destroy a usable PDF.
 */
export async function compileProject(project, cfg, signal) {
  const main = project.mainPath
  const root = project.root
  const pdf = main.replace(/\.tex$/i, '.pdf')
  const backup = join(root, `.${basename(pdf)}.paper-translator.bak`)
  const timeoutMs = cfg.compileTimeoutMs ?? 180000

  if (await exists(pdf)) await copyFile(pdf, backup).catch(() => {})

  const engine = String(cfg.compileEngine ?? 'pdflatex').toLowerCase()
  const candidates = []
  if (engine === 'pdflatex' || engine === 'latex') {
    candidates.push({ command: 'pdflatex', runs: cfg.compileRuns ?? 2 })
  }
  candidates.push(
    { command: 'latexmk', args: ['-pdf', '-interaction=nonstopmode', '-synctex=1', '-file-line-error', basename(main)] },
    { command: 'tectonic', args: ['-X', 'compile', '--synctex', basename(main)] },
    { command: 'xelatex', args: ['-synctex=1', '-interaction=nonstopmode', basename(main)] },
  )

  let last = null
  for (const candidate of candidates) {
    const result = candidate.command === 'pdflatex'
      ? await runPdfLatex(candidate.runs, main, root, timeoutMs, signal)
      : await run(candidate.command, candidate.args, root, timeoutMs, signal)
    if (result.missing || result.code === -1) {
      last = { ...result, command: candidate.command }
      continue
    }
    last = { ...result, command: candidate.command }
    if (result.code === 0) {
      await unlink(backup).catch(() => {})
      return { ok: true, command: candidate.command, log: result.log.slice(-8000) }
    }
    // pdflatex may fail on a real TeX error; do not silently retry another
    // engine, because that usually hides the error and can overwrite the PDF.
    break
  }

  if (await exists(backup)) {
    await copyFile(backup, pdf).catch(() => {})
    await unlink(backup).catch(() => {})
  }
  return {
    missing: Boolean(last?.missing),
    ok: false,
    command: last?.command ?? '',
    log: last?.log?.slice(-8000) ?? '',
    timedOut: Boolean(last?.timedOut),
  }
}
