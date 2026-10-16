import { describe, it, expect } from 'vitest'
import { matchesQuery, queryRank, searchableText } from './search.js'

function ex(overrides = {}) {
  return {
    name: 'Incline Dumbbell Press',
    equipment: 'dumbbell',
    target: 'upper chest',
    muscleGroup: 'chest',
    bodyPart: 'chest',
    secondary: ['shoulders', 'triceps'],
    ...overrides,
  }
}

describe('matchesQuery', () => {
  it('matches a substring of the name', () => {
    expect(matchesQuery(ex(), 'incline')).toBe(true)
  })

  it('matches the equipment even when the name lacks the word', () => {
    expect(matchesQuery(ex({ name: 'Arnold Press', equipment: 'dumbbell' }), 'dumbbell')).toBe(true)
  })

  it('matches a target and a secondary muscle', () => {
    expect(matchesQuery(ex(), 'triceps')).toBe(true)
    expect(matchesQuery(ex(), 'upper chest')).toBe(true)
  })

  it('is order-insensitive across tokens', () => {
    expect(matchesQuery(ex(), 'press dumbbell')).toBe(true)
    expect(matchesQuery(ex(), 'dumbbell incline')).toBe(true)
  })

  it('requires every token to match somewhere', () => {
    expect(matchesQuery(ex(), 'dumbbell squat')).toBe(false)
  })

  it('matches an empty or whitespace query as everything', () => {
    expect(matchesQuery(ex(), '')).toBe(true)
    expect(matchesQuery(ex(), '   ')).toBe(true)
  })

  it('treats tokens as substrings, not word boundaries', () => {
    expect(matchesQuery(ex(), 'inclin')).toBe(true)
  })

  it('ignores null and missing fields', () => {
    expect(matchesQuery({ name: 'Plank', equipment: null, target: null, bodyPart: 'waist', secondary: [] }, 'plank')).toBe(true)
  })
})

describe('queryRank', () => {
  it('ranks a name match above a main-muscle match above a secondary-muscle match', () => {
    const shoulderPress = ex({ name: 'lever shoulder press', target: 'delts', bodyPart: 'shoulders', secondary: ['triceps'] })
    const militaryPress = ex({ name: 'lever military press', target: 'delts', bodyPart: 'shoulders', secondary: ['triceps'] })
    const benchPress = ex({ name: 'barbell bench press', target: 'pectorals', bodyPart: 'chest', secondary: ['shoulders'] })
    expect(queryRank(shoulderPress, 'shoulder press')).toBe(0)
    expect(queryRank(militaryPress, 'shoulder press')).toBe(1)
    expect(queryRank(benchPress, 'shoulder press')).toBe(2)
  })
})

describe('searchableText', () => {
  it('joins every searchable field lowercased', () => {
    const text = searchableText(ex())
    expect(text).toContain('incline dumbbell press')
    expect(text).toContain('upper chest')
    expect(text).toContain('shoulders triceps')
  })
})
