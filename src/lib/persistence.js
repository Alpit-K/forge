// localStorage persistence. Every read/write is wrapped; a storage-blocked context (private
// window) must never throw.

export function loadState(storage, key) {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function saveState(storage, key, state) {
  try {
    storage.setItem(key, JSON.stringify(state))
  } catch {
    // fail quiet
  }
}

// A storage handle that never throws on access. Returns null when storage is unavailable.
export function safeStorage() {
  try {
    const ls = window.localStorage
    ls.setItem('__forge_probe__', '1')
    ls.removeItem('__forge_probe__')
    return ls
  } catch {
    return null
  }
}

// Debounced ~800 ms write, with an immediate flush on backgrounding.
export function attachPersistence(useStore, storage, key) {
  if (!storage) return () => {}

  let timer = null
  let pending = null

  const flush = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (pending !== null) {
      saveState(storage, key, pending)
      pending = null
    }
  }

  const unsubscribe = useStore.subscribe((state) => {
    pending = state
    if (timer) clearTimeout(timer)
    timer = setTimeout(flush, 800)
  })

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush()
    })
    // An installed app swiped out of the switcher can be terminated without visibilitychange
    // ever firing. pagehide is the one that survives that, so a set ticked inside the last
    // 800 ms is not the write that gets lost.
    window.addEventListener('pagehide', flush)
  }

  return unsubscribe
}
