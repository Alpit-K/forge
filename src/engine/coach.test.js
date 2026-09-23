import { describe, it, expect } from 'vitest'
import { recommend, nextSession } from './coach.js'
import { createInitialState } from '../lib/seed.js'

const local = (y, m, d, h = 9, min = 0) => new Date(y, m - 1, d, h, min)
const iso = (...args) => local(...args).toISOString()

// Mon 31 Aug 2026 begins the reference week. Default shape:
// Mon lift · Tue cardio · Wed lift · Thu rest · Fri lift · Sat cardio · Sun long.
const MON = [2026, 8, 31]
const TUE = [2026, 9, 1]
const WED = [2026, 9, 2]
const THU = [2026, 9, 3]
const SAT = [2026, 9, 5]
const SUN = [2026, 9, 6]

function state(overrides = {}) {
  return { ...createInitialState(), ...overrides }
}
const lift = (at, rotationIndex = 0) => ({ id: at, finishedAt: at, rotationIndex, entries: [] })
const run = (at, intensity = null, extra = {}) => ({ id: at, type: 'run', at, minutes: 30, intensity, ...extra })

describe('the shape decides the kind of day', () => {
  it('suggests a lift on a lift day', () => {
    const r = recommend(state(), local(...MON))
    expect(r.kind).toBe('lift')
    expect(r.planned).toBe('lift')
    expect(r.rotationIndex).toBe(0)
  })

  it('suggests cardio on a cardio day', () => {
    const r = recommend(state(), local(...TUE))
    expect(r.kind).toBe('cardio')
    expect(r.cardioKind).toBe('easy')
  })

  it('suggests the long run on the long day', () => {
    const r = recommend(state(), local(...SUN))
    expect(r.cardioKind).toBe('long')
  })

  it('rests on a rest day when the week is on track', () => {
    const workouts = [lift(iso(...MON)), lift(iso(...WED))]
    const activities = [run(iso(...TUE), 'easy')]
    const r = recommend(state({ workouts, activities }), local(...THU))
    expect(r.kind).toBe('rest')
    expect(r.reason).toContain('on track')
  })
})

describe('which lift', () => {
  it('picks the rotation slot left longest', () => {
    // Slots 0 and 1 done recently, slot 2 never — slot 2 is the one that is due.
    const workouts = [lift(iso(2026, 8, 26), 0), lift(iso(2026, 8, 28), 1)]
    const r = recommend(state({ workouts }), local(...MON))
    expect(r.kind).toBe('lift')
    expect(r.rotationIndex).toBe(2)
  })
})

describe('already trained today', () => {
  it('does not offer a second session', () => {
    const r = recommend(state({ workouts: [lift(iso(2026, 8, 31, 7, 0))] }), local(2026, 8, 31, 19, 0))
    expect(r.kind).toBe('rest')
    expect(r.detail).toBe('1 session logged')
  })

  it('counts an activity as having trained, not just a lift', () => {
    const r = recommend(state({ activities: [run(iso(2026, 9, 1, 7, 0))] }), local(2026, 9, 1, 19, 0))
    expect(r.kind).toBe('rest')
  })
})

describe('the recovery guard', () => {
  it('refuses a hard session the day after a hard one', () => {
    const activities = [
      run(iso(2026, 8, 30), 'hard'),
      run(iso(2026, 8, 29), 'easy'),
      run(iso(2026, 8, 28), 'easy'),
    ]
    const r = recommend(state({ activities }), local(...MON))
    // Monday is a lift day in the shape, so force the cardio branch via a cardio day. The
    // shape needs a fourth cardio day for that: with Monday's run banked, the seeded shape
    // leaves exactly two cardio days for the two still wanted and Tuesday is then spare.
    const settings = { ...createInitialState().settings, weekShape: ['lift', 'cardio', 'lift', 'cardio', 'lift', 'cardio', 'long'] }
    const tue = recommend(
      state({ activities: [...activities, run(iso(...MON), 'hard')], settings }),
      local(...TUE),
    )
    expect(tue.cardioKind).toBe('easy')
    expect(tue.reason).toContain('Hard session yesterday')
    expect(r.kind).toBe('lift')
  })

  it('downgrades a long run to easy after a hard session yesterday', () => {
    const activities = [run(iso(...SAT), 'hard')]
    const r = recommend(state({ activities }), local(...SUN))
    expect(r.cardioKind).toBe('easy')
    expect(r.reason).toContain('easy rather than long')
  })

  // Every rotation slot in the shipped plan contains a leg movement, so a guard that blocked
  // hard cardio for two days after any lift would leave no eligible day at all. A lift
  // yesterday must still allow a cardio suggestion — just not an interval one.
  it('still suggests cardio the day after a lift rather than blocking the day', () => {
    const r = recommend(state({ workouts: [lift(iso(...MON))] }), local(...TUE))
    expect(r.kind).toBe('cardio')
    expect(r.cardioKind).toBe('easy')
  })

  it('keeps cardio easy on a day something was already lifted', () => {
    // Lift logged today would normally short-circuit to rest, so test chooseCardio's own
    // path through a cardio day whose lift happened earlier the same morning.
    const r = recommend(state({ workouts: [lift(iso(2026, 9, 1, 7, 0))] }), local(2026, 9, 1, 18, 0))
    expect(r.kind).toBe('rest')
  })
})

describe('80/20 reads the rolling window, not week-to-date', () => {
  it('calls for easy when most recent tagged sessions were hard', () => {
    const activities = [
      run(iso(2026, 8, 27), 'hard'),
      run(iso(2026, 8, 29), 'hard'),
      run(iso(2026, 8, 30), 'easy'),
    ]
    const r = recommend(state({ activities }), local(...TUE))
    expect(r.cardioKind).toBe('easy')
    expect(r.reason).toMatch(/2 of your last 3 tagged sessions were hard/)
  })

  it('offers a hard session when the last seven days hold none', () => {
    const activities = [run(iso(2026, 8, 27), 'easy'), run(iso(2026, 8, 29), 'easy')]
    const r = recommend(state({ activities }), local(...TUE))
    expect(r.cardioKind).toBe('hard')
    expect(r.reason).toContain('last 7 days')
  })

  it('defaults to easy and says so when nothing is tagged', () => {
    const activities = [run(iso(2026, 8, 27)), run(iso(2026, 8, 29))]
    const r = recommend(state({ activities }), local(...TUE))
    expect(r.cardioKind).toBe('easy')
    expect(r.reason).toContain('Nothing tagged')
  })
})

describe('behind override', () => {
  it('offers a lift on a rest day when the week can no longer be finished', () => {
    // Thursday: 3 days left (Fri, Sat, Sun) and no lifts done. Not yet impossible.
    const onTrack = recommend(state(), local(...THU))
    expect(onTrack.kind).toBe('rest')

    // Saturday: 1 day left, 3 lifts short. Now it is.
    const behind = recommend(state({ settings: { ...createInitialState().settings, weekShape: ['lift', 'cardio', 'lift', 'rest', 'lift', 'rest', 'long'] } }), local(...SAT))
    expect(behind.kind).toBe('lift')
    expect(behind.reason).toContain('rest day')
  })

  it('swaps a lift day to cardio when the lift target is already met', () => {
    // Only lifts inside the current week count — Mon 31 Aug starts it, so a lift on 27 Aug
    // is last week's and does nothing for this week's target.
    const settings = { ...createInitialState().settings, weeklyLifts: 2 }
    const workouts = [lift(iso(...MON), 0), lift(iso(...TUE), 1)]
    // Wednesday is a lift day in the shape, but the two lifts are already banked and no
    // cardio has happened, so the scarcer thing wins over the shape.
    const r = recommend(state({ workouts, settings }), local(...WED))
    expect(r.kind).toBe('cardio')
    expect(r.reason).toBeTruthy()
  })
})

describe('shape robustness', () => {
  it('treats a missing shape as rest rather than throwing', () => {
    const s = state()
    delete s.settings.weekShape
    const r = recommend(s, local(...MON))
    expect(r.planned).toBe('rest')
    expect(r.kind).toBeTruthy()
  })

  it('always carries both windows for the caller to render', () => {
    const r = recommend(state(), local(...TUE))
    expect(r.week).toBeTruthy()
    expect(r.rolling).toBeTruthy()
  })
})

const shapeAllLift = { ...createInitialState().settings, weekShape: Array(7).fill('lift') }

describe('a lift suggestion explains which slot and why', () => {
  it('says a slot has never been trained rather than inventing a gap', () => {
    const r = recommend(
      state({ workouts: [lift(iso(...TUE), 0), lift(iso(...MON), 1)], settings: shapeAllLift }),
      local(...WED),
    )
    expect(r.kind).toBe('lift')
    // Slot 2 has no history at all, so it wins outright.
    expect(r.rotationIndex).toBe(2)
    expect(r.detail).toContain('not trained yet')
  })

  it('counts the days since the chosen slot was last trained', () => {
    const r = recommend(
      state({
        workouts: [lift(iso(...MON), 0), lift(iso(...TUE), 1), lift(iso(...WED), 2)],
        settings: { ...shapeAllLift, weeklyLifts: 5 },
      }),
      local(...THU),
    )
    // Monday is the oldest of the three, three days before Thursday.
    expect(r.rotationIndex).toBe(0)
    expect(r.detail).toContain('3 days ago')
  })
})

describe('a rest card reports what happened, not what is missing', () => {
  it('says what was already logged today', () => {
    const r = recommend(state({ workouts: [lift(iso(...THU))] }), local(2026, 9, 3, 18, 0))
    expect(r.kind).toBe('rest')
    expect(r.detail).toContain('1 session')
  })

  it('sums the week on a quiet rest day instead of leaving it blank', () => {
    const r = recommend(state({ workouts: [lift(iso(...MON)), lift(iso(...WED))] }), local(...THU))
    expect(r.kind).toBe('rest')
    expect(r.detail).toContain('2 lifts')
  })
})

describe('nextSession looks ahead', () => {
  // Wednesday is a lift day in the default shape, so Tuesday's answer is one day out.
  it('returns the next training day and how far off it is', () => {
    const next = nextSession(state(), local(...TUE))
    expect(next.days).toBe(1)
    expect(next.rec.kind).toBe('lift')
  })

  // Thursday is rest in the shape, so the walk has to step over it to Friday rather than
  // stopping at the first day and reporting nothing.
  it('steps over rest days rather than stopping on one', () => {
    const next = nextSession(state(), local(...WED))
    expect(next.days).toBe(2)
    expect(next.rec.kind).toBe('lift')
  })

  // Tuesday is a cardio day: the preview is not lifting-only.
  it('returns a cardio day when that is what is next', () => {
    const next = nextSession(state(), local(...MON))
    expect(next.days).toBe(1)
    expect(next.rec.kind).toBe('cardio')
  })

  // Nothing to look forward to is null, not an empty card.
  it('returns null when the whole week ahead is rest', () => {
    const settings = { ...createInitialState().settings, weekShape: Array(7).fill('rest'), weeklyLifts: 0, weeklyCardio: 0 }
    expect(nextSession(state({ settings }), local(...MON))).toBe(null)
  })
})

// Every guard here measures a gap backwards from now, so an item dated ahead of now makes
// that gap negative — which clears the same tests a session today or yesterday would, and
// says so in the reason line about something that has not happened.
describe('a session dated in the future', () => {
  it('does not count as recovery the week has already spent', () => {
    // Tomorrow's hard run, read as today's, would answer the guard with "Hard session
    // yesterday — keep this one easy." Ignored, the day is untagged and says so.
    const activities = [run(iso(...WED), 'hard')]
    const r = recommend(state({ activities }), local(...TUE))
    expect(r.reason).toBe('Nothing tagged easy or hard yet — starting you easy.')
  })

  it('does not stand in for a lift that has not happened', () => {
    const workouts = [lift(iso(...WED))]
    const r = recommend(state({ workouts }), local(...TUE))
    expect(r.reason).not.toContain('-1')
  })
})

// The comparison excludes today on purpose — the question is whether what is left fits in
// the days after this one. The sentence has to count today back in, since it is asking to
// spend it, and "1 days" is not a sentence.
describe('the rest-day override says how long is left', () => {
  it('counts today in the days it offers', () => {
    // Thursday is the rest day in the seeded shape. Nothing lifted, four wanted, and three
    // days after this one — so the week no longer fits without spending today.
    const settings = { ...createInitialState().settings, weeklyLifts: 4, weeklyCardio: 0 }
    const r = recommend(state({ settings }), local(...THU))
    expect(r.reason).toBe('Your rest day, but 4 lifts left and 4 days to do them.')
  })

  it('says one lift and one day rather than 1 lifts and 0 days', () => {
    const settings = { ...createInitialState().settings, weeklyLifts: 1, weeklyCardio: 0 }
    const shape = [...settings.weekShape]
    shape[6] = 'rest'
    const r = recommend(state({ settings: { ...settings, weekShape: shape } }), local(...SUN))
    expect(r.reason).toBe('Your rest day, but 1 lift left and 1 day to do them.')
  })
})

// A weekly target is a count, not a set of appointments — so a session done early is not
// also owed on the day the shape happened to put it. Without the look-ahead the card asks
// for one session more than the week wants, and the block shape is where it shows: three
// cardio days and a target of three leave no slack to absorb a run moved a day earlier.
describe('a shortfall the days ahead already cover', () => {
  // Mon lift · Tue cardio · Wed lift · Thu cardio · Fri rest · Sat long · Sun lift
  const BLOCK = ['lift', 'cardio', 'lift', 'cardio', 'rest', 'long', 'lift']
  const withShape = (overrides = {}) => ({ ...createInitialState().settings, weekShape: BLOCK, ...overrides })

  it('spends a cardio day on the lifts when only they are still scarce', () => {
    // Thursday's run was done on Wednesday. One cardio left and Saturday's long run for it,
    // against two lifts and only Sunday — so the scarce thing takes the day.
    const workouts = [lift(iso(...MON))]
    const activities = [run(iso(...TUE), 'easy'), run(iso(...WED), 'easy')]
    const r = recommend(state({ workouts, activities, settings: withShape() }), local(...THU))
    expect(r.kind).toBe('lift')
    expect(r.reason).toBe('1 cardio left and 1 day still shaped for it — lift today instead.')
  })

  it('hands the day back when nothing else is short either', () => {
    const workouts = [lift(iso(...MON))]
    const activities = [run(iso(...TUE), 'easy'), run(iso(...WED), 'easy')]
    const settings = withShape({ weeklyLifts: 1 })
    const r = recommend(state({ workouts, activities, settings }), local(...THU))
    expect(r.kind).toBe('rest')
    expect(r.reason).toBe('1 cardio left and 1 day still shaped for it — today is spare.')
  })

  it('applies the same rule to a lift moved a day earlier', () => {
    // Wednesday's lift was done on Tuesday. Sunday covers the one still owed; the cardio
    // target does not fit in the two cardio days left, so Wednesday goes to cardio.
    const workouts = [lift(iso(...MON), 0), lift(iso(...TUE), 1)]
    const r = recommend(state({ workouts, settings: withShape() }), local(...WED))
    expect(r.kind).toBe('cardio')
    expect(r.reason).toBe('1 lift left and 1 day still shaped for it — cardio today instead.')
  })

  it('still asks for the session when the days ahead do not cover it', () => {
    // Nothing logged: three cardio wanted and only Thursday, Saturday and today hold them.
    const r = recommend(state({ settings: withShape() }), local(...TUE))
    expect(r.kind).toBe('cardio')
  })
})
