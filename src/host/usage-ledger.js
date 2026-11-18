/**
 * Cross-paper token/cost ledger.
 *
 * Persisted under $DSH_HOME/paper-translator/usage.json. The per-paper sidecar
 * remains the source of truth for a paper; syncProject() folds sidecar totals
 * into the global ledger exactly once, so existing sidecars are captured on
 * their next open without double-counting calls already added live.
 */

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { emptyUsage } from './sidecar.js'

const FIELDS = ['input', 'output', 'cacheRead', 'cacheWrite', 'costUsd', 'calls']

function normalize(raw) {
  const usage = emptyUsage()
  if (raw && typeof raw === 'object') {
    for (const key of FIELDS) usage[key] = Number(raw[key]) || 0
  }
  return usage
}

function addInto(target, usage, costUsd = 0) {
  for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) {
    target[key] += Number(usage?.[key]) || 0
  }
  target.calls += Number(usage?.calls) || 1
  target.costUsd += Number(costUsd) || 0
}

export class UsageLedger {
  constructor(path) {
    this.path = path
    this.totals = emptyUsage()
    this.projects = {}
    this.loaded = false
    this.loading = null
    this.dirty = false
    this.timer = null
    this.chain = Promise.resolve()
  }

  async load() {
    if (this.loaded) return this
    if (this.loading) return this.loading
    this.loading = (async () => {
      try {
        const data = JSON.parse(await readFile(this.path, 'utf8'))
        this.totals = normalize(data?.totals)
        if (data?.projects && typeof data.projects === 'object') {
          for (const [id, usage] of Object.entries(data.projects)) {
            if (usage && typeof usage === 'object') this.projects[id] = normalize(usage)
          }
        }
      } catch {
        // first run or unreadable ledger
      }
      this.loaded = true
      this.loading = null
      return this
    })()
    return this.loading
  }

  async add(projectId, usage, costUsd = 0) {
    await this.load()
    addInto(this.totals, usage, costUsd)
    const project = this.projects[projectId] ?? emptyUsage()
    addInto(project, usage, costUsd)
    this.projects[projectId] = project
    this.dirty = true
    this.schedule()
    return this.totals
  }

  /**
   * Fold a paper's sidecar totals into the ledger without ever subtracting.
   * Calls added live already updated the project entry, so this is normally a
   * zero delta; it exists to capture sidecars created before the ledger.
   */
  async syncProject(projectId, usage) {
    await this.load()
    const sidecar = normalize(usage)
    const current = this.projects[projectId] ?? emptyUsage()
    const delta = emptyUsage()
    for (const key of FIELDS) delta[key] = Math.max(0, sidecar[key] - current[key])
    if (FIELDS.every((key) => delta[key] === 0)) return this.totals
    for (const key of FIELDS) {
      this.totals[key] += delta[key]
      // The project entry should match the sidecar, not merely accumulate.
      current[key] = Math.max(current[key], sidecar[key])
    }
    this.projects[projectId] = current
    this.dirty = true
    this.schedule()
    return this.totals
  }

  totalsView() {
    return { ...this.totals }
  }

  schedule() {
    if (this.timer) return
    this.timer = setTimeout(() => {
      this.timer = null
      this.flush().catch(() => {})
    }, 1200)
    if (typeof this.timer.unref === 'function') this.timer.unref()
  }

  async flush() {
    await this.load()
    const run = async () => {
      this.dirty = false
      const payload = {
        version: 1,
        updatedAt: new Date().toISOString(),
        totals: this.totals,
        projects: this.projects,
      }
      await mkdir(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.${process.pid}.${Date.now()}.tmp`
      await writeFile(tmp, JSON.stringify(payload), { mode: 0o600 })
      await rename(tmp, this.path)
    }
    this.chain = this.chain.then(run, run)
    return this.chain
  }
}
