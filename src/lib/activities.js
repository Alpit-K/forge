// The activity vocabulary. Fixed list rather than free text: typed names fragment on
// spelling and nothing could group them afterwards. `other` carries a typed label.
//
// `distance` marks the types where a distance means something. Tennis and `other` have no
// distance field at all — a distance box on a tennis row is a box you leave blank forever.
export const ACTIVITY_TYPES = [
  { id: 'run', label: 'Run', plural: 'Runs', distance: true },
  { id: 'tennis', label: 'Tennis', plural: 'Tennis', distance: false, format: true },
  { id: 'cycle', label: 'Cycle', plural: 'Cycles', distance: true },
  { id: 'swim', label: 'Swim', plural: 'Swims', distance: true },
  { id: 'walk', label: 'Walk', plural: 'Walks', distance: true },
  { id: 'other', label: 'Other', plural: 'Other', distance: false },
]

// Intensity applies to EVERY type, distance only to some. A hard tennis evening is exactly
// the session that should stop the coach suggesting a hard run the next day, so tennis has
// to be taggable even though it has no distance.
export const INTENSITIES = [
  { id: 'easy', label: 'Easy' },
  { id: 'hard', label: 'Hard' },
]

// Run types. These are descriptive — what KIND of run it was — and they carry no intensity,
// because `intensity` is a separate, independent field the user sets directly. That is the
// tennis rule: `matchFormat` says who was on court and `intensity` says how hard it was, and
// a run's type is the same way. "Short" is the everyday run; a long run can be easy (steady
// base) or hard (a hard long effort), and the user says which. The id is `short`, not
// `easy`, deliberately — `easy` is an intensity value and the two must not collide.
export const RUN_TYPES = [
  { id: 'short', label: 'Short' },
  { id: 'long', label: 'Long' },
  { id: 'tempo', label: 'Tempo' },
  { id: 'intervals', label: 'Intervals' },
  { id: 'race', label: 'Race' },
  // No implication either way. Untagged is a real state the week readout and the coach both
  // handle — better than guessing at something the person did not say.
  { id: 'other', label: 'Other' },
]

export function runTypeLabel(id) {
  const found = RUN_TYPES.find((t) => t.id === id)
  return found ? found.label : null
}

// Who was on court. Like a run type this does NOT imply an intensity and must never be
// made to: an easy doubles hit and a brutal doubles match are both doubles, and a singles
// match can be either. The two controls coexist on a tennis activity because they describe
// genuinely different things — a run now keeps the same two controls, kind and effort apart.
export const MATCH_FORMATS = [
  { id: 'singles', label: 'Singles' },
  { id: 'doubles', label: 'Doubles' },
]

export function matchFormatLabel(id) {
  const found = MATCH_FORMATS.find((f) => f.id === id)
  return found ? found.label : null
}

export function takesMatchFormat(typeId) {
  const type = ACTIVITY_TYPES.find((t) => t.id === typeId)
  return Boolean(type && type.format)
}

export function activityName(activity) {
  if (activity.type === 'other') return activity.label || 'Other'
  const type = ACTIVITY_TYPES.find((t) => t.id === activity.type)
  return type ? type.label : 'Other'
}

export function takesDistance(typeId) {
  const type = ACTIVITY_TYPES.find((t) => t.id === typeId)
  return Boolean(type && type.distance)
}

export function intensityLabel(intensity) {
  const found = INTENSITIES.find((i) => i.id === intensity)
  return found ? found.label : null
}
