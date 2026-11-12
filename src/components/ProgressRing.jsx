// Progress as a ring — the rest timer's, the block-complete hero, and the block count on
// History. Driven by a fraction the caller derives, never by a counter of its own: see
// RestTimer for why that matters there. `heat` paints it in --heat, which only the
// block-complete hero does: a finished block is the one ring that is not a countdown.
export default function ProgressRing({ fraction, size = 264, stroke = 14, heat = false, children }) {
  const clamped = Math.max(0, Math.min(1, fraction))

  // Drawn in CSS rather than SVG because the shading follows the arc: SVG has no gradient
  // along a stroke, and the linear one this replaced shaded the circle top to bottom, so a
  // three-quarter arc went light, dark, then light again. The conic gradient is scaled to
  // --sweep, which puts the dark end where the arc starts and the bright end at its tip
  // however far it has drained. A conic edge is square, so each end carries a round cap.
  return (
    <div
      className={heat ? 'ring ring-heat' : 'ring'}
      style={{ width: size, height: size, '--size': `${size}px`, '--stroke': `${stroke}px`, '--sweep': `${clamped * 360}deg` }}
    >
      <div className="ring-band ring-track" aria-hidden="true" />
      {clamped > 0 && (
        <>
          <div className="ring-band ring-fill" aria-hidden="true" />
          <span className="ring-cap ring-cap-start" aria-hidden="true" />
          <span className="ring-cap ring-cap-tip" aria-hidden="true" />
        </>
      )}
      <div className="ring-content">{children}</div>
    </div>
  )
}
