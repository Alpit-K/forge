import { useState } from 'react'
import { useStore } from '../store.js'
import { exerciseName } from '../lib/exercises.js'
import NavBar from '../components/NavBar.jsx'
import Icon from '../components/Icon.jsx'
import { Group, Row } from '../components/List.jsx'
import Sheet from '../components/Sheet.jsx'
import ExerciseBrowser from '../components/ExerciseBrowser.jsx'
import ExerciseDetail from '../components/ExerciseDetail.jsx'
import Selector from '../components/Selector.jsx'

const BODY_PARTS = ['back', 'cardio', 'chest', 'lower arms', 'lower legs', 'neck', 'shoulders', 'upper arms', 'upper legs', 'waist']

function DetailSheet({ exercise, onClose }) {
  return (
    <Sheet title={exerciseName(exercise)} onClose={onClose}>
      <ExerciseDetail exercise={exercise} />
    </Sheet>
  )
}

function NewExerciseSheet({ onClose }) {
  const [name, setName] = useState('')
  const [bodyPart, setBodyPart] = useState('chest')

  const submit = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    useStore.getState().addCustomExercise(trimmed, bodyPart)
    onClose()
  }

  return (
    <Sheet title="New exercise" onClose={onClose}>
      <input
        className="search"
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      {/* The same grouped row Settings and Plan's edit sheet are built from. It was a bare
          label-and-control sitting on the sheet with no card under it, which is the one
          pattern in the app that never got the grouped list. */}
      <Group>
        <Row
          title="Body part"
          value={
            <Selector
              label="Body part"
              value={bodyPart}
              options={BODY_PARTS.map((b) => ({ value: b, label: b }))}
              onChange={setBodyPart}
            />
          }
        />
      </Group>
      <button type="button" className="btn-primary" onClick={submit} disabled={!name.trim()}>
        Add exercise
      </button>
    </Sheet>
  )
}

export default function Library() {
  const [detail, setDetail] = useState(null)
  const [adding, setAdding] = useState(false)

  return (
    <>
      <NavBar
        title="Library"
        actions={
          <button type="button" className="btn" aria-label="New exercise" onClick={() => setAdding(true)}>
            <Icon name="plus" size={22} />
          </button>
        }
      />
      <div className="screen-body">
        <ExerciseBrowser onSelect={setDetail} />
      </div>

      {detail && <DetailSheet exercise={detail} onClose={() => setDetail(null)} />}
      {adding && <NewExerciseSheet onClose={() => setAdding(false)} />}
    </>
  )
}
