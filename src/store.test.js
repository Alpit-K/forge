import { describe, it, expect, vi } from 'vitest'
import { createStore } from './store.js'
import { createInitialState, seedPlan } from './lib/seed.js'
import { FIRST_REASON, nextTarget } from './engine/progression.js'
import { ensureAudioContext } from './lib/audio.js'
import { acquireWakeLock } from './lib/wakeLock.js'

vi.mock('./lib/wakeLock.js', () => ({
  acquireWakeLock: vi.fn(),
  releaseWakeLock: vi.fn(),
}))
vi.mock('./lib/audio.js', () => ({
  ensureAudioContext: vi.fn(),
  playCue: vi.fn(),
}))

function storeWithActive(exercise) {
  const state = createInitialState()
  state.active = {
    id: 'a1',
    startedAt: '2026-09-02T06:00:00.000Z',
    blockIndex: 0,
    sessionIndex: 0,
    rotationIndex: 0,
    templateName: 'Squat-led',
    currentIndex: 0,
    restStartedAt: null,
    restDuration: null,
    exercises: [exercise],
  }
  const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  const useStore = createStore(storage)
  useStore.setState({ active: state.active })
  return useStore
}

// The replacement is a different exercise. Inheriting the replaced exercise's
// weight would be worse than asking: a leg press is not a squat.
describe('swapMidWorkout', () => {
  it('does not carry the replaced exercise weights or reps into untouched sets', () => {
    const useStore = storeWithActive({
      exerciseId: '0043',
      swappedFrom: null,
      lastSets: [{ reps: 12, weightKg: 80, done: true }],
      repsMin: 8,
      repsMax: 12,
      sets: 3,
      restSec: 150,
      increment: 2.5,
      kind: 'hold',
      reason: 'Holding — you got 12, 10, 9 last session',
      performed: [
        { reps: 12, weightKg: 80, done: false },
        { reps: 10, weightKg: 80, done: false },
        { reps: 9, weightKg: 80, done: false },
      ],
    })

    useStore.getState().swapMidWorkout(0, '0739')
    const ex = useStore.getState().active.exercises[0]

    expect(ex.exerciseId).toBe('0739')
    expect(ex.swappedFrom).toBe('0043')
    expect(ex.performed.map((s) => s.weightKg)).toEqual([null, null, null])
    expect(ex.performed.map((s) => s.reps)).toEqual([8, 8, 8])
    expect(ex.kind).toBe('first')
    expect(ex.reason).toBe(FIRST_REASON)
  })

  it('keeps sets already logged against the slot', () => {
    const useStore = storeWithActive({
      exerciseId: '0043',
      swappedFrom: null,
      lastSets: [],
      repsMin: 8,
      repsMax: 12,
      sets: 3,
      restSec: 150,
      increment: 2.5,
      kind: 'hold',
      reason: 'Holding',
      performed: [
        { reps: 11, weightKg: 80, done: true },
        { reps: 12, weightKg: 80, done: false },
        { reps: 12, weightKg: 80, done: false },
      ],
    })

    useStore.getState().swapMidWorkout(0, '0739')
    const ex = useStore.getState().active.exercises[0]

    expect(ex.performed[0]).toEqual({ reps: 11, weightKg: 80, done: true })
    expect(ex.performed[1].weightKg).toBe(null)
    expect(ex.performed[2].weightKg).toBe(null)
  })

  // The swap sheet shows the incoming exercise's own history and heaviest weight. Landing on
  // "first time" after choosing it contradicted the screen the choice was made on, and threw
  // away real evidence — the replaced exercise's numbers are what must not carry across, not
  // the new one's.
  it('takes the incoming exercise own history, not first-time', () => {
    const useStore = storeWithActive({
      exerciseId: '0043',
      swappedFrom: null,
      lastSets: [],
      repsMin: 8,
      repsMax: 12,
      sets: 3,
      restSec: 150,
      increment: 2.5,
      kind: 'hold',
      reason: 'Holding',
      performed: [
        { reps: 8, weightKg: 80, done: false },
        { reps: 8, weightKg: 80, done: false },
        { reps: 8, weightKg: 80, done: false },
      ],
    })
    useStore.setState({
      workouts: [
        {
          id: 'w1',
          at: '2026-08-26T06:00:00.000Z',
          blockIndex: 0,
          sessionIndex: 0,
          rotationIndex: 0,
          templateName: 'Squat-led',
          entries: [
            {
              exerciseId: '0739',
              sets: [
                { reps: 10, weightKg: 40, done: true },
                { reps: 9, weightKg: 40, done: true },
                { reps: 9, weightKg: 40, done: true },
              ],
            },
          ],
        },
      ],
    })

    useStore.getState().swapMidWorkout(0, '0739')
    const ex = useStore.getState().active.exercises[0]

    expect(ex.kind).toBe('hold')
    expect(ex.reason).not.toBe(FIRST_REASON)
    expect(ex.performed.map((s) => s.weightKg)).toEqual([40, 40, 40])
    expect(ex.performed.map((s) => s.reps)).toEqual([10, 9, 9])
  })
})

// Everything that reads an exercise back out of a log uses `.find` and gets the first entry,
// while the finish summary and the volume iterate all of them. Two entries for one exercise
// therefore compute the next target from one set of numbers and report it against another,
// and nothing on screen says which is which.
describe('one entry per exercise per session', () => {
  it('refuses a duplicate mid-workout add', () => {
    const useStore = storeWithActive({
      exerciseId: '0043',
      swappedFrom: null,
      lastSets: [],
      repsMin: 8,
      repsMax: 12,
      sets: 3,
      restSec: 120,
      increment: 2.5,
      kind: 'first',
      reason: FIRST_REASON,
      performed: [{ reps: 8, weightKg: 60, done: true }],
    })
    useStore.getState().addExerciseToActive('0043')
    expect(useStore.getState().active.exercises).toHaveLength(1)

    useStore.getState().addExerciseToActive('0739')
    expect(useStore.getState().active.exercises).toHaveLength(2)
  })

  // A swap is the third way to get two entries for one exercise, and the worst: the slot it
  // lands on keeps its ticked sets, so both entries would hold real performed work and every
  // reader that uses .find would see only the first.
  it('refuses a swap onto an exercise already in the session', () => {
    const useStore = storeWithActive({
      exerciseId: '0043',
      swappedFrom: null,
      lastSets: [],
      repsMin: 8,
      repsMax: 12,
      sets: 3,
      restSec: 120,
      increment: 2.5,
      kind: 'first',
      reason: FIRST_REASON,
      performed: [{ reps: 8, weightKg: 60, done: true }],
    })
    const active = useStore.getState().active
    useStore.setState({
      active: {
        ...active,
        exercises: [...active.exercises, { ...active.exercises[0], exerciseId: '0739' }],
      },
    })

    useStore.getState().swapMidWorkout(0, '0739')

    const exercises = useStore.getState().active.exercises
    expect(exercises).toHaveLength(2)
    expect(exercises[0].exerciseId).toBe('0043')
    expect(exercises[0].swappedFrom).toBe(null)
  })

  it('refuses a duplicate in the plan editor', () => {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const useStore = createStore(storage)
    const existing = useStore.getState().plan.rotation[0].exercises[0].exerciseId
    const before = useStore.getState().plan.rotation[0].exercises.length

    useStore.getState().addExerciseToSession(0, existing)
    expect(useStore.getState().plan.rotation[0].exercises).toHaveLength(before)
  })
})

// Restoring a backup taken mid-workout puts the app in the same position as reopening after
// a kill: an active session with no tap behind it. Both need the lock and the audio context
// re-armed, and both fail silently when they are not — the cue simply does not sound.
describe('importing a backup with a workout in progress', () => {
  it('re-arms the wake lock and the audio context', () => {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const useStore = createStore(storage)
    ensureAudioContext.mockClear()
    acquireWakeLock.mockClear()

    const state = createInitialState()
    state.settings.keepAwake = true
    state.active = { id: 'a1', currentIndex: 0, exercises: [] }

    expect(useStore.getState().importBackup(JSON.stringify(state)).ok).toBe(true)
    expect(ensureAudioContext).toHaveBeenCalled()
    expect(acquireWakeLock).toHaveBeenCalled()
  })
})

describe('importPlan', () => {
  const memory = () => ({ getItem: () => null, setItem: () => {}, removeItem: () => {} })
  const nextPlan = () => {
    const plan = structuredClone(seedPlan)
    plan.name = 'Block 3'
    plan.rotation[0].exercises[0].repsMin = 6
    return plan
  }

  it('replaces the plan and clears swaps, and leaves the record alone', () => {
    const useStore = createStore(memory())
    const log = { id: 'w1', blockIndex: 1, sessionIndex: 11, rotationIndex: 0, entries: [] }
    const run = { id: 'r1', type: 'run', at: '2026-09-27T07:00:00.000Z' }
    useStore.setState({
      workouts: [log],
      activities: [run],
      progress: { blockIndex: 2, sessionIndex: 0 },
      swaps: { '0043': '0739' },
    })

    const result = useStore.getState().importPlan(JSON.stringify({ version: 1, plan: nextPlan() }))

    expect(result.ok).toBe(true)
    const s = useStore.getState()
    expect(s.plan.name).toBe('Block 3')
    expect(s.plan.rotation[0].exercises[0].repsMin).toBe(6)
    expect(s.swaps).toEqual({})
    expect(s.workouts).toEqual([log])
    expect(s.activities).toEqual([run])
    expect(s.progress).toEqual({ blockIndex: 2, sessionIndex: 0 })
  })

  it('changes nothing when the file is refused', () => {
    const useStore = createStore(memory())
    const before = useStore.getState().plan
    const plan = nextPlan()
    plan.rotation[1].exercises[2].exerciseId = '9999'

    expect(useStore.getState().importPlan(JSON.stringify({ version: 1, plan })).ok).toBe(false)
    expect(useStore.getState().plan).toBe(before)
  })
})

// A mid-workout add now resolves the exercise through the plan: a planned exercise gets its
// real prescription and current target, an unplanned one stays first-time. This is a
// deliberate improvement over the old behaviour, which prefilled nothing for either.
describe('addExerciseToActive', () => {
  it('reuses the plan prescription and target for an exercise already in the plan', () => {
    const useStore = storeWithActive({
      exerciseId: '0739',
      swappedFrom: null,
      lastSets: [],
      repsMin: 10,
      repsMax: 15,
      sets: 3,
      restSec: 120,
      increment: 2.5,
      kind: 'first',
      reason: FIRST_REASON,
      performed: [{ reps: 10, weightKg: null, done: false }],
    })
    useStore.getState().addExerciseToActive('0861')
    const ex = useStore.getState().active.exercises.find((e) => e.exerciseId === '0861')
    // '0861' is slot 0 with 10–15 × 3, rest 90 — not the first-time defaults.
    expect(ex.sets).toBe(3)
    expect(ex.repsMin).toBe(10)
    expect(ex.repsMax).toBe(15)
    expect(ex.restSec).toBe(90)
    expect(ex.kind).toBe('first')
    expect(ex.reason).toBe(FIRST_REASON)
    expect(ex.performed.map((s) => s.weightKg)).toEqual([null, null, null])
    expect(ex.performed.map((s) => s.reps)).toEqual([10, 10, 10])
  })

  it('prefills from the current target for a plan exercise with history', () => {
    const useStore = storeWithActive({
      exerciseId: '0739',
      swappedFrom: null,
      lastSets: [],
      repsMin: 10,
      repsMax: 15,
      sets: 3,
      restSec: 120,
      increment: 2.5,
      kind: 'first',
      reason: FIRST_REASON,
      performed: [{ reps: 10, weightKg: null, done: false }],
    })
    useStore.setState({
      workouts: [
        {
          id: 'w1',
          startedAt: '2026-09-01T06:00:00.000Z',
          finishedAt: '2026-09-01T06:40:00.000Z',
          blockIndex: 0,
          sessionIndex: 0,
          rotationIndex: 0,
          templateName: 'Squat-led',
          entries: [
            {
              exerciseId: '0043',
              swappedFrom: null,
              sets: [
                { reps: 12, weightKg: 60, done: true },
                { reps: 12, weightKg: 60, done: true },
                { reps: 12, weightKg: 60, done: true },
              ],
            },
          ],
        },
      ],
    })
    useStore.getState().addExerciseToActive('0043')
    const ex = useStore.getState().active.exercises.find((e) => e.exerciseId === '0043')
    // 3×12 @ 60 last time advances to 62.5, and the advance carries through to the add.
    expect(ex.kind).toBe('advance')
    expect(ex.performed.map((s) => s.weightKg)).toEqual([62.5, 62.5, 62.5])
    expect(ex.performed.map((s) => s.reps)).toEqual([8, 8, 8])
  })

  it('stays first-time for an exercise not in the plan', () => {
    const useStore = storeWithActive({
      exerciseId: '0739',
      swappedFrom: null,
      lastSets: [],
      repsMin: 10,
      repsMax: 15,
      sets: 3,
      restSec: 120,
      increment: 2.5,
      kind: 'first',
      reason: FIRST_REASON,
      performed: [{ reps: 10, weightKg: null, done: false }],
    })
    useStore.getState().addExerciseToActive('9999')
    const ex = useStore.getState().active.exercises.find((e) => e.exerciseId === '9999')
    expect(ex.kind).toBe('first')
    expect(ex.reason).toBe(FIRST_REASON)
    expect(ex.sets).toBe(3)
    expect(ex.repsMin).toBe(8)
    expect(ex.repsMax).toBe(12)
    expect(ex.restSec).toBe(90)
    expect(ex.performed.map((s) => s.weightKg)).toEqual([null, null, null])
  })

  it('takes the target from history for an exercise not in the plan', () => {
    const useStore = storeWithActive({
      exerciseId: '0739',
      swappedFrom: null,
      lastSets: [],
      repsMin: 10,
      repsMax: 15,
      sets: 3,
      restSec: 120,
      increment: 2.5,
      kind: 'first',
      reason: FIRST_REASON,
      performed: [{ reps: 10, weightKg: null, done: false }],
    })
    useStore.setState({
      workouts: [
        {
          id: 'w1',
          startedAt: '2026-10-05T06:00:00.000Z',
          finishedAt: '2026-10-05T06:40:00.000Z',
          blockIndex: 0,
          sessionIndex: 0,
          rotationIndex: null,
          freeform: true,
          templateName: 'Custom workout',
          entries: [
            {
              exerciseId: '0200',
              swappedFrom: null,
              sets: [
                { reps: 15, weightKg: 15, done: true },
                { reps: 12, weightKg: 15, done: true },
                { reps: 10, weightKg: 15, done: true },
              ],
            },
          ],
        },
      ],
    })
    // Cable pushdown is in no plan slot. Against the default 8–12 × 3, 12 + 12 + 10 clears
    // the rep-a-set tolerance, and a cable on triceps steps 2.5.
    useStore.getState().addExerciseToActive('0200')
    const ex = useStore.getState().active.exercises.find((e) => e.exerciseId === '0200')
    expect(ex.kind).toBe('advance')
    expect(ex.sets).toBe(3)
    expect(ex.repsMin).toBe(8)
    expect(ex.restSec).toBe(90)
    expect(ex.performed.map((s) => s.weightKg)).toEqual([17.5, 17.5, 17.5])
  })
})

// A custom workout is a full member of the program: it starts empty, and finishing writes a
// freeform log, advances sessionIndex, and its sets feed the next target like any session.
describe('custom workout', () => {
  it('starts empty with a null rotationIndex and the freeform flag', () => {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const useStore = createStore(storage)
    useStore.getState().startFreeWorkout()
    const a = useStore.getState().active
    expect(a.exercises).toEqual([])
    expect(a.rotationIndex).toBe(null)
    expect(a.freeform).toBe(true)
    expect(a.templateName).toBe('Custom workout')
    expect(a.blockIndex).toBe(0)
    expect(a.sessionIndex).toBe(0)
    expect(a.building).toBe(true)
  })

  it('stays building through adds and removes, and starts only with an exercise', () => {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const useStore = createStore(storage)
    useStore.getState().startFreeWorkout()
    useStore.getState().beginFreeWorkout()
    expect(useStore.getState().active.building).toBe(true)

    useStore.getState().addExerciseToActive('0043')
    useStore.getState().addExerciseToActive('0200')
    expect(useStore.getState().active.building).toBe(true)
    // Building may empty the list; a started workout keeps its last exercise.
    useStore.getState().removeExerciseFromActive(1)
    useStore.getState().removeExerciseFromActive(0)
    expect(useStore.getState().active.exercises).toEqual([])

    useStore.getState().addExerciseToActive('0043')
    useStore.setState({ active: { ...useStore.getState().active, startedAt: '2000-01-01T00:00:00.000Z' } })
    useStore.getState().beginFreeWorkout()
    const a = useStore.getState().active
    expect('building' in a).toBe(false)
    expect(a.startedAt > '2000-01-01T00:00:00.000Z').toBe(true)
    useStore.getState().removeExerciseFromActive(0)
    expect(useStore.getState().active.exercises).toHaveLength(1)
  })

  it('finishing writes a freeform log, advances sessionIndex, and feeds progression', () => {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const useStore = createStore(storage)
    useStore.getState().startFreeWorkout()
    useStore.getState().addExerciseToActive('0043')
    useStore.getState().setWeight(0, 0, 60)
    useStore.getState().tickSet(0, 0)
    useStore.getState().finishWorkout()

    expect(useStore.getState().progress.sessionIndex).toBe(1)
    const log = useStore.getState().workouts[0]
    expect(log.rotationIndex).toBe(null)
    expect(log.freeform).toBe(true)
    expect(log.templateName).toBe('Custom workout')
    expect(log.entries[0].exerciseId).toBe('0043')

    // The set feeds the next target: one done set at 60 is not an advance, so it holds at
    // 60 — but the weight now comes from history rather than from nothing.
    expect(nextTarget('0043', useStore.getState(), 0).weightKg).toBe(60)
  })
})

function logAt(id, day, weightKg) {
  return {
    id,
    startedAt: `2026-09-${day}T06:00:00.000Z`,
    finishedAt: `2026-09-${day}T06:40:00.000Z`,
    blockIndex: 0,
    sessionIndex: 0,
    rotationIndex: 0,
    templateName: 'Squat-led',
    entries: [
      {
        exerciseId: '0043',
        swappedFrom: null,
        sets: [
          { reps: 12, weightKg, done: true },
          { reps: 12, weightKg, done: true },
          { reps: 12, weightKg, done: true },
        ],
      },
    ],
  }
}

// A session forgotten in the gym, entered afterwards. It is a session like any other — it
// counts toward the block and feeds progression — so where it lands in the list matters.
describe('logPastWorkout', () => {
  function storeWith(workouts) {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const useStore = createStore(storage)
    useStore.setState({ workouts, progress: { blockIndex: 0, sessionIndex: workouts.length } })
    return useStore
  }

  it('slots the log in by date, unticked, and advances the session counter', () => {
    const useStore = storeWith([logAt('w1', '01', 60), logAt('w2', '10', 62.5)])
    const id = useStore.getState().logPastWorkout(0, '2026-09-05T06:00:00.000Z', '2026-09-05T07:00:00.000Z')

    const { workouts, progress } = useStore.getState()
    expect(workouts.map((w) => w.id)).toEqual(['w1', id, 'w2'])
    const log = workouts[1]
    expect(log.blockIndex).toBe(0)
    expect(log.rotationIndex).toBe(0)
    expect(log.templateName).toBe(useStore.getState().plan.rotation[0].name)
    expect(log.entries.every((e) => e.sets.every((s) => s.done === false))).toBe(true)
    expect(progress.sessionIndex).toBe(3)
  })

  it('prefills from the sessions before its date, not from everything since', () => {
    const useStore = storeWith([logAt('w1', '01', 60), logAt('w2', '10', 62.5)])
    const id = useStore.getState().logPastWorkout(0, '2026-09-05T06:00:00.000Z', '2026-09-05T07:00:00.000Z')

    const log = useStore.getState().workouts.find((w) => w.id === id)
    const squat = log.entries.find((e) => e.exerciseId === '0043')
    // 3×12 at 60 on the 1st advances to 62.5. Reading the 10th as well would say 65.
    expect(squat.sets.map((s) => s.weightKg)).toEqual([62.5, 62.5, 62.5])
  })

  it('does not become the latest session for progression', () => {
    const useStore = storeWith([logAt('w1', '01', 60), logAt('w2', '10', 62.5)])
    useStore.getState().logPastWorkout(0, '2026-09-05T06:00:00.000Z', '2026-09-05T07:00:00.000Z')
    // Unticked, so it is not history at all — the next target still comes off the 10th.
    expect(nextTarget('0043', useStore.getState(), 0).weightKg).toBe(65)
  })
})

describe('updateWorkoutTimes', () => {
  it('moves a log and keeps the list in date order', () => {
    const storage = { getItem: () => null, setItem: () => {}, removeItem: () => {} }
    const useStore = createStore(storage)
    useStore.setState({ workouts: [logAt('w1', '01', 60), logAt('w2', '10', 62.5)] })
    useStore.getState().updateWorkoutTimes('w1', '2026-09-12T06:00:00.000Z', '2026-09-12T07:15:00.000Z')

    const { workouts } = useStore.getState()
    expect(workouts.map((w) => w.id)).toEqual(['w2', 'w1'])
    expect(workouts[1].startedAt).toBe('2026-09-12T06:00:00.000Z')
    expect(workouts[1].finishedAt).toBe('2026-09-12T07:15:00.000Z')
  })
})
