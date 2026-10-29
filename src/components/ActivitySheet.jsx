import { useState } from 'react'
import { useStore } from '../store.js'
import Sheet from './Sheet.jsx'
import Icon from './Icon.jsx'
import { Group, Row, Section } from './List.jsx'
import {
  ACTIVITY_TYPES,
  INTENSITIES,
  RUN_TYPES,
  RIDE_TYPES,
  MATCH_FORMATS,
  takesDistance,
  takesMatchFormat,
} from '../lib/activities.js'
import { fmtRate } from '../lib/format.js'
import { toDateInput, withDate, notAfterToday } from '../lib/dateInput.js'

// Add and edit are the same form; `activity` is null when adding. Fields are held locally
// and committed on Save — the commit-on-blur rule exists because a set's weight propagates
// to later sets, and nothing here propagates.
// `activity` is an existing record being edited; `preset` seeds a new one from the Today
// card so a suggested easy run opens with the type and intensity already chosen. Only
// `activity` decides whether this is an edit — a preset must not read as one.
export default function ActivitySheet({ activity, preset, onSave, onDelete, onOpenTrend, onClose }) {
  const init = activity || preset || null
  // A new log opens on the current sport from Settings — the user's own choice, never the
  // last thing logged, which would stop a block of rides from ever offering a run again.
  const cardioSport = useStore((s) => s.settings.cardioSport)
  const [type, setType] = useState((init && init.type) || cardioSport || 'run')
  const [label, setLabel] = useState(init ? init.label || '' : '')
  const [at, setAt] = useState(init && init.at ? init.at : new Date().toISOString())
  const [minutes, setMinutes] = useState(init && init.minutes != null ? String(init.minutes) : '')
  const [distance, setDistance] = useState(
    init && typeof init.distanceKm === 'number' ? String(init.distanceKm) : '',
  )
  const [intensity, setIntensity] = useState(init ? init.intensity || null : null)
  const [runType, setRunType] = useState(init ? init.runType || null : null)
  const [rideType, setRideType] = useState(init ? init.rideType || null : null)
  const [matchFormat, setMatchFormat] = useState(init ? init.matchFormat || null : null)
  const [note, setNote] = useState(init ? init.note || '' : '')
  const [hr, setHr] = useState(init && init.avgHr != null ? String(init.avgHr) : '')
  const [walks, setWalks] = useState(init && init.walkBreaks != null ? String(init.walkBreaks) : '')

  const mins = Math.round(Number(minutes))
  const minutesValid = minutes.trim() !== '' && Number.isFinite(mins) && mins > 0

  // Distance is optional, so blank is valid — what is not valid is a value present but not a
  // positive number. An optional field that can reach the store as NaN is worse than an
  // absent one, because every derived total downstream inherits the NaN silently.
  const showDistance = takesDistance(type)
  const km = Number(distance)
  const distanceEntered = showDistance && distance.trim() !== ''
  const distanceValid = !distanceEntered || (Number.isFinite(km) && km > 0)
  const roundedKm = distanceEntered && Number.isFinite(km) ? Math.round(km * 100) / 100 : 0

  // Same shape as distance, and optional for the same reason: it comes off the watch
  // summary after the run and there will be runs logged without looking. Blank is valid;
  // a value present but not a positive number is not, because an optional field that can
  // reach the store as NaN poisons every total derived from it.
  //
  // Unlike distance and run type this is NOT cleared when the type changes — an average
  // heart rate means the same thing on a tennis match as on a run, so there is no type
  // where the box is one you leave blank forever.
  const bpm = Math.round(Number(hr))
  const hrEntered = hr.trim() !== ''
  const hrValid = !hrEntered || (Number.isFinite(bpm) && bpm > 0)

  // The 10k block judges a run week to week on how many walk breaks it took. Optional, and
  // unlike distance a zero is a real value — a continuous run — so it is kept, not dropped.
  // A whole number or nothing: a fraction of a walk break is not something the watch says.
  const walkCount = Number(walks)
  const walksEntered = walks.trim() !== ''
  const walksValid = !walksEntered || (Number.isInteger(walkCount) && walkCount >= 0)

  const valid = minutesValid && distanceValid && hrValid && walksValid

  // A run's type and its intensity are two independent facts — "long" is what kind of run,
  // and "easy"/"hard" is how it went — exactly as tennis keeps match format and intensity
  // apart. A run gets BOTH chip rows; everything else keeps just the easy/hard chips, because
  // a cycle or a walk has no equivalent vocabulary and still has to be taggable for the
  // recovery guard.
  const isRun = type === 'run'
  const showFormat = takesMatchFormat(type)
  const kindRow = isRun
    ? { label: 'Kind of run', options: RUN_TYPES, value: runType, set: setRunType }
    : type === 'cycle'
      ? { label: 'Kind of ride', options: RIDE_TYPES, value: rideType, set: setRideType }
      : showFormat
        ? { label: 'Format', options: MATCH_FORMATS, value: matchFormat, set: setMatchFormat }
        : null

  // Shown as you type, from the two numbers actually entered. It is the number that tells
  // you whether the run was what you meant it to be, and it was previously only visible
  // after saving.
  const pace = fmtRate(type, distanceEntered ? km : null, minutesValid ? mins : null)

  const save = () => {
    onSave({
      type,
      label: type === 'other' ? label.trim() || null : null,
      at,
      minutes: mins,
      // Cleared, not left stale, when the type stops taking a distance — switching a
      // mislogged run to tennis must not leave 5.2 km attached to a tennis match. Rounded
      // to the centimetre, and something that rounds to nothing IS nothing: a stored 0 is
      // dropped by the trend while History prints "0.0 km", so the run has a distance on
      // screen and none in the data.
      distanceKm: roundedKm > 0 ? roundedKm : null,
      // Cleared with distance when the type stops being a run, for the same reason: a
      // mislogged run switched to tennis must not stay tagged "Intervals".
      runType: isRun ? runType : null,
      // The same rule for a ride's kind: cleared on the way out of a ride.
      rideType: type === 'cycle' ? rideType : null,
      matchFormat: showFormat ? matchFormat : null,
      intensity,
      avgHr: hrEntered ? bpm : null,
      // Cleared when the type stops being a run, as distance and run type are.
      walkBreaks: isRun && walksEntered ? walkCount : null,
      note: note.trim() || null,
    })
    onClose()
  }

  return (
    <Sheet title={activity ? 'Edit activity' : 'Log activity'} onClose={onClose}>
      {/* The way into the cardio record, and the same route a lift takes: a logged entry,
          then the trend behind it. Only on a saved run or ride — there is nothing to trend
          from a form you have not saved yet, and the other types have no trend to show. */}
      {onOpenTrend && activity && (isRun || type === 'cycle') && (
        <button type="button" className="ex-open" onClick={() => onOpenTrend(type)}>
          {isRun ? 'Run trend' : 'Ride trend'}
        </button>
      )}

      {/* Six bare fields stacked on the sheet with nothing saying which belonged together.
          Three sections and the grouped list instead — the same pattern Settings and Plan's
          edit sheet are built from, so a typed value sits where a picked one does. */}
      <Section>What it was</Section>
      <div className="chip-row">
        {ACTIVITY_TYPES.map((t) => (
          <button
            key={t.id}
            type="button"
            className="chip"
            data-active={type === t.id}
            onClick={() => {
              if (t.id === type) return
              setType(t.id)
              // The run type is cleared on the way OUT of a run — a mislogged run switched
              // to tennis must not stay tagged "Intervals". Intensity is a universal field
              // and is left alone: it describes every activity, so carrying it across a
              // type change is correct, not stale.
              if (t.id !== 'run') setRunType(null)
              if (t.id !== 'cycle') setRideType(null)
              if (!takesMatchFormat(t.id)) setMatchFormat(null)
            }}
          >
            {/* Keyed by the type's own id, which is also the glyph's name — the same picture
                History draws in the row this form produces. */}
            <Icon name={t.id} size={16} />
            {t.label}
          </button>
        ))}
      </div>

      {/* The second row describes the activity just chosen, so it changes with it: a run's
          kind, a ride's kind, tennis's format, and nothing for a type with no vocabulary.
          Labelled, or the kinds read as more activity types. Tapping the active chip clears it. */}
      {kindRow && (
        <>
          <Section>{kindRow.label}</Section>
          <div className="chip-row">
            {kindRow.options.map((t) => (
              <button
                key={t.id}
                type="button"
                className="chip"
                data-active={kindRow.value === t.id}
                onClick={() => kindRow.set(kindRow.value === t.id ? null : t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      <Group>
        {type === 'other' && (
          <Row
            title="Name"
            value={
              <input
                className="row-field"
                type="text"
                value={label}
                placeholder="What was it?"
                aria-label="Activity name"
                onChange={(e) => setLabel(e.target.value)}
              />
            }
          />
        )}
        {/* A session logged in the future is read as having already happened: coach.js
            measures recovery from the last hard activity, and a negative gap clears every
            guard while the card says "Hard session yesterday" about something that has not
            happened. `max` asks the picker not to offer one; notAfterToday is what stops it. */}
        <Row
          title="Date"
          value={
            <input
              className="row-field"
              type="date"
              value={toDateInput(at)}
              max={toDateInput(new Date().toISOString())}
              aria-label="Date"
              onChange={(e) => e.target.value && setAt(withDate(at, notAfterToday(e.target.value)))}
            />
          }
        />
      </Group>

      <Section>How long</Section>
      <Group>
        <Row
          title="Duration"
          value={
            <input
              className="row-field tnum"
              type="number"
              inputMode="numeric"
              value={minutes}
              placeholder="min"
              aria-label="Duration in minutes"
              onChange={(e) => setMinutes(e.target.value)}
            />
          }
        />
        {showDistance && (
          <Row
            title="Distance"
            value={
              <input
                className="row-field tnum"
                type="number"
                inputMode="decimal"
                step="0.1"
                value={distance}
                placeholder="km, optional"
                aria-label="Distance in kilometres"
                onChange={(e) => setDistance(e.target.value)}
              />
            }
          />
        )}
      </Group>

      {pace && <p className="sheet-pace tnum">{pace}</p>}

      <Section>How it went</Section>

      {/* Tapping the active chip clears it: a tag applied by accident has to be removable,
          and untagged is a real state the week readout and the coach both depend on. */}
      <div className="chip-row">
        {INTENSITIES.map((o) => (
          <button
            key={o.id}
            type="button"
            className="chip"
            data-active={intensity === o.id}
            onClick={() => setIntensity(intensity === o.id ? null : o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>

      <Group>
        <Row
          title="Avg heart rate"
          value={
            <input
              className="row-field tnum"
              type="number"
              inputMode="numeric"
              value={hr}
              placeholder="bpm, optional"
              aria-label="Average heart rate in beats per minute"
              onChange={(e) => setHr(e.target.value)}
            />
          }
        />
        {isRun && (
          <Row
            title="Walk breaks"
            value={
              <input
                className="row-field tnum"
                type="number"
                inputMode="numeric"
                value={walks}
                placeholder="0 if none, optional"
                aria-label="Number of walk breaks"
                onChange={(e) => setWalks(e.target.value)}
              />
            }
          />
        )}
        <Row
          title="Note"
          value={
            <input
              className="row-field"
              type="text"
              value={note}
              placeholder="Optional"
              aria-label="Note"
              onChange={(e) => setNote(e.target.value)}
            />
          }
        />
      </Group>

      <button type="button" className="btn-primary" disabled={!valid} onClick={save}>
        Save
      </button>

      {onDelete && (
        <button type="button" className="btn btn-destructive" onClick={onDelete}>
          Delete activity
        </button>
      )}
    </Sheet>
  )
}
