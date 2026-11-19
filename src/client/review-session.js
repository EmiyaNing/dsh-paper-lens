// Each open main file has its own write queue and optimistic disk version.
export function reviewSession(projectId, store, send, onError) {
  let version = store?.version ?? 0
  let saved = JSON.stringify(store?.workspace ?? null)
  let pending = null
  let running = null
  let timer = null
  let conflict = false
  const backup = 'paperTranslator.reviewDraft.' + projectId
  const remember = value => { try { localStorage.setItem(backup, JSON.stringify({ version, workspace: value })) } catch { } }
  async function drain() {
    while (pending && !conflict) {
      const value = pending
      pending = null
      const serialized = JSON.stringify(value)
      if (serialized !== saved) {
        try {
          const response = await send('/review/save', { projectId, version, workspace: value })
          version = response.version
          saved = serialized
        } catch (error) {
          pending ??= value
          conflict = error.code === 'review/conflict'
          remember(pending)
          onError(error, pending)
          throw error
        }
      }
      if (pending) remember(pending)
      else { try { localStorage.removeItem(backup) } catch { } }
    }
  }
  function flush() {
    clearTimeout(timer)
    if (!running) running = drain().finally(() => { running = null })
    return running
  }
  return {
    flush,
    queue(value) {
      if (!pending && !running && JSON.stringify(value) === saved) return
      pending = value
      remember(value)
      clearTimeout(timer)
      timer = setTimeout(() => flush().catch(() => { }), 300)
    }
  }
}
