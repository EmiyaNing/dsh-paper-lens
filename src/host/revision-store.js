// Author-owned material is separate from the disposable translation cache.
import { readFile, writeFile, rename } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

export async function readRevisionStore(main) {
  const path = main.replace(/\.tex$/i, '.paper-lens.review.json')
  try {
    const state = JSON.parse(await readFile(path, 'utf8'))
    if (state.schema !== 1 || !Array.isArray(state.history) || !Number.isInteger(state.version)) {
      throw new Error('无法读取返修记录格式 / Unsupported review file')
    }
    return state
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    return { schema: 1, version: 0, workspace: null, history: [] }
  }
}

export async function writeRevisionStore(main, state) {
  const path = main.replace(/\.tex$/i, '.paper-lens.review.json')
  const tmp = path + '.' + randomUUID() + '.tmp'
  await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 })
  await rename(tmp, path)
}

// Serialize authors editing the same source through different plugin windows or main files.
let tail = Promise.resolve()
export function withRevisionLock(work) {
  const next = tail.then(work)
  tail = next.catch(() => {})
  return next
}
