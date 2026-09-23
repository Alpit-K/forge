import { useState } from 'react'
import { useStore } from '../store.js'
import { getExercise, exerciseName } from '../lib/exercises.js'
import NavBar from './NavBar.jsx'
import { Thumb } from './ExerciseImage.jsx'
import Sheet, { ActionSheet } from './Sheet.jsx'
import ExerciseBrowser from './ExerciseBrowser.jsx'
import Icon from './Icon.jsx'

export default function SessionOverview({ onClose, onEnd }) {
  const active = useStore((s) => s.active)
  const customEx = useStore((s) => s.customEx)
  const [rowIdx, setRowIdx] = useState(null)
  const [swapping, setSwapping] = useState(null)
  const [adding, setAdding] = useState(false)

  if (!active) return null

  const jump = (i) => {
    useStore.getState().goToExercise(i)
    onClose()
  }

  const selectedEx = rowIdx != null ? active.exercises[rowIdx] : null
  const removable = selectedEx ? selectedEx.performed.filter((s) => s.done).length === 0 : false

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
            const status = done === 0 ? 'Not started' : done === total ? 'Complete' : `In progress · ${done}/${total}`
            return (
              <div className="row" key={i}>
                <button type="button" className="row-jump" onClick={() => jump(i)}>
                  <Thumb exercise={def} />
                  <div className="row-label">
                    <div className="title">{exerciseName(def)}</div>
                    <div className="subtitle">{status}</div>
                  </div>
                  <span className="row-value tnum">
                    {done}/{total}
                  </span>
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
        <button type="button" className="btn" onClick={() => setAdding(true)}>
          Add exercise
        </button>
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
