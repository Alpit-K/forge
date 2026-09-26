import { useMemo, useState } from 'react'
import { allExercises, exerciseName, swapSuggestions } from '../lib/exercises.js'
import { matchesQuery } from '../lib/search.js'
import { Thumb } from './ExerciseImage.jsx'
import Icon from './Icon.jsx'
import ExerciseDetail from './ExerciseDetail.jsx'
import { useStore } from '../store.js'
import { Section } from './List.jsx'

// Rendering a whole dataset costs a long scroll and a large DOM for a list nobody reads to
// the end of — you search or you filter. This is the cap, not a paginator: there is no
// "load more", because the answer to "not in the first hundred" is a better query.
const PAGE = 100

function frequency(values) {
  const counts = new Map()
  for (const v of values) {
    if (v == null || v === '') continue
    counts.set(v, (counts.get(v) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v)
}

function Chips({ label, options, value, onChange }) {
  if (options.length <= 1) return null
  // The selected chip leads its row. The row scrolls, and the options are ordered by
  // frequency, so picking "waist" off the far end scrolled it out of sight and left the
  // row looking unfiltered — the filter was on and nothing on screen said so.
  const ordered = value ? [value, ...options.filter((o) => o !== value)] : options
  return (
    <div className="filter-group">
      <div className="filter-label">{label}</div>
      <div className="filter-chips">
        {ordered.map((opt) => (
          <button
            key={opt}
            type="button"
            className="chip"
            data-active={value === opt}
            onClick={() => onChange(value === opt ? null : opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  )
}

function ExerciseRow({ exercise, subtitle, onClick }) {
  return (
    <button type="button" className="row" onClick={onClick}>
      <Thumb exercise={exercise} />
      <div className="row-label">
        <div className="title">{exerciseName(exercise)}</div>
        <div className="subtitle">{subtitle}</div>
      </div>
    </button>
  )
}

// Exercise browser: free-text search plus body part / equipment / target filters. Equipment
// and target options are derived from the already-filtered list, most common first, so every
// visible combination has results. `suggestFor` is the exercise being swapped out; it
// puts a short list of like-for-like replacements above the full one, shown only while no
// search or filter is set — once you are looking for something, they are in the way.
export default function ExerciseBrowser({ onSelect, selectLabel, suggestFor, exclude }) {
  const customEx = useStore((s) => s.customEx)
  const workouts = useStore((s) => s.workouts)
  const [search, setSearch] = useState('')
  const [bodyPart, setBodyPart] = useState(null)
  const [equipmentChoice, setEquipmentChoice] = useState(null)
  const [targetChoice, setTargetChoice] = useState(null)
  const [preview, setPreview] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)

  const all = useMemo(() => allExercises(customEx), [customEx])

  const byBodyAndSearch = useMemo(() => {
    return all.filter((e) => {
      if (bodyPart && e.bodyPart !== bodyPart) return false
      if (!matchesQuery(e, search)) return false
      return true
    })
  }, [all, bodyPart, search])

  const equipmentOptions = useMemo(() => frequency(byBodyAndSearch.map((e) => e.equipment)), [byBodyAndSearch])

  // A selection stranded by a change to a filter above it is dropped rather than left to
  // empty the list — a filter pair with no results is a bug, not an empty state.
  const equipment = equipmentOptions.includes(equipmentChoice) ? equipmentChoice : null

  const byEquipment = useMemo(() => {
    if (!equipment) return byBodyAndSearch
    return byBodyAndSearch.filter((e) => e.equipment === equipment)
  }, [byBodyAndSearch, equipment])

  const targetOptions = useMemo(() => frequency(byEquipment.map((e) => e.target)), [byEquipment])

  const target = targetOptions.includes(targetChoice) ? targetChoice : null

  const results = useMemo(() => {
    if (!target) return byEquipment
    return byEquipment.filter((e) => e.target === target)
  }, [byEquipment, target])

  const bodyParts = useMemo(() => frequency(all.map((e) => e.bodyPart)), [all])
  const shown = results.slice(0, PAGE)

  // What the three rows currently say, in the order they are applied. This is the whole
  // reason the block can close: a filter you cannot see is a filter you will forget you set,
  // and the empty state that says "clear a filter above" needs there to be one visible.
  const activeFilters = [bodyPart, equipment, target].filter(Boolean)

  const suggestions = suggestFor ? swapSuggestions(suggestFor, all, workouts, exclude) : []
  const showSuggestions = suggestions.length > 0 && search === '' && activeFilters.length === 0
  const choose = (e) => (selectLabel ? setPreview(e) : onSelect(e))

  const clearFilters = () => {
    setBodyPart(null)
    setEquipmentChoice(null)
    setTargetChoice(null)
  }

  if (preview && selectLabel) {
    return (
      <div>
        <ExerciseDetail exercise={preview} />
        <div className="browser-actions">
          <button type="button" className="btn btn-bezel" onClick={() => setPreview(null)}>
            Back
          </button>
          <button type="button" className="btn-primary" onClick={() => onSelect(preview)}>
            {selectLabel}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="search-field">
        <Icon name="search" size={17} />
        <input
          type="search"
          className="search"
          placeholder="Search exercises"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="filter-bar">
        <button
          type="button"
          className="filter-disclosure"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <span className="filter-disclosure-label">Filters</span>
          <span className="filter-disclosure-value">
            {activeFilters.length > 0 ? activeFilters.join(' · ') : 'All'}
          </span>
          <span className={filtersOpen ? 'filter-chevron open' : 'filter-chevron'}>
            <Icon name="chevron" size={14} />
          </span>
        </button>
        {activeFilters.length > 0 && (
          <button type="button" className="filter-clear" onClick={clearFilters}>
            Clear
          </button>
        )}
      </div>

      {filtersOpen && (
        <>
          <Chips label="Body part" options={bodyParts} value={bodyPart} onChange={setBodyPart} />
          <Chips label="Equipment" options={equipmentOptions} value={equipment} onChange={setEquipmentChoice} />
          <Chips label="Target muscle" options={targetOptions} value={target} onChange={setTargetChoice} />
        </>
      )}

      {showSuggestions && (
        <>
          <Section>Suggested</Section>
          <div className="list">
            {suggestions.map(({ exercise, trained, lastKg }) => (
              <ExerciseRow
                key={exercise.id}
                exercise={exercise}
                subtitle={[exercise.equipment, lastKg != null ? `${lastKg} kg last time` : trained && 'trained before']
                  .filter(Boolean)
                  .join(' · ')}
                onClick={() => choose(exercise)}
              />
            ))}
          </div>
          <Section>All exercises</Section>
        </>
      )}

      {results.length === 0 ? (
        <div className="empty-state">
          <span className="empty-glyph"><Icon name="library" size={28} /></span>
          <p className="empty-title">Nothing matches</p>
          <p className="empty-body">Try a shorter search, or clear a filter above.</p>
        </div>
      ) : (
        <div className="list">
          {shown.map((e) => (
            <ExerciseRow
              key={e.id}
              exercise={e}
              subtitle={[e.target, e.equipment].filter(Boolean).join(' · ')}
              onClick={() => choose(e)}
            />
          ))}
        </div>
      )}
      {results.length > shown.length && (
        <p className="browser-count tnum">
          Showing {shown.length} of {results.length}. Search or filter to narrow it.
        </p>
      )}
    </div>
  )
}
