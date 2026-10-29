import { describe, it, expect } from 'vitest'
import { muscleGroupsOf, plannedSetsPerWeek, coverageDone, coveragePlanned, coverageLevel, coverageDue, coverageRates, coverageLevels } from './muscles.js'
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

describe('coverage', () => {
  const slot = (exerciseId) => ({ exerciseId, sets: 3, repsMin: 8, repsMax: 10, restSec: 90, incrementKg: null })
  const plan = {
    sessionCount: 12,
    rotation: [
      { name: 'Squat-led', exercises: [slot('0043')] },
      { name: 'Press-led', exercises: [slot('0739'), slot('1391')] },
      { name: 'Hinge-led', exercises: [slot('0032')] },
    ],
  }
  const sets = (...done) => done.map((d) => ({ reps: 10, weightKg: 50, done: d }))
  const log = (entries) => ({ entries })

  it('plans a whole block of sets per group, under the exercise a permanent swap names', () => {
    const planned = coveragePlanned(plan, { '1391': '2335' }, [])
    expect(planned.Quads.sets).toBe(24)
    expect(planned['Hamstrings & glutes'].sets).toBe(12)
    expect(planned.Calves.sets).toBe(12)
    expect(planned.Calves.exercises.get('2335')).toEqual({ exerciseId: '2335', days: ['Press-led'], sessions: 4 })
    expect(planned.Calves.exercises.has('1391')).toBe(false)
    expect(planned.Core.sets).toBe(0)
  })

  it('counts completed sets and the sessions each exercise was done in', () => {
    const done = coverageDone(
      [log([{ exerciseId: '0043', sets: sets(true, true, false) }]), log([{ exerciseId: '0043', sets: sets(true, true, true) }])],
      [],
    )
    expect(done.Quads.sets).toBe(5)
    expect(done.Quads.exercises.get('0043').sessions).toBe(2)
  })

  it('leaves out an entry with nothing ticked', () => {
    const done = coverageDone([log([{ exerciseId: '0739', sets: sets(false, false, false) }])], [])
    expect(done.Quads.sets).toBe(0)
    expect(done.Quads.exercises.has('0739')).toBe(false)
  })

  it('skips a custom exercise with no target and an id the dataset no longer has', () => {
    const customEx = [{ id: 'c1', name: 'Mystery', target: null, secondary: [] }]
    const done = coverageDone(
      [log([{ exerciseId: 'c1', sets: sets(true) }, { exerciseId: '9999', sets: sets(true) }])],
      customEx,
    )
    expect(Object.values(done).every((g) => g.sets === 0)).toBe(true)
  })

  it('states planned-by-now as one whole number, so the label, the bar and the shade agree', () => {
    // A 4-set slot, one session of twelve in: 1.33 would read "1 of 1" over a 75% bar.
    expect(coverageDue(16, 1, 12)).toBe(1)
    expect(coverageDue(24, 7, 12)).toBe(14)
    expect(coverageDue(24, 0, 12)).toBe(0)
  })

  it('never puts planned-by-now past the block, once its sessions are all done', () => {
    expect(coverageDue(24, 12, 12)).toBe(24)
    expect(coverageDue(24, 13, 12)).toBe(24)
  })

  it('states sets per week over the span the logs cover, to one decimal', () => {
    const squat = { exerciseId: '0043', sets: sets(true, true, true) }
    const logs = [
      { startedAt: '2026-09-01T06:00:00Z', finishedAt: '2026-09-01T06:40:00Z', entries: [squat] },
      { startedAt: '2026-09-29T06:00:00Z', finishedAt: '2026-09-29T06:00:00Z', entries: [squat] },
    ]
    const rates = coverageRates(coverageDone(logs, []), logs)
    expect(rates.Quads).toBe(1.5)
    expect(rates.Chest).toBe(0)
  })

  it('never divides by less than a week, so one session is not read as a rate', () => {
    const logs = [{ startedAt: '2026-09-01T06:00:00Z', finishedAt: '2026-09-01T06:40:00Z', entries: [{ exerciseId: '0043', sets: sets(true, true, true) }] }]
    expect(coverageRates(coverageDone(logs, []), logs).Quads).toBe(3)
  })

  it('reads zero everywhere for a window with nothing logged', () => {
    expect(Object.values(coverageRates(coverageDone([], []), [])).every((r) => r === 0)).toBe(true)
  })

  it('shades an earlier block or all time from sets per week, never from raw totals', () => {
    // Totals that would shade the other way round, to prove they are not what is read.
    const done = { ...coverageDone([], []), Quads: { sets: 100, exercises: new Map() }, Back: { sets: 1, exercises: new Map() } }
    const rates = { Quads: 4.2, 'Hamstrings & glutes': 3.3, Chest: 4.2, Back: 6.3, Shoulders: 5.6, Triceps: 5.1, Biceps: 2.8, Calves: 2.1, Core: 0 }
    const levels = coverageLevels({ done, rates })
    expect(levels.Back).toBe(4)
    expect(levels.Quads).toBe(3)
    expect(levels.Calves).toBe(2)
    expect(levels.Core).toBe(0)
  })

  it('shades the current block from sets done against planned-by-now', () => {
    const done = { ...coverageDone([], []), Quads: { sets: 9, exercises: new Map() } }
    const due = Object.fromEntries(Object.keys(done).map((g) => [g, g === 'Quads' ? 14 : 0]))
    expect(coverageLevels({ done, due }).Quads).toBe(2)
  })

  it('shades the current block by how close each group is to the plan so far', () => {
    expect(coverageLevel({ done: 9, due: 14 })).toBe(2)
    expect(coverageLevel({ done: 11, due: 14 })).toBe(3)
    expect(coverageLevel({ done: 14, due: 14 })).toBe(4)
    expect(coverageLevel({ done: 20, due: 14 })).toBe(4)
    expect(coverageLevel({ done: 0, due: 14 })).toBe(0)
  })

  it('shades nothing at the start of a block, when nothing is due yet', () => {
    expect(coverageLevel({ done: 0, due: 0 })).toBe(0)
  })

  it('shades a group trained off plan in full, since anything is over a plan of nothing', () => {
    expect(coverageLevel({ done: 3, due: 0 })).toBe(4)
  })

  it('shades an earlier block relative to its most-trained group', () => {
    expect(coverageLevel({ done: 3, due: null, max: 15 })).toBe(1)
    expect(coverageLevel({ done: 15, due: null, max: 15 })).toBe(4)
    expect(coverageLevel({ done: 0, due: null, max: 0 })).toBe(0)
  })
})
