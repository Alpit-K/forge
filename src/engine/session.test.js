import { describe, it, expect } from 'vitest'
import {
  exerciseHistory,
  exerciseStats,
  stalledAt,
  slotResult,
  buildWorkoutLog,
  finishWorkout,
  continueBlock,
  totalVolume,
  setsCompleted,
  durationSeconds,
  isBlockComplete,
  sessionsDone,
  lastDoneByRotation,
  nextUnfinished,
  byFinish,
  blockWindow,
  blockWeightChanges,
} from './session.js'
import { createInitialState } from '../lib/seed.js'

function active(overrides = {}) {
  return {
    id: 'active-1',
    startedAt: '2026-08-27T06:00:00.000Z',
    blockIndex: 0,
    sessionIndex: 0,
    rotationIndex: 1,
    templateName: 'Squat-led',
    currentIndex: 0,
    restStartedAt: null,
    restDuration: null,
    exercises: [
      {
        exerciseId: '0043',
        swappedFrom: null,
        repsMin: 8,
        repsMax: 12,
        sets: 3,
        restSec: 150,
        increment: 2.5,
        kind: 'first',
        reason: 'x',
        performed: [
          { reps: 8, weightKg: 60, done: true },
          { reps: 8, weightKg: 60, done: true },
          { reps: 12, weightKg: 60, done: true },
        ],
      },
    ],
    ...overrides,
  }
}

describe('buildWorkoutLog / finishWorkout', () => {
  it('writes a log, advances progress, clears active', () => {
    const state = { ...createInitialState(), active: active() }
    const finishedAt = '2026-08-27T06:45:00.000Z'
    const next = finishWorkout(state, finishedAt)

    expect(next.active).toBeNull()
    expect(next.workouts).toHaveLength(1)
    expect(next.workouts[0].finishedAt).toBe(finishedAt)
    expect(next.workouts[0].entries[0].exerciseId).toBe('0043')
    expect(next.progress.sessionIndex).toBe(1)
    expect(next.progress.blockIndex).toBe(0)
  })

  it('computes summary numbers from completed sets only', () => {
    const log = buildWorkoutLog(active(), '2026-08-27T06:45:00.000Z')
    // 8*60 + 8*60 + 12*60 = 1680
    expect(totalVolume(log.entries)).toBe(1680)
    expect(setsCompleted(log.entries)).toBe(3)
    expect(durationSeconds('2026-08-27T06:00:00.000Z', '2026-08-27T06:45:00.000Z')).toBe(2700)
  })

  it('ignores unticked sets in the volume', () => {
    const a = active()
    a.exercises[0].performed[2].done = false
    const log = buildWorkoutLog(a, '2026-08-27T06:45:00.000Z')
    expect(totalVolume(log.entries)).toBe(960)
    expect(setsCompleted(log.entries)).toBe(2)
  })
})

describe('block completion', () => {
  it('continuing a block increments blockIndex and resets sessionIndex', () => {
    const next = continueBlock({ blockIndex: 0, sessionIndex: 23 })
    expect(next).toEqual({ blockIndex: 1, sessionIndex: 0 })
  })

  it('leaves workouts and swaps untouched', () => {
    const state = {
      ...createInitialState(),
      progress: { blockIndex: 0, sessionIndex: 23 },
      workouts: [{ id: 'w1' }],
      swaps: { '0043': '0314' },
    }
    const next = { ...state, progress: continueBlock(state.progress) }
    expect(next.workouts).toBe(state.workouts)
    expect(next.swaps).toBe(state.swaps)
    expect(next.plan).toBe(state.plan)
  })

  it('reports block completion only at the final session', () => {
    expect(isBlockComplete(23, 24)).toBe(false)
    expect(isBlockComplete(24, 24)).toBe(true)
  })

  // The bug this replaced a stored counter for: deleteWorkout drops the log and leaves
  // progress.sessionIndex alone, so the counter ran ahead for good and the block ended a
  // session early. Counted from history there is nothing to drift.
  it('counts only the current block, and a deleted session stops counting', () => {
    const workouts = [
      { id: 'a', blockIndex: 0 },
      { id: 'b', blockIndex: 0 },
      { id: 'c', blockIndex: 1 },
    ]
    expect(sessionsDone(workouts, 0)).toBe(2)
    expect(sessionsDone(workouts, 1)).toBe(1)
    expect(sessionsDone(workouts.filter((w) => w.id !== 'b'), 0)).toBe(1)
  })

  it('counts a freeform workout toward the block', () => {
    expect(sessionsDone([{ blockIndex: 0, freeform: true, rotationIndex: null }], 0)).toBe(1)
  })
})

describe('lastDoneByRotation', () => {
  it('carries the chosen rotation slot into the log', () => {
    const log = buildWorkoutLog(active(), '2026-08-27T06:45:00.000Z')
    expect(log.rotationIndex).toBe(1)
  })

  it('reads the slot from sessionIndex on logs written before it was choosable', () => {
    const workouts = [
      { sessionIndex: 0, finishedAt: '2026-08-01T10:00:00.000Z' },
      { sessionIndex: 1, finishedAt: '2026-08-03T10:00:00.000Z' },
      { sessionIndex: 3, finishedAt: '2026-08-08T10:00:00.000Z' },
    ]
    expect(lastDoneByRotation(workouts, 3)).toEqual([
      '2026-08-08T10:00:00.000Z',
      '2026-08-03T10:00:00.000Z',
      null,
    ])
  })

  it('prefers a stored rotationIndex and keeps the latest finish per slot', () => {
    const workouts = [
      { sessionIndex: 0, rotationIndex: 2, finishedAt: '2026-08-10T10:00:00.000Z' },
      { sessionIndex: 1, rotationIndex: 2, finishedAt: '2026-08-05T10:00:00.000Z' },
    ]
    expect(lastDoneByRotation(workouts, 3)).toEqual([null, null, '2026-08-10T10:00:00.000Z'])
  })

  // A custom workout has no rotation slot, so it is "last done" for none of them — but it
  // must be told apart from a pre-picker log, which is also missing rotationIndex and whose
  // slot is still recoverable from sessionIndex % rotationCount.
  it('skips a freeform workout and keeps the pre-picker fallback', () => {
    const workouts = [
      { sessionIndex: 0, finishedAt: '2026-08-01T10:00:00.000Z' },
      { sessionIndex: 1, finishedAt: '2026-08-03T10:00:00.000Z' },
      { sessionIndex: 2, rotationIndex: null, freeform: true, finishedAt: '2026-08-05T10:00:00.000Z' },
    ]
    expect(lastDoneByRotation(workouts, 3)).toEqual([
      '2026-08-01T10:00:00.000Z',
      '2026-08-03T10:00:00.000Z',
      null,
    ])
  })
})

describe('slotResult', () => {
  const set = (weightKg, reps, done = true) => ({ weightKg, reps, done })

  it('reads the slot back under its own id', () => {
    const log = { entries: [{ exerciseId: '0043', swappedFrom: null, sets: [set(80, 8), set(85, 6)] }] }
    expect(slotResult(log, '0043', '0043')).toEqual({ weightKg: 85, swapped: false })
  })

  it('reads a permanently swapped slot under its effective id', () => {
    const log = { entries: [{ exerciseId: '0861', swappedFrom: null, sets: [set(60, 10)] }] }
    expect(slotResult(log, '0043', '0861')).toEqual({ weightKg: 60, swapped: false })
  })

  // The whole reason this is a function: a mid-session swap files the entry under the NEW
  // exercise, so looking only by the slot's own id finds nothing and the slot reads as
  // untrained. The caller needs to know it was a swap, not just that a weight exists.
  it('finds a mid-session swap through swappedFrom and reports it', () => {
    const log = { entries: [{ exerciseId: '0739', swappedFrom: '0043', sets: [set(40, 12)] }] }
    expect(slotResult(log, '0043', '0043')).toEqual({ weightKg: 40, swapped: true })
  })

  it('takes the heaviest completed set, not the last', () => {
    const log = { entries: [{ exerciseId: '0043', sets: [set(80, 8), set(90, 5), set(60, 12)] }] }
    expect(slotResult(log, '0043', '0043').weightKg).toBe(90)
  })

  it('reports a null weight for a slot logged with nothing ticked', () => {
    const log = { entries: [{ exerciseId: '0043', sets: [set(80, 8, false)] }] }
    expect(slotResult(log, '0043', '0043')).toEqual({ weightKg: null, swapped: false })
  })

  it('returns null for a slot the log has no entry for', () => {
    expect(slotResult({ entries: [] }, '0043', '0043')).toBe(null)
  })
})

describe('exerciseHistory and exerciseStats', () => {
  const set = (weightKg, reps, done = true) => ({ weightKg, reps, done })
  const session = (at, sets, exerciseId = '0043') => ({
    finishedAt: at,
    templateName: 'Squat-led',
    entries: [{ exerciseId, sets }],
  })

  const workouts = [
    session('2026-07-01T10:00:00.000Z', [set(70, 12), set(70, 10)]),
    session('2026-07-08T10:00:00.000Z', [set(75, 10), set(80, 8)]),
    session('2026-07-15T10:00:00.000Z', [set(80, 12), set(80, 11)]),
  ]

  it('returns one record per session that logged the exercise, oldest first', () => {
    const h = exerciseHistory(workouts, '0043')
    expect(h.map((r) => r.at)).toEqual([
      '2026-07-01T10:00:00.000Z',
      '2026-07-08T10:00:00.000Z',
      '2026-07-15T10:00:00.000Z',
    ])
  })

  it('ignores sessions that never touched the exercise', () => {
    expect(exerciseHistory(workouts, '9999')).toEqual([])
  })

  // An entry with nothing ticked is a plan, not a performance. On a trend line it draws a
  // hole; in the stats it would report a null top weight as if it were a session.
  it('drops a session where the exercise was present but nothing was completed', () => {
    const skipped = [...workouts, session('2026-07-22T10:00:00.000Z', [set(85, 8, false)])]
    expect(exerciseHistory(skipped, '0043')).toHaveLength(3)
  })

  it('takes the heaviest completed set as the session weight, not the last', () => {
    expect(exerciseHistory(workouts, '0043')[1].topWeight).toBe(80)
  })

  it('reports sessions, first, latest and the change across them', () => {
    const s = exerciseStats(exerciseHistory(workouts, '0043'))
    expect(s.sessions).toBe(3)
    expect(s.first).toBe(70)
    expect(s.latest).toBe(80)
    expect(s.change).toBe(10)
  })

  it('finds the heaviest completed set ever, with its reps and date', () => {
    const s = exerciseStats(exerciseHistory(workouts, '0043'))
    expect(s.best).toEqual({ weightKg: 80, reps: 8, at: '2026-07-08T10:00:00.000Z' })
  })

  // The earliest date you reached a weight is the answer to "when did I first do this";
  // re-hitting it later must not quietly move the record forward.
  it('keeps the earliest date when a best weight is matched again', () => {
    const s = exerciseStats(exerciseHistory([...workouts, session('2026-07-29T10:00:00.000Z', [set(80, 8)])], '0043'))
    expect(s.best.at).toBe('2026-07-08T10:00:00.000Z')
  })

  it('reports a null change from a single session rather than zero', () => {
    const s = exerciseStats(exerciseHistory([workouts[0]], '0043'))
    expect(s.sessions).toBe(1)
    expect(s.change).toBe(null)
  })

  it('returns null stats for an exercise with no history', () => {
    expect(exerciseStats([])).toBe(null)
  })
})

describe('stalledAt', () => {
  const h = (...weights) => weights.map((w) => ({ topWeight: w }))

  it('needs four sessions before it says anything', () => {
    expect(stalledAt(h(100, 100, 100))).toBe(null)
  })

  it('flags a lift flat across four sessions', () => {
    expect(stalledAt(h(100, 100, 100, 100))).toBe(100)
  })

  it('flags an advance that deloaded straight back', () => {
    // The leg press in block 1: each step a correct decision, the four together no gain.
    expect(stalledAt(h(100, 110, 100, 100))).toBe(100)
  })

  it('stays quiet on a lift that is moving', () => {
    expect(stalledAt(h(30, 30, 32.5, 32.5))).toBe(null)
    expect(stalledAt(h(80, 100, 100, 100, 102.5))).toBe(null)
  })

  it('reads only the last four', () => {
    expect(stalledAt(h(60, 80, 80, 80, 80))).toBe(80)
  })

  it('says nothing when a weight is missing', () => {
    expect(stalledAt(h(null, 100, 100, 100))).toBe(null)
  })
})

describe('nextUnfinished', () => {
  const ex = (...done) => ({ performed: done.map((d) => ({ reps: 8, weightKg: 60, done: d })) })

  it('skips finished exercises ahead and returns the next with a set left', () => {
    expect(nextUnfinished([ex(true), ex(true), ex(false)], 0)).toBe(2)
  })

  it('wraps to the earlier exercises when the last in the list is done first', () => {
    // Jumped to the last exercise from the overview and finished it with two untouched.
    expect(nextUnfinished([ex(true), ex(false, false), ex(false), ex(true)], 3)).toBe(1)
  })

  it('counts a partly done exercise as unfinished', () => {
    expect(nextUnfinished([ex(true, false), ex(true)], 1)).toBe(0)
  })

  it('returns -1 only when every set of every exercise is done', () => {
    expect(nextUnfinished([ex(true, true), ex(true)], 1)).toBe(-1)
  })
})

// Progression and exerciseHistory read workouts in stored order and take the last as the
// latest, so a log written after the fact has to be slotted in by date, not appended.
describe('byFinish', () => {
  it('orders logs by finishedAt without touching the input', () => {
    const logs = [
      { id: 'b', finishedAt: '2026-09-10T07:00:00.000Z' },
      { id: 'a', finishedAt: '2026-09-01T07:00:00.000Z' },
      { id: 'c', finishedAt: '2026-09-12T07:00:00.000Z' },
    ]
    expect(byFinish(logs).map((w) => w.id)).toEqual(['a', 'b', 'c'])
    expect(logs.map((w) => w.id)).toEqual(['b', 'a', 'c'])
  })
})

describe('blockWindow', () => {
  const logs = [
    { id: 'a', blockIndex: 0, startedAt: '2026-08-01T06:00:00.000Z', finishedAt: '2026-08-01T07:00:00.000Z' },
    { id: 'b', blockIndex: 0, startedAt: '2026-08-20T06:00:00.000Z', finishedAt: '2026-08-20T07:00:00.000Z' },
    { id: 'c', blockIndex: 1, startedAt: '2026-09-01T06:00:00.000Z', finishedAt: '2026-09-01T07:00:00.000Z' },
    { id: 'd', blockIndex: 2, startedAt: '2026-09-25T06:00:00.000Z', finishedAt: '2026-09-25T07:00:00.000Z' },
  ]

  it('sits after every earlier block and before every later one', () => {
    expect(blockWindow(logs, 1)).toEqual({
      after: '2026-08-20T07:00:00.000Z',
      before: '2026-09-25T06:00:00.000Z',
    })
  })

  it('is open at both ends with nothing either side', () => {
    expect(blockWindow(logs, 0)).toEqual({ after: null, before: '2026-09-01T06:00:00.000Z' })
    expect(blockWindow(logs, 2)).toEqual({ after: '2026-09-01T07:00:00.000Z', before: null })
  })

  it('leaves out the log being edited', () => {
    expect(blockWindow(logs, 1, 'c')).toEqual({
      after: '2026-08-20T07:00:00.000Z',
      before: '2026-09-25T06:00:00.000Z',
    })
    expect(blockWindow(logs, 2, 'd').before).toBe(null)
  })
})

// A block where the weight held and the reps grew used to read "60 → 60 kg", which says
// nothing happened. The reps at the working weight are what moved.
describe('blockWeightChanges', () => {
  const log = (sets) => ({ entries: [{ exerciseId: '0043', sets }] })
  const s = (reps, weightKg, done = true) => ({ reps, weightKg, done })

  it('carries the fewest reps at the working weight, first and last', () => {
    const [c] = blockWeightChanges([
      log([s(8, 60), s(8, 60), s(9, 60)]),
      log([s(10, 60), s(11, 60), s(10, 60)]),
    ])
    expect(c).toEqual({ exerciseId: '0043', first: 60, last: 60, firstReps: 8, lastReps: 10 })
  })

  it('ignores lighter back-off sets and unticked sets when counting reps', () => {
    const [c] = blockWeightChanges([log([s(10, 60), s(9, 60), s(15, 40), s(2, 60, false)])])
    expect(c.firstReps).toBe(9)
  })
})
