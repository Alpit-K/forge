import { useEffect, useRef, useState } from 'react'
import { nextCollapsed } from '../lib/navbar.js'

// `compact` keeps the inline bar whatever the scroll position. The workout flow uses it:
// its title is a variable-length exercise name sitting beside four controls, which a 34px
// display title cannot hold — long names were being truncated to "Barbell Full…".
// `collapsed` drives two things off one scroll threshold: the title collapses to the inline
// treatment, and the bar gains its bottom hairline. A `compact` bar never collapses its title
// but still takes the hairline, because the edge is about the scroll, not the title.
// `mark` and `subtitle` are Today's alone — the wordmark lockup and the date that used to sit
// in the screen body below it. The wrappers they need are rendered only when they are passed,
// so every other screen's DOM is untouched: `.navbar-large` lays out the <h1> against
// `.navbar-actions` directly, and inserting a container between them moves `min-width: 0`.
export default function NavBar({ title, subtitle, mark, actions, compact = false }) {
  const ref = useRef(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const navbar = ref.current
    const scroller = navbar && navbar.closest('.screen')
    if (!scroller) return
    // Hysteresis, not a single threshold — see lib/navbar.js. Collapsing removes height
    // from above the scroll position, and the browser answers by moving scrollTop back
    // through the threshold that triggered it, which loops once per frame.
    const onScroll = () => setCollapsed((c) => nextCollapsed(c, scroller.scrollTop))
    onScroll()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => scroller.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className={`navbar${collapsed ? ' navbar-scrolled' : ''}`} ref={ref}>
      {compact || collapsed ? (
        <div className="navbar-inline">
          {/* No mark here: the collapsed bar sets the title at 17px and the mark is drawn to
              sit beside a 34px one. Scrolled, Today reads "Forge" like any other screen. */}
          <span className="navbar-title">{title}</span>
          {actions && <div className="navbar-actions">{actions}</div>}
        </div>
      ) : (
        <div className="navbar-large">
          {mark || subtitle ? (
            <div className="navbar-heading">
              <div className="navbar-lockup">
                {mark}
                <h1 className="navbar-title">{title}</h1>
              </div>
              {subtitle && <p className="navbar-subtitle">{subtitle}</p>}
            </div>
          ) : (
            <h1 className="navbar-title">{title}</h1>
          )}
          {actions && <div className="navbar-actions">{actions}</div>}
        </div>
      )}
    </div>
  )
}
