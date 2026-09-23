import { describe, it, expect } from 'vitest'
import { swapSuggestions, weightHint } from './exercises.js'

describe('weightHint', () => {
  it('flags dumbbell and kettlebell as per-side', () => {
    expect(weightHint({ equipment: 'dumbbell' })).toBe('Weight per side')
    expect(weightHint({ equipment: 'kettlebell' })).toBe('Weight per side')
  })

  it('flags barbell variants as total, bar excluded', () => {
    for (const e of ['barbell', 'ez barbell', 'olympic barbell', 'trap bar', 'smith machine']) {
      expect(weightHint({ equipment: e })).toBe('Total — plates only, bar not counted')
    }
  })

  it('returns null for cable, band, machines and body weight', () => {
    for (const e of ['cable', 'band', 'body weight', 'leverage machine', null]) {
      expect(weightHint({ equipment: e })).toBeNull()
    }
  })

  it('returns null for a missing exercise', () => {
    expect(weightHint(null)).toBeNull()
    expect(weightHint({})).toBeNull()
  })
})

describe('swapSuggestions', () => {
  const squat = { id: 'sq', target: 'quads', bodyPart: 'upper legs' }
  const all = [
    squat,
    { id: 'rdl', target: 'hamstrings', bodyPart: 'upper legs' },
    { id: 'lp', target: 'quads', bodyPart: 'upper legs' },
    { id: 'split', target: 'quads', bodyPart: 'upper legs' },
    { id: 'bench', target: 'pectorals', bodyPart: 'chest' },
    { id: 'custom', target: null, bodyPart: 'upper legs' },
  ]
  const log = (exerciseId, done) => ({ entries: [{ exerciseId, sets: [{ reps: 8, weightKg: 60, done }] }] })
  const ids = (list) => list.map((s) => s.exercise.id)

  it('ranks the same target muscle before the same body part, and drops the rest', () => {
    expect(ids(swapSuggestions(squat, all, []))).toEqual(['lp', 'split', 'rdl', 'custom'])
  })

  it('puts a trained exercise first within its tier, never across tiers', () => {
    const got = swapSuggestions(squat, all, [log('split', true), log('rdl', true)])
    expect(ids(got)).toEqual(['split', 'lp', 'rdl', 'custom'])
    expect(got[0].trained).toBe(true)
  })

  it('carries the latest working weight, and null where nothing was trained', () => {
    const got = swapSuggestions(squat, all, [log('split', true)])
    expect(got.find((s) => s.exercise.id === 'split').lastKg).toBe(60)
    expect(got.find((s) => s.exercise.id === 'lp').lastKg).toBeNull()
  })

  it('does not count an entry with nothing ticked as trained', () => {
    expect(ids(swapSuggestions(squat, all, [log('split', false)]))).toEqual(['lp', 'split', 'rdl', 'custom'])
  })

  // The duplicate guard refuses these silently, so offering one would be a dead tap.
  it('leaves out what the session already holds', () => {
    expect(ids(swapSuggestions(squat, all, [], ['lp', 'rdl']))).toEqual(['split', 'custom'])
  })

  it('takes one of each kit in turn within a tier', () => {
    const pool = [
      squat,
      { id: 'b1', target: 'quads', bodyPart: 'upper legs', equipment: 'barbell' },
      { id: 'b2', target: 'quads', bodyPart: 'upper legs', equipment: 'barbell' },
      { id: 'd1', target: 'quads', bodyPart: 'upper legs', equipment: 'dumbbell' },
      { id: 'm1', target: 'quads', bodyPart: 'upper legs', equipment: 'leverage machine' },
    ]
    expect(ids(swapSuggestions(squat, pool, []))).toEqual(['b1', 'd1', 'm1', 'b2'])
  })

  it('falls back to body part for a custom exercise with no target', () => {
    const custom = all[5]
    expect(ids(swapSuggestions(custom, all, []))).toEqual(['sq', 'rdl', 'lp', 'split'])
  })
})
