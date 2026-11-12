import { useState } from 'react'
import { useStore, TRIM_SETS } from '../store.js'
import { minutesLeft } from '../engine/session.js'
import { getExercise, exerciseName } from '../lib/exercises.js'
import NavBar from './NavBar.jsx'
import { Thumb } from './ExerciseImage.jsx'
import Sheet, { ActionSheet } from './Sheet.jsx'
import ExerciseBrowser from './ExerciseBrowser.jsx'
import MuscleCoverage from './MuscleCoverage.jsx'
import OwedList from './OwedList.jsx'
import { Group, Row } from './List.jsx'
import Icon from './Icon.jsx'

// `onStart` is passed only while a custom workout is being built: a row then opens its
// options rather than jumping into a logger that has not started, and the targets stand in
// for a progress count that is zero on every row.
export default function SessionOverview({ onClose, onEnd, onStart }) {
  const active = useStore((s) => s.active)
  const customEx = useStore((s) => s.customEx)
  const workouts = useStore((s) => s.workouts)
  const [rowIdx, setRowIdx] = useState(null)
  const [swapping, setSwapping] = useState(null)
  const [adding, setAdding] = useState(false)
  const [coverage, setCoverage] = useState(false)

  if (!active) return null

  const jump = (i) => {
    useStore.getState().goToExercise(i)
    onClose()
  }

  const selectedEx = rowIdx != null ? active.exercises[rowIdx] : null
  const removable = selectedEx ? selectedEx.performed.filter((s) => s.done).length === 0 : false

  // Short on time is offered only once a workout is under way, never while one is being
  // built. Derived per render: whether anything carries `cut` is the whole trimmed state.
  const trimmed = active.exercises.some((e) => e.cut)
  const trimmable = active.exercises.some((e) => e.performed.length > TRIM_SETS && !e.performed.some((s) => s.done))
  const left = trimmed ? minutesLeft(active, workouts) : null

  return (
    <>
      <NavBar
        compact
        title={active.templateName}
        actions={
          <button type="button" className="btn" onClick={onEnd || onClose}>
            {onEnd ? 'End' : 'Done'}
          </button>
        }
      />
      <div className="screen-body">
        <div className="list">
          {active.exercises.map((ex, i) => {
            const def = getExercise(ex.exerciseId, customEx)
            const done = ex.performed.filter((s) => s.done).length
            const total = ex.performed.length
            const weight = ex.performed[0].weightKg
            const status = onStart
              ? `${total} × ${ex.repsMin}–${ex.repsMax}${weight != null ? ` · ${weight} kg` : ''}`
              : done === 0
                ? 'Not started'
                : done === total
                  ? 'Complete'
                  : `In progress · ${done}/${total}`
            return (
              <div className="row" key={i}>
                <button type="button" className="row-jump" onClick={() => (onStart ? setRowIdx(i) : jump(i))}>
                  <Thumb exercise={def} />
                  <div className="row-label">
                    <div className="title">{exerciseName(def)}</div>
                    <div className="subtitle tnum">{status}</div>
                  </div>
                  {!onStart && (
                    <span className="row-value tnum">
                      {done}/{total}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  className="row-more"
                  aria-label="Exercise options"
                  onClick={() => setRowIdx(i)}
                >
                  <Icon name="chevron" size={16} />
                </button>
              </div>
            )
          })}
        </div>
        {!onStart && trimmed && (
          <div>
            <p className="trim-note tnum">
              Trimmed to {TRIM_SETS} sets each{left != null ? ` · about ${left} min left` : ''}
            </p>
            <button type="button" className="btn" onClick={() => useStore.getState().undoTrim()}>
              Undo — back to full sets
            </button>
          </div>
        )}
        {!onStart && !trimmed && trimmable && (
          <Group>
            <Row
              title="Short on time"
              subtitle={`Trim what you have not started to ${TRIM_SETS} sets`}
              onClick={() => useStore.getState().trimUntouched()}
            />
          </Group>
        )}
        {/* A light day starts from what the block is owed: one tap each, or all of them. */}
        {onStart && <OwedList onAdd={(id) => useStore.getState().addExerciseToActive(id)} />}
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          Add exercise
        </button>
        {/* Building a custom workout is when a muscle that is behind gets made up, so the
            coverage sheet opens here and adds straight into the list above. */}
        {onStart && (
          <button type="button" className="btn" onClick={() => setCoverage(true)}>
            Muscle coverage
          </button>
        )}
        {onStart && (
          <button type="button" className="btn-primary" disabled={active.exercises.length === 0} onClick={onStart}>
            Start workout
          </button>
        )}
      </div>

      {rowIdx != null && (
        <ActionSheet
          onClose={() => setRowIdx(null)}
          actions={[
            { label: 'Swap exercise', onClick: () => setSwapping(rowIdx) },
            {
              label: removable ? 'Remove exercise' : 'Remove exercise — finish sets first',
              destructive: removable,
              onClick: removable ? () => useStore.getState().removeExerciseFromActive(rowIdx) : undefined,
            },
          ]}
        />
      )}

      {swapping != null && (
        <Sheet title="Swap exercise" onClose={() => setSwapping(null)}>
          <ExerciseBrowser
            selectLabel="Swap exercise"
            suggestFor={getExercise(active.exercises[swapping].exerciseId, customEx)}
            exclude={active.exercises.map((x) => x.exerciseId)}
            onSelect={(e) => {
              useStore.getState().swapMidWorkout(swapping, e.id)
              setSwapping(null)
            }}
          />
        </Sheet>
      )}

      {coverage && (
        <Sheet title="Muscle coverage" onClose={() => setCoverage(false)}>
          <MuscleCoverage onAdd={(id) => useStore.getState().addExerciseToActive(id)} />
        </Sheet>
      )}

      {adding && (
        <Sheet title="Add exercise" onClose={() => setAdding(false)}>
          <ExerciseBrowser
            selectLabel="Add exercise"
            onSelect={(e) => {
              useStore.getState().addExerciseToActive(e.id)
              setAdding(false)
            }}
          />
        </Sheet>
      )}
    </>
  )
}
