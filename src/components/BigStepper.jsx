import { useState } from 'react'
import Icon from './Icon.jsx'

// The single-set logger shows one value at a time, so it can afford to be large. The number
// is tappable to type a correction; the draft commits on blur or Enter, never per keystroke,
// because a weight edit propagates to the later sets of the same exercise.
export default function BigStepper({ label, value, unit, onStep, onCommit }) {
  const [draft, setDraft] = useState(null)

  const commit = () => {
    const raw = draft
    setDraft(null)
    if (raw == null || raw.trim() === '') return
    const n = Number(raw)
    if (!Number.isNaN(n)) onCommit(n)
  }

  return (
    <div className="big-stepper">
      <div className="big-stepper-label">{label}</div>
      <div className="big-stepper-row">
        <button type="button" className="big-stepper-btn" aria-label={`Decrease ${label}`} onClick={() => onStep(-1)}>
          <Icon name="minus" size={22} />
        </button>
        <div className="big-stepper-value">
          {draft !== null ? (
            <input
              autoFocus
              type="number"
              inputMode="decimal"
              aria-label={label}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.target.blur()
              }}
            />
          ) : (
            <button
              type="button"
              className="big-stepper-number tnum"
              onClick={() => setDraft(value == null ? '' : String(value))}
            >
              {value == null ? '—' : value}
              {unit && <span className="big-stepper-unit">{unit}</span>}
            </button>
          )}
        </div>
        <button type="button" className="big-stepper-btn" aria-label={`Increase ${label}`} onClick={() => onStep(1)}>
          <Icon name="plus" size={22} />
        </button>
      </div>
    </div>
  )
}
