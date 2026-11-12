import { useId, useState } from 'react'
import { fmtDate } from '../lib/format.js'

// Hand-drawn inline SVG — no charting library. The plot's box is stretched to
// the container with preserveAspectRatio="none", which would stretch the stroke with it, so
// every stroke is pinned with vector-effect. The full chart's viewBox height equals its CSS
// height, so only the x axis is stretched. The dots, labels and tap targets are HTML laid
// over it by percentage, because anything round or written inside a stretched SVG is
// stretched too.
const W = 240
const COMPACT = { h: 40, padX: 4, padY: 4 }
// The full plot is 104 px tall and the padding clears the latest point's 10 px dot plus its
// 3 px ring, so the emphasised dot never sits on the plot's edge.
const FULL = { h: 104, padX: 8, padY: 8 }

// `cat` is the category the line belongs to — it defaults to the accent, which is the
// strength tint, because a weight trend is what this was written for. The run and ride
// trends pass 'cardio' so their lines are drawn in the colour History draws those sessions in.
//
// The full chart is an instrument: a scale of three gridlines labelled max, mid and min, an
// area under the line, a dot per session with the latest one emphasised, and a readout above
// that starts on the latest session and moves to whichever one you tap, with a hairline
// through it. Every line is drawn the natural way up — a higher number is higher on the
// chart — because once the numbers are on screen a line drawn upside down puts 127 bpm below
// 117. Where lower is the good direction, the caller says so in words.
//
// `marks` — `[{ index, label }]` — draws a dashed boundary between point index-1 and index,
// labelled at its top. `compact` is the bare line and an end dot, for a row that has its
// numbers beside it.
export default function Sparkline({ points, format = String, cat, compact = false, marks = [] }) {
  const [picked, setPicked] = useState(null)
  const gradientId = useId()
  if (points.length < 2) return null
  const { h: H, padX, padY } = compact ? COMPACT : FULL
  const values = points.map((p) => p.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const x = (i) => padX + (i * (W - padX * 2)) / (points.length - 1)
  // A flat run has no range to scale against — draw it down the middle.
  const y = (v) => (span === 0 ? H / 2 : H - padY - ((v - min) / span) * (H - padY * 2))
  const coords = points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
  const stroke = cat === 'cardio' ? 'var(--cat-cardio)' : 'var(--cat-lift)'
  const pctX = (i) => `${(x(i) / W) * 100}%`
  const pctY = (v) => `${(y(v) / H) * 100}%`
  const last = points.length - 1

  if (compact) {
    return (
      <span className="spark-wrap" data-cat={cat || 'lift'}>
        <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <polyline
            points={coords.join(' ')}
            fill="none"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="spark-end" style={{ left: pctX(last), top: pctY(points[last].value) }} />
      </span>
    )
  }

  const shown = picked ?? last
  const sel = points[shown]
  const floor = span === 0 ? H / 2 : H - padY
  // The scale: max, the real midpoint and min, or the one value of a flat run.
  const ticks = span === 0 ? [min] : [max, (max + min) / 2, min]
  const area = `${x(0).toFixed(1)},${floor} ${coords.join(' ')} ${x(last).toFixed(1)},${floor}`

  return (
    <div className="chart" data-cat={cat || 'lift'}>
      <div className="chart-readout tnum">
        <b>{format(sel.value)}</b> · {fmtDate(sel.at)}
      </div>
      <div className="chart-body" data-marks={marks.length > 0 || undefined}>
        <div className="chart-range tnum" aria-hidden="true">
          {ticks.map((v, i) => (
            <span key={i} style={{ top: `${(y(v) / H) * 100}%` }}>
              {format(v)}
            </span>
          ))}
        </div>
        <div className="chart-plot">
          <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
            <defs>
              {/* The category's own tinted ground at the line, fading to nothing at the
                  floor of the scale. */}
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="chart-area-top" />
                <stop offset="1" className="chart-area-top" stopOpacity="0" />
              </linearGradient>
            </defs>
            {ticks.map((v, i) => (
              <line
                key={i}
                className="chart-grid"
                x1="0"
                x2={W}
                y1={y(v)}
                y2={y(v)}
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polygon points={area} fill={`url(#${gradientId})`} />
            <polyline
              points={coords.join(' ')}
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
          {marks.map((m) => {
            const at = ((x(m.index - 1) + x(m.index)) / 2 / W) * 100
            return (
              <div key={m.index} className="chart-mark" style={{ left: `${at}%` }} data-end={at > 72 || undefined}>
                <span>{m.label}</span>
              </div>
            )
          })}
          {picked != null && <div className="chart-cursor" style={{ left: pctX(picked) }} />}
          {points.map((p, i) => (
            <span
              key={i}
              className="chart-dot"
              data-latest={i === last || undefined}
              data-picked={(picked != null && i === picked) || undefined}
              style={{ left: pctX(i), top: pctY(p.value) }}
            />
          ))}
          {/* One column per session across the whole plot, so a tap anywhere above or below a
              dot picks it — a 5 px dot is not a target. */}
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
        <span>{fmtDate(points[last].at)}</span>
      </div>
    </div>
  )
}
