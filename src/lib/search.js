export function searchableText(exercise) {
  return [
    exercise?.name,
    exercise?.equipment,
    exercise?.target,
    exercise?.muscleGroup,
    exercise?.bodyPart,
    ...(exercise?.secondary || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

export function matchesQuery(exercise, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  const hay = searchableText(exercise)
  return q.split(/\s+/).filter(Boolean).every((t) => hay.includes(t))
}
