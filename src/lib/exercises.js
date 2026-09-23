import dataset from '../data/exercises.json'
import { exerciseHistory, exerciseStats } from '../engine/session.js'

// Media is served from jsDelivr at a pinned commit — never @main.
export const DATASET_SHA = '7455efae41b330c265e7cd4b78dfa848e7ce5ebd'
export const MEDIA_BASE = `https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@${DATASET_SHA}`

// The media is not MIT-licensed (see NOTICE). Building with VITE_EXERCISE_MEDIA=off ships
// an instance that never requests it; every image slot then shows its placeholder.
export const MEDIA_ENABLED = import.meta.env.VITE_EXERCISE_MEDIA !== 'off'

export function titleCase(name) {
  if (!name) return ''
  return name
    .split(' ')
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(' ')
}

export function allExercises(customEx = []) {
  return [...customEx, ...dataset]
}

export function getExercise(id, customEx = []) {
  for (const e of customEx) {
    if (e.id === id) return e
  }
  for (const e of dataset) {
    if (e.id === id) return e
  }
  return null
}

export function exerciseName(ex) {
  return titleCase(ex?.name)
}

export function thumbSrc(ex) {
  if (!MEDIA_ENABLED || !ex || !ex.image) return null
  return `${MEDIA_BASE}/images/${ex.image}`
}

export function gifSrc(ex) {
  if (!MEDIA_ENABLED || !ex || !ex.gif) return null
  return `${MEDIA_BASE}/videos/${ex.gif}`
}

const SIDE_EQUIPMENT = ['dumbbell', 'kettlebell']
const TOTAL_EQUIPMENT = ['barbell', 'ez barbell', 'olympic barbell', 'trap bar', 'smith machine']

export function weightHint(exercise) {
  const equipment = exercise && exercise.equipment
  if (!equipment) return null
  if (SIDE_EQUIPMENT.includes(equipment)) return 'Weight per side'
  if (TOTAL_EQUIPMENT.includes(equipment)) return 'Total — plates only, bar not counted'
  return null
}

// Swap candidates: the same target muscle first, then the same body part, and within each an
// exercise you have logged before ahead of one you have not — a swap takes the incoming
// exercise's own history, so those arrive with a real weight. Equipment is deliberately not
// matched, and the rest of each tier takes one of each kit in turn: you usually swap because
// the kit is taken, and the dataset is alphabetical, so a squat's first six were all barbell.
// `exclude` is what the session already holds, which the duplicate guard would refuse
// without a word. `lastKg` is exerciseStats' `latest` — the figure the preview calls "Working
// weight" — so the row and the sheet it opens cannot disagree; null for a weightless history.
export function swapSuggestions(exercise, all, workouts, exclude = [], limit = 6) {
  const skip = new Set([exercise.id, ...exclude])
  const tier = (e) => {
    if (exercise.target && e.target === exercise.target) return 0
    if (e.bodyPart === exercise.bodyPart) return 1
    return null
  }
  const seen = new Map()
  return all
    .filter((e) => !skip.has(e.id) && tier(e) != null)
    .map((e) => {
      const stats = exerciseStats(exerciseHistory(workouts, e.id))
      return { exercise: e, tier: tier(e), trained: stats != null, lastKg: stats ? stats.latest : null }
    })
    .sort((a, b) => a.tier - b.tier || b.trained - a.trained)
    .map((s) => {
      const key = `${s.tier}|${s.trained}|${s.exercise.equipment}`
      const turn = seen.get(key) || 0
      seen.set(key, turn + 1)
      return { ...s, turn }
    })
    .sort((a, b) => a.tier - b.tier || b.trained - a.trained || a.turn - b.turn)
    .slice(0, limit)
    .map(({ exercise, trained, lastKg }) => ({ exercise, trained, lastKg }))
}
