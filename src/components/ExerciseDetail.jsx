import { useStore } from '../store.js'
import { exerciseHistory, exerciseStats } from '../engine/session.js'
import { nextTarget, findSlotFor } from '../engine/progression.js'
import { weightHint } from '../lib/exercises.js'
import { fmtDate } from '../lib/format.js'
import { ExerciseMedia } from './ExerciseImage.jsx'
import Sparkline from './Sparkline.jsx'

// The last few sessions, newest first. Five is the window that fits without scrolling past
// the reference material below it, and further back is what the sparkline is for.
const RECENT = 5

export function Stat({ label, value, note }) {
  return (
    <div className="ex-stat">
      <div className="ex-stat-label">{label}</div>
      <div className="ex-stat-value tnum">{value}</div>
      {note && <div className="ex-stat-note tnum">{note}</div>}
    </div>
  )
}

// One exercise, as a training record first and a reference entry second. The order is
// deliberate: for an exercise you already train, what you lifted last week matters more
// than how to perform it, and the dataset's instructions were previously the only thing
// here at all.
export default function ExerciseDetail({ exercise }) {
  const state = useStore((s) => s)
  const history = exerciseHistory(state.workouts, exercise.id)
  const stats = exerciseStats(history)
  const slot = findSlotFor(state.plan, state.swaps, exercise.id)
  const target = slot ? nextTarget(slot.slotId, state, slot.rotationIndex) : null
  const recent = history.slice(-RECENT).reverse()

  return (
    <>
      <ExerciseMedia exercise={exercise} gif={!exercise.custom} />

      {stats && (
        <div className="ex-stats">
          <Stat
            label="Working weight"
            value={stats.latest != null ? `${stats.latest} kg` : '—'}
            /* Phase 9's quiet performance context: a recorded difference, not an award.
               Null on a single session, because there is nothing yet to compare against. */
            note={
              stats.change != null && stats.change !== 0
                ? `${stats.change > 0 ? '↑' : '↓'} ${Math.abs(stats.change)} kg since ${fmtDate(history[0].at)}`
                : null
            }
          />
          {stats.best && (
            <Stat
              label="Heaviest"
              value={`${stats.best.weightKg} kg × ${stats.best.reps}`}
              note={fmtDate(stats.best.at)}
            />
          )}
        </div>
      )}

      {target && (
        <>
          <div className="caption">Next target</div>
          <p className="ex-target tnum">
            {target.weightKg != null ? `${target.weightKg} kg × ` : ''}
            {target.repsMin}–{target.repsMax}
            {target.weightKg == null ? ' reps' : ''}
          </p>
          <p className="ex-reason">{target.reason}</p>
        </>
      )}

      {recent.length > 0 && (
        <>
          <div className="caption">Recent</div>
          {history.length > 1 && <Sparkline values={history.map((h) => h.topWeight)} />}
          <div className="list">
            {recent.map((r) => (
              <div className="ex-session" key={r.at}>
                <span className="ex-session-date">{fmtDate(r.at)}</span>
                <span className="ex-session-sets tnum">
                  {r.sets.map((s) => (s.weightKg != null ? `${s.weightKg}×${s.reps}` : `${s.reps}`)).join('  ')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {!stats && <p className="ex-empty">Not logged yet. Sessions with this exercise will show up here.</p>}

      <div className="caption">About</div>
      {exercise.custom ? (
        <p className="ex-about">Custom exercise · {exercise.bodyPart}</p>
      ) : (
        <>
          <p className="ex-about">
            {[exercise.target, exercise.equipment].filter(Boolean).join(' · ')}
            {exercise.secondary && exercise.secondary.length > 0
              ? ` · also ${exercise.secondary.join(', ')}`
              : ''}
          </p>
          {weightHint(exercise) && <p className="ex-about">{weightHint(exercise)}</p>}
          {exercise.steps && exercise.steps.length > 0 && (
            <ol className="steps">
              {exercise.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  )
}
