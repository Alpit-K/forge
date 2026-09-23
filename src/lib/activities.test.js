import { describe, it, expect } from 'vitest'
import {
  RUN_TYPES,
  runTypeLabel,
  takesDistance,
  takesMatchFormat,
  matchFormatLabel,
  activityName,
} from './activities.js'

describe('run types', () => {
  // Run type and intensity are independent — a type says what KIND of run it was, never how
  // hard. A leftover intensity on a type would re-couple the two and the 80/20 guard would
  // drift for months with nothing on screen looking wrong.
  it('carries no intensity — kind and effort are chosen independently', () => {
    for (const t of RUN_TYPES) expect(t.intensity).toBeUndefined()
  })

  // Records written before run types existed carry none, and a type the vocabulary later
  // drops must not crash a History row.
  it('returns null for a missing or unknown run type', () => {
    expect(runTypeLabel(undefined)).toBe(null)
    expect(runTypeLabel('fartlek')).toBe(null)
  })

  it('labels each type for display', () => {
    expect(runTypeLabel('short')).toBe('Short')
    expect(runTypeLabel('long')).toBe('Long')
    expect(runTypeLabel('intervals')).toBe('Intervals')
  })
})

describe('activity vocabulary', () => {
  it('gives a distance only to the types where one means something', () => {
    expect(takesDistance('run')).toBe(true)
    expect(takesDistance('tennis')).toBe(false)
    expect(takesDistance('other')).toBe(false)
  })

  it('falls back to the typed label for an "other" activity', () => {
    expect(activityName({ type: 'other', label: 'Climbing' })).toBe('Climbing')
    expect(activityName({ type: 'other' })).toBe('Other')
    expect(activityName({ type: 'run' })).toBe('Run')
  })
})

describe('match format', () => {
  it('applies to tennis and to nothing else', () => {
    expect(takesMatchFormat('tennis')).toBe(true)
    expect(takesMatchFormat('run')).toBe(false)
    expect(takesMatchFormat('other')).toBe(false)
    expect(takesMatchFormat(undefined)).toBe(false)
  })

  it('labels each format for display', () => {
    expect(matchFormatLabel('singles')).toBe('Singles')
    expect(matchFormatLabel('doubles')).toBe('Doubles')
  })

  // Matches logged before formats existed carry none, and an unknown value must not crash
  // a History row.
  it('returns null for a missing or unknown format', () => {
    expect(matchFormatLabel(undefined)).toBe(null)
    expect(matchFormatLabel('mixed')).toBe(null)
  })
})
