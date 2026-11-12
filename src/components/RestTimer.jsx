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
  // The last ten seconds. The tip and the numerals warm to --heat and the caption changes
  // word, so the state is said in words as well as hue — a colour transition and nothing
  // else, because this is the one motion in the app that does not answer a tap.
  const ending = !done && remaining <= 10

  // One tick per 15 s of this rest, a longer one on each whole minute, placed where the
  // ring's tip will be at that much time left — so a 90 s rest has six, and ±15 moves them.
  const ticks = []
  for (let t = 0; t < restSec; t += 15) ticks.push({ t, long: t % 60 === 0 })

  return (
    <div className="rest-view" data-ending={ending || undefined}>
      <div className="rest-main">
        <div className="rest-dial">
          {ticks.map(({ t, long }) => (
            <span
              key={t}
              className="rest-tick"
              data-long={long || undefined}
              style={{ '--a': `${(t / restSec) * 360}deg` }}
              aria-hidden="true"
            />
          ))}
          <ProgressRing fraction={restSec > 0 ? remaining / restSec : 0}>
            <div className="rest-caption">{ending ? 'Get set' : 'Rest'}</div>
            <div className={`rest-time tnum${done ? ' complete' : ''}`}>{done ? 'Done' : fmtRest(remaining)}</div>
            <div className="rest-of tnum">of {fmtRest(restSec)}</div>
          </ProgressRing>
        </div>

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
