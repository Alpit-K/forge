// Reading and writing `<input type="date">` and `type="time"` values against stored ISO
// timestamps, in local time. Shared by the activity sheet and the workout time sheet.

const pad = (n) => String(n).padStart(2, '0')

// `new Date().toISOString().slice(0, 10)` is the UTC day, which is the previous one for
// anything logged late on a British Summer Time evening. Read and write the local day.
export function toDateInput(iso) {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Keeps the original time of day. All three components are set in one call so a 31st
// never rolls forward through a short month on the way.
export function withDate(iso, value) {
  const [y, m, d] = value.split('-').map(Number)
  const next = new Date(iso)
  next.setFullYear(y, m - 1, d)
  return next.toISOString()
}

export function toTimeInput(iso) {
  const d = new Date(iso)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// Keeps the date; seconds are dropped because the field cannot show them.
export function withTime(iso, value) {
  const [h, min] = value.split(':').map(Number)
  const next = new Date(iso)
  next.setHours(h, min, 0, 0)
  return next.toISOString()
}

// Today is the latest date there is: a session logged ahead of now is read as one that has
// already happened. `max` on the input is a hint and iOS offers the day regardless, so this
// is where it is actually enforced — the field snaps back rather than accepting it. Both
// values are `yyyy-mm-dd`, where a string comparison is a date comparison.
export function notAfterToday(value, now = new Date()) {
  const today = toDateInput(now.toISOString())
  return value > today ? today : value
}
