import { getExercise } from '../lib/exercises.js'

// Double progression. Pure function of logged history plus the template. No stored state,
// no counters.

export const FIRST_REASON = "First time — enter the weight you're lifting"
export const DELOAD_REASON = 'Deload 5% — two sessions short of target'

// An explicit per-exercise increment wins, else dumbbell steps in 2 kg, else 2.5 kg.
export function incrementFor(template, equipment) {
  if (template && template.incrementKg != null) return template.incrementKg
  if (equipment === 'dumbbell') return 2
  return 2.5
}

// Round to the nearest multiple of the exercise's own increment.
export function roundToIncrement(weight, increment) {
  const steps = Math.round(weight / increment)
  return Math.round(steps * increment * 100) / 100
}

// Classify a single logged set against the prescribed rep range.
export function classifySet(set, repsMin, repsMax) {
  if (!set || !set.done) return 'miss'
  if (set.reps >= repsMax) return 'top'
  if (set.reps >= repsMin) return 'partial'
  return 'miss'
}

// Classify every prescribed set; a missing set counts as a miss.
export function classifySession(entry, repsMin, repsMax, prescribed) {
  const sets = entry && entry.sets ? entry.sets : []
  const statuses = []
  for (let i = 0; i < prescribed; i++) statuses.push(classifySet(sets[i], repsMin, repsMax))
  return statuses
}

// A session is "missed" when more than half its prescribed sets are misses.
export function isMissedSession(entry, repsMin, repsMax, prescribed) {
  const statuses = classifySession(entry, repsMin, repsMax, prescribed)
  const misses = statuses.filter((s) => s === 'miss').length
  return misses > prescribed / 2
}

// The working weight the user actually lifted last session, for a given exercise entry.
// The HEAVIEST completed set, not the last one: sets added mid-workout are often back-off
// sets, and taking the last would hand a lighter drop set back as next session's base.
// Null when nothing was ticked — identical to heaviestDone() in session.js, which is the
// point. An untouched entry has no working weight; reading the app's own prefill back as
// though it had been lifted is what deloaded exercises off weights that were never on a bar.
export function workingWeight(entry) {
  if (!entry || !entry.sets) return null
  let best = null
  for (const s of entry.sets) {
    if (s && s.done && s.weightKg != null && (best == null || s.weightKg > best)) best = s.weightKg
  }
  return best
}

export function findTemplateEntry(plan, exerciseId, rotationIndex = null) {
  if (rotationIndex != null) {
    const session = plan.rotation[rotationIndex]
    const entry = session && session.exercises.find((e) => e.exerciseId === exerciseId)
    if (entry) return entry
  }
  for (const session of plan.rotation) {
    const entry = session.exercises.find((e) => e.exerciseId === exerciseId)
    if (entry) return entry
  }
  return null
}

// Which plan slot, if any, currently resolves to this exercise — the reverse of the swap
// lookup nextTarget does internally. A slot's id and the exercise actually performed differ
// whenever a permanent swap is in place, so an exercise opened from the Library cannot find
// its own target by looking itself up in the rotation.
export function findSlotFor(plan, swaps, exerciseId) {
  for (let ri = 0; ri < plan.rotation.length; ri += 1) {
    const entry = plan.rotation[ri].exercises.find(
      (e) => (swaps[e.exerciseId] || e.exerciseId) === exerciseId,
    )
    if (entry) return { slotId: entry.exerciseId, rotationIndex: ri }
  }
  return null
}

// Sessions that are evidence for this exercise, oldest first. An entry with nothing ticked
// is dropped — the same rule and the same reason as exerciseHistory() in session.js. The
// exercise was in the workout and never performed, which is a plan, not a performance:
// classifySession would read it as every set missed, and workingWeight would hand back the
// weight the app itself prefilled as though it had been lifted.
function relevantWorkouts(exerciseId, workouts) {
  return workouts.filter((w) => {
    const entry = w.entries && w.entries.find((e) => e.exerciseId === exerciseId)
    return Boolean(entry && entry.sets && entry.sets.some((s) => s && s.done))
  })
}

// One session's entry for an exercise, by index into its filtered history.
function entryAt(history, index, exerciseId) {
  if (index < 0 || index >= history.length) return null
  return history[index].entries.find((e) => e.exerciseId === exerciseId) || null
}

// The working weight of one session in an exercise's filtered history, by index.
function weightAt(history, index, exerciseId) {
  return workingWeight(entryAt(history, index, exerciseId))
}

// The reps of the PRESCRIBED sets only, null where a set was not done. A set added
// mid-workout is outside this window, so an extra back-off set is volume that can neither
// trigger nor block an advance.
function prescribedRepsOf(entry, prescribed) {
  return Array.from({ length: prescribed }, (_, i) => {
    const s = entry && entry.sets ? entry.sets[i] : null
    return s && s.done ? s.reps : null
  })
}

// The advance rule — every set at the top of the range — loosened by a rep per set pooled
// across the prescription. With three sets, set 3 lags set 1 by two or three reps through
// fatigue, so under the strict rule 12-11-10 is a stall the scheme never escapes rather
// than a training failure. Two guards:
//
//   - Each set is CLAMPED at repsMax before the sum, or one heroic 15 covers a collapsed
//     6 and the back-off sets stop counting for anything.
//   - A set below repsMin blocks it outright. repsMin and repsMax can be set equal in the
//     Plan editor, and at 12–12 a pooled tolerance is cleared by 11-11-11 — every set a
//     miss. The floor is the rule; the tolerance only ever bends the ceiling.
function earnsAdvance(entry, repsMin, repsMax, prescribed) {
  const statuses = classifySession(entry, repsMin, repsMax, prescribed)
  const allTop = statuses.length === prescribed && statuses.every((s) => s === 'top')
  const reps = prescribedRepsOf(entry, prescribed)
  const clampedTotal = reps.reduce((sum, r) => sum + (r == null ? 0 : Math.min(r, repsMax)), 0)
  const withinOneRep =
    clampedTotal >= prescribed * (repsMax - 1) && !statuses.some((s) => s === 'miss')
  return { statuses, allTop, withinOneRep, reps, earned: allTop || withinOneRep }
}

// 5% off, never rounding back onto the weight you were already lifting.
function deloadFrom(base, increment) {
  const deload = roundToIncrement(base * 0.95, increment)
  return deload >= base ? roundToIncrement(base - increment, increment) : deload
}

// What the scheme asks for after the session at `index`. This is the whole of the
// progression decision and it lives here once on purpose: the walk below applies it to
// every past session to work out which weights the user chose for themselves, and the
// answer nextTarget returns is one more call of it. A second copy of these rules would
// drift from this one invisibly.
function stepAfter(history, index, exerciseId, rules, userMoved) {
  const { repsMin, repsMax, prescribed, increment } = rules
  const entry = entryAt(history, index, exerciseId)
  const base = workingWeight(entry)
  if (base == null) return { kind: 'hold', weightKg: null, base: null, entry }

  const advance = earnsAdvance(entry, repsMin, repsMax, prescribed)
  if (advance.earned) {
    return {
      kind: 'advance',
      weightKg: roundToIncrement(base + increment, increment),
      base,
      entry,
      advance,
    }
  }

  // Two missed sessions in a row, neither of them performed at a weight the user moved to. A
  // session at a self-chosen weight is not evidence of a stall — the reps fell short of a
  // number they picked, not one the scheme prescribed — so it settles neither side of the
  // window. That is all the exemption does: the weight itself is never reverted.
  const missed = (i) => isMissedSession(entryAt(history, i, exerciseId), repsMin, repsMax, prescribed)
  if (index >= 1 && !userMoved[index] && !userMoved[index - 1] && missed(index) && missed(index - 1)) {
    return { kind: 'deload', weightKg: deloadFrom(base, increment), base, entry }
  }

  return { kind: 'hold', weightKg: base, base, entry, advance }
}

// Which sessions were performed at a weight the USER moved to. Two things have to be true:
// the weight moved from the session before, and it did not move to the number the scheme
// asked for. classifySet reads reps alone, so the weight on the bar is invisible to it, and
// this is the only thing that tells the two kinds of move apart.
//
// Both halves are load-bearing. Without the second, the scheme's own advance reads as the
// user's move and exempts the session after it from the deload window, which bought a
// genuinely stalling exercise a third session before the drop against the two the rule is
// written for. Without the first, declining a prescribed advance — staying at a weight
// rather than moving to one — would count too, and a stall at a weight the scheme had
// already prescribed and seen cleared is exactly the stall it exists to catch.
//
// It has to be a walk rather than a comparison against the session before, because what the
// scheme asked for is itself a function of everything earlier. One forward pass is enough:
// a session's prescription depends only on the sessions before it, and so does the exemption
// each of those carries.
function userMovedWeights(history, exerciseId, rules) {
  const moved = history.map(() => false)
  for (let i = 1; i < history.length; i += 1) {
    const asked = stepAfter(history, i - 1, exerciseId, rules, moved).weightKg
    const lifted = weightAt(history, i, exerciseId)
    const before = weightAt(history, i - 1, exerciseId)
    moved[i] = lifted != null && before != null && lifted !== before && lifted !== asked
  }
  return moved
}

// The progression decision against an explicit prescription, for the exercise actually
// performed. nextTarget reads that prescription out of the plan; a mid-workout swap
// carries the slot's own and has no template of its own to look up, so the history half
// lives here and both callers share it rather than keeping a second copy of the decision.
export function targetFor(exerciseId, rules, workouts = []) {
  const { repsMin, repsMax, prescribed, increment } = rules

  const history = relevantWorkouts(exerciseId, workouts)
  if (history.length === 0) {
    return { weightKg: null, repsMin, repsMax, kind: 'first', reason: FIRST_REASON, increment }
  }

  const userMoved = userMovedWeights(history, exerciseId, rules)
  const lastIdx = history.length - 1
  const outcome = stepAfter(history, lastIdx, exerciseId, rules, userMoved)

  // lastSets is display only — the logger shows what you actually did last time for every
  // kind of target, and a deload is the one you most want the evidence for.
  const latestEntry = outcome.entry
  const base = outcome.base
  const lastSets = latestEntry ? latestEntry.sets : []
  const target = { weightKg: outcome.weightKg, repsMin, repsMax, increment, lastSets }

  if (outcome.kind === 'deload') {
    return { ...target, kind: 'deload', reason: DELOAD_REASON }
  }

  if (outcome.kind === 'advance') {
    const { allTop, reps } = outcome.advance
    return {
      ...target,
      kind: 'advance',
      // The strict case says what it always said. The tolerance case has to state the
      // arithmetic instead: "you hit 3×12" is a lie about a session that did not.
      reason: allTop
        ? `Up ${increment} kg — you hit ${prescribed}×${repsMax} last time`
        : `${reps.map((r) => (r == null ? '—' : r)).join(', ')} @ ${base} kg — within a rep of ${prescribed}×${repsMax} across the board. Add ${increment} kg.`,
    }
  }

  // The target is the heaviest completed set however the weight got there. Only the sentence
  // changes, and it turns on WHOSE move it was: "holding" after the user moved the weight
  // themselves reads as "you did not progress" when the opposite happened, while claiming
  // they moved up after the scheme's own advance credits them with a decision it made.
  const prevWeight = weightAt(history, lastIdx - 1, exerciseId)
  const moved = base != null && prevWeight != null ? base - prevWeight : 0
  const repsList = lastSets.map((s) => (s && s.done ? s.reps : '—')).join(', ')

  let reason
  if (base == null) reason = FIRST_REASON
  else if (moved > 0 && userMoved[lastIdx]) {
    reason = outcome.advance.statuses.some((s) => s === 'miss')
      ? `Moved up to ${base} kg — ${prescribed}×${repsMin} didn't land yet`
      : `Moved up to ${base} kg — build back to ${prescribed}×${repsMax}`
  } else if (moved > 0) reason = `Still at ${base} kg — you moved up last session`
  else if (moved < 0) reason = `Back at ${base} kg — build from here`
  else reason = `Holding — you got ${repsList || 'fewer reps'} last session`

  return { ...target, kind: 'hold', reason }
}

// Compute the next target for a plan slot. `exerciseId` is the plan's slot id; a
// permanent swap is resolved internally. `rotationIndex` picks the prescription
// when the same exercise is slotted into more than one session with different rep ranges.
export function nextTarget(exerciseId, state, rotationIndex = null) {
  const { plan, workouts = [], swaps = {}, customEx = [] } = state
  const effectiveId = swaps[exerciseId] || exerciseId
  const template = findTemplateEntry(plan, exerciseId, rotationIndex)
  if (!template) return null

  const ex = getExercise(effectiveId, customEx)
  const rules = {
    repsMin: template.repsMin,
    repsMax: template.repsMax,
    prescribed: template.sets,
    increment: incrementFor(template, ex && ex.equipment),
  }
  return targetFor(effectiveId, rules, workouts)
}
