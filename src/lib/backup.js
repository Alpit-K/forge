// Backup export/import validation. Validate fully, then replace — never field by field.

import { getExercise, exerciseName } from './exercises.js'

export const CURRENT_VERSION = 1

export const ERRORS = {
  notJson: "That file isn't a Forge backup.",
  newer: 'This backup is from a newer version of Forge.',
  older: "This backup is from an older version of Forge and can't be imported yet.",
  damaged: 'That backup is damaged — some of its data is the wrong shape.',
  planFile: "That's a plan file — use Import plan.",
  fullBackup: "That's a full backup — use Import backup.",
  badPlan: "That plan can't be used — an exercise is missing a number or its rep range is backwards.",
  unknownExercise: "That plan names an exercise this app doesn't have.",
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

// The version is not the only thing that can be wrong with a file, and nothing downstream
// re-checks these. hydrate() merges over the defaults, which fills an ABSENT key and does
// nothing about a present one of the wrong type, and every screen iterates them on the next
// render. A `workouts` holding a string throws a TypeError out of Today — the default tab —
// and there is no error boundary to land in: the replaced state has already been persisted,
// so the app comes back to the same crash on every launch with Settings unreachable.
//
// Absent stays valid, because that is what makes an additive field safe at version 1. What
// is checked is every container the app iterates and every number it does arithmetic on.
function isWellFormed(data) {
  for (const key of ['workouts', 'activities', 'customEx']) {
    if (key in data && !Array.isArray(data[key])) return false
  }
  // A log's `entries` is a container the app iterates, so it is checked like the rest of
  // them. It is NOT an absent-stays-valid case: every version of the app has written the
  // array (`buildWorkoutLog`), and four readers walk it without a guard — this file's own
  // `referencedExerciseIds`, `totalVolume` (now on the launch path via `summarise`),
  // `blockWeightChanges`, and History's rows. Missing, it threw out of Today with the state
  // already persisted, which is the unreachable-Settings crash this function exists for.
  if ('workouts' in data && !data.workouts.every((w) => isObject(w) && Array.isArray(w.entries))) {
    return false
  }
  for (const key of ['settings', 'swaps']) {
    if (key in data && !isObject(data[key])) return false
  }
  if ('progress' in data) {
    const p = data.progress
    if (!isObject(p) || typeof p.blockIndex !== 'number' || typeof p.sessionIndex !== 'number') {
      return false
    }
  }
  if ('plan' in data) {
    const rotation = isObject(data.plan) ? data.plan.rotation : null
    if (!Array.isArray(rotation)) return false
    if (!rotation.every((day) => isObject(day) && Array.isArray(day.exercises))) return false
  }
  if ('active' in data && data.active !== null) {
    if (!isObject(data.active) || !Array.isArray(data.active.exercises)) return false
  }
  return true
}

// The checks every file starts with, backup or plan: JSON, an object, this version.
function parseVersioned(jsonString) {
  let data
  try {
    data = JSON.parse(jsonString)
  } catch {
    return { ok: false, message: ERRORS.notJson }
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, message: ERRORS.notJson }
  }
  if (typeof data.version !== 'number') {
    return { ok: false, message: ERRORS.newer }
  }
  if (data.version > CURRENT_VERSION) {
    return { ok: false, message: ERRORS.newer }
  }
  if (data.version < CURRENT_VERSION) {
    return { ok: false, message: ERRORS.older }
  }
  return { ok: true, data }
}

// A plan file carries the plan and nothing else the store holds — `exerciseNames` is allowed
// beside it because it is export-only and makes the file readable. It has to be told apart
// from a backup because the backup path fills every ABSENT key from the defaults: a plan
// file imported as a backup would come back with an empty `workouts` and wipe the history.
function isPlanFile(data) {
  const keys = Object.keys(data).filter((k) => k !== 'version' && k !== 'exerciseNames')
  return keys.length === 1 && keys[0] === 'plan'
}

// Returns { ok: true, data } or { ok: false, message }.
export function validateBackup(jsonString) {
  const parsed = parseVersioned(jsonString)
  if (!parsed.ok) return parsed
  const { data } = parsed
  if (!isWellFormed(data)) {
    return { ok: false, message: ERRORS.damaged }
  }
  if (isPlanFile(data)) {
    return { ok: false, message: ERRORS.planFile }
  }
  return { ok: true, data }
}

const isCount = (n) => Number.isInteger(n) && n > 0

// The plan is the only thing a plan import replaces, so it is checked field by field: the
// engine does arithmetic on every one of these numbers, and a `sessionCount` that is not
// one breaks the block gate. `customEx` is the store's own list — an id that resolves to
// nothing would put a blank name on every surface that shows it.
export function validatePlan(jsonString, customEx = []) {
  const parsed = parseVersioned(jsonString)
  if (!parsed.ok) return parsed
  const { data } = parsed
  if ('workouts' in data) {
    return { ok: false, message: ERRORS.fullBackup }
  }
  if (!('plan' in data) || !isWellFormed({ plan: data.plan })) {
    return { ok: false, message: ERRORS.damaged }
  }
  const { plan } = data
  if (!isCount(plan.sessionCount) || plan.rotation.length === 0) {
    return { ok: false, message: ERRORS.badPlan }
  }
  for (const day of plan.rotation) {
    if (typeof day.name !== 'string' || day.exercises.length === 0) {
      return { ok: false, message: ERRORS.badPlan }
    }
    for (const ex of day.exercises) {
      const numbersOk =
        isObject(ex) &&
        isCount(ex.sets) &&
        isCount(ex.repsMin) &&
        isCount(ex.repsMax) &&
        ex.repsMin <= ex.repsMax &&
        Number.isInteger(ex.restSec) && ex.restSec >= 0 &&
        (ex.incrementKg == null || (typeof ex.incrementKg === 'number' && ex.incrementKg > 0))
      if (!numbersOk) return { ok: false, message: ERRORS.badPlan }
      if (!getExercise(ex.exerciseId, customEx)) {
        return { ok: false, message: ERRORS.unknownExercise }
      }
    }
  }
  return { ok: true, plan }
}

export function backupFilename(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `forge-backup-${y}-${m}-${d}.json`
}

// Every id a backup references, from all four places one can appear. `active` holds
// `exercises`, a finished log holds `entries`, and both carry the id they were swapped from.
function referencedExerciseIds(state) {
  const ids = new Set()
  for (const day of state.plan.rotation) for (const ex of day.exercises) ids.add(ex.exerciseId)
  for (const log of state.workouts) {
    for (const e of log.entries) {
      ids.add(e.exerciseId)
      if (e.swappedFrom) ids.add(e.swappedFrom)
    }
  }
  if (state.active) {
    for (const ex of state.active.exercises) {
      ids.add(ex.exerciseId)
      if (ex.swappedFrom) ids.add(ex.swappedFrom)
    }
  }
  for (const [from, to] of Object.entries(state.swaps)) {
    ids.add(from)
    ids.add(to)
  }
  return [...ids].sort()
}

// Ids are opaque 4-digit keys and the names live in the generated dataset, which is not in
// the file. Resolving them here means nothing reading a backup has to keep its own copy of
// the map and drift against DATASET_SHA. Derived at export time, never stored: importBackup
// strips the key so it can never be read back as truth.
function exerciseNames(state) {
  const out = {}
  for (const id of referencedExerciseIds(state)) {
    const ex = getExercise(id, state.customEx)
    if (ex) out[id] = exerciseName(ex)
  }
  return out
}

// JSON.stringify skips the store's action functions, leaving only the data.
export function serializeState(state) {
  return JSON.stringify({ ...state, exerciseNames: exerciseNames(state) }, null, 2)
}

// An installed iOS web app has no download UI, so `<a download>` silently does nothing
// there — the share sheet is the only way to get the file into Files or iCloud. Returns
// whether the file actually left the app, because the backup banner must not be silenced by a
// cancelled export.
export async function triggerDownload(jsonString, filename) {
  if (typeof document === 'undefined') return false
  const blob = new Blob([jsonString], { type: 'application/json' })
  const file = new File([blob], filename, { type: 'application/json' })

  // Files ONLY. The File already carries the name, so a `title` or `text` beside it says
  // nothing the share sheet does not already have — and iOS renders those as a second,
  // text item, so an export handed over a .json AND a .txt. The spec allows it: title
  // "may be ignored by the target" and a user agent MAY "discard or combine" members, so
  // there is nothing to rely on here beyond not sending them.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch {
      return false
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // Safari needs the anchor in the document, and revoking in the same tick cancels the
  // download before it starts.
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
  return true
}

// The file has to carry the timestamp of the export that wrote it, so it is minted before
// serialising rather than after — writing it to the store first and re-reading would be the
// same value at the cost of a render. It reaches the store only if the file actually left
// the app, because the backup banner must not be silenced by a cancelled share sheet.
export async function exportBackup(store) {
  const at = new Date().toISOString()
  const json = serializeState({ ...store.getState(), lastExportAt: at })
  const exported = await triggerDownload(json, backupFilename())
  if (exported) store.getState().markExported(at)
  return exported
}
