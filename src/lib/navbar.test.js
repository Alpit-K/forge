import { describe, expect, it } from 'vitest'
import { COLLAPSE_AT, EXPAND_AT, nextCollapsed } from './navbar.js'

// Not a component test — `nextCollapsed` is the pure decision, extracted precisely so the
// feedback loop it exists to prevent can be tested without a DOM. The model below is the
// loop itself: toggling the bar changes the page height, and the browser answers by moving
// scrollTop by that same amount, which feeds straight back into the next decision.
function settle(delta, startTop, startCollapsed = false, limit = 50) {
  let collapsed = startCollapsed
  let top = startTop
  for (let i = 0; i < limit; i++) {
    const next = nextCollapsed(collapsed, top)
    if (next === collapsed) return { collapsed, top, steps: i }
    // Scroll anchoring: the bar's height leaves or returns above the scroll position.
    top = Math.max(0, top + (next ? -delta : delta))
    collapsed = next
  }
    return { oscillated: true, top, collapsed }
}

describe('the nav bar collapse cannot fight its own scroll position', () => {
  // 11px and 16px are the deltas measured on an iPhone for Plan and Library, 33 is Today's
  // (its large bar carries the date subtitle), 50 is a title wrapped to two lines.
  const deltas = [11, 16, 33, 50]

  for (const delta of deltas) {
    it(`settles from every scroll offset with a ${delta}px bar delta`, () => {
      for (let top = 0; top <= 400; top++) {
        for (const collapsed of [false, true]) {
          const out = settle(delta, top, collapsed)
          expect(out.oscillated, `oscillated at top=${top} collapsed=${collapsed}`).toBeUndefined()
        }
      }
    })
  }

  it('separates the thresholds by more than the tallest collapse removes', () => {
    expect(COLLAPSE_AT - EXPAND_AT).toBeGreaterThan(Math.max(...deltas))
  })

  it('still collapses once you have scrolled, and expands again at the top', () => {
    expect(nextCollapsed(false, COLLAPSE_AT + 1)).toBe(true)
    expect(nextCollapsed(false, COLLAPSE_AT)).toBe(false)
    expect(nextCollapsed(true, EXPAND_AT + 1)).toBe(true)
    expect(nextCollapsed(true, EXPAND_AT)).toBe(false)
  })
})
