import Icon from './Icon.jsx'

// A value with a picker behind it. The <select> is transparent and laid over the whole
// control, so the native wheel still opens on tap while the text you see is drawn by us.
//
// This exists because styling the select itself could not be made to line up. A native
// select is only as wide as its widest option — "8" for sets, "150" for rest, "Auto · 2 kg"
// for the increment — and WebKit does not reliably honour `text-align` inside one, so the
// value lands at the left edge of a box whose width differs per row while the boxes
// themselves are right-anchored. The result is a column of numbers that does not line up,
// and no amount of padding on the select fixes it. Here the chevron is a fixed 14px at the
// far right and the value sits immediately left of it, so every row ends at the same x by
// construction.
export default function Selector({ value, options, onChange, label }) {
  const current = options.find((o) => String(o.value) === String(value))
  return (
    <span className="selector">
      <span className="selector-value tnum">{current ? current.label : value}</span>
      <span className="selector-chevron">
        <Icon name="chevron" size={14} />
      </span>
      <select
        className="selector-native"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  )
}
