export function fmtDuration(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return s === 0 ? `${m}m` : `${m}m ${s}s`
}

// Rest, as a clock rather than a count of seconds. `rest 150s` is arithmetic the reader has
// to do; nobody sets a rest interval in seconds past ninety. Always m:ss, including under a
// minute — "0:45" beside "2:30" is a column you can compare, "45s" beside "2:30" is not.
// Same padStart as the pace, and for the same reason: 2:5 is not a time.
//
// This is the rest timer's own clock, hoisted. RestTimer drew "of 2:30" from a private copy
// of exactly this function while the Plan editor printed "rest 150s" beside it — the same
// number in two formats depending on which screen you were looking at.
export function fmtRest(sec) {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export function fmtDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function fmtDateTime(iso) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
}

// Relative day count for the session picker. Same-day reads "Today", not "0d ago".
export function fmtAgo(iso) {
  const then = new Date(iso)
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((start(new Date()) - start(then)) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days}d ago`
}

// Timeline day headings. Today and Yesterday are named because that is how you refer to
// them; anything older leads with the weekday, which is what makes a training week scannable
// — "Sat 30 Aug" tells you it was a weekend session, "30 Aug" does not.
export function fmtDayHeading(date, now = new Date()) {
  const start = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((start(now) - start(date)) / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}

// Empty at zero so the caller can append it unconditionally — a block with no activities
// reads "Block 2 — 9 sessions", not "… · 0 activities".
export function fmtActivityCount(n) {
  if (n <= 0) return ''
  return n === 1 ? '1 activity' : `${n} activities`
}

export function fmtRunCount(n) {
  return n === 1 ? '1 run' : `${n} runs`
}

// Distance is optional on every activity, so this is only called when one exists. One
// decimal: 5.2 km. Swims read oddly at 0.8 km and that is accepted — one unit throughout
// beats a second unit to carry.
export function fmtDistance(km) {
  return `${km.toFixed(1)} km`
}

// Seconds per kilometre as a pace. Rounded to the nearest second, then carried: 5:59.6 must
// render 6:00 and never 5:60, which is the whole reason this is a function and not an inline
// template string. The engine keeps pace unrounded and rounds here, once.
export function fmtPaceSec(secPerKm) {
  if (!secPerKm || secPerKm <= 0) return null
  const totalSec = Math.round(secPerKm)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')} /km`
}

// Average heart rate, read off the watch summary after the run. Whole beats — a decimal
// bpm is precision the source does not have.
export function fmtHr(bpm) {
  if (!bpm || bpm <= 0) return null
  return `${Math.round(bpm)} bpm`
}

// Pace from the two things actually typed.
export function fmtPace(km, minutes) {
  if (!km || !minutes || km <= 0 || minutes <= 0) return null
  return fmtPaceSec((minutes * 60) / km)
}
