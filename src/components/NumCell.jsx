import { useState } from 'react'

// A tappable numeric cell in the set table. The draft is committed on blur or Enter, never
// per keystroke: a weight edit propagates to the later sets, so a partial "6" on the way to
// typing "60" must not fire and drag them down with it.
export default function NumCell({ value, onCommit, label, disabled }) {
  const [draft, setDraft] = useState(null)

  const commit = () => {
    const raw = draft
    setDraft(null)
    if (raw == null || raw.trim() === '') return
    const n = Number(raw)
    if (!Number.isNaN(n)) onCommit(n)
  }

  return (
    <input
      className="num-cell tnum"
      type="number"
      inputMode="decimal"
      aria-label={label}
      disabled={disabled}
      placeholder="—"
      value={draft ?? (value == null ? '' : String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.target.blur()
      }}
    />
  )
}
