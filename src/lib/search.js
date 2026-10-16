function tokensOf(query) {
  return (query || '').trim().toLowerCase().split(/\s+/).filter(Boolean)
}

function primaryText(exercise) {
  return [exercise?.name, exercise?.equipment, exercise?.target, exercise?.bodyPart]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// `muscleGroup` ranks with the secondaries: the dataset fills it with one, so a press sit-up
// targeting abs carries "shoulders" there.
export function searchableText(exercise) {
  return [primaryText(exercise), exercise?.muscleGroup, ...(exercise?.secondary || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function matchesQuery(exercise, query) {
  const tokens = tokensOf(query)
  if (tokens.length === 0) return true
  const hay = searchableText(exercise)
  return tokens.every((t) => hay.includes(t))
}

// Where a matching query landed, best first: 0 when every word is in the name, 1 when the
// name, kit and main muscle cover it, 2 when it needed a secondary muscle. Secondaries stay
// searchable — "triceps" should still find a bench press — but a bench press lists
// "shoulders" there, and unranked it led the alphabetical list for "shoulder press".
export function queryRank(exercise, query) {
  const tokens = tokensOf(query)
  const name = (exercise?.name || '').toLowerCase()
  if (tokens.every((t) => name.includes(t))) return 0
  const primary = primaryText(exercise)
  if (tokens.every((t) => primary.includes(t))) return 1
  return 2
}
