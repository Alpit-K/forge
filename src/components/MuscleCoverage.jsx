import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store.js'
import BODY from '../data/body.json'
import { PARTS } from '../lib/body.js'
import { MUSCLE_GROUPS, INDIRECT_CREDIT, coverageDone, coveragePlanned, coverageRates, coverageLevels } from '../engine/muscles.js'
import { sessionsDone, customSessions, extraSessions } from '../engine/session.js'
import { getExercise, exerciseName } from '../lib/exercises.js'
import Icon from './Icon.jsx'
import { Row } from './List.jsx'
import OwedList from './OwedList.jsx'

const GROUP_OF_PART = Object.fromEntries(Object.entries(PARTS).flatMap(([g, parts]) => parts.map((p) => [p, g])))

const plural = (n, word) => `${n} ${n === 1 ? word : `${word}s`}`

// A step's token, drawn the other way up: the least-trained step takes the lightest shade and
// a plan met the darkest (owner's decision, 2026-11-11). Step 0 is untrained either way.
const shade = (step) => `var(--cov-${step ? 5 - step : 0})`

// The figure is drawn in three passes so a muscle can carry an inner outline: fills first,
// then the outlined parts' strokes clipped to their own shape, then the sheet-coloured
// separator over every edge, which trims the outline's outer half away and leaves it inside
// the muscle. A muscle the plan asks for and nothing has trained yet is OUTLINED rather than
// shaded — it differs from a muscle the plan does not hold by shape, not by colour — and the
// group whose row is open is outlined in the label colour.
//
// The viewBox is cropped to the drawn parts on mount: MuscleMap's canvas carries a margin
// either side of the arms, and the crop is what lets the pair fill the sheet.
function Figure({ view, levels, outlined, open, onPick }) {
  const ref = useRef(null)
  const id = useId()
  // Written to the element rather than through state: it is a measurement of what was just
  // drawn, and React never rewrites the attribute because the prop below never changes.
  useLayoutEffect(() => {
    const b = ref.current.getBBox()
    ref.current.setAttribute('viewBox', `${b.x - 4} ${b.y - 4} ${b.width + 8} ${b.height + 8}`)
  }, [])
  const parts = Object.entries(view.parts).flatMap(([slug, paths]) =>
    paths.map((d, i) => ({ key: `${slug}-${i}`, d, group: GROUP_OF_PART[slug] })),
  )
  const ringed = parts.filter((p) => p.group && (p.group === open || outlined.has(p.group)))
  return (
    <svg
      ref={ref}
      className="cov-figure"
      viewBox={view.viewBox}
      aria-hidden="true"
      onClick={(e) => {
        const g = e.target.getAttribute('data-group')
        if (g) onPick(g)
      }}
    >
      <defs>
        {ringed.map((p) => (
          <clipPath key={p.key} id={`${id}${p.key}`}>
            <path d={p.d} />
          </clipPath>
        ))}
      </defs>
      {parts.map((p) => (
        <path
          key={p.key}
          d={p.d}
          data-group={p.group}
          fill={p.group ? shade(outlined.has(p.group) ? 0 : levels[p.group]) : 'var(--cov-inert)'}
        />
      ))}
      {ringed.map((p) => (
        <path
          key={p.key}
          d={p.d}
          className="cov-ring"
          data-open={p.group === open || undefined}
          clipPath={`url(#${id}${p.key})`}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {parts.map((p) => (
        <path key={p.key} d={p.d} className="cov-edge" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  )
}

// What the figure's steps mean, in words. The current block's steps are coverageLevel's own
// thresholds — under 50%, 50–74%, 75–99%, met — so the key cannot drift from the
// drawing. Where there is no plan to measure against, the steps are only relative.
function Legend({ planned, none }) {
  const steps = planned
    ? [
        ['not planned', 0],
        ['none yet', 'ring'],
        ['under 50%', 1],
        ['50–74%', 2],
        ['75–99%', 3],
        ['plan met', 4],
      ]
    : [
        [none, 0],
        ['least', 1],
        ['', 2],
        ['', 3],
        ['most', 4],
      ]
  return (
    <div className="cov-legend" style={{ gridTemplateColumns: `repeat(${steps.length}, 1fr)` }} aria-hidden="true">
      {steps.map(([word, step]) => (
        <div className="cov-key" key={step}>
          <span className="cov-swatch" data-ring={step === 'ring' || undefined} style={{ background: shade(step === 'ring' ? 0 : step) }} />
          <span>{word}</span>
        </div>
      ))}
    </div>
  )
}

// Sets per muscle for a block or for all time, on a body and in a list. Only the current
// block has a plan to measure against — no earlier plan is stored — so only it says "of" and
// draws a bar: sets done against the plan's sets for the whole block. An earlier block and all
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
  // Set when the figure opens a row, so the row is brought into view; a tap on the list
  // itself is already where the eye is.
  const reveal = useRef(false)
  const listRef = useRef(null)
  useEffect(() => {
    if (!reveal.current || !open) return
    reveal.current = false
    const row = [...listRef.current.querySelectorAll('button.row')].find((r) => r.querySelector('.title')?.textContent === open)
    ;(row?.nextElementSibling?.classList.contains('cov-exercises') ? row.nextElementSibling : row)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [open])

  const inWindow = all ? workouts : workouts.filter((w) => w.blockIndex === block)
  const done = coverageDone(inWindow, customEx)
  const isCurrent = !all && block === current
  const planned = isCurrent ? coveragePlanned(plan, swaps, customEx) : null
  const sessions = sessionsDone(workouts, block)
  const custom = customSessions(workouts, block)
  const extra = extraSessions(workouts, block)
  const rates = planned ? null : coverageRates(done, inWindow)
  const firstBlock = Math.min(current, ...workouts.map((w) => w.blockIndex))
  const inWorkout = new Set(active ? active.exercises.map((e) => e.exerciseId) : [])

  const due = (g) => (planned ? Math.round(planned[g].sets) : null)
  // Before the block's first session there is nothing done to shade, and an all-dark body
  // said nothing at the one moment you open this to see what the block asks for. So the
  // figure shows the plan itself until a session lands, shaded relative to the busiest group
  // exactly as an earlier block's rates are. The list's numbers are unchanged (owner's
  // decision, 2026-10-29).
  // Any log, extra included — an extra session's sets are coverage like any other's.
  const showPlan = planned != null && inWindow.length === 0
  const levels = coverageLevels(
    showPlan
      ? { done, rates: Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, planned[g].sets])) }
      : rates
        ? { done, rates }
        : { done, due: Object.fromEntries(MUSCLE_GROUPS.map((g) => [g, due(g)])) },
  )
  // Most sets first. Ties, and every row of a block not started yet, fall back to the plan.
  const rows = MUSCLE_GROUPS.filter((g) => done[g].sets > 0 || (planned && planned[g].sets > 0)).sort(
    (a, b) => done[b].sets - done[a].sets || (planned ? planned[b].sets - planned[a].sets : 0),
  )
  const untrained = MUSCLE_GROUPS.filter((g) => done[g].sets === 0)
  // Planned and untouched, once the block has begun: drawn as an outline, not a shade.
  const outlined = new Set(planned && !showPlan ? MUSCLE_GROUPS.filter((g) => planned[g].sets > 0 && done[g].sets === 0) : [])
  const pick = (g) => {
    if (!rows.includes(g)) return
    setOpen(open === g ? null : g)
    reveal.current = true
  }

  const value = (g) => {
    const d = done[g].sets
    if (!planned) return <><b>{rates[g]}</b> a week</>
    if (planned[g].sets === 0) return <><b>{d}</b> · off plan</>
    return <><b>{d}</b> of {due(g)} this block</>
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
              {custom > 0 && ` · ${custom} custom`}
              {extra > 0 && ` · ${extra} extra`}
            </div>
          </div>
          <button type="button" className="btn" aria-label="Later block" disabled={block >= current} onClick={() => setBlock(block + 1)}>
            <Icon name="chevron" size={18} />
          </button>
        </div>
      )}

      {showPlan && <div className="caption cov-plan-label">What the plan asks for</div>}
      <div className="cov-figures">
        <Figure view={BODY.front} levels={levels} outlined={outlined} open={open} onPick={pick} />
        <Figure view={BODY.back} levels={levels} outlined={outlined} open={open} onPick={pick} />
      </div>
      <Legend planned={planned != null && !showPlan} none={showPlan ? 'not planned' : 'not trained'} />

      <div className="list" ref={listRef}>
        {rows.map((g) => {
          // The plan's exercises first, then anything done that the plan does not hold.
          const exercises = new Map(planned ? planned[g].exercises : [])
          for (const [id, x] of done[g].exercises) if (!exercises.has(id)) exercises.set(id, x)
          return (
            <Fragment key={g}>
              <Row
                title={g}
                // Sets that reached the group through another lift's secondaries, at half a
                // set each. Secondary text only: the bar, the target and the shading stay
                // direct. Where the figure is a weekly rate a set count would be a second unit.
                subtitle={
                  planned && done[g].indirect > 0 ? (
                    <span className="tnum">+{done[g].indirect * INDIRECT_CREDIT} from other lifts</span>
                  ) : null
                }
                value={value(g)}
                chevron
                open={open === g}
                onClick={() => setOpen(open === g ? null : g)}
              >
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

      {isCurrent && <OwedList onAdd={onAdd} />}

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
