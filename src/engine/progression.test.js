import { describe, it, expect } from 'vitest'
import {
  nextTarget,
  findTemplateEntry,
  incrementFor,
  roundToIncrement,
  classifySet,
  classifySession,
  isMissedSession,
  workingWeight,
  findSlotFor,
} from './progression.js'
import { seedPlan } from '../lib/seed.js'

function entry(exerciseId, overrides = {}) {
  return {
    exerciseId,
    sets: 3,
    repsMin: 8,
    repsMax: 12,
    restSec: 120,
    incrementKg: null,
    ...overrides,
  }
}

function set(reps, weightKg = 60, done = true) {
  return { reps, weightKg, done }
}

function workout(exerciseId, sets, idx = 0) {
  return {
    id: `w${idx}`,
    startedAt: `2026-01-0${idx + 1}T06:00:00.000Z`,
    finishedAt: `2026-01-0${idx + 1}T07:00:00.000Z`,
    blockIndex: 0,
    sessionIndex: idx,
    templateName: 'Squat-led',
    entries: [{ exerciseId, swappedFrom: null, sets }],
  }
}

function state({ workouts = [], swaps = {}, exerciseId = '0043' } = {}) {
  return {
    plan: { ...seedPlan, rotation: [{ name: 's', exercises: [entry(exerciseId)] }] },
    workouts,
    swaps,
    customEx: [],
  }
}

// The same exercise prescribed differently in two rotation slots.
function twoSlotRotation() {
  return [
    { name: 'a', exercises: [entry('0043', { sets: 3, repsMin: 8, repsMax: 12 })] },
    { name: 'b', exercises: [entry('0043', { sets: 4, repsMin: 10, repsMax: 15 })] },
  ]
}

describe('incrementFor', () => {
  it('prefers an explicit incrementKg override', () => {
    expect(incrementFor({ incrementKg: 5 }, 'barbell')).toBe(5)
  })
  it('steps dumbbell work in 2 kg', () => {
    expect(incrementFor({ incrementKg: null }, 'dumbbell')).toBe(2)
  })
  it('defaults to 2.5 kg for everything else', () => {
    expect(incrementFor({ incrementKg: null }, 'barbell')).toBe(2.5)
    expect(incrementFor({ incrementKg: null }, 'cable')).toBe(2.5)
  })
})

describe('findTemplateEntry', () => {
  const plan = { ...seedPlan, rotation: twoSlotRotation() }

  it('picks the entry from the matching rotation slot when one is given', () => {
    expect(findTemplateEntry(plan, '0043', 1).repsMax).toBe(15)
    expect(findTemplateEntry(plan, '0043', 1).sets).toBe(4)
    expect(findTemplateEntry(plan, '0043', 0).repsMax).toBe(12)
    expect(findTemplateEntry(plan, '0043', 0).sets).toBe(3)
  })

  it('falls back to the first match when no slot is given', () => {
    expect(findTemplateEntry(plan, '0043').repsMax).toBe(12)
  })
})

describe('roundToIncrement', () => {
  it('rounds to the nearest multiple of the increment', () => {
    expect(roundToIncrement(59.375, 2.5)).toBe(60)
    expect(roundToIncrement(57, 2.5)).toBe(57.5)
    expect(roundToIncrement(61, 2)).toBe(62)
  })
})

describe('classifySet / classifySession', () => {
  it('top hit when reps reach the max', () => {
    expect(classifySet(set(12), 8, 12)).toBe('top')
  })
  it('partial when reps are within the range', () => {
    expect(classifySet(set(8), 8, 12)).toBe('partial')
    expect(classifySet(set(11), 8, 12)).toBe('partial')
  })
  it('miss when reps are below the minimum', () => {
    expect(classifySet(set(7), 8, 12)).toBe('miss')
  })
  it('miss when a set was never ticked', () => {
    expect(classifySet(set(10, 60, false), 8, 12)).toBe('miss')
  })
  it('miss when the set is absent entirely', () => {
    expect(classifySet(undefined, 8, 12)).toBe('miss')
  })
  it('counts fewer sets than prescribed as misses', () => {
    const e = { exerciseId: '0043', sets: [set(12), set(12)] }
    expect(classifySession(e, 8, 12, 3)).toEqual(['top', 'top', 'miss'])
  })
})

describe('isMissedSession', () => {
  it('one missed set of three is not a missed session', () => {
    const e = { exerciseId: '0043', sets: [set(12), set(12), set(7)] }
    expect(isMissedSession(e, 8, 12, 3)).toBe(false)
  })
  it('two missed sets of three is a missed session', () => {
    const e = { exerciseId: '0043', sets: [set(12), set(7), set(7)] }
    expect(isMissedSession(e, 8, 12, 3)).toBe(true)
  })
})

describe('nextTarget', () => {
  it('is a first-time empty weight with no history', () => {
    const t = nextTarget('0043', state())
    expect(t.kind).toBe('first')
    expect(t.weightKg).toBeNull()
  })

  it('advances when every set hit the top of the range', () => {
    const t = nextTarget('0043', state({ workouts: [workout('0043', [set(12), set(12), set(12)])] }))
    expect(t.kind).toBe('advance')
    expect(t.weightKg).toBe(62.5)
  })

  it('holds when a session was partial', () => {
    const t = nextTarget('0043', state({ workouts: [workout('0043', [set(10), set(9), set(7)])] }))
    expect(t.kind).toBe('hold')
    expect(t.weightKg).toBe(60)
  })

  it('holds (does not deload) after a single missed session', () => {
    const t = nextTarget('0043', state({ workouts: [workout('0043', [set(7), set(7), set(12)])] }))
    expect(t.kind).toBe('hold')
    expect(t.weightKg).toBe(60)
  })

  it('deloads 5% after two consecutive missed sessions', () => {
    const missed = [workout('0043', [set(7), set(7), set(12)]), workout('0043', [set(7), set(7), set(12)], 1)]
    const t = nextTarget('0043', state({ workouts: missed }))
    expect(t.kind).toBe('deload')
    expect(t.weightKg).toBe(57.5)
  })

  it('does not deload when a good session separates two missed ones', () => {
    const workouts = [
      workout('0043', [set(7), set(7), set(12)]),
      workout('0043', [set(12), set(12), set(12)], 1),
      workout('0043', [set(7), set(7), set(12)], 2),
    ]
    const t = nextTarget('0043', state({ workouts }))
    expect(t.kind).toBe('hold')
  })

  it('subtracts an increment when a deload rounds back to the current weight', () => {
    const missed = [workout('0043', [set(7, 20), set(7, 20), set(12, 20)]), workout('0043', [set(7, 20), set(7, 20), set(12, 20)], 1)]
    const t = nextTarget('0043', state({ workouts: missed }))
    expect(t.kind).toBe('deload')
    // 20 * 0.95 = 19 -> rounds to 20 -> subtract 2.5
    expect(t.weightKg).toBe(17.5)
  })

  it('correcting a historical set changes the computed target', () => {
    const good = [workout('0043', [set(12), set(12), set(12)])]
    expect(nextTarget('0043', state({ workouts: good })).kind).toBe('advance')

    const corrected = [workout('0043', [set(12), set(12), set(7)])]
    expect(nextTarget('0043', state({ workouts: corrected })).kind).toBe('hold')
  })

  it('resolves a permanent swap and starts the replacement fresh', () => {
    const t = nextTarget('0043', state({ swaps: { '0043': '0314' } }))
    expect(t.kind).toBe('first')
    expect(t.weightKg).toBeNull()
    expect(t.increment).toBe(2)
  })

  it('classifies against the trained rotation slot, not the first match', () => {
    const plan = { ...seedPlan, rotation: twoSlotRotation() }
    // Four sets of 13 under the 4×10–15 slot: partial, so it holds. Under the first slot's
    // 3×8–12 those same 13s are all tops and would wrongly advance to 62.5.
    const workouts = [
      { ...workout('0043', [set(13, 60), set(13, 60), set(13, 60), set(13, 60)]), rotationIndex: 1 },
    ]
    const t = nextTarget('0043', { plan, workouts, swaps: {}, customEx: [] }, 1)
    expect(t.kind).toBe('hold')
    expect(t.weightKg).toBe(60)
  })
})

describe('workingWeight', () => {
  it('takes the heaviest completed set, not the last one', () => {
    // A back-off set added after the working sets must not become the new base.
    expect(workingWeight({ sets: [set(10, 60), set(10, 60), set(10, 60), set(15, 40)] })).toBe(60)
  })

  it('ignores sets that were never ticked', () => {
    expect(workingWeight({ sets: [set(10, 60), set(10, 80, false)] })).toBe(60)
  })

  it('is null when nothing was ticked, never the weight the app prefilled', () => {
    expect(workingWeight({ sets: [set(10, 60, false), set(10, 50, false)] })).toBeNull()
  })

  it('is null with no sets at all', () => {
    expect(workingWeight({ sets: [] })).toBeNull()
    expect(workingWeight(null)).toBeNull()
  })
})

describe('sets added mid-workout', () => {
  it('a back-off set does not drag the next target down', () => {
    const w = [workout('0043', [set(12, 60), set(12, 60), set(12, 60), set(15, 40)])]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('advance')
    expect(t.weightKg).toBe(62.5)
  })

  it('an extra set cannot rescue a session that fell short of the prescription', () => {
    // Three prescribed, the third missed, a fourth added at the top of the range.
    const w = [workout('0043', [set(12, 60), set(12, 60), set(6, 60), set(12, 60)])]
    expect(nextTarget('0043', state({ workouts: w })).kind).toBe('hold')
  })

  it('dropping a set holds the weight rather than advancing it', () => {
    const w = [workout('0043', [set(12, 60), set(12, 60)])]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('hold')
    expect(t.weightKg).toBe(60)
  })
})

describe('findSlotFor', () => {
  it('finds the rotation slot an unswapped exercise sits in', () => {
    const found = findSlotFor(seedPlan, {}, '0085')
    expect(found).toEqual({ slotId: '0085', rotationIndex: 1 })
  })

  // The point of the function: with a permanent swap in place the slot keeps its original
  // id while the exercise you actually train is a different one, so looking the exercise up
  // by its own id in the rotation finds nothing.
  it('finds the slot a permanent swap points at, keyed by the original slot id', () => {
    const found = findSlotFor(seedPlan, { '0043': '0861' }, '0861')
    expect(found).toEqual({ slotId: '0043', rotationIndex: 0 })
  })

  it('no longer finds the replaced exercise once its slot is swapped away', () => {
    expect(findSlotFor(seedPlan, { '0043': '0861' }, '0043')).toBe(null)
  })

  it('returns null for an exercise the plan does not contain', () => {
    expect(findSlotFor(seedPlan, {}, '9999')).toBe(null)
  })
})

// An exercise can sit in a finished session with nothing ticked — you jumped past it, or
// finished from the End sheet. That is a plan, not a performance. Before this it read as
// three missed sets AND handed its own prefilled weight back as though it had been lifted,
// so two of them deloaded you 5% from a weight you never touched.
describe('untouched entries are not evidence', () => {
  const untouched = [set(8, 60, false), set(8, 60, false), set(8, 60, false)]

  it('two untouched sessions leave the exercise unstarted rather than deloading it', () => {
    const w = [workout('0043', untouched), workout('0043', untouched, 1)]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('first')
    expect(t.weightKg).toBeNull()
  })

  it('an untouched session does not cancel the advance the session before it earned', () => {
    const w = [workout('0043', [set(12), set(12), set(12)]), workout('0043', untouched, 1)]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('advance')
    expect(t.weightKg).toBe(62.5)
  })

  it('a partly logged session is still evidence — one ticked set is enough', () => {
    const w = [workout('0043', [set(12, 60), set(12, 60), set(8, 60, false)])]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('hold')
    expect(t.weightKg).toBe(60)
  })

  it('two real missed sessions still deload with an untouched one between them', () => {
    const w = [
      workout('0043', [set(7), set(7), set(12)]),
      workout('0043', untouched, 1),
      workout('0043', [set(7), set(7), set(12)], 2),
    ]
    expect(nextTarget('0043', state({ workouts: w })).kind).toBe('deload')
  })
})

// classifySet reads reps only, so a weight the user put on the bar themselves was invisible
// to the engine: the reps that fell short at it read as a stall at a weight the engine had
// prescribed. The target was right — hold at the heaviest completed set — but the copy said
// "holding" after a raise, and two such sessions deloaded 5% off a weight just added.
describe('a self-chosen weight change', () => {
  const goodAt60 = [set(12, 60), set(12, 60), set(12, 60)]
  const missAt60 = [set(7, 60), set(7, 60), set(12, 60)]
  const missAt70 = [set(7, 70), set(7, 70), set(12, 70)]
  const clearedAt65 = [set(9, 65), set(9, 65), set(8, 65)]

  it('holds at the raised weight and says so, rather than reporting a stall', () => {
    const w = [workout('0043', goodAt60), workout('0043', clearedAt65, 1)]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('hold')
    expect(t.weightKg).toBe(65)
    expect(t.reason).toBe('Moved up to 65 kg — build back to 3×12')
  })

  it('holds at the raised weight when the prescription did not land, and never reverts it', () => {
    const w = [workout('0043', goodAt60), workout('0043', missAt70, 1)]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('hold')
    expect(t.weightKg).toBe(70)
    expect(t.reason).toBe("Moved up to 70 kg — 3×8 didn't land yet")
  })

  it('names a weight the user dropped to rather than calling it a hold', () => {
    const w = [workout('0043', goodAt60), workout('0043', [set(10, 50), set(10, 50), set(10, 50)], 1)]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('hold')
    expect(t.weightKg).toBe(50)
    expect(t.reason).toBe('Back at 50 kg — build from here')
  })

  it('leaves the ordinary hold copy alone when the weight did not move', () => {
    const w = [workout('0043', goodAt60), workout('0043', [set(10, 60), set(9, 60), set(9, 60)], 1)]
    expect(nextTarget('0043', state({ workouts: w })).reason).toBe(
      'Holding — you got 10, 9, 9 last session',
    )
  })

  it('cannot compare with only one session, so the existing rules stand', () => {
    const t = nextTarget('0043', state({ workouts: [workout('0043', goodAt60)] }))
    expect(t.kind).toBe('advance')
    expect(t.weightKg).toBe(62.5)
  })

  it('still advances off a raised weight that hit every top', () => {
    const w = [workout('0043', goodAt60), workout('0043', [set(12, 65), set(12, 65), set(12, 65)], 1)]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('advance')
    expect(t.weightKg).toBe(67.5)
  })

  describe('the deload window', () => {
    it('does not fire when the latest session is the one that moved the weight', () => {
      const w = [workout('0043', missAt60), workout('0043', missAt70, 1)]
      const t = nextTarget('0043', state({ workouts: w }))
      expect(t.kind).toBe('hold')
      expect(t.weightKg).toBe(70)
    })

    it('does not fire when the session before it is the one that moved the weight', () => {
      const w = [
        workout('0043', goodAt60),
        workout('0043', missAt70, 1),
        workout('0043', missAt70, 2),
      ]
      const t = nextTarget('0043', state({ workouts: w }))
      expect(t.kind).toBe('hold')
      expect(t.weightKg).toBe(70)
    })

    it('fires once two settled sessions at the raised weight both fall short', () => {
      const w = [
        workout('0043', goodAt60),
        workout('0043', missAt70, 1),
        workout('0043', missAt70, 2),
        workout('0043', missAt70, 3),
      ]
      const t = nextTarget('0043', state({ workouts: w }))
      expect(t.kind).toBe('deload')
      expect(t.weightKg).toBe(67.5)
    })

    it('counts the two misses either side of a banked raise as one each, not two in a row', () => {
      const w = [
        workout('0043', missAt60),
        workout('0043', clearedAt65, 1),
        workout('0043', [set(7, 65), set(7, 65), set(12, 65)], 2),
      ]
      expect(nextTarget('0043', state({ workouts: w })).kind).toBe('hold')
    })

    it('still deloads after two missed sessions at a weight nobody moved', () => {
      const w = [workout('0043', missAt60), workout('0043', missAt60, 1)]
      const t = nextTarget('0043', state({ workouts: w }))
      expect(t.kind).toBe('deload')
      expect(t.weightKg).toBe(57.5)
    })
  })

  it('recomputes when the weight is corrected retroactively', () => {
    const raised = [workout('0043', goodAt60), workout('0043', clearedAt65, 1)]
    expect(nextTarget('0043', state({ workouts: raised })).reason).toBe(
      'Moved up to 65 kg — build back to 3×12',
    )
    // The same session with the mistyped 65s corrected back to 60: no move, ordinary hold.
    const corrected = [workout('0043', goodAt60), workout('0043', [set(9, 60), set(9, 60), set(8, 60)], 1)]
    expect(nextTarget('0043', state({ workouts: corrected })).reason).toBe(
      'Holding — you got 9, 9, 8 last session',
    )
  })

  it('follows the performed exercise across a mid-session swap, not the slot', () => {
    // The swapped session files its entry under the exercise actually performed, so the
    // slot's own history skips it and the comparison spans the sessions either side.
    const swapped = {
      ...workout('0043', [set(12, 80), set(12, 80), set(12, 80)], 1),
      entries: [{ exerciseId: '0314', swappedFrom: '0043', sets: [set(12, 80), set(12, 80), set(12, 80)] }],
    }
    const w = [workout('0043', goodAt60), swapped, workout('0043', clearedAt65, 2)]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.weightKg).toBe(65)
    expect(t.reason).toBe('Moved up to 65 kg — build back to 3×12')
  })
})

// The strict rule needs every prescribed set at repsMax. With three sets, set 3 lags set 1
// by two or three reps through fatigue, so 12-11-10 is a stall the scheme never escapes
// rather than a training failure. The tolerance is a rep per set, pooled across the
// prescription, and each set is clamped at repsMax before the sum.
describe('the advance tolerance', () => {
  const at = (...reps) => reps.map((r) => set(r, 60))

  it('advances a session within a rep per set of the prescription', () => {
    const t = nextTarget('0043', state({ workouts: [workout('0043', at(12, 11, 10))] }))
    expect(t.kind).toBe('advance')
    expect(t.weightKg).toBe(62.5)
    expect(t.reason).toBe(
      '12, 11, 10 @ 60 kg — within a rep of 3×12 across the board. Add 2.5 kg.',
    )
  })

  it('holds one rep short of the tolerance', () => {
    expect(nextTarget('0043', state({ workouts: [workout('0043', at(12, 11, 9))] })).kind).toBe('hold')
  })

  it('advances an even session that never touched the top of the range', () => {
    const t = nextTarget('0043', state({ workouts: [workout('0043', at(11, 11, 11))] }))
    expect(t.kind).toBe('advance')
    expect(t.weightKg).toBe(62.5)
  })

  it('holds a session sitting in the middle of the range', () => {
    expect(nextTarget('0043', state({ workouts: [workout('0043', at(10, 10, 10))] })).kind).toBe('hold')
  })

  it('clamps each set at the top of the range, so one heroic set cannot cover a collapse', () => {
    // 15 + 12 + 6 totals 33 raw, which would clear the tolerance. Clamped it is 30.
    expect(nextTarget('0043', state({ workouts: [workout('0043', at(15, 12, 6))] })).kind).toBe('hold')
  })

  it('leaves a strict all-tops advance saying what it always said', () => {
    const t = nextTarget('0043', state({ workouts: [workout('0043', at(12, 12, 12))] }))
    expect(t.kind).toBe('advance')
    expect(t.reason).toBe('Up 2.5 kg — you hit 3×12 last time')
  })

  it('scales the tolerance to the slot it was prescribed under', () => {
    const plan = { ...seedPlan, rotation: twoSlotRotation() }
    // The 4×10–15 slot: 15 + 14 + 14 + 13 is 56, a rep per set short of 60.
    const workouts = [
      { ...workout('0043', [set(15, 60), set(14, 60), set(14, 60), set(13, 60)]), rotationIndex: 1 },
    ]
    const t = nextTarget('0043', { plan, workouts, swaps: {}, customEx: [] }, 1)
    expect(t.kind).toBe('advance')
    expect(t.reason).toBe(
      '15, 14, 14, 13 @ 60 kg — within a rep of 4×15 across the board. Add 2.5 kg.',
    )
  })

  it('never advances off a set below the floor, however the total lands', () => {
    // repsMin and repsMax can be set equal in the Plan editor, and there 11-11-11 clears a
    // pooled tolerance of one rep per set while every set is a miss.
    const plan = { ...seedPlan, rotation: [{ name: 's', exercises: [entry('0043', { repsMin: 12, repsMax: 12 })] }] }
    const workouts = [workout('0043', at(11, 11, 11))]
    const t = nextTarget('0043', { plan, workouts, swaps: {}, customEx: [] })
    expect(t.kind).toBe('hold')
  })
})

// The logger does not require a weight before a set can be ticked, so a session can be real
// history and still carry no weight at all. Every branch has to answer null there. This used
// to fall back to the exWeights cache — the one case it could ever fire, since an exercise
// with no history returns before it — and handed back a number nothing had evidence for.
describe('a performed session with no weight on it', () => {
  const blank = [set(8, null), set(8, null), set(8, null)]
  const blankMiss = [set(4, null), set(4, null), set(4, null)]

  it('holds at no weight rather than inventing one', () => {
    const t = nextTarget('0043', state({ workouts: [workout('0043', blank)] }))
    expect(t.weightKg).toBeNull()
  })

  it('has nothing to deload from', () => {
    const w = [workout('0043', blankMiss), workout('0043', blankMiss, 1)]
    expect(nextTarget('0043', state({ workouts: w })).weightKg).toBeNull()
  })

  it('has nothing to advance from', () => {
    const w = [workout('0043', [set(12, null), set(12, null), set(12, null)])]
    expect(nextTarget('0043', state({ workouts: w })).weightKg).toBeNull()
  })
})

// The exemption above is for weights the USER moved to. It used to fire on any change of
// weight between adjacent sessions, which included the scheme's own advance — so every
// advance bought the exercise after it a third session before the deload, against the two
// the rule is written for. What the scheme asked for is now walked forward and compared.
describe('whose move the weight was', () => {
  const topAt60 = [set(12, 60), set(12, 60), set(12, 60)]
  const missAt = (kg) => [set(7, kg), set(7, kg), set(12, kg)]

  it('deloads after two short sessions at a weight the scheme itself advanced to', () => {
    const w = [
      workout('0043', topAt60),
      workout('0043', missAt(62.5), 1),
      workout('0043', missAt(62.5), 2),
    ]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('deload')
    expect(t.weightKg).toBe(60)
  })

  it('still holds through the same two sessions when the user picked the weight', () => {
    const w = [
      workout('0043', topAt60),
      workout('0043', missAt(70), 1),
      workout('0043', missAt(70), 2),
    ]
    expect(nextTarget('0043', state({ workouts: w })).kind).toBe('hold')
  })

  it('deloads again off a deload it prescribed and the user took', () => {
    const w = [
      workout('0043', missAt(60)),
      workout('0043', missAt(60), 1),
      workout('0043', missAt(57.5), 2),
      workout('0043', missAt(55), 3),
    ]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('deload')
    expect(t.weightKg).toBe(52.5)
  })

  it('does not exempt a stall at a weight the user declined to move off', () => {
    // 3×12 at 60 asked for 62.5 and the session stayed at 60. Staying put is not a move, and
    // falling short twice at a weight already cleared for 3×12 is the stall the rule is for.
    const w = [
      workout('0043', topAt60),
      workout('0043', missAt(60), 1),
      workout('0043', missAt(60), 2),
    ]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('deload')
    expect(t.weightKg).toBe(57.5)
  })

  it('does not credit the user with the advance the scheme prescribed', () => {
    const w = [
      workout('0043', topAt60),
      workout('0043', [set(10, 62.5), set(9, 62.5), set(9, 62.5)], 1),
    ]
    const t = nextTarget('0043', state({ workouts: w }))
    expect(t.kind).toBe('hold')
    expect(t.reason).toBe('Still at 62.5 kg — you moved up last session')
  })

  it('names the user’s own raise as theirs', () => {
    const w = [workout('0043', topAt60), workout('0043', [set(9, 65), set(9, 65), set(8, 65)], 1)]
    expect(nextTarget('0043', state({ workouts: w })).reason).toBe(
      'Moved up to 65 kg — build back to 3×12',
    )
  })
})
