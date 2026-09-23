// The seeded plan the app ships with. Every exercise id is verified present in
// src/data/exercises.json. Three full-body sessions a week, each led by a different
// movement pattern, four exercises each, ~40 minutes.
//
// `incrementKg` is set only where the equipment's derived default is wrong: cable stacks
// move in coarse 5 kg pin steps, and the plate-loaded sled takes a pair of 5 kg plates, so
// a 2.5 kg advance cannot be loaded on either.
// Barbell and dumbbell slots leave it null and fall back to their derived increments.
export const seedPlan = {
  name: 'Full Body 3-Day',
  sessionCount: 12,
  rotation: [
    {
      name: 'Squat-led',
      exercises: [
        { exerciseId: '0043', sets: 3, repsMin: 8, repsMax: 12, restSec: 150, incrementKg: null },
        { exerciseId: '0314', sets: 3, repsMin: 8, repsMax: 12, restSec: 120, incrementKg: null },
        { exerciseId: '0861', sets: 3, repsMin: 10, repsMax: 15, restSec: 90, incrementKg: 5 },
        { exerciseId: '0334', sets: 3, repsMin: 12, repsMax: 15, restSec: 60, incrementKg: null },
      ],
    },
    {
      name: 'Hinge-led',
      exercises: [
        { exerciseId: '0085', sets: 3, repsMin: 8, repsMax: 12, restSec: 150, incrementKg: null },
        { exerciseId: '0426', sets: 3, repsMin: 8, repsMax: 12, restSec: 120, incrementKg: null },
        { exerciseId: '2330', sets: 3, repsMin: 10, repsMax: 15, restSec: 90, incrementKg: 5 },
        { exerciseId: '0201', sets: 3, repsMin: 12, repsMax: 15, restSec: 60, incrementKg: 5 },
      ],
    },
    {
      name: 'Press-led',
      exercises: [
        { exerciseId: '0025', sets: 3, repsMin: 8, repsMax: 12, restSec: 150, incrementKg: null },
        { exerciseId: '0739', sets: 3, repsMin: 10, repsMax: 15, restSec: 120, incrementKg: 10 },
        { exerciseId: '0027', sets: 3, repsMin: 8, repsMax: 12, restSec: 120, incrementKg: null },
        { exerciseId: '0031', sets: 3, repsMin: 12, repsMax: 15, restSec: 60, incrementKg: null },
      ],
    },
  ],
}

export const DEFAULT_SETTINGS = {
  defaultRestSec: 120,
  keepAwake: true,
  sound: true,
  weeklyLifts: 3,
  weeklyCardio: 3,
  // Monday-first, one entry per weekday. Kinds: 'lift' | 'cardio' | 'long' | 'rest'.
  // A shape declares the KIND of day, never which session — which lift and which run are
  // derived from history by the coach. It is an input to that calculation, not a set of
  // appointments, which is why a day that does not happen is never recorded as missed.
  weekShape: ['lift', 'cardio', 'lift', 'rest', 'lift', 'cardio', 'long'],
}

export const WEEK_SHAPE_KINDS = ['lift', 'cardio', 'long', 'rest']

export function createInitialState() {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    plan: structuredClone(seedPlan),
    progress: { blockIndex: 0, sessionIndex: 0 },
    swaps: {},
    workouts: [],
    activities: [],
    customEx: [],
    active: null,
    lastExportAt: null,
  }
}

// The single hydration path, used by both the initial load and importBackup. The top-level
// spread is what lets an additive field ship without touching state.version — stored state
// predates anything added since it was written.
//
// `settings` is merged a second level down because the top-level spread REPLACES it
// wholesale: an install whose stored settings predate a new key would otherwise never gain
// the default, and every read of it would be undefined on a real phone while every test
// stayed green. That is not hypothetical — it is the same shape as the two total-failure
// bugs that have already shipped past this suite.
export function hydrate(stored) {
  const base = createInitialState()
  if (!stored) return base
  return { ...base, ...stored, settings: { ...base.settings, ...stored.settings } }
}
