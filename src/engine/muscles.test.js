import { describe, it, expect } from 'vitest'
import { muscleGroupsOf, plannedSetsPerWeek, loggedSetsPerWeek } from './muscles.js'
import { getExercise } from '../lib/exercises.js'
import { seedPlan } from '../lib/seed.js'

const row = (rows, group) => rows.find((r) => r.group === group)

describe('muscleGroupsOf', () => {
  it('files the squat and the leg press as quad work, though the dataset targets glutes', () => {
    expect(muscleGroupsOf(getExercise('0043')).direct).toBe('Quads')
    expect(muscleGroupsOf(getExercise('0739')).direct).toBe('Quads')
  })

  it('files the deadlift and the RDL as hinges', () => {
    expect(muscleGroupsOf(getExercise('0032')).direct).toBe('Hamstrings & glutes')
    expect(muscleGroupsOf(getExercise('0085')).direct).toBe('Hamstrings & glutes')
  })

  it('credits a press to triceps and shoulders indirectly, never to its own group twice', () => {
    const bench = muscleGroupsOf(getExercise('0025'))
    expect(bench.direct).toBe('Chest')
    expect(bench.indirect.sort()).toEqual(['Shoulders', 'Triceps'])
  })

  it('counts nothing for an exercise with no target', () => {
    expect(muscleGroupsOf({ id: 'c1', target: null, secondary: [] })).toBe(null)
    expect(muscleGroupsOf(null)).toBe(null)
  })
})

describe('plannedSetsPerWeek', () => {
  it('reads the seeded plan at three lifts a week as each day once', () => {
    const rows = plannedSetsPerWeek(seedPlan, {}, [], 3)
    // Squat and leg press, three sets each.
    expect(row(rows, 'Quads').direct).toBe(6)
    // RDL only.
    expect(row(rows, 'Hamstrings & glutes').direct).toBe(3)
    // Pushdown direct; bench, incline press and the overhead press indirect.
    expect(row(rows, 'Triceps')).toEqual({ group: 'Triceps', direct: 3, indirect: 9 })
  })

  it('scales to the number of lifts a week', () => {
    expect(row(plannedSetsPerWeek(seedPlan, {}, [], 2), 'Quads').direct).toBe(4)
  })

  it('counts a permanent swap as the exercise swapped to', () => {
    // Leg press swapped for the leg curl: one quad lift fewer, one hamstring lift more.
    const rows = plannedSetsPerWeek(seedPlan, { '0739': '0599' }, [], 3)
    expect(row(rows, 'Quads').direct).toBe(3)
    expect(row(rows, 'Hamstrings & glutes').direct).toBe(6)
  })
})

describe('loggedSetsPerWeek', () => {
  const log = (startedAt, finishedAt, entries) => ({ startedAt, finishedAt, entries })
  const sets = (...done) => done.map((d) => ({ reps: 10, weightKg: 50, done: d }))

  it('is null for a block with nothing in it', () => {
    expect(loggedSetsPerWeek([], [])).toBe(null)
  })

  it('counts completed sets only, under the exercise performed', () => {
    const rows = loggedSetsPerWeek(
      [log('2026-09-01T06:00:00Z', '2026-09-01T06:40:00Z', [{ exerciseId: '0043', sets: sets(true, true, false) }])],
      [],
    )
    expect(row(rows, 'Quads').direct).toBe(2)
  })

  it('divides by the weeks the block spanned, and never by less than one', () => {
    const squat = [{ exerciseId: '0043', sets: sets(true, true, true) }]
    const fourWeeks = loggedSetsPerWeek(
      [log('2026-09-01T06:00:00Z', '2026-09-01T06:40:00Z', squat), log('2026-09-29T06:00:00Z', '2026-09-29T06:00:00Z', squat)],
      [],
    )
    expect(row(fourWeeks, 'Quads').direct).toBe(1.5)
    const oneDay = loggedSetsPerWeek([log('2026-09-01T06:00:00Z', '2026-09-01T06:40:00Z', squat)], [])
    expect(row(oneDay, 'Quads').direct).toBe(3)
  })
})
