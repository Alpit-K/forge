// Pure session mechanics: building a WorkoutLog, finishing, block completion, and the
// summary numbers. No stored state, no counters.

export function buildWorkoutLog(active, finishedAt) {
  return {
    id: active.id,
    startedAt: active.startedAt,
    finishedAt,
    blockIndex: active.blockIndex,
    sessionIndex: active.sessionIndex,
    rotationIndex: active.rotationIndex,
    freeform: active.freeform,
    templateName: active.templateName,
    entries: active.exercises.map((ex) => ({
      exerciseId: ex.exerciseId,
      swappedFrom: ex.swappedFrom || null,
      sets: ex.performed.map((s) => ({ reps: s.reps, weightKg: s.weightKg, done: s.done })),
    })),
  }
}

// Σ (reps × weight) over completed sets only.
export function totalVolume(entries) {
  let volume = 0
  for (const e of entries) {
    for (const s of e.sets) {
      if (s.done) volume += (s.reps || 0) * (s.weightKg || 0)
    }
  }
  return volume
}

export function setsCompleted(entries) {
  return entries.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0)
}

export function durationSeconds(startedAt, finishedAt) {
  const start = Date.parse(startedAt)
  const end = Date.parse(finishedAt)
  if (Number.isNaN(start) || Number.isNaN(end)) return 0
  return Math.max(0, Math.round((end - start) / 1000))
}

// sessionIndex advances ONLY on finishing. Reaching sessionCount means the block is
// complete; continuing is a separate, explicit step.
export function advanceProgress(progress) {
  return { blockIndex: progress.blockIndex, sessionIndex: progress.sessionIndex + 1 }
}

export function continueBlock(progress) {
  return { blockIndex: progress.blockIndex + 1, sessionIndex: 0 }
}

// How far into the block you are, counted from the logs themselves rather than from
// progress.sessionIndex — deleting a session in History removes the log and leaves the
// counter alone, so the stored number runs ahead of what happened and never comes back.
// Counting is the same rule as progression's: history is the only thing that knows.
// A freeform workout is a full member of the block and counts here like any other.
export function sessionsDone(workouts, blockIndex) {
  return workouts.filter((w) => w.blockIndex === blockIndex).length
}

export function isBlockComplete(done, sessionCount) {
  return done >= sessionCount
}

// The most recent finish date per rotation slot, for the session picker. Logs written before
// the rotation was choosable have no rotationIndex; for those it was sessionIndex % length.
export function lastDoneByRotation(workouts, rotationCount) {
  const last = new Array(rotationCount).fill(null)
  for (const w of workouts) {
    if (w.freeform) continue
    const idx = w.rotationIndex ?? w.sessionIndex % rotationCount
    if (idx < 0 || idx >= rotationCount || !w.finishedAt) continue
    if (last[idx] == null || w.finishedAt > last[idx]) last[idx] = w.finishedAt
  }
  return last
}

// The heaviest completed set in a list. The session's working weight — see workingWeight()
// in the progression engine, which this deliberately matches.
export function heaviestDone(sets) {
  let best = null
  for (const s of sets || []) {
    if (s && s.done && s.weightKg != null && (best == null || s.weightKg > best)) best = s.weightKg
  }
  return best
}

// What a plan slot recorded in a finished log. Two spellings have to be checked: normally
// the entry sits under the slot's effective id, but a mid-session swap rewrites that id to
// the exercise actually performed and names the slot in `swappedFrom`.
//
// `swapped` is reported rather than hidden because the caller cannot compare across it — the
// slot reverts to its original exercise next session, so the difference between what was
// lifted and what is next is a difference between two different lifts, which is not a number.
export function slotResult(log, slotId, effectiveId) {
  const entry = log.entries.find((e) => e.exerciseId === effectiveId || e.swappedFrom === slotId)
  if (!entry) return null
  return { weightKg: heaviestDone(entry.sets), swapped: Boolean(entry.swappedFrom) }
}

// Every session that logged real work for one exercise, oldest first. Sessions where the
// exercise was present but nothing was ticked are dropped: an entry with no completed set
// is a plan, not a performance, and putting it on a trend line draws a hole in the chart.
//
// `topWeight` is the HEAVIEST completed set, matching workingWeight() in the progression
// engine and heaviestDone() below. Every number in the app that claims to be "the weight
// you did" has to agree, or the trend line in one screen contradicts the target in another.
export function exerciseHistory(workouts, exerciseId) {
  const out = []
  for (const w of workouts) {
    const entry = w.entries.find((e) => e.exerciseId === exerciseId)
    if (!entry) continue
    const done = entry.sets.filter((s) => s && s.done)
    if (done.length === 0) continue
    out.push({
      at: w.finishedAt,
      templateName: w.templateName,
      sets: done,
      topWeight: heaviestDone(entry.sets),
    })
  }
  return out
}

// The quiet performance facts, from the history above. No badges and no thresholds — these
// are recorded numbers, and `best` is simply the heaviest completed set there has ever been.
// A tie keeps the FIRST one: the earliest date you reached a weight is the true answer to
// "when did I first do this", and re-hitting it should not silently reset the record.
export function exerciseStats(history) {
  if (history.length === 0) return null
  const first = history[0].topWeight
  const latest = history[history.length - 1].topWeight
  let best = null
  for (const session of history) {
    for (const set of session.sets) {
      if (set.weightKg == null) continue
      if (best === null || set.weightKg > best.weightKg) {
        best = { weightKg: set.weightKg, reps: set.reps, at: session.at }
      }
    }
  }
  return {
    sessions: history.length,
    first,
    latest,
    // Null rather than 0 on a single session: there is no change to report yet, and a "0 kg"
    // reads as "you have not progressed" rather than "there is nothing to compare against".
    change:
      history.length < 2 || first == null || latest == null
        ? null
        : Math.round((latest - first) * 100) / 100,
    best,
  }
}

// First logged working weight -> last, per exercise, across a block's workouts (in order).
export function blockWeightChanges(workouts) {
  const first = new Map()
  const last = new Map()
  for (const w of workouts) {
    for (const e of w.entries) {
      const top = heaviestDone(e.sets)
      if (top == null) continue
      if (!first.has(e.exerciseId)) first.set(e.exerciseId, top)
      last.set(e.exerciseId, top)
    }
  }
  const out = []
  for (const [exerciseId, f] of first) {
    out.push({ exerciseId, first: f, last: last.get(exerciseId) })
  }
  return out
}

// Finish a workout: write the log, advance progress, clear active.
// Pure — the caller supplies the finishedAt timestamp and applies the returned state.
export function finishWorkout(state, finishedAt) {
  const { active, workouts, progress } = state
  return {
    ...state,
    workouts: [...workouts, buildWorkoutLog(active, finishedAt)],
    progress: advanceProgress(progress),
    active: null,
  }
}
