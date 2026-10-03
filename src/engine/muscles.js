import { getExercise } from '../lib/exercises.js'

// Sets per muscle group per week — the coverage table block 2 was designed from, which was
// counted by hand from an export. Two readings of one rule: what a plan prescribes, and what
// a block actually logged. Pure; nothing here writes anything or feeds progression.

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

// What a block's logs actually hold: completed sets only, filed under the exercise performed.
// The week count runs from the first session's start to the last one's finish, and is never
// less than one, so a block trained in a fortnight is not read as double its real rate.
export function loggedSetsPerWeek(workouts, customEx) {
  if (workouts.length === 0) return null
  const tally = emptyTally()
  for (const w of workouts) {
    for (const e of w.entries) {
      const done = e.sets.filter((s) => s && s.done).length
      if (done > 0) add(tally, getExercise(e.exerciseId, customEx), done)
    }
  }
  const first = Date.parse(workouts[0].startedAt)
  const last = Date.parse(workouts[workouts.length - 1].finishedAt)
  const weeks = Math.max(1, (last - first) / (7 * 24 * 3600 * 1000))
  return scale(tally, 1 / weeks)
}
