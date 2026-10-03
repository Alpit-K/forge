import { describe, it, expect } from 'vitest'
import { validateBackup, validatePlan, backupFilename, serializeState, ERRORS } from './backup.js'
import { createInitialState, seedPlan } from './seed.js'

describe('validateBackup', () => {
  it('rejects non-JSON', () => {
    expect(validateBackup('not json {').ok).toBe(false)
    expect(validateBackup('not json {').message).toBe(ERRORS.notJson)
  })

  it('rejects a JSON value that is not an object', () => {
    expect(validateBackup('[1,2,3]').message).toBe(ERRORS.notJson)
    expect(validateBackup('"hello"').message).toBe(ERRORS.notJson)
  })

  it('rejects a missing version as newer', () => {
    expect(validateBackup('{"workouts":[]}').message).toBe(ERRORS.newer)
  })

  it('rejects a version this build does not understand', () => {
    expect(validateBackup('{"version":2}').message).toBe(ERRORS.newer)
  })

  it('rejects an older version with no migration', () => {
    expect(validateBackup('{"version":0}').message).toBe(ERRORS.older)
  })

  it('accepts the current version', () => {
    const r = validateBackup('{"version":1,"workouts":[]}')
    expect(r.ok).toBe(true)
    expect(r.data.version).toBe(1)
  })
})

// A file with the right version and the wrong shape used to import cleanly and throw out of
// the first screen that iterated it. There is no error boundary and the state is persisted
// by then, so the crash comes back on every launch — validate fully, then replace.
describe('validateBackup shape', () => {
  const damaged = (json) => {
    const r = validateBackup(json)
    expect(r.ok).toBe(false)
    expect(r.message).toBe(ERRORS.damaged)
  }

  it('rejects a list that is not a list', () => {
    damaged('{"version":1,"workouts":"none"}')
    damaged('{"version":1,"activities":{}}')
    damaged('{"version":1,"customEx":7}')
  })

  it('rejects a plan with no rotation to walk', () => {
    damaged('{"version":1,"plan":null}')
    damaged('{"version":1,"plan":{}}')
    damaged('{"version":1,"plan":{"rotation":[{"name":"a"}]}}')
  })

  it('rejects progress that cannot be counted', () => {
    damaged('{"version":1,"progress":{}}')
    damaged('{"version":1,"progress":{"blockIndex":0,"sessionIndex":"4"}}')
  })

  it('rejects an active session with no exercises', () => {
    damaged('{"version":1,"active":{"id":"a1"}}')
  })

  it('accepts a file this app actually writes', () => {
    // The one case tightening the shape check could break, and the one nothing else covers.
    expect(validateBackup(serializeState(createInitialState())).ok).toBe(true)
  })

  it('still accepts a file that simply predates a field', () => {
    // Absent is the whole reason an additive field ships safely at version 1 — hydrate fills
    // it from the defaults. Only present-and-wrong is damaged.
    const r = validateBackup('{"version":1,"progress":{"blockIndex":0,"sessionIndex":4},"active":null}')
    expect(r.ok).toBe(true)
  })

  it('round-trips a freeform workout and tolerates its absence', () => {
    const state = createInitialState()
    state.workouts = [
      {
        id: 'w1',
        startedAt: '2026-09-10T06:00:00.000Z',
        finishedAt: '2026-09-10T06:40:00.000Z',
        blockIndex: 0,
        sessionIndex: 0,
        rotationIndex: null,
        freeform: true,
        templateName: 'Custom workout',
        entries: [{ exerciseId: '0043', swappedFrom: null, sets: [{ reps: 10, weightKg: 60, done: true }] }],
      },
    ]
    const json = serializeState(state)
    expect(json).toContain('"freeform": true')
    expect(validateBackup(json).ok).toBe(true)

    const preFlag = createInitialState()
    preFlag.workouts = [{ ...state.workouts[0] }]
    delete preFlag.workouts[0].freeform
    expect(validateBackup(serializeState(preFlag)).ok).toBe(true)
  })
})

// A plan file and a backup are told apart in both directions, because the backup path fills
// every absent key from the defaults — a plan file restored as a backup wipes the history.
describe('validatePlan', () => {
  const planFile = (plan = seedPlan) => JSON.stringify({ version: 1, plan })
  const withExercise = (patch) => {
    const plan = structuredClone(seedPlan)
    Object.assign(plan.rotation[0].exercises[0], patch)
    return planFile(plan)
  }

  it('accepts the seeded plan', () => {
    const r = validatePlan(planFile())
    expect(r.ok).toBe(true)
    expect(r.plan.rotation).toHaveLength(3)
  })

  it('accepts a plan file carrying exerciseNames for readability', () => {
    const json = JSON.stringify({ version: 1, plan: seedPlan, exerciseNames: { '0043': 'x' } })
    expect(validatePlan(json).ok).toBe(true)
  })

  it('refuses a full backup and sends it to the other row', () => {
    expect(validatePlan(serializeState(createInitialState())).message).toBe(ERRORS.fullBackup)
  })

  it('refuses a plan with no session count, which the block gate divides by', () => {
    const plan = structuredClone(seedPlan)
    delete plan.sessionCount
    expect(validatePlan(planFile(plan)).message).toBe(ERRORS.badPlan)
  })

  it('refuses a backwards or missing rep range', () => {
    expect(validatePlan(withExercise({ repsMin: 12, repsMax: 8 })).message).toBe(ERRORS.badPlan)
    expect(validatePlan(withExercise({ sets: '3' })).message).toBe(ERRORS.badPlan)
    expect(validatePlan(withExercise({ incrementKg: 0 })).message).toBe(ERRORS.badPlan)
  })

  it('refuses an exercise id this app cannot name', () => {
    expect(validatePlan(withExercise({ exerciseId: '9999' })).message).toBe(ERRORS.unknownExercise)
  })

  it('resolves a custom exercise against the list it is given', () => {
    const json = withExercise({ exerciseId: 'c1' })
    expect(validatePlan(json, [{ id: 'c1', name: 'Mine' }]).ok).toBe(true)
  })
})

describe('validateBackup and a plan file', () => {
  it('refuses a plan file under Import backup', () => {
    const r = validateBackup(JSON.stringify({ version: 1, plan: seedPlan }))
    expect(r.ok).toBe(false)
    expect(r.message).toBe(ERRORS.planFile)
  })
})

describe('backupFilename', () => {
  it('formats the date', () => {
    expect(backupFilename(new Date('2026-08-27T12:00:00Z'))).toBe('forge-backup-2026-08-27.json')
  })
})
