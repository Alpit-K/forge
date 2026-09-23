import { describe, it, expect } from 'vitest'
import {
  weekStart,
  dayIndex,
  summarise,
  weekSummary,
  rollingSummary,
  daysBetween,
  weekDays,
  addDays,
  startOfDay,
  groupByDay,
  recentWeeks,
} from './week.js'

// Local dates throughout. The suite pins TZ=Europe/London (vite.config.js) precisely so the
// local-vs-UTC distinction below is testable at all.
const local = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min)
const iso = (...args) => local(...args).toISOString()

// `entries` is not optional on a real log — buildWorkoutLog always writes the array, and
// four readers iterate it without checking. The fixture carries an empty one so the shape
// here is the shape the engine is actually handed.
const lift = (at, rotationIndex = 0, entries = []) => ({ id: at, finishedAt: at, rotationIndex, entries })
const act = (at, extra = {}) => ({ id: at, type: 'run', at, minutes: 30, ...extra })

describe('week boundaries', () => {
  it('starts the week on Monday', () => {
    // Mon 31 Aug 2026 through Sun 6 Sep 2026 are all one week.
    expect(weekStart(local(2026, 8, 31)).toDateString()).toBe('Mon Aug 31 2026')
    expect(weekStart(local(2026, 9, 4)).toDateString()).toBe('Mon Aug 31 2026')
    expect(weekStart(local(2026, 9, 6)).toDateString()).toBe('Mon Aug 31 2026')
    // Monday starts a new one rather than closing the old.
    expect(weekStart(local(2026, 9, 7)).toDateString()).toBe('Mon Sep 07 2026')
  })

  it('indexes Monday as 0 and Sunday as 6', () => {
    expect(dayIndex(local(2026, 8, 31))).toBe(0)
    expect(dayIndex(local(2026, 9, 6))).toBe(6)
  })

  it('rolls back across a month boundary', () => {
    // Sun 1 Mar 2026 belongs to the week beginning Mon 23 Feb.
    expect(weekStart(local(2026, 3, 1)).toDateString()).toBe('Mon Feb 23 2026')
  })

  it('rolls back across a year boundary', () => {
    // Fri 1 Jan 2027 belongs to the week beginning Mon 28 Dec 2026.
    expect(weekStart(local(2027, 1, 1)).toDateString()).toBe('Mon Dec 28 2026')
  })

  // The regression that matters. Under BST, 00:30 on Monday is 23:30 Sunday in UTC, so UTC
  // bucketing files the run in the week that just ended. Getting this wrong silently moves
  // sessions between weeks and every count downstream inherits it.
  it('files a small-hours Monday run in the new week, not the old one', () => {
    const mondayMorning = iso(2026, 9, 7, 0, 30)
    expect(mondayMorning).toBe('2026-09-06T23:30:00.000Z')

    const now = local(2026, 9, 7, 9, 0)
    expect(weekSummary([], [act(mondayMorning)], now).cardio).toBe(1)

    const lastWeek = local(2026, 9, 6, 9, 0)
    expect(weekSummary([], [act(mondayMorning)], lastWeek).cardio).toBe(0)
  })
})

describe('summarise', () => {
  const from = local(2026, 8, 31, 0, 0)
  const to = addDays(from, 7)

  it('counts lifts and cardio separately and sums distance', () => {
    const s = summarise(
      [lift(iso(2026, 9, 1)), lift(iso(2026, 9, 3))],
      [act(iso(2026, 9, 2), { distanceKm: 5.2 }), act(iso(2026, 9, 4), { distanceKm: 4 })],
      from,
      to,
    )
    expect(s.lifts).toBe(2)
    expect(s.cardio).toBe(2)
    expect(s.distanceKm).toBeCloseTo(9.2)
  })

  it('excludes anything outside the window', () => {
    const s = summarise([lift(iso(2026, 8, 30))], [act(iso(2026, 9, 7))], from, to)
    expect(s.lifts).toBe(0)
    expect(s.cardio).toBe(0)
  })

  // Untagged is unknown, not all-hard. A number here would invent data the user never gave.
  it('reports easyPct as null when nothing is tagged', () => {
    const s = summarise([], [act(iso(2026, 9, 1)), act(iso(2026, 9, 2))], from, to)
    expect(s.cardio).toBe(2)
    expect(s.tagged).toBe(0)
    expect(s.easyPct).toBeNull()
  })

  it('ignores untagged sessions in the split rather than counting them hard', () => {
    const s = summarise(
      [],
      [
        act(iso(2026, 9, 1), { intensity: 'easy' }),
        act(iso(2026, 9, 2), { intensity: 'hard' }),
        act(iso(2026, 9, 3)),
      ],
      from,
      to,
    )
    expect(s.cardio).toBe(3)
    expect(s.tagged).toBe(2)
    expect(s.easyPct).toBe(50)
  })

  it('tolerates an activity with no distance', () => {
    const s = summarise([], [act(iso(2026, 9, 1)), act(iso(2026, 9, 2), { distanceKm: 5 })], from, to)
    expect(s.distanceKm).toBe(5)
  })
})

// The two windows disagree on purpose: week-to-date is what a person means by "this week",
// a rolling window is the only honest 80/20 input. If these ever agree on a Tuesday, one of
// them has been pointed at the wrong range.
describe('the two windows', () => {
  it('reads 100% easy week-to-date while the rolling window still sees the hard runs', () => {
    const activities = [
      act(iso(2026, 8, 27), { intensity: 'hard' }),
      act(iso(2026, 8, 29), { intensity: 'hard' }),
      act(iso(2026, 9, 1), { intensity: 'easy' }),
    ]
    const tuesday = local(2026, 9, 1, 20, 0)

    expect(weekSummary([], activities, tuesday).easyPct).toBe(100)
    expect(rollingSummary([], activities, tuesday).easyPct).toBe(33)
  })

  it('rolling window covers today and the previous six days', () => {
    const now = local(2026, 9, 4, 12, 0)
    expect(rollingSummary([], [act(iso(2026, 8, 29))], now).cardio).toBe(1)
    expect(rollingSummary([], [act(iso(2026, 8, 28))], now).cardio).toBe(0)
    expect(rollingSummary([], [act(iso(2026, 9, 4, 23, 0))], now).cardio).toBe(1)
  })
})

describe('daysBetween', () => {
  const now = local(2026, 9, 4, 8, 0)
  it('counts calendar days, not elapsed hours', () => {
    // 22:00 last night to 08:00 this morning is ten hours and one day.
    expect(daysBetween(iso(2026, 9, 3, 22, 0), now)).toBe(1)
    expect(daysBetween(iso(2026, 9, 4, 1, 0), now)).toBe(0)
    expect(daysBetween(iso(2026, 9, 1), now)).toBe(3)
  })
})

describe('weekDays', () => {
  const shape = ['lift', 'cardio', 'lift', 'rest', 'lift', 'cardio', 'long']

  it('returns seven Monday-first days carrying plan and actual', () => {
    const now = local(2026, 9, 2, 12, 0)
    const days = weekDays([lift(iso(2026, 8, 31))], [act(iso(2026, 9, 1))], shape, now)

    expect(days).toHaveLength(7)
    expect(days[0].date.toDateString()).toBe('Mon Aug 31 2026')
    expect(days[0].planned).toBe('lift')
    expect(days[0].lifts).toBe(1)
    expect(days[1].cardio).toBe(1)
    expect(days[2].isToday).toBe(true)
    expect(days[3].isFuture).toBe(true)
    expect(days[1].isFuture).toBe(false)
  })

  // A day the shape asked for that did not happen is just empty. There is no missed flag to
  // set, which is the entire point — nothing can accumulate that later needs resolving.
  it('leaves a skipped day empty rather than marking it', () => {
    const now = local(2026, 9, 4, 12, 0)
    const days = weekDays([], [], shape, now)
    expect(days[1].planned).toBe('cardio')
    expect(days[1].lifts + days[1].cardio).toBe(0)
    expect(Object.keys(days[1])).not.toContain('missed')
  })

  it('falls back to rest for a short or absent shape', () => {
    const days = weekDays([], [], [], local(2026, 9, 4, 12, 0))
    expect(days.every((d) => d.planned === 'rest')).toBe(true)
  })
})

describe('startOfDay', () => {
  it('strips the time', () => {
    expect(startOfDay(local(2026, 9, 4, 23, 59)).getHours()).toBe(0)
  })
})

describe('groupByDay', () => {
  it('buckets by day, newest day first and newest item first within a day', () => {
    const days = groupByDay([
      { at: '2026-08-30T09:00:00.000Z', id: 'a' },
      { at: '2026-09-01T18:00:00.000Z', id: 'c' },
      { at: '2026-09-01T07:00:00.000Z', id: 'b' },
    ])
    expect(days.map((d) => d.items.map((i) => i.id))).toEqual([['c', 'b'], ['a']])
  })

  // The reason this is in the engine and pinned to Europe/London. 23:30 local on 31 August
  // is 22:30 UTC the same day, but a session at 23:30 BST on a date whose UTC instant rolls
  // past midnight would head up the following day's group if the key came from the ISO
  // string. Read locally it stays where the person who trained it thinks it belongs.
  it('keeps a late-evening British Summer Time session on its own local day', () => {
    const late = new Date(2026, 7, 31, 23, 30).toISOString()
    const days = groupByDay([{ at: late, id: 'late' }])
    expect(days[0].date.getDate()).toBe(31)
    expect(days[0].date.getMonth()).toBe(7)
  })

  it('drops an item with an unparseable timestamp rather than making a NaN bucket', () => {
    expect(groupByDay([{ at: 'nonsense', id: 'x' }])).toEqual([])
  })

  it('returns nothing for nothing', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('recentWeeks', () => {
  const now = local(2026, 9, 4, 12, 0) // Friday 4 Sep 2026; week starts Mon 31 Aug

  it('returns the requested number of local-Monday weeks, oldest first', () => {
    const weeks = recentWeeks([], [], now, 3)
    expect(weeks.map((w) => w.start.toDateString())).toEqual([
      'Mon Aug 17 2026',
      'Mon Aug 24 2026',
      'Mon Aug 31 2026',
    ])
  })

  it('counts lifts and activities into the week they belong to', () => {
    const weeks = recentWeeks(
      [lift(iso(2026, 9, 1)), lift(iso(2026, 8, 26))],
      [act(iso(2026, 8, 25))],
      now,
      3,
    )
    expect(weeks.map((w) => [w.lifts, w.cardio])).toEqual([[0, 0], [1, 1], [1, 0]])
  })

  // The window this feeds is "trained 5 of the last 6 weeks", so an empty week has to come
  // back as a real bucket of zeroes rather than being skipped — otherwise the denominator
  // silently shrinks to only the weeks that went well.
  it('returns empty weeks as zero buckets rather than omitting them', () => {
    const weeks = recentWeeks([lift(iso(2026, 9, 1))], [], now, 4)
    expect(weeks).toHaveLength(4)
    expect(weeks.filter((w) => w.lifts + w.cardio > 0)).toHaveLength(1)
  })

  it('includes the current week even though it is still running', () => {
    const weeks = recentWeeks([lift(iso(2026, 9, 4))], [], now, 2)
    expect(weeks[1].lifts).toBe(1)
  })
})
