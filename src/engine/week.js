// Week bucketing and the rollups both the Today readout and the coach read. Pure: dates and
// arrays in, numbers out. No stored counters — the same rule the progression engine follows,
// which is why correcting a run in History fixes every number here instantly.
//
// Everything is LOCAL, never UTC. A run logged at 23:00 on a Sunday in British Summer Time
// is Sunday's; read through UTC getters it becomes Monday and lands in the wrong week
// entirely. ActivitySheet already carries this bug's twin for the date picker.

export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

// Date.getDay() is 0=Sunday. The week starts Monday, so Monday is 0 and Sunday is 6. Every
// weekShape array is indexed by this, not by getDay().
export function dayIndex(date) {
  return (date.getDay() + 6) % 7
}

export function weekStart(date) {
  const d = startOfDay(date)
  // setDate handles the negative rollover into the previous month and year on its own.
  d.setDate(d.getDate() - dayIndex(d))
  return d
}

export function addDays(date, n) {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

import { totalVolume } from './session.js'

// A WorkoutLog timestamps as `finishedAt`, an Activity as `at`. Not the same field, and
// nothing else in the app needs both, so the asymmetry is absorbed here.
function inRange(iso, from, to) {
  const t = Date.parse(iso)
  return Number.isFinite(t) && t >= from.getTime() && t < to.getTime()
}

// Inclusive of `from`, exclusive of `to`. One implementation, two windows — see the two
// callers below, which deliberately disagree.
export function summarise(workouts, activities, from, to) {
  const lifts = workouts.filter((w) => w.finishedAt && inRange(w.finishedAt, from, to))
  const cardio = activities.filter((a) => a.at && inRange(a.at, from, to))

  // Σ(reps × weight) over the window's lifts, through the one function that computes it.
  // Re-deriving it here is how the finish summary and this readout would come to disagree
  // about the same session — the same rule `workingWeight` is written under.
  let volumeKg = 0
  for (const w of lifts) volumeKg += totalVolume(w.entries)

  let distanceKm = 0
  let easy = 0
  let hard = 0
  for (const a of cardio) {
    if (typeof a.distanceKm === 'number' && Number.isFinite(a.distanceKm)) distanceKm += a.distanceKm
    if (a.intensity === 'easy') easy += 1
    else if (a.intensity === 'hard') hard += 1
  }

  const tagged = easy + hard
  return {
    lifts: lifts.length,
    cardio: cardio.length,
    volumeKg,
    distanceKm,
    easy,
    hard,
    tagged,
    // Null, not 0, when nothing is tagged: an untagged week is unknown, not all-hard. Every
    // consumer must treat null as "say nothing" rather than rendering a number.
    easyPct: tagged === 0 ? null : Math.round((easy / tagged) * 100),
    liftLogs: lifts,
    cardioLogs: cardio,
  }
}

// What the Today readout shows: Monday to the end of today. This is "this week" as a person
// means it, and it is the window the counts are compared against the weekly targets.
export function weekSummary(workouts, activities, now = new Date()) {
  return summarise(workouts, activities, weekStart(now), addDays(startOfDay(now), 1))
}

// What the coach reasons over: a rolling window ending today. Week-to-date is useless as an
// 80/20 input — one easy run on a Tuesday reads 100% easy and means nothing. The two windows
// disagree by design, so any reason line built from this one must name its own window.
export function rollingSummary(workouts, activities, now = new Date(), days = 7) {
  const end = addDays(startOfDay(now), 1)
  return summarise(workouts, activities, addDays(startOfDay(now), -(days - 1)), end)
}

// Whole days between two instants, by local calendar day. Same-day is 0, yesterday is 1.
export function daysBetween(iso, now = new Date()) {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return null
  return Math.round((startOfDay(now).getTime() - startOfDay(new Date(then)).getTime()) / 86400000)
}

// The timeline's buckets: everything logged, newest day first, newest item first within a
// day. Items carry `at` — the merged shape History already builds, where a workout's
// finishedAt and an activity's at are normalised to the one field.
//
// The day is the LOCAL calendar day, via startOfDay. Keying on `at.slice(0, 10)` would be
// the UTC day, so a session finished at 23:30 on a Sunday in British Summer Time would head
// up Monday's group — the same bug the week bucketing above exists to avoid, in a place
// where it is even more visible.
export function groupByDay(items) {
  const buckets = new Map()
  for (const item of items) {
    const t = Date.parse(item.at)
    if (!Number.isFinite(t)) continue
    const date = startOfDay(new Date(t))
    const key = date.getTime()
    if (!buckets.has(key)) buckets.set(key, { key, date, items: [] })
    buckets.get(key).items.push(item)
  }
  const days = [...buckets.values()].sort((a, b) => b.key - a.key)
  for (const d of days) d.items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
  return days
}

// The seven-dot row. One entry per day of the current week, Monday first, each carrying what
// the shape asked for and what actually happened. Derived entirely — a day with nothing in it
// is simply empty, never "missed", because nothing was ever scheduled to be missed.
export function weekDays(workouts, activities, weekShape, now = new Date()) {
  const start = weekStart(now)
  const todayIdx = dayIndex(now)
  return Array.from({ length: 7 }, (_, i) => {
    const from = addDays(start, i)
    const to = addDays(start, i + 1)
    const day = summarise(workouts, activities, from, to)
    return {
      index: i,
      date: from,
      planned: weekShape[i] || 'rest',
      lifts: day.lifts,
      cardio: day.cardio,
      // The records themselves, for the week detail — the strip only needs the counts, but
      // deriving the same seven buckets a second time to name what was in them would be two
      // implementations of one thing.
      liftLogs: day.liftLogs,
      cardioLogs: day.cardioLogs,
      isToday: i === todayIdx,
      isFuture: i > todayIdx,
    }
  })
}

// The last `count` local-Monday weeks, oldest first, each summarised the same way as any
// other window. The current week is included and is simply incomplete — nothing is logged in
// the future, so its `to` running to Sunday costs nothing and keeps every bucket the same
// shape. This is the consistency readout's only input: **there is no streak state, and none
// may be added.** A week with nothing in it is a fact and breaks nothing.
export function recentWeeks(workouts, activities, now = new Date(), count = 6) {
  const current = weekStart(now)
  const weeks = []
  for (let i = count - 1; i >= 0; i -= 1) {
    const from = addDays(current, -7 * i)
    weeks.push({ start: from, ...summarise(workouts, activities, from, addDays(from, 7)) })
  }
  return weeks
}
