import { useStore } from '../store.js'
import { blockOwed } from '../engine/session.js'
import { getExercise, exerciseName } from '../lib/exercises.js'
import { Group, Row } from './List.jsx'

// What the block is owed, a row per exercise: sets done against the sets the plan gave it on
// the days actually trained. Stated as a count and nothing else — no colour, no "behind".
// `onAdd` is passed where a workout is being built, and puts an Add on each row plus one
// button that adds them all.
export default function OwedList({ onAdd }) {
  const plan = useStore((s) => s.plan)
  const swaps = useStore((s) => s.swaps)
  const workouts = useStore((s) => s.workouts)
  const blockIndex = useStore((s) => s.progress.blockIndex)
  const customEx = useStore((s) => s.customEx)
  const active = useStore((s) => s.active)

  const owed = blockOwed(plan, swaps, workouts, blockIndex)
  if (owed.length === 0) return null
  const inWorkout = new Set(active ? active.exercises.map((e) => e.exerciseId) : [])
  const addable = owed.filter((r) => !inWorkout.has(r.exerciseId))

  return (
    <>
      <div className="caption">Left over this block</div>
      <Group>
        {owed.map((r) => {
          const added = inWorkout.has(r.exerciseId)
          return (
            <Row
              key={r.exerciseId}
              title={exerciseName(getExercise(r.exerciseId, customEx))}
              subtitle={
                <span className="tnum">
                  {r.done} of {r.planned} sets · {plan.rotation[r.rotationIndex].name}
                </span>
              }
              value={
                onAdd && (
                  <button type="button" className="btn" disabled={added} onClick={() => onAdd(r.exerciseId)}>
                    {added ? 'Added' : 'Add'}
                  </button>
                )
              }
            />
          )
        })}
      </Group>
      {onAdd && addable.length > 1 && (
        <button type="button" className="btn" onClick={() => addable.forEach((r) => onAdd(r.exerciseId))}>
          Add all {addable.length}
        </button>
      )}
    </>
  )
}
