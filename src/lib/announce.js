// Says one line to a screen reader through the single live region App renders. The workout
// swaps whole screens — logger, rest, summary — and a live region mounted with a screen is
// not reliably read; one that outlives them is. Cleared first so the same sentence twice
// running ("Set 2 logged" after an undo) is still spoken.
export function announce(text) {
  const el = typeof document !== 'undefined' ? document.getElementById('announcer') : null
  if (!el) return
  el.textContent = ''
  requestAnimationFrame(() => {
    el.textContent = text
  })
}
