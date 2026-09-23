import { useEffect, useRef, useState } from 'react'
import { playCue } from '../lib/audio.js'
import ProgressRing from './ProgressRing.jsx'
import { fmtRest } from '../lib/format.js'

// Renders from restStartedAt, never by decrementing a counter. The cue fires only if
// the timer reaches zero while the document is visible — never retroactively.
export default function RestTimer({ restStartedAt, restSec, sound, onAdjust, onSkip, onComplete, children }) {
  const [elapsed, setElapsed] = useState(0)
  const cuedRef = useRef(false)
  const endedRef = useRef(false)

  // Held in a ref, not in the deps below: the parent passes a fresh arrow every render and
  // depending on it would restart the interval — and the timer with it — on each tick.
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onCompleteRef.current = onComplete
  })

  useEffect(() => {
    if (!restStartedAt) return
    cuedRef.current = false
    endedRef.current = false
    const started = Date.parse(restStartedAt)
    const complete = () => Date.now() - started >= restSec * 1000

    const sync = () => {
      const e = Math.floor((Date.now() - started) / 1000)
      setElapsed(e)
      if (complete() && !cuedRef.current) {
        cuedRef.current = true
        if (sound && document.visibilityState === 'visible') playCue()
      }
      // Hand the screen back to the logger the moment rest is up. Fires once per rest, and
      // fires on return from a background too — where cuedRef is pre-armed below, so you get
      // the next set with no retroactive beep.
      if (complete() && !endedRef.current) {
        endedRef.current = true
        if (onCompleteRef.current) onCompleteRef.current()
      }
    }

    if (complete()) cuedRef.current = true
    sync()
    const id = setInterval(sync, 200)
    const onVis = () => {
      if (document.visibilityState === 'visible') {
        if (complete()) cuedRef.current = true
        sync()
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [restStartedAt, restSec, sound])

  if (!restStartedAt) return null
  const remaining = Math.max(0, restSec - elapsed)
  const done = remaining <= 0

  return (
    <div className="rest-view">
      <div className="rest-main">
        <ProgressRing fraction={restSec > 0 ? remaining / restSec : 0}>
          <div className="rest-caption">Rest</div>
          <div className={`rest-time tnum${done ? ' complete' : ''}`}>{done ? 'Done' : fmtRest(remaining)}</div>
          <div className="rest-of tnum">of {fmtRest(restSec)}</div>
        </ProgressRing>

        {children}
      </div>

      <div className="rest-actions">
        <button type="button" className="btn btn-bezel" onClick={() => onAdjust(-15)} disabled={restSec <= 0}>
          −15 sec
        </button>
        <button type="button" className="btn btn-bezel" onClick={() => onAdjust(15)}>
          +15 sec
        </button>
        <button type="button" className="btn btn-bezel" onClick={onSkip}>
          Skip rest
        </button>
      </div>
    </div>
  )
}
