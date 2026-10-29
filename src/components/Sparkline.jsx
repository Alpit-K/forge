import { useState } from 'react'
import { fmtDate } from '../lib/format.js'

// Hand-drawn inline SVG — no charting library. The line's box is stretched to
// the container with preserveAspectRatio="none", which would stretch the stroke with it, so
// the stroke is pinned at 2 px with vector-effect. The dots, labels and tap targets are HTML
// laid over it by percentage, because anything round or written inside a stretched SVG is
// stretched too.
const W = 240
const H = 40
const PAD = 4

// `cat` is the category the line belongs to — it defaults to the accent, which is the
// strength tint, because a weight trend is what this was written for. The run and ride
// trends pass 'cardio' so their lines are drawn in the colour History draws those sessions in.
//
// The full chart says what it plots: a dot per session, the range it spans at the left, the
// first and last dates beneath, and a readout above that starts on the latest session and
// moves to whichever one you tap. Every line is drawn the natural way up — a higher number
// is higher on the chart — because once the numbers are on screen a line drawn upside down
// puts 127 bpm below 117. Where lower is the good direction, the caller says so in words.
// `compact` is the bare line, for a row that has its numbers beside it.
export default function Sparkline({ points, format = String, cat, compact = false }) {
  const [picked, setPicked] = useState(null)
  if (points.length < 2) return null
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const x = (i) => PAD + (i * (W - PAD * 2)) / (points.length - 1)
  // A flat run has no range to scale against — draw it down the middle.
  const y = (v) => (span === 0 ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2))
  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const stroke = cat === 'cardio' ? 'var(--cat-cardio)' : 'var(--cat-lift)'

  const svg = (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={line}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
  if (compact) return svg

  const shown = picked ?? points.length - 1
  const sel = points[shown]

  return (
    <div className="chart" data-cat={cat || 'lift'}>
      <div className="chart-readout tnum">
        <b>{format(sel.value)}</b> · {fmtDate(sel.at)}
      </div>
      <div className="chart-body">
        <div className="chart-range tnum" aria-hidden="true">
          <span>{format(max)}</span>
          {span > 0 && <span>{format(min)}</span>}
        </div>
        <div className="chart-plot">
          {svg}
          {points.map((p, i) => (
            <span
              key={i}
              className="chart-dot"
              data-picked={i === shown || undefined}
              style={{ left: `${(x(i) / W) * 100}%`, top: `${(y(p.value) / H) * 100}%` }}
            />
          ))}
          {/* One column per session across the whole plot, so a tap anywhere above or below a
              dot picks it — a 6 px dot is not a target. */}
          <div className="chart-hits">
            {points.map((p, i) => (
              <button
                type="button"
                key={i}
                aria-label={`${format(p.value)} on ${fmtDate(p.at)}`}
                aria-pressed={i === shown}
                onClick={() => setPicked(i)}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="chart-dates tnum">
        <span>{fmtDate(points[0].at)}</span>
        <span>{fmtDate(points[points.length - 1].at)}</span>
      </div>
    </div>
  )
}
