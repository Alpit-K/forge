import { describe, it, expect } from 'vitest'
import { fmtPace, fmtDistance, fmtDayHeading, fmtRest, fmtSpeed, fmtRate, fmtCount, fmtBlockChange } from './format.js'

// Narrow on purpose. The only thing here that can be silently wrong every single run is the
// seconds carry — 5:60 is not a pace, and nobody would report it as a bug, they would just
// stop trusting the number.
describe('fmtPace', () => {
  it('formats a plain pace', () => {
    expect(fmtPace(5, 30)).toBe('6:00 /km')
    expect(fmtPace(5.2, 32)).toBe('6:09 /km')
  })

  it('pads single-digit seconds', () => {
    expect(fmtPace(6, 30)).toBe('5:00 /km')
    expect(fmtPace(10, 50.5)).toBe('5:03 /km')
  })

  it('carries into the next minute instead of rendering :60', () => {
    // 5:59.6 /km — rounds up through the boundary.
    const paced = fmtPace(10, 59.933)
    expect(paced).toBe('6:00 /km')
    expect(paced).not.toContain(':60')
  })

  it('returns null when either half is missing, so callers can drop it', () => {
    expect(fmtPace(null, 30)).toBeNull()
    expect(fmtPace(5, null)).toBeNull()
    expect(fmtPace(undefined, undefined)).toBeNull()
    expect(fmtPace(0, 30)).toBeNull()
  })
})

describe('fmtDistance', () => {
  it('always shows one decimal', () => {
    expect(fmtDistance(5)).toBe('5.0 km')
    expect(fmtDistance(5.24)).toBe('5.2 km')
    expect(fmtDistance(0.8)).toBe('0.8 km')
  })
})

describe('fmtDayHeading', () => {
  const now = new Date(2026, 8, 4)

  it('names today and yesterday rather than dating them', () => {
    expect(fmtDayHeading(new Date(2026, 8, 4, 21, 0), now)).toBe('Today')
    expect(fmtDayHeading(new Date(2026, 8, 3, 6, 0), now)).toBe('Yesterday')
  })

  it('leads with the weekday for anything older', () => {
    expect(fmtDayHeading(new Date(2026, 7, 30), now)).toBe('Sun 30 Aug')
  })

  // Compared by local calendar day, not by elapsed hours: 23:00 last night is Yesterday even
  // though it is under 24 hours ago, and 01:00 this morning is Today even though it is not.
  it('compares by calendar day, not by elapsed time', () => {
    expect(fmtDayHeading(new Date(2026, 8, 4, 1, 0), new Date(2026, 8, 4, 23, 0))).toBe('Today')
    expect(fmtDayHeading(new Date(2026, 8, 3, 23, 0), new Date(2026, 8, 4, 1, 0))).toBe('Yesterday')
  })
})

// Pinned because two screens read it now — the rest timer's ring and the Plan editor's
// subtitle. The padStart is the same trap as the pace: 2:5 is not a time.
describe('fmtRest', () => {
  it('pads the seconds', () => {
    expect(fmtRest(150)).toBe('2:30')
    expect(fmtRest(125)).toBe('2:05')
  })

  it('keeps the minute on a whole one, and stays a clock under a minute', () => {
    expect(fmtRest(120)).toBe('2:00')
    expect(fmtRest(45)).toBe('0:45')
    expect(fmtRest(0)).toBe('0:00')
  })
})

// A ride reads in km/h and every other sport in min/km. fmtRate is the one place that decides
// which, so a row and the live preview in the sheet cannot disagree.
describe('fmtRate', () => {
  it('gives a ride its speed in km/h', () => {
    expect(fmtRate('cycle', 13.1, 30)).toBe('26.2 km/h')
  })

  it('keeps every other sport on pace', () => {
    expect(fmtRate('run', 5, 30)).toBe('6:00 /km')
    expect(fmtRate('walk', 5, 60)).toBe('12:00 /km')
  })

  it('returns null when either half is missing, so callers can drop it', () => {
    expect(fmtRate('cycle', null, 30)).toBeNull()
  })
})

describe('fmtSpeed', () => {
  it('shows one decimal, and null for nothing', () => {
    expect(fmtSpeed(26.2)).toBe('26.2 km/h')
    expect(fmtSpeed(null)).toBeNull()
    expect(fmtSpeed(0)).toBeNull()
  })
})

describe('fmtCount', () => {
  it('pluralises', () => {
    expect(fmtCount(1, 'ride')).toBe('1 ride')
    expect(fmtCount(4, 'ride')).toBe('4 rides')
  })
})

// Both the block marker in History and the block-complete screen print this; the direction
// drives the same up/down class in each.
describe('fmtBlockChange', () => {
  it('states the reps when the weight held', () => {
    expect(fmtBlockChange({ first: 60, last: 60, firstReps: 8, lastReps: 10 })).toEqual({
      text: '60 kg: 8s → 10s',
      direction: 'up',
    })
    expect(fmtBlockChange({ first: 60, last: 60, firstReps: 10, lastReps: 8 }).direction).toBe('down')
    expect(fmtBlockChange({ first: 60, last: 60, firstReps: 8, lastReps: 8 }).direction).toBeNull()
  })

  it('states the weight when it moved', () => {
    expect(fmtBlockChange({ first: 60, last: 62.5, firstReps: 12, lastReps: 8 })).toEqual({
      text: '60 → 62.5 kg',
      direction: 'up',
    })
    expect(fmtBlockChange({ first: 60, last: 55, firstReps: 6, lastReps: 12 }).direction).toBe('down')
  })
})
