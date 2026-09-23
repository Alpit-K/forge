import { describe, it, expect, vi } from 'vitest'
import { loadState, saveState } from './persistence.js'
import { createStore, STATE_KEY, useStore } from '../store.js'
import { createInitialState } from './seed.js'
import { acquireWakeLock } from './wakeLock.js'
import { ensureAudioContext } from './audio.js'

vi.mock('./wakeLock.js', () => ({
  acquireWakeLock: vi.fn(),
  releaseWakeLock: vi.fn(),
}))
vi.mock('./audio.js', () => ({
  ensureAudioContext: vi.fn(),
  playCue: vi.fn(),
}))

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => {
      map.set(k, String(v))
    },
    removeItem: (k) => {
      map.delete(k)
    },
  }
}

describe('persistence', () => {
  it('round-trips an in-progress workout including restStartedAt', () => {
    const state = createInitialState()
    state.active = {
      id: 'a1',
      startedAt: '2026-08-27T06:00:00.000Z',
      blockIndex: 0,
      sessionIndex: 0,
      templateName: 'Squat-led',
      currentIndex: 1,
      restStartedAt: '2026-08-27T06:10:00.000Z',
      restDuration: 150,
      exercises: [],
    }
    const storage = memoryStorage()
    saveState(storage, STATE_KEY, state)
    const loaded = loadState(storage, STATE_KEY)
    expect(loaded.active.restStartedAt).toBe('2026-08-27T06:10:00.000Z')
    expect(loaded.active.currentIndex).toBe(1)
  })

  it('returns null on corrupt storage', () => {
    const storage = memoryStorage({ [STATE_KEY]: '{broken' })
    expect(loadState(storage, STATE_KEY)).toBeNull()
  })

  it('does not throw when storage access is blocked', () => {
    const storage = {
      getItem() {
        throw new Error('blocked')
      },
      setItem() {
        throw new Error('blocked')
      },
    }
    expect(loadState(storage, STATE_KEY)).toBeNull()
    expect(() => saveState(storage, STATE_KEY, {})).not.toThrow()
  })
})

// The shallow top-level merge is what lets an additive field ship at state.version 1, but it
// REPLACES `settings` wholesale. Every install that predates a new setting key would read it
// as undefined on a real phone while this suite stayed green — the exact shape of the two
// total-failure bugs that have already shipped past it.
describe('settings hydration', () => {
  it('fills in a setting key the stored state predates', () => {
    const stale = createInitialState()
    stale.settings = { defaultRestSec: 90, keepAwake: false, sound: true }
    const storage = memoryStorage({ [STATE_KEY]: JSON.stringify(stale) })

    const store = createStore(storage)
    const settings = store.getState().settings

    // The user's own choices survive.
    expect(settings.defaultRestSec).toBe(90)
    expect(settings.keepAwake).toBe(false)
    // The keys they have never seen arrive at their defaults rather than undefined.
    expect(settings.weeklyLifts).toBe(3)
    expect(settings.weeklyCardio).toBe(3)
    expect(Array.isArray(settings.weekShape)).toBe(true)
    expect(settings.weekShape).toHaveLength(7)
  })

  it('applies the same merge to an imported backup', () => {
    const file = createInitialState()
    file.settings = { defaultRestSec: 45, keepAwake: true, sound: false }
    const store = createStore(memoryStorage())

    expect(store.getState().importBackup(JSON.stringify(file)).ok).toBe(true)
    expect(store.getState().settings.defaultRestSec).toBe(45)
    expect(store.getState().settings.weeklyCardio).toBe(3)
  })

  it('leaves activities written before distance and intensity existed alone', () => {
    const stale = createInitialState()
    stale.activities = [{ id: 'a1', type: 'tennis', at: '2026-09-03T18:21:00.000Z', minutes: 75 }]
    const store = createStore(memoryStorage({ [STATE_KEY]: JSON.stringify(stale) }))

    const [activity] = store.getState().activities
    expect(activity.minutes).toBe(75)
    expect(activity.distanceKm).toBeUndefined()
    expect(activity.intensity).toBeUndefined()
  })
})

describe('the exported store', () => {
  // Every screen reaches its actions through useStore.getState(); nothing else catches it
  // if that goes missing, because the tests below build their own store.
  it('exposes getState', () => {
    expect(typeof useStore.getState).toBe('function')
    expect(typeof useStore.getState().startWorkout).toBe('function')
  })
})

describe('resume after kill (store-level)', () => {
  it('restores the in-progress workout from persisted state', () => {
    const state = createInitialState()
    state.active = {
      id: 'a1',
      startedAt: '2026-08-27T06:00:00.000Z',
      blockIndex: 0,
      sessionIndex: 0,
      templateName: 'Squat-led',
      currentIndex: 0,
      restStartedAt: '2026-08-27T06:10:00.000Z',
      restDuration: 150,
      exercises: [],
    }
    const storage = memoryStorage()
    saveState(storage, STATE_KEY, state)

    const store = createStore(storage)
    expect(store.getState().active).not.toBeNull()
    expect(store.getState().active.restStartedAt).toBe('2026-08-27T06:10:00.000Z')
  })

  it('re-arms the wake lock and audio context on resume', () => {
    const state = createInitialState()
    state.active = {
      id: 'a1',
      startedAt: '2026-08-27T06:00:00.000Z',
      blockIndex: 0,
      sessionIndex: 0,
      templateName: 'Squat-led',
      currentIndex: 0,
      restStartedAt: null,
      restDuration: null,
      exercises: [],
    }
    const storage = memoryStorage()
    saveState(storage, STATE_KEY, state)

    acquireWakeLock.mockClear()
    ensureAudioContext.mockClear()

    createStore(storage)

    expect(acquireWakeLock).toHaveBeenCalledTimes(1)
    expect(ensureAudioContext).toHaveBeenCalledTimes(1)
  })
})

describe('hydration', () => {
  // State written before a field existed must not reach the actions with that field
  // undefined — `logActivity` spreads `s.activities` and History iterates it, so both
  // threw against real stored state while every test stayed green.
  it('fills a field missing from stored state with its default', () => {
    const stored = createInitialState()
    delete stored.activities
    const storage = memoryStorage({ [STATE_KEY]: JSON.stringify(stored) })

    const store = createStore(storage)

    expect(store.getState().activities).toEqual([])
    store.getState().logActivity({ type: 'run', label: null, at: '2026-08-29T17:00:00.000Z', minutes: 45, note: null })
    expect(store.getState().activities).toHaveLength(1)
  })

  it('keeps stored values over the defaults', () => {
    const stored = createInitialState()
    stored.progress = { blockIndex: 3, sessionIndex: 7 }
    const storage = memoryStorage({ [STATE_KEY]: JSON.stringify(stored) })

    expect(createStore(storage).getState().progress).toEqual({ blockIndex: 3, sessionIndex: 7 })
  })
})

describe('import backup (store-level)', () => {
  it('rejects a bad file and leaves existing state untouched', () => {
    const storage = memoryStorage()
    const store = createStore(storage)
    const before = store.getState().workouts

    const result = store.getState().importBackup('not json')

    expect(result.ok).toBe(false)
    expect(store.getState().workouts).toBe(before)
  })

  it('replaces state with a valid current-version backup', () => {
    const storage = memoryStorage()
    const store = createStore(storage)
    // `entries` is part of the shape validateBackup checks — every log the app writes has
    // the array, and the readers that walk it do not guard.
    const backup = { version: 1, workouts: [{ id: 'w1', entries: [] }] }

    const result = store.getState().importBackup(JSON.stringify(backup))

    expect(result.ok).toBe(true)
    expect(store.getState().workouts).toEqual([{ id: 'w1', entries: [] }])
  })

  // A backup taken before activities existed carries no `activities` key. Import spreads
  // createInitialState() first, so the field lands as [] rather than undefined — which is
  // why state.version could stay at 1.
  it('gives a backup with no activities an empty array', () => {
    const storage = memoryStorage()
    const store = createStore(storage)

    const result = store.getState().importBackup(JSON.stringify({ version: 1, workouts: [] }))

    expect(result.ok).toBe(true)
    expect(store.getState().activities).toEqual([])
  })
})
