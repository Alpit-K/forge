// The nav bar collapses its large title once you have scrolled a little. That decision has
// to be made with hysteresis, and the reason is not cosmetic: collapsing REMOVES content
// height from above the scroll position, because `.navbar` is in normal flow at the top of
// the scroller. Safari holds the visual position by reducing scrollTop by exactly the height
// that vanished — so the act of collapsing moves you back through the very threshold that
// triggered it.
//
// With a single threshold at 24 that is an infinite loop, one cycle per frame, measured on
// an iPhone: Plan oscillated scrollTop 26 <-> 15 while the scrollable range oscillated
// 765 <-> 754 (an 11px bar delta), and Library 26 <-> 10 against 6955 <-> 6939 (16px). iOS
// momentum keeps integrating against a scroller fighting itself and flings it to the end,
// which is why a small downward flick landed at the bottom of the page.
//
// So the two thresholds must be separated by MORE than the tallest collapse can remove:
//
//   collapse - expand  >  (large bar height - inline bar height)
//
// The largest delta in the app is Today's, whose large bar carries the date subtitle:
// 8 + 39 + 4 + 18 + 8 = 77px against the inline bar's 44, so 33. A title wrapping to two
// lines would be 50. The 64px separation below clears both. **If you change either number,
// check that inequality** — closing the gap brings the loop straight back, and it looks
// like a scrolling bug rather than a threshold bug.
export const COLLAPSE_AT = 72
export const EXPAND_AT = 8

export function nextCollapsed(collapsed, scrollTop) {
  return collapsed ? scrollTop > EXPAND_AT : scrollTop > COLLAPSE_AT
}
