import { useStore } from '../store.js'

// Service worker update flow: reload on controllerchange, but never during a workout.
// If an update lands while active is non-null, hold it until the finish summary is dismissed.
let pendingReload = false

export function requestReloadIfIdle() {
  if (pendingReload && useStore.getState().active == null) {
    window.location.reload()
  }
}

export function initServiceWorker() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return
  // clientsClaim fires controllerchange on a first install too. That is not an update, and
  // reloading for it would flash the app on its very first launch.
  const hadController = navigator.serviceWorker.controller != null
  navigator.serviceWorker.register('/sw.js').catch(() => {})
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return
    if (useStore.getState().active == null) window.location.reload()
    else pendingReload = true
  })
}
