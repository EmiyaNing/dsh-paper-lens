/**
 * Disk cache for translated blocks.
 *
 * One JSON file per project, keyed by content hash. Writes are atomic
 * (tmp + rename) and debounced; the cache never stores failed translations.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const CACHE_VERSION = 1
const MAX_ENTRIES = 5000

export function shortHash(value) {
  return createHash('sha256').update(value).digest('hex')
}

export class TranslationCache {
  constructor(baseDir) {
    this.dir = join(baseDir, 'cache')
    this.projects = new Map()
    this.timers = new Map()
  }

  async ensure() {
    await mkdir(this.dir, { recursive: true })
  }

  fileFor(projectId) {
    return join(this.dir, `${projectId}.json`)
  }

  async load(projectId) {
    if (this.projects.has(projectId)) return this.projects.get(projectId)
    let data = { version: CACHE_VERSION, entries: {} }
    try {
      const raw = await readFile(this.fileFor(projectId), 'utf8')
      const parsed = JSON.parse(raw)
      if (parsed && parsed.version === CACHE_VERSION && parsed.entries && typeof parsed.entries === 'object') {
        data = parsed
      }
    } catch {
      // missing or corrupt cache: start clean
    }
    this.projects.set(projectId, data)
    return data
  }

  async get(projectId, key) {
    const data = await this.load(projectId)
    return data.entries[key]?.text
  }

  async set(projectId, key, text) {
    const data = await this.load(projectId)
    data.entries[key] = { text, ts: Date.now() }
    const keys = Object.keys(data.entries)
    if (keys.length > MAX_ENTRIES) {
      keys.sort((a, b) => (data.entries[a].ts ?? 0) - (data.entries[b].ts ?? 0))
      for (const stale of keys.slice(0, keys.length - MAX_ENTRIES)) delete data.entries[stale]
    }
    this.schedule(projectId)
  }

  schedule(projectId) {
    if (this.timers.has(projectId)) return
    const timer = setTimeout(() => {
      this.timers.delete(projectId)
      this.flush(projectId).catch((error) => {
        console.error('[paper-translator] cache flush failed:', error.message)
      })
    }, 1500)
    if (typeof timer.unref === 'function') timer.unref()
    this.timers.set(projectId, timer)
  }

  async flush(projectId) {
    const data = this.projects.get(projectId)
    if (!data) return
    await this.ensure()
    const target = this.fileFor(projectId)
    const tmp = `${target}.${process.pid}.tmp`
    await writeFile(tmp, JSON.stringify(data), { mode: 0o600 })
    await rename(tmp, target)
  }

  async flushAll() {
    for (const id of this.projects.keys()) await this.flush(id)
  }

  async clear(projectId) {
    if (projectId) {
      this.projects.delete(projectId)
      const timer = this.timers.get(projectId)
      if (timer) clearTimeout(timer)
      this.timers.delete(projectId)
      try {
        await writeFile(this.fileFor(projectId), JSON.stringify({ version: CACHE_VERSION, entries: {} }), { mode: 0o600 })
      } catch {
        // ignore
      }
      return
    }
    this.projects.clear()
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    await mkdir(this.dir, { recursive: true })
    const { readdir, unlink } = await import('node:fs/promises')
    for (const name of await readdir(this.dir)) {
      if (name.endsWith('.json')) await unlink(join(this.dir, name)).catch(() => {})
    }
  }
}
