import { useState } from 'react'
import { useStore } from '../store.js'
import { getExercise, exerciseName } from '../lib/exercises.js'
import { incrementFor } from '../engine/progression.js'
import { exerciseHistory, stalledAt, STALL_SESSIONS } from '../engine/session.js'
import { plannedSetsPerWeek } from '../engine/muscles.js'
import { fmtRest } from '../lib/format.js'
import NavBar from '../components/NavBar.jsx'
import Icon from '../components/Icon.jsx'
import { Group, Row, RowIcon, Section } from '../components/List.jsx'
import { Thumb } from '../components/ExerciseImage.jsx'
import Sheet from '../components/Sheet.jsx'
import ExerciseBrowser from '../components/ExerciseBrowser.jsx'
import Selector from '../components/Selector.jsx'

// Six pickers stacked on the bare sheet, on no card, with no grouping and no headers — the
// one settable surface in the app that never got the grouped list every other one uses. The
// rows are `Row` + `Selector` now, which is the same pattern Settings is built from, so the
// separators, the rails and the 44pt minimum all come for free rather than being restated.
function EditSheet({ sessionIdx, exerciseIdx, onClose, onSwap }) {
  const state = useStore((s) => s)
  const exercises = state.plan.rotation[sessionIdx].exercises
  const entry = exercises[exerciseIdx]
  const effectiveId = state.swaps[entry.exerciseId] || entry.exerciseId
  const ex = getExercise(effectiveId, state.customEx)
  const update = (patch) => useStore.getState().updateTemplateEntry(sessionIdx, exerciseIdx, patch)

  const range = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => from + i)
  const numbers = (options) => options.map((o) => ({ value: o, label: String(o) }))
  const pick = (label, value, options, onChange) => (
    <Selector label={label} value={value} options={options} onChange={(v) => onChange(Number(v))} />
  )

  return (
    <Sheet title={exerciseName(ex)} onClose={onClose}>
      <Section>Prescription</Section>
      <Group>
        <Row title="Sets" value={pick('Sets', entry.sets, numbers(range(1, 8)), (v) => update({ sets: v }))} />
        <Row
          title="Reps (min)"
          value={pick('Reps (min)', entry.repsMin, numbers(range(1, 20)), (v) =>
            update({ repsMin: v, repsMax: Math.max(v, entry.repsMax) }),
          )}
        />
        <Row
          title="Reps (max)"
          value={pick('Reps (max)', entry.repsMax, numbers(range(2, 30)), (v) =>
            update({ repsMax: v, repsMin: Math.min(v, entry.repsMin) }),
          )}
        />
        <Row
          title="Rest"
          value={pick(
            'Rest',
            entry.restSec,
            range(0, 10).map((n) => ({ value: n * 15, label: `${n * 15}s` })),
            (v) => update({ restSec: v }),
          )}
        />
      </Group>

      <Section>Progression</Section>
      <Group>
        {/* Auto is the equipment's own increment — 2 kg dumbbell, 2.5 or 5 kg cable by the
            muscle it trains, 5 kg lever machine, 2.5 plates — resolved through the same
            `incrementFor` the engine uses, so the label cannot state a number the progression
            would not apply. */}
        <Row
          title="Increment"
          subtitle="How much the weight moves when you clear the top of the range"
          value={
            <Selector
              label="Increment"
              value={entry.incrementKg == null ? '' : entry.incrementKg}
              options={[
                { value: '', label: `Auto · ${incrementFor(null, ex)} kg` },
                { value: 2, label: '2 kg' },
                { value: 2.5, label: '2.5 kg' },
                { value: 5, label: '5 kg' },
                { value: 10, label: '10 kg' },
              ]}
              onChange={(v) => update({ incrementKg: v === '' ? null : Number(v) })}
            />
          }
        />
      </Group>

      <Section>This exercise</Section>
      <Group>
        <Row
          title="Swap exercise"
          subtitle="Permanently, in every session that uses it"
          thumb={<RowIcon name="swap" />}
          accent
          chevron
          onClick={() => {
            onClose()
            onSwap(entry.exerciseId)
          }}
        />
        <Row
          title="Move up"
          thumb={<RowIcon name="arrow-up" />}
          accent={exerciseIdx > 0}
          disabled={exerciseIdx === 0}
          onClick={() => {
            useStore.getState().reorderExercise(sessionIdx, exerciseIdx, exerciseIdx - 1)
            onClose()
          }}
        />
        <Row
          title="Move down"
          thumb={<RowIcon name="arrow-down" />}
          accent={exerciseIdx < exercises.length - 1}
          disabled={exerciseIdx === exercises.length - 1}
          onClick={() => {
            useStore.getState().reorderExercise(sessionIdx, exerciseIdx, exerciseIdx + 1)
            onClose()
          }}
        />
        <Row
          title="Remove exercise"
          thumb={<RowIcon name="trash" danger />}
          danger
          onClick={() => {
            useStore.getState().removeExerciseFromSession(sessionIdx, exerciseIdx)
            onClose()
          }}
        />
      </Group>
    </Sheet>
  )
}

export default function Plan() {
  const state = useStore((s) => s)
  const { plan, swaps, customEx } = state
  const [editing, setEditing] = useState(null)
  const [adding, setAdding] = useState(null)
  const [swapping, setSwapping] = useState(null)

  return (
    <>
      <NavBar title="Plan" />
      <div className="screen-body">
        {plan.rotation.map((session, si) => (
          <div key={si}>
            {/* All three days take the same lift tint on purpose — a colour per day would
                make the tint mean "which day" rather than "strength", and there are only two
                category colours for exactly that reason. The day's name is what tells them
                apart; the glyph is what lets you find the boundary scrolling past it. */}
            <div className="plan-session-head">
              <RowIcon name="dumbbell" cat="lift" />
              <Section>
                {session.name} · {session.exercises.length}{' '}
                {session.exercises.length === 1 ? 'exercise' : 'exercises'} ·{' '}
                {session.exercises.reduce((n, e) => n + e.sets, 0)} sets
              </Section>
            </div>
            <Group className="plan-sequence">
              {session.exercises.map((e, ei) => {
                const effectiveId = swaps[e.exerciseId] || e.exerciseId
                const ex = getExercise(effectiveId, customEx)
                const stall = stalledAt(exerciseHistory(state.workouts, effectiveId))
                return (
                  <Row
                    key={`${si}-${e.exerciseId}-${ei}`}
                    title={exerciseName(ex)}
                    subtitle={`${e.sets} × ${e.repsMin}–${e.repsMax} · rest ${fmtRest(e.restSec)}`}
                    thumb={
                      <span className="plan-order">
                        <span className="plan-order-n tnum">{ei + 1}</span>
                        <Thumb exercise={ex} />
                      </span>
                    }
                    chevron
                    onClick={() => setEditing({ sessionIdx: si, exerciseIdx: ei })}
                  >
                    {/* A fact, not an alarm — the fix is the rep window or the step, and
                        both are one tap away in the sheet this row opens. */}
                    {stall != null && (
                      <div className="subtitle tnum">
                        No gain in {STALL_SESSIONS} sessions at {stall} kg
                      </div>
                    )}
                  </Row>
                )
              })}
            </Group>
            <button type="button" className="btn-add" onClick={() => setAdding(si)}>
              <Icon name="plus" size={16} />
              Add exercise
            </button>
          </div>
        ))}

        {/* The coverage table block 2 was designed from, recounted on every edit. The big
            number is direct work; compound lifts reaching a muscle second-hand are the
            subtitle, the way the table wrote "triceps: 3, plus every press". A zero stays:
            it is the fact the table exists to show. */}
        <Section>Sets per week</Section>
        <Group>
          {plannedSetsPerWeek(plan, swaps, customEx, state.settings.weeklyLifts).map((r) => (
            <Row
              key={r.group}
              title={r.group}
              subtitle={r.indirect > 0 ? `+${r.indirect} from compound lifts` : undefined}
              value={<span className="tnum">{r.direct}</span>}
              metric
            />
          ))}
        </Group>

        {/* Last, not first: it is set a couple of times a year, and the programme is what
            this screen is for. */}
        <Section>Block</Section>
        <Group>
          <Row
            title="Sessions per block"
            subtitle="A block ends here and the label moves on; nothing else changes"
            thumb={<RowIcon name="plan" />}
            value={<SessionCountControl />}
          />
        </Group>
      </div>

      {editing && (
        <EditSheet
          sessionIdx={editing.sessionIdx}
          exerciseIdx={editing.exerciseIdx}
          onClose={() => setEditing(null)}
          onSwap={(originalId) => setSwapping(originalId)}
        />
      )}

      {adding != null && (
        <Sheet title="Add exercise" onClose={() => setAdding(null)}>
          <ExerciseBrowser
            onSelect={(e) => {
              useStore.getState().addExerciseToSession(adding, e.id)
              setAdding(null)
            }}
          />
        </Sheet>
      )}

      {swapping && (
        <Sheet title="Swap exercise" onClose={() => setSwapping(null)}>
          <ExerciseBrowser
            suggestFor={getExercise(swaps[swapping] || swapping, customEx)}
            onSelect={(e) => {
              useStore.getState().swapExercisePermanent(swapping, e.id)
              setSwapping(null)
            }}
          />
        </Sheet>
      )}
    </>
  )
}

function SessionCountControl() {
  const sessionCount = useStore((s) => s.plan.sessionCount)
  const setSessionCount = useStore((s) => s.setSessionCount)
  return (
    <Selector
      label="Sessions per block"
      value={sessionCount}
      options={[12, 18, 24, 30, 36, 48].map((n) => ({ value: n, label: String(n) }))}
      onChange={(v) => setSessionCount(Number(v))}
    />
  )
}
