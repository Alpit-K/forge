// Hand-drawn inline SVG — no charting library. The box is stretched to the
// container with preserveAspectRatio="none", which would stretch the stroke with it, so the
// stroke is pinned at 2 px with vector-effect. The caption carries the numbers, so the
// drawing itself is decorative.
const W = 240
const H = 40
const PAD = 4

// `cat` is the category the line belongs to — it defaults to the accent, which is the
// strength tint, because a weight trend is what this was written for. The run trend passes
// 'cardio' so its three lines are drawn in the colour History draws its runs in; they were
// violet against cyan rows, which is the one inconsistency the week strip already had.
export default function Sparkline({ values, cat }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min
  const points = values
    .map((v, i) => {
      const x = PAD + (i * (W - PAD * 2)) / (values.length - 1)
      // A flat run has no range to scale against — draw it down the middle.
      const y = span === 0 ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')

  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <polyline
        points={points}
        fill="none"
        stroke={cat === 'cardio' ? 'var(--cat-cardio)' : 'var(--cat-lift)'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}
