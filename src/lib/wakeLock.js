// Screen Wake Lock. Keep a `wanted` flag and re-acquire on visibilitychange — a one-shot
// request dies silently the moment the document hides.

let wanted = false
let sentinel = null

async function request() {
  if (typeof navigator === 'undefined' || !navigator.wakeLock) return
  if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
  } catch {
    // Low Power Mode, or an unsupported build. Fail quiet; retry on next visible.
  }
}

export function acquireWakeLock() {
  wanted = true
  request()
}

export function releaseWakeLock() {
  wanted = false
  if (sentinel) {
    sentinel.release().catch(() => {})
    sentinel = null
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (wanted && document.visibilityState === 'visible' && !sentinel) request()
  })
}
