import { describe, it, expect } from 'vitest'
import { runHistory, runStats, rideHistory, rideStats } from './activity.js'
import { fmtPaceSec } from '../lib/format.js'

const run = (at, distanceKm, minutes, extra = {}) => ({
  id: at,
  type: 'run',
  at,
  minutes,
  distanceKm,
  intensity: 'easy',
  ...extra,
})

describe('runHistory', () => {
  it('drops a run with no distance rather than counting it as zero', () => {
    const history = runHistory([
      run('2026-08-01T09:00:00.000Z', 5, 30),
      { id: 'x', type: 'run', at: '2026-08-03T09:00:00.000Z', minutes: 35, distanceKm: null },
    ])
    expect(history).toHaveLength(1)
    expect(history[0].distanceKm).toBe(5)
  })

  it('keeps a run with a distance but no duration, with a null pace', () => {
    const [only] = runHistory([run('2026-08-01T09:00:00.000Z', 5, null)])
    expect(only.distanceKm).toBe(5)
    expect(only.paceSecPerKm).toBeNull()
  })

  it('keeps a walk-break count of zero, which is a continuous run, apart from none recorded', () => {
    const [none, continuous, three] = runHistory([
      run('2026-08-01T09:00:00.000Z', 5, 30),
      { ...run('2026-08-02T09:00:00.000Z', 5, 30), walkBreaks: 0 },
      { ...run('2026-08-03T09:00:00.000Z', 5, 30), walkBreaks: 3 },
    ])
    expect(none.walkBreaks).toBeNull()
    expect(continuous.walkBreaks).toBe(0)
    expect(three.walkBreaks).toBe(3)
  })

  it('ignores activities that are not runs', () => {
    expect(runHistory([{ id: 'c', type: 'cycle', at: '2026-08-01T09:00:00.000Z', minutes: 40, distanceKm: 20 }]))
      .toHaveLength(0)
  })

  it('sorts oldest first, because a run can be back-dated after a later one', () => {
    const history = runHistory([
      run('2026-08-10T09:00:00.000Z', 8, 48),
      run('2026-08-02T09:00:00.000Z', 5, 30),
    ])
    expect(history.map((r) => r.distanceKm)).toEqual([5, 8])
  })
})

describe('runStats', () => {
  it('is null with nothing to report', () => {
    expect(runStats([])).toBeNull()
  })

  it('keeps the earliest date when the longest distance is matched again', () => {
    const stats = runStats(
      runHistory([
        run('2026-08-02T09:00:00.000Z', 8, 48),
        run('2026-08-16T09:00:00.000Z', 8, 46),
        run('2026-08-09T09:00:00.000Z', 5, 30),
      ]),
    )
    expect(stats.longest.distanceKm).toBe(8)
    expect(stats.longest.at).toBe('2026-08-02T09:00:00.000Z')
  })

  it('reports a null pace change from a single run, never zero', () => {
    const stats = runStats(runHistory([run('2026-08-02T09:00:00.000Z', 5, 30)]))
    expect(stats.paceChange).toBeNull()
  })

  it('reports a negative pace change when the runs got faster', () => {
    const stats = runStats(
      runHistory([
        run('2026-08-02T09:00:00.000Z', 5, 30),
        run('2026-08-09T09:00:00.000Z', 5, 29),
      ]),
    )
    expect(stats.paceChange).toBe(-12)
  })

  it('ignores runs with no pace when comparing, and still counts their distance', () => {
    const stats = runStats(
      runHistory([
        run('2026-08-02T09:00:00.000Z', 5, 30),
        run('2026-08-05T09:00:00.000Z', 4, null),
        run('2026-08-09T09:00:00.000Z', 5, 29),
      ]),
    )
    expect(stats.runs).toBe(3)
    expect(stats.totalKm).toBe(14)
    expect(stats.paceChange).toBe(-12)
  })
})

describe('average heart rate', () => {
  it('carries the heart rate through, and null when the run has none', () => {
    const history = runHistory([
      run('2026-08-02T09:00:00.000Z', 5, 30, { avgHr: 158 }),
      run('2026-08-09T09:00:00.000Z', 5, 30),
    ])
    expect(history.map((r) => r.avgHr)).toEqual([158, null])
  })

  it('drops a run with no heart rate from the comparison, never counting it as zero', () => {
    const stats = runStats(
      runHistory([
        run('2026-08-02T09:00:00.000Z', 5, 30, { avgHr: 162 }),
        run('2026-08-05T09:00:00.000Z', 5, 30),
        run('2026-08-09T09:00:00.000Z', 5, 30, { avgHr: 154 }),
      ]),
    )
    expect(stats.runs).toBe(3)
    expect(stats.latestHr).toBe(154)
    expect(stats.hrChange).toBe(-8)
  })

  it('reports a null heart-rate change from a single reading, never zero', () => {
    const stats = runStats(runHistory([run('2026-08-02T09:00:00.000Z', 5, 30, { avgHr: 158 })]))
    expect(stats.latestHr).toBe(158)
    expect(stats.hrChange).toBeNull()
  })

  it('reports nulls when no run carries a heart rate at all', () => {
    const stats = runStats(runHistory([run('2026-08-02T09:00:00.000Z', 5, 30)]))
    expect(stats.latestHr).toBeNull()
    expect(stats.hrChange).toBeNull()
    expect(stats.firstHrAt).toBeNull()
  })

  it('dates the change from the first run carrying a heart rate, not the first run', () => {
    const stats = runStats(
      runHistory([
        run('2026-08-02T09:00:00.000Z', 5, 30),
        run('2026-08-09T09:00:00.000Z', 5, 30, { avgHr: 160 }),
        run('2026-08-16T09:00:00.000Z', 5, 30, { avgHr: 151 }),
      ]),
    )
    expect(stats.firstHrAt).toBe('2026-08-09T09:00:00.000Z')
    expect(stats.hrChange).toBe(-9)
  })
})

describe('pace rounding', () => {
  // 5.1 km in 30 minutes is 352.94 s/km — 5:52.94, which must carry to 5:53 and never 5:52.
  it('carries seconds rather than truncating', () => {
    const [only] = runHistory([run('2026-08-02T09:00:00.000Z', 5.1, 30)])
    expect(fmtPaceSec(only.paceSecPerKm)).toBe('5:53 /km')
  })

  it('never renders sixty seconds', () => {
    expect(fmtPaceSec(359.6)).toBe('6:00 /km')
  })
})

const ride = (at, distanceKm, minutes, extra = {}) => ({
  id: at,
  type: 'cycle',
  at,
  minutes,
  distanceKm,
  intensity: 'easy',
  ...extra,
})

// Four rides, as logged.
const REAL_RIDES = [
  ride('2026-10-06T06:04:23.714Z', 12, 29, { avgHr: 117 }),
  ride('2026-10-10T14:08:14.048Z', 15, 35, { avgHr: 131 }),
  ride('2026-10-14T16:10:45.585Z', 13.1, 30, { avgHr: 130 }),
  ride('2026-10-26T17:57:07.948Z', 26.15, 60, { avgHr: 127 }),
]

describe('rideHistory', () => {
  it('keeps rides only, and drops one with no distance rather than counting it as zero', () => {
    const history = rideHistory([
      ride('2026-10-06T06:00:00.000Z', 12, 29),
      run('2026-10-07T06:00:00.000Z', 5, 30),
      ride('2026-10-08T06:00:00.000Z', null, 40),
    ])
    expect(history).toHaveLength(1)
    expect(history[0].distanceKm).toBe(12)
  })

  it('gives speed in km/h, and null when no duration was logged', () => {
    const [timed, untimed] = rideHistory([
      ride('2026-10-06T06:00:00.000Z', 12, 29),
      ride('2026-10-08T06:00:00.000Z', 12, null),
    ])
    expect(timed.speedKmh).toBeCloseTo(24.83, 2)
    expect(untimed.speedKmh).toBeNull()
  })

  it('sorts oldest first, because a ride can be back-dated after a later one', () => {
    const history = rideHistory([
      ride('2026-10-14T06:00:00.000Z', 13.1, 30),
      ride('2026-10-06T06:00:00.000Z', 12, 29),
    ])
    expect(history.map((r) => r.distanceKm)).toEqual([12, 13.1])
  })
})

describe('rideStats', () => {
  it('is null with nothing to report', () => {
    expect(rideStats([])).toBeNull()
  })

  it('reports the real rides', () => {
    const stats = rideStats(rideHistory(REAL_RIDES))
    expect(stats.rides).toBe(4)
    expect(stats.totalKm).toBe(66.3)
    expect(stats.longest.distanceKm).toBe(26.15)
    expect(stats.speedChange).toBe(1.3)
    expect(stats.firstSpeedAt).toBe('2026-10-06T06:04:23.714Z')
    expect(stats.hrChange).toBe(10)
  })

  it('is null rather than zero on a single ride, with nothing to compare against', () => {
    const stats = rideStats(rideHistory([REAL_RIDES[0]]))
    expect(stats.latestSpeed).toBeCloseTo(24.83, 2)
    expect(stats.speedChange).toBeNull()
    expect(stats.hrChange).toBeNull()
  })

  it('keeps the earliest ride when the longest is matched', () => {
    const stats = rideStats(
      rideHistory([ride('2026-10-06T06:00:00.000Z', 20, 50), ride('2026-10-20T06:00:00.000Z', 20, 45)]),
    )
    expect(stats.longest.at).toBe('2026-10-06T06:00:00.000Z')
  })
})
