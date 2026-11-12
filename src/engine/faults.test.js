import { describe, it, expect } from 'vitest'
import { targetFor, isMissedSession, ownWeightStart } from './progression.js'
import { exerciseHistory, stalledAt } from './session.js'

const set = (reps, weightKg, done = true) => ({ reps, weightKg, done })

function workout(exerciseId, sets, idx = 0) {
  const day = String(idx + 1).padStart(2, '0')
  return {
    id: `w${idx}`,
    startedAt: `2026-01-${day}T06:00:00.000Z`,
    finishedAt: `2026-01-${day}T07:00:00.000Z`,
    blockIndex: 0,
    sessionIndex: idx,
    templateName: 'Test',
    entries: [{ exerciseId, swappedFrom: null, sets }],
  }
}

const ID = '0001'

describe('a missed session is not hidden by lighter sets', () => {
  const rules = { repsMin: 8, repsMax: 12, prescribed: 3, increment: 2.5 }
  const s1 = workout(ID, [set(8, 60), set(8, 60), set(8, 60)], 0)
  const s2 = workout(ID, [set(12, 50), set(12, 50), set(5, 60)], 1)
  const s3 = workout(ID, [set(12, 50), set(12, 50), set(5, 60)], 2)

  it('deloads after two sessions where the only working-weight set was below the range', () => {
    const t = targetFor(ID, rules, [s1, s2, s3])
    expect(t.kind).toBe('deload')
    expect(t.weightKg).toBeLessThan(60)
  })

  it('treats a session whose only working-weight set missed the range as missed', () => {
    expect(isMissedSession(s2.entries[0], 8, 12, 3)).toBe(true)
  })
})

describe('stalledAt is quiet about a lift that is going up', () => {
  it('is quiet when the most recent session rose after a deliberate step-down', () => {
    expect(stalledAt([90, 90, 75, 80].map((w) => ({ topWeight: w })))).toBe(null)
  })

  it('still flags an advance that deloaded straight back', () => {
    expect(stalledAt([80, 85, 80, 80].map((w) => ({ topWeight: w })))).toBe(80)
  })

  it('is quiet when reps at the same weight rose', () => {
    const rows = [
      [12, 12, 10],
      [13, 12, 11],
      [15, 13, 12],
      [15, 15, 13],
    ]
    const workouts = rows.map((r, i) => workout(ID, r.map((n) => set(n, 20)), i))
    expect(stalledAt(exerciseHistory(workouts, ID))).toBe(null)
  })
})

describe('the hold sentence when sets were done lighter', () => {
  it('lists only the reps done at the working weight', () => {
    const rules = { repsMin: 8, repsMax: 12, prescribed: 3, increment: 2.5 }
    const w = [
      workout(ID, [set(8, 60), set(8, 60), set(8, 60)], 0),
      workout(ID, [set(12, 50), set(12, 50), set(5, 60)], 1),
    ]
    expect(targetFor(ID, rules, w).reason).toBe('1 of 3 sets at 60 kg — 5 reps there')
  })
})

describe('ownWeightStart', () => {
  const rules = { repsMin: 8, repsMax: 12, prescribed: 3, increment: 2.5 }
  const flat = (kg, i) => workout(ID, [set(9, kg), set(9, kg), set(9, kg)], i)

  it('is 0 when every weight was the scheme\'s own', () => {
    expect(ownWeightStart(ID, rules, [flat(60, 0), flat(60, 1), flat(60, 2)])).toBe(0)
  })

  it('points at the latest session at a weight the user chose', () => {
    expect(ownWeightStart(ID, rules, [flat(60, 0), flat(60, 1), flat(50, 2), flat(50, 3)])).toBe(2)
  })
})

describe('the advance tolerance on a narrow rep window', () => {
  it('holds 100x6,5,4 on a 4-6 window', () => {
    const rules = { repsMin: 4, repsMax: 6, prescribed: 3, increment: 2.5 }
    const t = targetFor(ID, rules, [workout(ID, [set(6, 100), set(5, 100), set(4, 100)])])
    expect(t.kind).toBe('hold')
  })

  it('holds 30x8,8,6 on a 6-8 window', () => {
    const rules = { repsMin: 6, repsMax: 8, prescribed: 3, increment: 2.5 }
    const t = targetFor(ID, rules, [workout(ID, [set(8, 30), set(8, 30), set(6, 30)])])
    expect(t.kind).toBe('hold')
  })
})
