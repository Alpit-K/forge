import { getExercise } from '../lib/exercises.js'

// Sets per muscle group — the coverage table block 2 was designed from, which was counted by
// hand from an export. What a plan prescribes a week, and the coverage sheet's two sides:
// what the logs hold and what the plan gives a block. Pure; nothing here writes anything or
// feeds progression.

// The groups, in the order the block-2 coverage table used. A set counts once, DIRECT, to the
// group of the exercise's target, and once, INDIRECT, to each other group its secondary
// muscles reach — "triceps: 3, plus every press". Muscles outside these groups (forearms,
// hip flexors, lower back) are not counted, because no plan decision has ever turned on them.
export const MUSCLE_GROUPS = ['Quads', 'Hamstrings & glutes', 'Chest', 'Back', 'Shoulders', 'Triceps', 'Biceps', 'Calves', 'Core']

const GROUP_OF = {
  quads: 'Quads',
  quadriceps: 'Quads',
  hamstrings: 'Hamstrings & glutes',
  glutes: 'Hamstrings & glutes',
  adductors: 'Hamstrings & glutes',
  pectorals: 'Chest',
  chest: 'Chest',
  'upper chest': 'Chest',
  lats: 'Back',
  'latissimus dorsi': 'Back',
  'upper back': 'Back',
  back: 'Back',
  rhomboids: 'Back',
  traps: 'Back',
  trapezius: 'Back',
  spine: 'Back',
  delts: 'Shoulders',
  deltoids: 'Shoulders',
  shoulders: 'Shoulders',
  'rear deltoids': 'Shoulders',
  triceps: 'Triceps',
  biceps: 'Biceps',
  calves: 'Calves',
  soleus: 'Calves',
  abs: 'Core',
  core: 'Core',
  obliques: 'Core',
  'lower abs': 'Core',
}

// The dataset targets the squat, the leg press and the deadlift all at `glutes`, so by target
// alone a squat-and-leg-press block has no quad work at all. The first secondary muscle is
// what separates them — quadriceps on the knee-dominant lifts, hamstrings on the hinges — and
// it is the split the coverage table was drawn with.
function directGroup(ex) {
  if (ex.target === 'glutes' && ex.secondary && ex.secondary[0] === 'quadriceps') return 'Quads'
  return GROUP_OF[ex.target] || null
}

// { direct, indirect } groups for one exercise, or null for one with no target — a custom
// exercise carries none, and guessing from its body part would be a number with no source.
export function muscleGroupsOf(ex) {
  if (!ex) return null
  const direct = directGroup(ex)
  if (!direct) return null
  const indirect = new Set()
  for (const m of ex.secondary || []) {
    const g = GROUP_OF[m]
    if (g && g !== direct) indirect.add(g)
  }
  return { direct, indirect: [...indirect] }
}

function emptyTally() {
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, { direct: 0, indirect: 0 }]))
}

function add(tally, ex, sets) {
  const groups = muscleGroupsOf(ex)
  if (!groups) return
  tally[groups.direct].direct += sets
  for (const g of groups.indirect) tally[g].indirect += sets
}

const perWeek = (n) => Math.round(n * 10) / 10

function scale(tally, factor) {
  return MUSCLE_GROUPS.map((group) => ({
    group,
    direct: perWeek(tally[group].direct * factor),
    indirect: perWeek(tally[group].indirect * factor),
  }))
}

// What the plan prescribes. The rotation is walked in turn, so a week holds `weeklyLifts`
// sessions out of `rotation.length`: the seeded three-day plan at three lifts a week is each
// day once. A permanent swap counts as the exercise it swaps to, as the workout would.
export function plannedSetsPerWeek(plan, swaps, customEx, weeklyLifts) {
  const tally = emptyTally()
  for (const day of plan.rotation) {
    for (const e of day.exercises) {
      add(tally, getExercise(swaps[e.exerciseId] || e.exerciseId, customEx), e.sets)
    }
  }
  return scale(tally, plan.rotation.length ? weeklyLifts / plan.rotation.length : 0)
}

// The coverage sheet's two sides. Direct sets only, the way the block notes count them, and
// each group remembers which exercises filled it, so a tap on a muscle can say what to add.

// What the logs hold: completed sets per group, and how many sessions each exercise was
// done in. An entry with nothing ticked was in the workout and never performed — no sets,
// and not listed either.
export function coverageDone(workouts, customEx) {
  const out = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, { sets: 0, exercises: new Map() }]))
  for (const w of workouts) {
    for (const e of w.entries) {
      const done = e.sets.filter((s) => s && s.done).length
      const groups = done > 0 ? muscleGroupsOf(getExercise(e.exerciseId, customEx)) : null
      if (!groups) continue
      const row = out[groups.direct]
      row.sets += done
      const x = row.exercises.get(e.exerciseId) || { exerciseId: e.exerciseId, sessions: 0 }
      x.sessions += 1
      row.exercises.set(e.exerciseId, x)
    }
  }
  return out
}

// What the current plan gives a whole block: each day is trained sessionCount / days times.
// A permanent swap counts as the exercise swapped to, as the workout would.
export function coveragePlanned(plan, swaps, customEx) {
  const perDay = plan.rotation.length ? plan.sessionCount / plan.rotation.length : 0
  const out = Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, { sets: 0, exercises: new Map() }]))
  for (const day of plan.rotation) {
    for (const e of day.exercises) {
      const id = swaps[e.exerciseId] || e.exerciseId
      const groups = muscleGroupsOf(getExercise(id, customEx))
      if (!groups) continue
      const row = out[groups.direct]
      row.sets += e.sets * perDay
      const x = row.exercises.get(id) || { exerciseId: id, days: [], sessions: 0 }
      x.days.push(day.name)
      x.sessions += perDay
      row.exercises.set(id, x)
    }
  }
  return out
}

// What the plan would have given a group by now: its block's sets scaled to the sessions
// done, never past the whole block. One whole number, because it is printed beside the bar
// and the shade it drives — a fraction rounded for the label alone would let the three
// disagree.
export function coverageDue(plannedSets, sessions, sessionCount) {
  return Math.round(plannedSets * Math.min(1, sessions / sessionCount))
}

// Sets per week for each group, where there is no plan to measure against — an earlier
// block, or all time. A total would grow with the window and a bar against the busiest group
// can never fill for the rest, so the figure is a rate, in the same unit the plan is written
// in. The span runs from the first session's start to the last one's finish and is never
// less than a week, so a fortnight's training is not read as double its real rate. The body
// is shaded from these same figures, so the drawing and the list cannot disagree.
export function coverageRates(done, workouts) {
  const weeks = workouts.length
    ? Math.max(1, (Date.parse(workouts[workouts.length - 1].finishedAt) - Date.parse(workouts[0].startedAt)) / (7 * 24 * 3600 * 1000))
    : 1
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, Math.round((done[g].sets / weeks) * 10) / 10]))
}

// Shade step 0–4 for one group. In the current block `due` is what the plan would have
// given by now, and the step says how close the group is to it — a group trained with
// nothing due, off plan, is over it. Anywhere else there is no plan to compare against, so
// the step is relative to the most-trained group.
export function coverageLevel({ done, due, max }) {
  if (done === 0) return 0
  if (due != null) {
    const r = due === 0 ? Infinity : done / due
    return r >= 1 ? 4 : r >= 0.75 ? 3 : r >= 0.5 ? 2 : 1
  }
  return Math.max(1, Math.min(4, Math.ceil((done / max) * 4)))
}

// Every group's shade step, from the same figures the list prints: sets per week where there
// is no plan (`rates`), sets done against planned-by-now where there is one (`due`). Passing
// raw totals in place of the rates would let the drawing and the list disagree.
export function coverageLevels({ done, due, rates }) {
  if (rates) {
    const max = Math.max(...MUSCLE_GROUPS.map((g) => rates[g]))
    return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, coverageLevel({ done: rates[g], due: null, max })]))
  }
  return Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, coverageLevel({ done: done[g].sets, due: due[g] })]))
}
