/**
 * Per-project translation sidecar.
 *
 * Translations live next to the paper (main.paper-lens.json + .md) instead of
 * only in ~/.dsh, so reopening a project never re-buys unchanged paragraphs.
 * The JSON file is authoritative; the Markdown file is the human-readable
 * translated LaTeX document.
 */

import { mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

export function emptyUsage() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, costUsd: 0, calls: 0 }
}

export function sidecarPaths(mainPath) {
  const stem = mainPath.replace(/\.tex$/i, '')
  return {
    json: `${stem}.paper-lens.json`,
    md: `${stem}.paper-lens.md`,
  }
}

export class ProjectSidecar {
  constructor(mainPath, legacyDir = null) {
    this.paths = sidecarPaths(mainPath)
    this.legacyDir = legacyDir
    this.entries = {}
    this.byBlock = new Map()
    this.dirty = false
    this.timer = null
    this.migrated = false
    this.usage = emptyUsage()
  }

  async load() {
    try {
      const data = JSON.parse(await readFile(this.paths.json, 'utf8'))
      if (data && data.entries && typeof data.entries === 'object') this.entries = data.entries
      if (data && data.migrated === true) this.migrated = true
      if (data && data.usage && typeof data.usage === 'object') {
        this.usage = {
          input: Number(data.usage.input) || 0,
          output: Number(data.usage.output) || 0,
          cacheRead: Number(data.usage.cacheRead) || 0,
          cacheWrite: Number(data.usage.cacheWrite) || 0,
          costUsd: Number(data.usage.costUsd) || 0,
          calls: Number(data.usage.calls) || 0,
        }
      }
    } catch {
      // no sidecar yet
    }
    this.reindex()
    if (!this.migrated) {
      await this.mergeLegacy()
      this.migrated = true
    }
    if (Object.keys(this.entries).length > 0) {
      this.dirty = true
      await this.flush().catch((error) => {
        console.error('[paper-translator] sidecar write failed:', error.message)
      })
    }
    return this
  }

  async mergeLegacy() {
    if (!this.legacyDir) return
    let names = []
    try {
      names = await readdir(this.legacyDir)
    } catch {
      return
    }
    for (const name of names) {
      if (!name.endsWith('.json')) continue
      try {
        const data = JSON.parse(await readFile(join(this.legacyDir, name), 'utf8'))
        const entries = data?.entries ?? {}
        for (const [key, value] of Object.entries(entries)) {
          if (!this.entries[key] && value?.text) this.entries[key] = value
        }
      } catch {
        // ignore one corrupt legacy file
      }
    }
    this.reindex()
  }

  reindex() {
    this.byBlock = new Map()
    for (const value of Object.values(this.entries)) {
      if (value?.block && typeof value.text === 'string') this.byBlock.set(value.block, value.text)
    }
  }

  get(key) {
    return this.entries[key]?.text
  }

  textForBlock(blockId) {
    return this.byBlock.get(blockId)
  }

  set(key, text, blockId) {
    if (!text) return
    this.entries[key] = { text, ...(blockId ? { block: blockId } : {}), ts: Date.now() }
    if (blockId) this.byBlock.set(blockId, text)
    this.dirty = true
    this.schedule()
  }

  addUsage(usage, costUsd = 0) {
    if (!usage) return this.usage
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) {
      this.usage[key] += Number(usage[key]) || 0
    }
    this.usage.calls += Number(usage.calls) || 1
    this.usage.costUsd += Number(costUsd) || 0
    this.dirty = true
    this.schedule()
    return this.usage
  }

  schedule() {
    this.dirty = true
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush().catch((error) => {
        console.error('[paper-translator] sidecar flush failed:', error.message)
      })
    }, 1200)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  async flush() {
    if (!this.dirty && this.timer) return
    this.dirty = false
    const payload = {
      version: 1,
      generator: 'paper-translator/0.1.0',
      migrated: true,
      updatedAt: new Date().toISOString(),
      entries: this.entries,
      usage: this.usage,
    }
    await mkdir(dirname(this.paths.json), { recursive: true })
    const tmp = `${this.paths.json}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(payload), { mode: 0o600 })
    await rename(tmp, this.paths.json)
  }

  async clear() {
    this.entries = {}
    this.byBlock.clear()
    this.dirty = true
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    await this.flush()
    await unlink(this.paths.md).catch(() => {})
  }
}
