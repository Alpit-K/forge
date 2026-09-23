import { create } from 'zustand'
import { createInitialState, hydrate } from './lib/seed.js'
import { loadState, safeStorage, attachPersistence } from './lib/persistence.js'
import { validateBackup } from './lib/backup.js'
import {
  nextTarget,
  targetFor,
  incrementFor,
  FIRST_REASON,
  findSlotFor,
  findTemplateEntry,
} from './engine/progression.js'
import { getExercise } from './lib/exercises.js'
import {
  buildWorkoutLog,
  finishWorkout as reduceFinish,
  totalVolume,
  setsCompleted,
  durationSeconds,
  continueBlock,
} from './engine/session.js'
import { acquireWakeLock, releaseWakeLock } from './lib/wakeLock.js'
import { ensureAudioContext } from './lib/audio.js'

export const STATE_KEY = 'forge_state_v1'

function newId() {
  if (globalThis.crypto && crypto.randomUUID) return crypto.randomUUID()
  return `id-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

// The prefill rule, in one place: reps from last session on hold, else repsMin; weight from
// the target. startWorkout, addExerciseToActive and swapMidWorkout all fill sets from it and
// so cannot drift apart.
function prefilledSets(count, target) {
  const lastSets = target.lastSets || []
  return Array.from({ length: count }, (_, i) => {
    const last = lastSets[i]
    const reps = target.kind === 'hold' && last && last.done ? last.reps : target.repsMin
    return { reps, weightKg: target.weightKg, done: false }
  })
}

// Build an active-workout entry from a resolved target and its template.
function buildExerciseEntry(exerciseId, template, target) {
  const lastSets = target.lastSets || []
  const performed = prefilledSets(template.sets, target)
  return {
    exerciseId,
    swappedFrom: null,
    lastSets,
    repsMin: target.repsMin,
    repsMax: target.repsMax,
    sets: template.sets,
    restSec: template.restSec,
    increment: target.increment,
    kind: target.kind,
    reason: target.reason,
    performed,
  }
}

// The first-time fallback for an exercise with no plan slot: nothing to prescribe, nothing
// to prefill — the user types the weight on the first set.
function firstTimeEntry(exerciseId, state) {
  const ex = getExercise(exerciseId, state.customEx)
  const repsMin = 8
  const repsMax = 12
  const sets = 3
  return {
    exerciseId,
    swappedFrom: null,
    lastSets: [],
    repsMin,
    repsMax,
    sets,
    restSec: state.settings.defaultRestSec,
    increment: incrementFor(null, ex && ex.equipment),
    kind: 'first',
    reason: FIRST_REASON,
    performed: Array.from({ length: sets }, () => ({ reps: repsMin, weightKg: null, done: false })),
  }
}

export function createStore(storage) {
  // Merged over the defaults, not used raw: stored state predates any field added since it
  // was written, and `activities` reaching an action as undefined throws. This is what lets
  // an additive field ship without touching `state.version`. hydrate() is the single place
  // that merge lives — importBackup takes the identical path.
  const initial = hydrate(loadState(storage, STATE_KEY))

  // A workout restored from a killed session has no tap to go through startWorkout, so
  // re-arm the wake lock and audio context here — the first rest cue after resume would
  // otherwise be silent and the screen could sleep mid-set.
  if (initial.active) {
    ensureAudioContext()
    if (initial.settings?.keepAwake) acquireWakeLock()
  }

  const useStore = create((set, get) => ({
    ...initial,

    // ---- settings ----
    setSetting(key, value) {
      set((s) => ({ settings: { ...s.settings, [key]: value } }))
    },

    // ---- plan ----
    updateTemplateEntry(sessionIdx, exerciseIdx, patch) {
      set((s) => ({
        plan: {
          ...s.plan,
          rotation: s.plan.rotation.map((session, si) =>
            si === sessionIdx
              ? {
                  ...session,
                  exercises: session.exercises.map((e, ei) =>
                    ei === exerciseIdx ? { ...e, ...patch } : e,
                  ),
                }
              : session,
          ),
        },
      }))
    },

    reorderExercise(sessionIdx, fromIdx, toIdx) {
      set((s) => {
        const session = s.plan.rotation[sessionIdx]
        const exercises = [...session.exercises]
        const [moved] = exercises.splice(fromIdx, 1)
        exercises.splice(toIdx, 0, moved)
        return {
          plan: {
            ...s.plan,
            rotation: s.plan.rotation.map((ss, si) => (si === sessionIdx ? { ...ss, exercises } : ss)),
          },
        }
      })
    },

    // One entry per exercise per session. Every reader that looks an exercise up in a log
    // does it with `.find` — relevantWorkouts, workingWeight, exerciseHistory, slotResult —
    // while the finish summary and the volume iterate all of them, so a second entry means
    // the next target is computed from one set of numbers and reported against another.
    addExerciseToSession(sessionIdx, exerciseId) {
      if (get().plan.rotation[sessionIdx].exercises.some((e) => e.exerciseId === exerciseId)) return
      set((s) => ({
        plan: {
          ...s.plan,
          rotation: s.plan.rotation.map((ss, si) =>
            si === sessionIdx
              ? {
                  ...ss,
                  exercises: [
                    ...ss.exercises,
                    {
                      exerciseId,
                      sets: 3,
                      repsMin: 8,
                      repsMax: 12,
                      restSec: s.settings.defaultRestSec,
                      incrementKg: null,
                    },
                  ],
                }
              : ss,
          ),
        },
      }))
    },

    removeExerciseFromSession(sessionIdx, exerciseIdx) {
      set((s) => ({
        plan: {
          ...s.plan,
          rotation: s.plan.rotation.map((ss, si) =>
            si === sessionIdx
              ? { ...ss, exercises: ss.exercises.filter((_, ei) => ei !== exerciseIdx) }
              : ss,
          ),
        },
      }))
    },

    setSessionCount(count) {
      set((s) => ({ plan: { ...s.plan, sessionCount: count } }))
    },

    // Permanent swap. `newId == null` clears the swap.
    swapExercisePermanent(originalId, newId) {
      set((s) => {
        if (newId == null) {
          const swaps = { ...s.swaps }
          delete swaps[originalId]
          return { swaps }
        }
        return { swaps: { ...s.swaps, [originalId]: newId } }
      })
    },

    // ---- custom exercises ----
    addCustomExercise(name, bodyPart) {
      const id = `c${newId().replace(/-/g, '').slice(0, 16)}`
      const ex = {
        id,
        name,
        bodyPart,
        equipment: null,
        target: null,
        muscleGroup: null,
        secondary: [],
        steps: [],
        image: null,
        gif: null,
        custom: true,
      }
      set((s) => ({ customEx: [...s.customEx, ex] }))
      return id
    },

    // ---- workout lifecycle ----
    startWorkout(rotationIndex) {
      const s = get()
      if (s.active) return
      ensureAudioContext()
      if (s.settings.keepAwake) acquireWakeLock()
      const template = s.plan.rotation[rotationIndex]
      const exercises = template.exercises.map((t) =>
        buildExerciseEntry(s.swaps[t.exerciseId] || t.exerciseId, t, nextTarget(t.exerciseId, s, rotationIndex)),
      )
      set({
        active: {
          id: newId(),
          startedAt: new Date().toISOString(),
          blockIndex: s.progress.blockIndex,
          sessionIndex: s.progress.sessionIndex,
          rotationIndex,
          templateName: template.name,
          currentIndex: 0,
          restStartedAt: null,
          restDuration: null,
          exercises,
        },
      })
    },

    // A self-chosen session: start empty, add exercises, finish. A full member of the program —
    // finishing advances sessionIndex and the sets feed progression — but with no rotation
    // slot, so rotationIndex is null and the log carries the freeform flag for
    // lastDoneByRotation to skip.
    startFreeWorkout() {
      const s = get()
      if (s.active) return
      ensureAudioContext()
      if (s.settings.keepAwake) acquireWakeLock()
      set({
        active: {
          id: newId(),
          startedAt: new Date().toISOString(),
          blockIndex: s.progress.blockIndex,
          sessionIndex: s.progress.sessionIndex,
          rotationIndex: null,
          freeform: true,
          templateName: 'Custom workout',
          currentIndex: 0,
          restStartedAt: null,
          restDuration: null,
          exercises: [],
        },
      })
    },

    adjustSet(exerciseIdx, setIdx, patch) {
      set((s) => {
        if (!s.active) return {}
        const ex = s.active.exercises[exerciseIdx]
        const performed = ex.performed.map((st, i) => (i === setIdx ? { ...st, ...patch } : st))
        return {
          active: {
            ...s.active,
            exercises: s.active.exercises.map((e, i) => (i === exerciseIdx ? { ...e, performed } : e)),
          },
        }
      })
    },

    // The weight you actually loaded carries forward to the later sets you have not touched:
    // forward only, never a ticked set, and never one already set to something else. That
    // last condition is what makes going back to correct set 1 safe — a 65 you deliberately
    // typed into set 2 survives, while a set still sitting on the stale pre-fill follows.
    setWeight(exerciseIdx, setIdx, weightKg) {
      set((s) => {
        if (!s.active) return {}
        const ex = s.active.exercises[exerciseIdx]
        const previous = ex.performed[setIdx].weightKg
        const performed = ex.performed.map((st, i) =>
          i === setIdx || (i > setIdx && !st.done && st.weightKg === previous)
            ? { ...st, weightKg }
            : st,
        )
        return {
          active: {
            ...s.active,
            exercises: s.active.exercises.map((e, i) => (i === exerciseIdx ? { ...e, performed } : e)),
          },
        }
      })
    },

    // Sets added here are for this session only — the plan's `sets` is untouched, and the
    // progression engine still judges you against the prescribed count.
    addSet(exerciseIdx) {
      set((s) => {
        if (!s.active) return {}
        const ex = s.active.exercises[exerciseIdx]
        const prev = ex.performed[ex.performed.length - 1]
        const performed = [
          ...ex.performed,
          { reps: ex.repsMin, weightKg: prev ? prev.weightKg : null, done: false },
        ]
        return {
          active: {
            ...s.active,
            exercises: s.active.exercises.map((e, i) => (i === exerciseIdx ? { ...e, performed } : e)),
          },
        }
      })
    },

    // Drops the last set. Never the last remaining one, and never a logged one — untick it
    // first, so no completed work disappears on a mis-tap.
    removeSet(exerciseIdx) {
      set((s) => {
        if (!s.active) return {}
        const ex = s.active.exercises[exerciseIdx]
        if (ex.performed.length <= 1) return {}
        if (ex.performed[ex.performed.length - 1].done) return {}
        const performed = ex.performed.slice(0, -1)
        return {
          active: {
            ...s.active,
            exercises: s.active.exercises.map((e, i) => (i === exerciseIdx ? { ...e, performed } : e)),
          },
        }
      })
    },

    // Lengthen or shorten the rest in progress. The timer renders from restStartedAt plus
    // this duration, so there is no counter to correct.
    adjustRest(deltaSec) {
      set((s) => {
        if (!s.active || !s.active.restStartedAt) return {}
        return { active: { ...s.active, restDuration: Math.max(0, s.active.restDuration + deltaSec) } }
      })
    },

    // Logs a set. Rest starts only when there is another set of THIS exercise still to do —
    // finishing the last one goes to the exercise summary instead, which is where the screen
    // advances from. It no longer moves currentIndex itself; nextExercise does that.
    tickSet(exerciseIdx, setIdx) {
      set((s) => {
        if (!s.active) return {}
        const ex = s.active.exercises[exerciseIdx]
        const performed = ex.performed.map((st, i) => (i === setIdx ? { ...st, done: true } : st))
        const exerciseDone = performed.every((st) => st.done)
        return {
          active: {
            ...s.active,
            restStartedAt: exerciseDone ? null : new Date().toISOString(),
            restDuration: exerciseDone ? null : ex.restSec,
            exercises: s.active.exercises.map((e, i) => (i === exerciseIdx ? { ...e, performed } : e)),
          },
        }
      })
    },

    // Un-log a set, from the this-session strip. The logger derives the current set as the
    // first one not done, so this is also how you get back to a set you mis-tapped.
    untickSet(exerciseIdx, setIdx) {
      set((s) => {
        if (!s.active) return {}
        const ex = s.active.exercises[exerciseIdx]
        const performed = ex.performed.map((st, i) => (i === setIdx ? { ...st, done: false } : st))
        return {
          active: {
            ...s.active,
            restStartedAt: null,
            restDuration: null,
            exercises: s.active.exercises.map((e, i) => (i === exerciseIdx ? { ...e, performed } : e)),
          },
        }
      })
    },

    nextExercise() {
      set((s) => {
        if (!s.active) return {}
        const idx = Math.min(s.active.exercises.length - 1, s.active.currentIndex + 1)
        return { active: { ...s.active, currentIndex: idx, restStartedAt: null, restDuration: null } }
      })
    },

    // Both directions clear the rest state: rest belongs to the exercise you were on, and
    // carrying it across would show the rest screen for a set you are no longer logging.
    prevExercise() {
      set((s) => {
        if (!s.active) return {}
        const idx = Math.max(0, s.active.currentIndex - 1)
        return { active: { ...s.active, currentIndex: idx, restStartedAt: null, restDuration: null } }
      })
    },

    goToExercise(idx) {
      set((s) => {
        if (!s.active) return {}
        const i = Math.max(0, Math.min(s.active.exercises.length - 1, idx))
        return { active: { ...s.active, currentIndex: i, restStartedAt: null, restDuration: null } }
      })
    },

    skipRest() {
      set((s) => (s.active ? { active: { ...s.active, restStartedAt: null, restDuration: null } } : {}))
    },

    // The slot's PRESCRIPTION carries across and the replaced exercise's numbers do
    // not: a leg press is not a squat, and inheriting its 80 kg would be worse than asking.
    // The weight instead comes from the incoming exercise's OWN history, through the same
    // decision every other target is made by — the swap sheet showed that history to
    // choose from, so landing on "first time" with a heaviest weight one tap behind it
    // contradicted the screen the choice was made on. An exercise with nothing logged still
    // comes back first-time, which is what targetFor returns for an empty history.
    // Sets already ticked stay as they are: they were really performed.
    swapMidWorkout(exerciseIdx, newId) {
      set((s) => {
        if (!s.active) return {}
        const entry = s.active.exercises[exerciseIdx]
        if (!entry) return {}
        // One entry per exercise per session — see addExerciseToSession. A swap is the third
        // way to get one, and it is the way that loses work: the slot it lands on keeps its
        // ticked sets, so two entries for one exercise would each hold real performed sets
        // and progression would read only the first. Swapping an exercise onto itself hits
        // this too and is correctly a no-op.
        if (s.active.exercises.some((e) => e.exerciseId === newId)) return {}
        const ex = getExercise(newId, s.customEx)
        const rules = {
          repsMin: entry.repsMin,
          repsMax: entry.repsMax,
          prescribed: entry.sets,
          increment: incrementFor(null, ex && ex.equipment),
        }
        const target = targetFor(newId, rules, s.workouts)
        const fill = prefilledSets(entry.performed.length, target)
        return {
          active: {
            ...s.active,
            restStartedAt: null,
            restDuration: null,
            exercises: s.active.exercises.map((e, i) =>
              i === exerciseIdx
                ? {
                    ...e,
                    exerciseId: newId,
                    swappedFrom: e.swappedFrom || e.exerciseId,
                    increment: target.increment,
                    lastSets: target.lastSets || [],
                    kind: target.kind,
                    reason: target.reason,
                    performed: e.performed.map((st, j) => (st.done ? st : fill[j])),
                  }
                : e,
            ),
          },
        }
      })
    },

    // Mid-workout add, session-only: touches active, never the plan. A planned exercise keeps
    // its prescription and current target (prefill included); an unplanned one is first-time.
    // findSlotFor resolves the permanent swap, and where the same exercise is slotted twice it
    // takes the first slot — the same "first slot wins" assumption ExerciseDetail makes.
    addExerciseToActive(exerciseId) {
      const s = get()
      if (!s.active) return
      // One entry per exercise per session — see addExerciseToSession.
      if (s.active.exercises.some((e) => e.exerciseId === exerciseId)) return
      const slot = findSlotFor(s.plan, s.swaps, exerciseId)
      const entry = slot
        ? buildExerciseEntry(
            exerciseId,
            findTemplateEntry(s.plan, slot.slotId, slot.rotationIndex),
            nextTarget(slot.slotId, s, slot.rotationIndex),
          )
        : firstTimeEntry(exerciseId, s)
      set((st) => ({ active: { ...st.active, exercises: [...st.active.exercises, entry] } }))
    },

    // Mid-workout remove, session-only. Refuses the last remaining exercise and any exercise
    // with a logged set, so no completed work vanishes on a mis-tap.
    removeExerciseFromActive(exerciseIdx) {
      set((s) => {
        if (!s.active) return {}
        if (s.active.exercises.length <= 1) return {}
        const ex = s.active.exercises[exerciseIdx]
        if (!ex || ex.performed.some((p) => p.done)) return {}
        const exercises = s.active.exercises.filter((_, i) => i !== exerciseIdx)
        let currentIndex = s.active.currentIndex
        if (exerciseIdx < currentIndex) currentIndex -= 1
        currentIndex = Math.max(0, Math.min(exercises.length - 1, currentIndex))
        return { active: { ...s.active, exercises, currentIndex, restStartedAt: null, restDuration: null } }
      })
    },

    finishWorkout() {
      const s = get()
      if (!s.active) return null
      const finishedAt = new Date().toISOString()
      const log = buildWorkoutLog(s.active, finishedAt)
      set(reduceFinish(s, finishedAt))
      releaseWakeLock()
      return {
        log,
        durationSec: durationSeconds(s.active.startedAt, finishedAt),
        sets: setsCompleted(log.entries),
        volume: totalVolume(log.entries),
      }
    },

    abandonWorkout() {
      if (!get().active) return
      set({ active: null })
      releaseWakeLock()
    },

    continueBlock() {
      set((s) => ({ progress: continueBlock(s.progress) }))
    },

    // ---- history ----
    updateHistoricalSet(workoutId, entryIdx, setIdx, patch) {
      set((s) => ({
        workouts: s.workouts.map((w) =>
          w.id === workoutId
            ? {
                ...w,
                entries: w.entries.map((e, ei) =>
                  ei === entryIdx
                    ? { ...e, sets: e.sets.map((st, si) => (si === setIdx ? { ...st, ...patch } : st)) }
                    : e,
                ),
              }
            : w,
        ),
      }))
    },

    deleteWorkout(workoutId) {
      set((s) => ({ workouts: s.workouts.filter((w) => w.id !== workoutId) }))
    },

    // ---- activities ----
    // Inert to the engine: nothing here advances sessionIndex, counts toward sessionCount
    // or feeds progression. blockIndex is stamped at log time because an activity has no
    // session to derive it from.
    logActivity(activity) {
      set((s) => ({
        activities: [...s.activities, { ...activity, id: newId(), blockIndex: s.progress.blockIndex }],
      }))
    },

    updateActivity(activityId, patch) {
      set((s) => ({
        activities: s.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a)),
      }))
    },

    deleteActivity(activityId) {
      set((s) => ({ activities: s.activities.filter((a) => a.id !== activityId) }))
    },

    // ---- backup ----
    markExported(at) {
      set({ lastExportAt: at })
    },

    importBackup(jsonString) {
      const result = validateBackup(jsonString)
      if (!result.ok) return result
      // exerciseNames is derived at export time for whatever reads the file. Letting it into
      // the store would park a snapshot of the dataset in localStorage that nothing updates.
      const data = { ...result.data }
      delete data.exerciseNames
      set(() => hydrate(data))
      // A backup taken mid-workout restores an active session that never went through
      // startWorkout, the same position the resume-after-kill path above is in: without
      // this the first rest cue is silent and the screen sleeps mid-set.
      if (get().active) {
        ensureAudioContext()
        if (get().settings.keepAwake) acquireWakeLock()
      }
      return { ok: true }
    },

    // Back to a fresh install. Releases the lock first in case a workout is in progress.
    resetAllData() {
      releaseWakeLock()
      set(() => createInitialState())
    },
  }))

  attachPersistence(useStore, storage, STATE_KEY)

  return useStore
}

export const useStore = createStore(typeof window !== 'undefined' ? safeStorage() : null)
