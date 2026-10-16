import { useState } from 'react'
import { useStore } from '../store.js'
import { blockWindow } from '../engine/session.js'
import { toDateInput, withDate, toTimeInput, withTime, notAfterToday } from '../lib/dateInput.js'
import Sheet from './Sheet.jsx'
import { Group, Row, Section } from './List.jsx'

const MINUTE = 60 * 1000

// A new entry opens on the hour before now, started on a quarter-hour, so the form is valid
// as it stands and the usual edit is the date alone.
function defaultStart(now) {
  const d = new Date(now.getTime() - 60 * MINUTE)
  d.setMinutes(Math.floor(d.getMinutes() / 15) * 15, 0, 0)
  return d.toISOString()
}

// Two jobs, one form: entering a session forgotten in the gym (`workout` null), and moving or
// re-timing one already logged. Both are the same three facts — when it started, on what day,
// and for how long — and the same rules about where a session may sit.
export default function WorkoutTimeSheet({ workout, onLogged, onClose }) {
  const workouts = useStore((s) => s.workouts)
  const rotation = useStore((s) => s.plan.rotation)
  const currentBlock = useStore((s) => s.progress.blockIndex)
  const [rotationIndex, setRotationIndex] = useState(null)
  const [start, setStart] = useState(() => (workout ? workout.startedAt : defaultStart(new Date())))
  const [minutes, setMinutes] = useState(() =>
    workout ? String(Math.round((Date.parse(workout.finishedAt) - Date.parse(workout.startedAt)) / MINUTE)) : '60',
  )

  const mins = Math.round(Number(minutes))
  const minutesValid = minutes.trim() !== '' && Number.isFinite(mins) && mins > 0
  const finish = minutesValid ? new Date(Date.parse(start) + mins * MINUTE).toISOString() : null

  // The coach measures every recovery gap backwards from now, so a session that has not
  // finished yet would read as one that already happened. And a session has to stay inside
  // its own block's span, or it would sit in another block's history while counting toward
  // its own — see blockWindow.
  const { after, before } = blockWindow(workouts, workout ? workout.blockIndex : currentBlock, workout?.id)
  let problem = null
  if (finish && finish > new Date().toISOString()) problem = 'That would finish in the future.'
  else if (after && start <= after) problem = 'That falls inside an earlier block.'
  else if (before && finish && finish >= before) problem = 'That falls inside a later block.'

  const valid = minutesValid && !problem && (workout || rotationIndex != null)

  const save = () => {
    const store = useStore.getState()
    if (workout) {
      store.updateWorkoutTimes(workout.id, start, finish)
      onClose()
    } else {
      onLogged(store.logPastWorkout(rotationIndex, start, finish))
    }
  }

  return (
    <Sheet title={workout ? 'Date and time' : 'Log a past workout'} onClose={onClose}>
      {!workout && (
        <>
          <Section>Session</Section>
          <div className="chip-row">
            {rotation.map((day, i) => (
              <button
                key={i}
                type="button"
                className="chip"
                data-active={rotationIndex === i}
                onClick={() => setRotationIndex(i)}
              >
                {day.name}
              </button>
            ))}
          </div>
        </>
      )}

      <Section>When</Section>
      <Group>
        <Row
          title="Date"
          value={
            <input
              className="row-field"
              type="date"
              value={toDateInput(start)}
              min={after ? toDateInput(after) : undefined}
              max={toDateInput(new Date().toISOString())}
              aria-label="Date"
              onChange={(e) => e.target.value && setStart(withDate(start, notAfterToday(e.target.value)))}
            />
          }
        />
        <Row
          title="Started"
          value={
            <input
              className="row-field"
              type="time"
              value={toTimeInput(start)}
              aria-label="Start time"
              onChange={(e) => e.target.value && setStart(withTime(start, e.target.value))}
            />
          }
        />
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
      </Group>
      {problem && <p className="settings-note">{problem}</p>}

      <button type="button" className="btn-primary" disabled={!valid} onClick={save}>
        {workout ? 'Save' : 'Log workout'}
      </button>
    </Sheet>
  )
}
