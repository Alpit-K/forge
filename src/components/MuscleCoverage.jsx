import { Fragment, useState } from 'react'
import { useStore } from '../store.js'
import BODY from '../data/body.json'
import { PARTS } from '../lib/body.js'
import { MUSCLE_GROUPS, coverageDone, coveragePlanned, coverageDue, coverageRates, coverageLevels } from '../engine/muscles.js'
import { sessionsDone } from '../engine/session.js'
import { getExercise, exerciseName } from '../lib/exercises.js'
import Icon from './Icon.jsx'
import { Row } from './List.jsx'

const GROUP_OF_PART = Object.fromEntries(Object.entries(PARTS).flatMap(([g, parts]) => parts.map((p) => [p, g])))

const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`

function Figure({ view, levels }) {
  return (
    <svg className="cov-figure" viewBox={view.viewBox} aria-hidden="true">
      {Object.entries(view.parts).map(([slug, paths]) => {
        const group = GROUP_OF_PART[slug]
        const fill = group ? `var(--cov-${levels[group]})` : 'var(--cov-inert)'
        return paths.map((d, i) => <path key={`${slug}-${i}`} d={d} fill={fill} />)
      })}
    </svg>
  )
}

// Sets per muscle for a block or for all time, on a body and in a list. Only the current
// block has a plan to measure against — no earlier plan is stored — so only it says "of" and
// draws a bar: the plan's sets for the block, scaled to the sessions done so far, counted in
// sessions, never dates, because a block is a count of sessions. An earlier block and all
// time state sets per week instead, with no bar, since a bar against the busiest group
// could never fill for the rest. `onAdd` is passed from the
// custom-workout builder, which is where a muscle that is behind gets made up.
export default function MuscleCoverage({ onAdd }) {
  const workouts = useStore((s) => s.workouts)
  const plan = useStore((s) => s.plan)
  const swaps = useStore((s) => s.swaps)
  const customEx = useStore((s) => s.customEx)
  const current = useStore((s) => s.progress.blockIndex)
  const active = useStore((s) => s.active)
  const [all, setAll] = useState(false)
  const [block, setBlock] = useState(current)
  const [open, setOpen] = useState(null)

  const inWindow = all ? workouts : workouts.filter((w) => w.blockIndex === block)
  const done = coverageDone(inWindow, customEx)
  const isCurrent = !all && block === current
  const planned = isCurrent ? coveragePlanned(plan, swaps, customEx) : null
  const sessions = sessionsDone(workouts, block)
  const rates = planned ? null : coverageRates(done, inWindow)
  const firstBlock = Math.min(current, ...workouts.map((w) => w.blockIndex))
  const inWorkout = new Set(active ? active.exercises.map((e) => e.exerciseId) : [])

  const due = (g) => (planned ? coverageDue(planned[g].sets, sessions, plan.sessionCount) : null)
  // Before the block's first session there is nothing done to shade, and an all-dark body
  // said nothing at the one moment you open this to see what the block asks for. So the
  // figure shows the plan itself until a session lands, shaded relative to the busiest group
  // exactly as an earlier block's rates are. The list's numbers are unchanged (owner's
  // decision, 2026-10-29).
  const showPlan = planned != null && sessions === 0
  const levels = coverageLevels(
    showPlan
      ? { done, rates: Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, planned[g].sets])) }
      : rates
        ? { done, rates }
        : { done, due: Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, due(g)])) },
  )
  const rows = MUSCLE_GROUPS.filter((g) => done[g].sets > 0 || (planned && planned[g].sets > 0))
  const untrained = MUSCLE_GROUPS.filter((g) => done[g].sets === 0)

  const value = (g) => {
    const d = done[g].sets
    if (!planned) return <><b>{rates[g]}</b> a week</>
    if (planned[g].sets === 0) return <><b>{d}</b> · off plan</>
    if (sessions === 0) return <><b>0</b> of {Math.round(planned[g].sets)} this block</>
    return <><b>{d}</b> of {due(g)}</>
  }
  const fill = (g) => {
    const d = done[g].sets
    if (planned[g].sets === 0) return 1
    return due(g) ? Math.min(1, d / due(g)) : 0
  }

  return (
    <div className="cov">
      <div className="segmented">
        <button type="button" aria-pressed={!all} onClick={() => setAll(false)}>
          Block
        </button>
        <button type="button" aria-pressed={all} onClick={() => setAll(true)}>
          All
        </button>
      </div>

      {!all && (
        <div className="cov-period">
          <button type="button" className="btn" aria-label="Earlier block" disabled={block <= firstBlock} onClick={() => setBlock(block - 1)}>
            <span className="cov-back">
              <Icon name="chevron" size={18} />
            </span>
          </button>
          <div>
            <div className="cov-period-title">Block {block + 1}</div>
            <div className="cov-period-sub tnum">
              {isCurrent ? `${sessions} of ${plan.sessionCount} sessions done` : plural(sessions, 'session')}
            </div>
          </div>
          <button type="button" className="btn" aria-label="Later block" disabled={block >= current} onClick={() => setBlock(block + 1)}>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      )}

      {showPlan && <div className="caption cov-plan-label">What the plan asks for</div>}
      <div className="cov-figures">
        <Figure view={BODY.front} levels={levels} />
        <Figure view={BODY.back} levels={levels} />
      </div>

      <div className="list">
        {rows.map((g) => {
          // The plan's exercises first, then anything done that the plan does not hold.
          const exercises = new Map(planned ? planned[g].exercises : [])
          for (const [id, x] of done[g].exercises) if (!exercises.has(id)) exercises.set(id, x)
          return (
            <Fragment key={g}>
              <Row title={g} value={value(g)} chevron open={open === g} onClick={() => setOpen(open === g ? null : g)}>
                {planned && (
                  <div className="cov-bar">
                    <span style={{ width: `${fill(g) * 100}%` }} />
                  </div>
                )}
              </Row>
              {open === g && (
                <div className="cov-exercises">
                  {[...exercises.values()].map((x) => {
                    const doneIn = done[g].exercises.get(x.exerciseId)?.sessions || 0
                    const added = inWorkout.has(x.exerciseId)
                    return (
                      <div className="cov-exercise" key={x.exerciseId}>
                        <div>
                          <div className="cov-exercise-name">{exerciseName(getExercise(x.exerciseId, customEx))}</div>
                          <div className="cov-exercise-meta tnum">
                            {x.days
                              ? `${doneIn} of ${Math.round(x.sessions)} sessions this block · ${x.days.join(', ')}`
                              : `Done in ${plural(doneIn, 'session')}`}
                          </div>
                        </div>
                        {onAdd && (
                          <button type="button" className="btn" disabled={added} onClick={() => onAdd(x.exerciseId)}>
                            {added ? 'Added' : 'Add'}
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </Fragment>
          )
        })}
      </div>

      {planned && sessions > 0 && (
        <p className="cov-note tnum">
          Planned by now: the block's plan × {sessions} of {plan.sessionCount} sessions done.
        </p>
      )}

      {inWindow.length === 0 ? (
        <p className="cov-note">
          {all
            ? 'Nothing logged yet.'
            : showPlan
              ? 'Nothing logged in this block yet. The figure shows the plan until the first session.'
              : 'Nothing logged in this block yet.'}
        </p>
      ) : (
        untrained.length > 0 && (
          <>
            <div className="caption">Not trained {all ? 'yet' : 'this block'}</div>
            <div className="chip-row">
              {untrained.map((g) => (
                <span className="chip cov-untrained" key={g}>
                  {g}
                </span>
              ))}
            </div>
          </>
        )
      )}
    </div>
  )
}
