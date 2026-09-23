import { Fragment, useEffect, useMemo, useState } from 'react'
import { useStore } from '../store.js'
import { nextTarget } from '../engine/progression.js'
import {
  blockWeightChanges,
  lastDoneByRotation,
  heaviestDone,
  slotResult,
  sessionsDone,
  isBlockComplete,
} from '../engine/session.js'
import { recommend, nextSession } from '../engine/coach.js'
import { weekDays, dayIndex } from '../engine/week.js'
import { getExercise, exerciseName, gifSrc, weightHint } from '../lib/exercises.js'
import { ACTIVITY_TYPES } from '../lib/activities.js'
import NavBar from '../components/NavBar.jsx'
import { Group, Row, Section } from '../components/List.jsx'
import { Thumb, ExerciseMedia } from '../components/ExerciseImage.jsx'
import BigStepper from '../components/BigStepper.jsx'
import RestTimer from '../components/RestTimer.jsx'
import Sheet, { ActionSheet } from '../components/Sheet.jsx'
import ExerciseBrowser from '../components/ExerciseBrowser.jsx'
import SessionOverview from '../components/SessionOverview.jsx'
import ActivitySheet from '../components/ActivitySheet.jsx'
import WeekSheet from '../components/WeekSheet.jsx'
import { requestReloadIfIdle } from '../lib/update.js'
import Icon from '../components/Icon.jsx'
import { fmtDuration, fmtDate, fmtAgo, fmtActivityCount, fmtDistance } from '../lib/format.js'

export default function Today() {
  const active = useStore((s) => s.active)
  const blockIndex = useStore((s) => s.progress.blockIndex)
  const workouts = useStore((s) => s.workouts)
  const sessionCount = useStore((s) => s.plan.sessionCount)
  const [summary, setSummary] = useState(null)

  if (active) {
    return <WorkoutFlow onFinish={setSummary} />
  }
  if (summary) {
    return (
      <SummaryView
        summary={summary}
        onDone={() => {
          setSummary(null)
          requestReloadIfIdle()
        }}
      />
    )
  }
  if (isBlockComplete(sessionsDone(workouts, blockIndex), sessionCount)) {
    return <BlockCompleteView />
  }
  return <IdleView />
}

const DAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

// The opening lift of a rotation slot, resolved through the same nextTarget() the session
// itself will use, so a card can never disagree with the first screen of the workout. Both
// the coach card and the next-session preview read it — one rule, two callers.
function leadTarget(state, rotationIndex) {
  const t = state.plan.rotation[rotationIndex]?.exercises[0]
  if (!t) return null
  const target = nextTarget(t.exerciseId, state, rotationIndex)
  const ex = getExercise(state.swaps[t.exerciseId] || t.exerciseId, state.customEx)
  return {
    name: exerciseName(ex),
    value:
      target.weightKg != null
        ? `${target.weightKg} kg × ${target.repsMin}–${target.repsMax}`
        : `${target.repsMin}–${target.repsMax} reps`,
  }
}

// Seven derived cells, carrying two independent facts: colour says whether the day is
// training at all, fill says whether it happened. So a planned day is an accent ring and a
// rest day is a small grey dot — the two used to be a grey ring and a grey dot of the same
// size, which is no distinction at all on a phone.
//
// Past and future planned days are drawn IDENTICALLY, on purpose. Drawing yesterday's
// unfulfilled plan differently is missed-session state by another name, and there is none
// anywhere in this app. It also used to mean a planned day in the future rendered exactly
// like a rest day, so the strip could not be read as the week's shape at all.
function WeekStrip({ days }) {
  return (
    <div className="week-strip" aria-label="This week">
      {days.map((d) => {
        // Two independent facts, two independent attributes — they were one before, which is
        // why the dot could say "planned" or "lift" but never "a lift day, still to come".
        // `data-state` is whether it happened; `data-kind` is which of the two it is or was.
        // A long run is the cardio kind here exactly as it is in the week planner: the shape
        // sets four kinds, the strip reports two.
        const done = d.lifts > 0 ? 'lift' : d.cardio > 0 ? 'cardio' : null
        const planned = d.planned && d.planned !== 'rest' ? (d.planned === 'lift' ? 'lift' : 'cardio') : null
        const kind = done || planned
        const state = done ? 'done' : planned ? 'planned' : 'rest'
        return (
          <div key={d.index} className="week-day" data-today={d.isToday || undefined}>
            <span className="week-day-letter">{DAY_INITIALS[d.index]}</span>
            <span className="week-day-dot" data-state={state} data-kind={kind || undefined} />
          </div>
        )
      })}
    </div>
  )
}

// What the week actually contained, by type — the counts line above it is target-relative
// ("Lifts 2 of 3") and answers a different question. Types with nothing in them are left
// out rather than listed as zero: a row of zeroes is a list of things you did not do.
function activityMix(cardioLogs) {
  return ACTIVITY_TYPES.map((t) => {
    const count = cardioLogs.filter((a) => a.type === t.id).length
    return { label: count === 1 ? t.label : t.plural, count }
  }).filter((m) => m.count > 0)
}

// The one decision. Everything else on this screen is below it, and the reason sits BELOW
// the action deliberately — the explanation is what makes the card trustworthy, not what
// you came to the screen to read.
function CoachCard({ rec, lead, meta, onStart, onLog }) {
  const kind = rec.kind === 'lift' ? 'Lift' : rec.kind === 'cardio' ? 'Cardio' : 'Rest'
  // The same four glyphs and the same two tints the week planner in Settings draws, so the
  // suggestion and the shape it came from are plainly the same vocabulary. A suggested long
  // run takes `route` for the reason it does there: it is the cardio kind done further, and
  // a second blue would read as a fault rather than a distinction.
  const glyph =
    rec.kind === 'lift' ? 'dumbbell' : rec.kind === 'rest' ? 'rest' : rec.cardioKind === 'long' ? 'route' : 'run'
  const cat = rec.kind === 'lift' ? 'lift' : rec.kind === 'rest' ? 'rest' : 'cardio'
  return (
    <div className="coach-card">
      <div className="coach-head">
        {/* The glyph is tinted and the label is not: an eyebrow is a passive label and is
            never accent-coloured, which is the rule the whole eyebrow block is written
            under. The colour belongs to the category, not to the word. */}
        <span className="coach-lead">
          <span className="coach-glyph" data-cat={cat}>
            <Icon name={glyph} size={15} />
          </span>
          <span className="coach-kind">{kind}</span>
        </span>
        {meta && <span className="coach-meta tnum">{meta}</span>}
      </div>
      <div className="coach-title">{rec.title}</div>
      <div className="coach-detail">{rec.detail}</div>

      {/* The first exercise of the slot, resolved through the same nextTarget() the session
          itself will use. It is the number that decides whether you are going. */}
      {lead && (
        <div className="coach-target">
          <span className="coach-target-name">{lead.name}</span>
          <span className="coach-target-value tnum">{lead.value}</span>
        </div>
      )}

      {rec.kind === 'lift' && (
        <button type="button" className="btn-primary" onClick={onStart}>
          Start workout
        </button>
      )}
      {rec.kind === 'cardio' && (
        <button type="button" className="btn-primary" onClick={onLog}>
          Log it
        </button>
      )}
      {rec.reason && <div className="coach-reason">{rec.reason}</div>}
    </div>
  )
}

function IdleView() {
  const state = useStore((s) => s)
  const { plan, progress, workouts, activities, swaps, customEx, settings } = state
  const [picked, setPicked] = useState(null)
  const [expanded, setExpanded] = useState(false)
  const [activitySheet, setActivitySheet] = useState(null)
  const [weekOpen, setWeekOpen] = useState(false)
  const lastDone = lastDoneByRotation(workouts, plan.rotation.length)

  // Recomputed from history on every render, never stored. Correcting a run in History moves
  // the card and the strip immediately, for the same reason a mistyped set fixes the next
  // target — there are no counters to drift.
  const rec = useMemo(() => recommend(state), [state])
  const days = useMemo(
    () => weekDays(workouts, activities, settings.weekShape || [], new Date()),
    [workouts, activities, settings.weekShape],
  )

  const week = rec.week
  const suggestedIndex = rec.kind === 'lift' ? rec.rotationIndex : null
  const now = new Date()

  // The lead exercise of the suggested slot — the movement the day is named after, and the
  // number that actually decides whether you are going.
  const lead = useMemo(
    () => (suggestedIndex == null ? null : leadTarget(state, suggestedIndex)),
    [state, suggestedIndex],
  )

  // What is coming, once the card above has nothing to offer — you have trained today, or
  // it is a rest day the week is on track for. It is a forecast and never a fixture: a lift
  // shows its opening target, cardio names itself, and the whole thing is recomputed from
  // history on the next render.
  const next = useMemo(() => (rec.kind === 'rest' ? nextSession(state) : null), [state, rec.kind])
  const nextLead = useMemo(
    () => (next && next.rec.kind === 'lift' ? leadTarget(state, next.rec.rotationIndex) : null),
    [state, next],
  )

  // Block position belongs to a lifting suggestion. Above the card it read as a standing
  // instruction on a rest day too, which is the opposite of what the coach just said.
  const meta =
    rec.kind === 'lift'
      ? `Session ${sessionsDone(workouts, progress.blockIndex) + 1} of ${plan.sessionCount}`
      : null
  const mix = activityMix(week.cardioLogs)

  // The coach's cardioKind maps onto a run type AND an intensity, so "Log it" on a suggested
  // session opens with both already chosen. A long run defaults to easy — steady base rather
  // than intervals — and the user can flip either chip in the sheet.
  const RUN_TYPE_FOR = {
    easy: { runType: 'short', intensity: 'easy' },
    long: { runType: 'long', intensity: 'easy' },
    hard: { runType: 'intervals', intensity: 'hard' },
  }
  const logSuggested = () => {
    const preset = RUN_TYPE_FOR[rec.cardioKind] || RUN_TYPE_FOR.easy
    setActivitySheet({ type: 'run', runType: preset.runType, intensity: preset.intensity })
  }

  return (
    <>
      {/* "Today" restated, vaguely, what the date line directly beneath it already said
          precisely. The date is now the bar's own subtitle and the title carries the app's
          identity instead — this screen only. */}
      <NavBar
        title="Forge"
        mark={<Icon name="anvil" size={30} />}
        subtitle={`${DAY_NAMES[dayIndex(now)]} ${fmtDate(now.toISOString())}`}
      />
      <div className="screen-body">
        <CoachCard
          rec={rec}
          lead={lead}
          meta={meta}
          onStart={() => suggestedIndex != null && useStore.getState().startWorkout(suggestedIndex)}
          onLog={logSuggested}
        />

        {next && (
          <>
            <Section>Next session</Section>
            <Group>
              <Row
                title={next.rec.title}
                subtitle={next.rec.detail}
                value={next.days === 1 ? 'Tomorrow' : DAY_NAMES[dayIndex(next.date)]}
              />
              {nextLead && (
                <Row title={nextLead.name} subtitle="First exercise" value={<span className="tnum">{nextLead.value}</span>} />
              )}
            </Group>
          </>
        )}

        {rec.kind === 'lift' && suggestedIndex != null && (
          <Group>
            {plan.rotation[suggestedIndex].exercises.map((t) => {
              const effectiveId = swaps[t.exerciseId] || t.exerciseId
              const ex = getExercise(effectiveId, customEx)
              const target = nextTarget(t.exerciseId, state, suggestedIndex)
              return (
                <Row
                  key={t.exerciseId}
                  title={exerciseName(ex)}
                  subtitle={`${t.sets} × ${t.repsMin}–${t.repsMax} · ${
                    target.kind === 'first' ? 'First time' : target.reason
                  }`}
                  value={target.weightKg != null ? `${target.weightKg} kg` : null}
                  metric
                  thumb={<Thumb exercise={ex} />}
                />
              )
            })}
          </Group>
        )}

        {/* The old picker, demoted rather than removed. It never scolds and it is one tap
            away — a card you cannot overrule is a card you stop trusting.

            The three sessions live INSIDE the trigger's own card rather than in a card each.
            Four stacked cards read as four unrelated things appearing, not as one disclosure
            opening; one container growing is what makes the row look expandable before you
            have tapped it. `.disclosure` animates the height with the 0fr → 1fr grid trick,
            so the rows are always mounted and there is no measuring. */}
        <Group>
          <Row
            title="Something else"
            chevron
            open={expanded}
            onClick={() => setExpanded(!expanded)}
          />
          <div className="disclosure" data-open={expanded || undefined}>
            <div className="disclosure-body">
              {plan.rotation.map((template, ri) => (
                <Fragment key={ri}>
                  <Row
                    title={template.name}
                    value={
                      <span className="session-pick-value">
                        {lastDone[ri] ? fmtAgo(lastDone[ri]) : 'Not yet'}
                        {picked === ri && (
                          <span className="pick-tick">
                            <Icon name="check" size={16} />
                          </span>
                        )}
                      </span>
                    }
                    chevron={picked !== ri}
                    onClick={() => setPicked(picked === ri ? null : ri)}
                  />
                  {picked === ri &&
                    template.exercises.map((t) => {
                      const effectiveId = swaps[t.exerciseId] || t.exerciseId
                      const ex = getExercise(effectiveId, customEx)
                      const target = nextTarget(t.exerciseId, state, ri)
                      return (
                        <Row
                          key={t.exerciseId}
                          title={exerciseName(ex)}
                          subtitle={`${t.sets} × ${t.repsMin}–${t.repsMax} · ${
                            target.kind === 'first' ? 'First time' : target.reason
                          }`}
                          value={target.weightKg != null ? `${target.weightKg} kg` : null}
                          metric
                          thumb={<Thumb exercise={ex} />}
                        />
                      )
                    })}
                </Fragment>
              ))}
            </div>
          </div>
        </Group>

        {/* The two controls the picker leads to cannot live in the card above — a filled
            button is not a row — so they take the same wrapper and open on the same
            transition. Left outside it they appeared instantly under a card still growing. */}
        <div className="disclosure" data-open={expanded || undefined}>
          <div className="disclosure-body">
            <button
              type="button"
              className="btn-primary"
              disabled={picked == null}
              onClick={() => useStore.getState().startWorkout(picked)}
            >
              Start Workout
            </button>
            <div className="picker-log">
              <Group>
                <Row
                  title="Custom workout"
                  subtitle="Start empty and build your own"
                  chevron
                  onClick={() => useStore.getState().startFreeWorkout()}
                />
                <Row
                  title="Log activity"
                  subtitle="A run, a game, anything else"
                  chevron
                  onClick={() => setActivitySheet({})}
                />
              </Group>
            </div>
          </div>
        </div>

        <Section>This week</Section>
        {/* The card is the way in to the week detail — the strip and the counts are a
            summary, and a summary you cannot open is a summary you have to trust. */}
        <button type="button" className="week-card" onClick={() => setWeekOpen(true)}>
          <WeekStrip days={days} />
          <div className="week-counts tnum">
            <span>
              Lifts {week.lifts} of {settings.weeklyLifts}
            </span>
            <span>
              Cardio {week.cardio} of {settings.weeklyCardio}
            </span>
          </div>
          {(mix.length > 0 || week.distanceKm > 0 || week.easyPct !== null) && (
            <div className="week-meta tnum">
              {mix.map((m) => (
                <span key={m.label}>
                  {m.label} {m.count}
                </span>
              ))}
              {week.distanceKm > 0 && <span>{fmtDistance(week.distanceKm)}</span>}
              {/* Null, not zero, when nothing is tagged — an untagged week is unknown, and a
                  0% here would be inventing data the user never entered. */}
              {week.easyPct !== null && <span>{week.easyPct}% easy</span>}
            </div>
          )}
        </button>
      </div>

      {weekOpen && <WeekSheet onClose={() => setWeekOpen(false)} />}

      {activitySheet && (
        <ActivitySheet
          preset={activitySheet}
          onSave={(activity) => useStore.getState().logActivity(activity)}
          onClose={() => setActivitySheet(null)}
        />
      )}
    </>
  )
}

// Post-workout. The progression list is computed from state AFTER the log is saved, so it
// is the real next target for each slot — the same nextTarget() the next session will use,
// not a copy of it. Reads the plan's rotation rather than the log's entries because "next
// time" means the plan's slots, which a mid-session swap does not change.
function SummaryView({ summary, onDone }) {
  const state = useStore((s) => s)
  const { plan, swaps, customEx } = state
  const rotationIndex = summary.log.rotationIndex
  const rotation = rotationIndex != null ? plan.rotation[rotationIndex] : null

  const progression = (rotation ? rotation.exercises : []).map((t) => {
    const target = nextTarget(t.exerciseId, state, rotationIndex)
    const effectiveId = swaps[t.exerciseId] || t.exerciseId
    const ex = getExercise(effectiveId, customEx)
    const did = slotResult(summary.log, t.exerciseId, effectiveId)
    // No change across a swap: the slot reverts next session, so the two weights belong to
    // two different lifts. Nothing is shown rather than a number that reads as progress.
    const change =
      !did || did.swapped || did.weightKg == null || target.weightKg == null
        ? null
        : Math.round((target.weightKg - did.weightKg) * 100) / 100
    return { id: t.exerciseId, name: exerciseName(ex), target, change }
  })

  // Exercises you actually logged something on, not exercises the session contained — an
  // untouched one is in `entries` with every set unticked and is not a thing you did.
  const exercisesDone = summary.log.entries.filter((e) => e.sets.some((st) => st.done)).length

  return (
    <>
      <NavBar title="Today" />
      <div className="screen-body">
        <div className="workout-hero">
          <h2 className="done-title">Session complete</h2>
          <p className="hero-sub tnum">
            {summary.log.templateName} · {fmtDuration(summary.durationSec)}
          </p>
        </div>

        <div className="summary-stats">
          <div className="summary-stat">
            <div className="value tnum">
              {exercisesDone}
              {exercisesDone !== summary.log.entries.length && (
                <span className="summary-of tnum"> / {summary.log.entries.length}</span>
              )}
            </div>
            <div className="label">Exercises</div>
          </div>
          <div className="summary-stat">
            <div className="value tnum">{summary.sets}</div>
            <div className="label">Sets</div>
          </div>
          <div className="summary-stat">
            <div className="value tnum">{summary.volume.toLocaleString('en-GB')}</div>
            <div className="label">kg Volume</div>
          </div>
        </div>

        {progression.length > 0 ? (
          <>
            <div className="caption">Next time</div>
            <div className="list">
              {progression.map((p) => (
                <div className="prog-row" key={p.id}>
                  <span className={`prog-mark ${p.target.kind}`}>
                    <Icon
                      name={
                        p.target.kind === 'advance'
                          ? 'arrow-up'
                          : p.target.kind === 'deload'
                            ? 'arrow-down'
                            : 'minus'
                      }
                      size={16}
                    />
                  </span>
                  <span className="prog-name">{p.name}</span>
                  <span className="prog-target tnum">
                    {p.target.weightKg != null ? `${p.target.weightKg} kg` : 'First time'}
                    {/* The change, stated rather than celebrated. "Held" is a fact worth
                        printing: it is what most sessions do and it is not a failure. */}
                    {p.change != null && (
                      <span className={`prog-change${p.change > 0 ? ' up' : p.change < 0 ? ' down' : ''}`}>
                        {p.change === 0 ? 'Held' : `${p.change > 0 ? '+' : '−'}${Math.abs(p.change)} kg`}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          // A custom workout has no rotation slot, so there is no "next time" to list — but
          // say so, rather than let the empty section read as missing data.
          summary.log.freeform && (
            <p className="summary-note">Targets update next time these lifts appear in a scheduled session.</p>
          )
        )}

        <button type="button" className="btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </>
  )
}

function BlockCompleteView() {
  const progress = useStore((s) => s.progress)
  const workouts = useStore((s) => s.workouts)
  const activities = useStore((s) => s.activities)
  const customEx = useStore((s) => s.customEx)

  const blockWorkouts = workouts.filter((w) => w.blockIndex === progress.blockIndex)
  const activityCount = fmtActivityCount(activities.filter((a) => a.blockIndex === progress.blockIndex).length)
  const changes = blockWeightChanges(blockWorkouts)
  const first = blockWorkouts[0]
  const last = blockWorkouts[blockWorkouts.length - 1]

  return (
    <>
      <NavBar title="Today" />
      <div className="screen-body">
        <div className="workout-hero">
          <h2 className="done-title">Block complete</h2>
          <p className="hero-sub">
            {blockWorkouts.length} sessions completed
            {activityCount ? ` · ${activityCount}` : ''}
            {first && last ? ` · ${fmtDate(first.startedAt)} – ${fmtDate(last.finishedAt)}` : ''}
          </p>
        </div>
        {changes.length > 0 && (
          <Group>
            {changes.map((c) => {
              const ex = getExercise(c.exerciseId, customEx)
              const diff = Math.round((c.last - c.first) * 100) / 100
              return (
                <Row
                  key={c.exerciseId}
                  title={exerciseName(ex)}
                  thumb={<Thumb exercise={ex} />}
                  value={
                    <span className={`delta${diff > 0 ? ' up' : diff < 0 ? ' down' : ''}`}>
                      {c.first} → {c.last} kg
                    </span>
                  }
                />
              )
            })}
          </Group>
        )}
        <button type="button" className="btn-primary" onClick={() => useStore.getState().continueBlock()}>
          Continue
        </button>
      </div>
    </>
  )
}

// The workout is three views over one active exercise: log the current set, rest between
// sets, and a summary when the exercise is done. Which one shows is derived, not stored —
// the current set is simply the first one not ticked, so un-ticking from the this-session
// strip walks you straight back to it.
function WorkoutFlow({ onFinish }) {
  const state = useStore((s) => s)
  const { active, customEx } = state
  const [swapSheet, setSwapSheet] = useState(false)
  const [endSheet, setEndSheet] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)
  const [overview, setOverview] = useState(false)

  const exIdx = active.currentIndex
  const current = active.exercises[exIdx] || null
  const exDef = current ? getExercise(current.exerciseId, customEx) : null
  const nextEx = active.exercises[exIdx + 1]
  const nextDef = nextEx ? getExercise(nextEx.exerciseId, customEx) : null

  const setIdx = current ? current.performed.findIndex((s) => !s.done) : -1
  const exerciseDone = current ? setIdx === -1 : false
  const resting = current ? !exerciseDone && active.restStartedAt != null : false

  // Prefetch the next exercise's GIF during rest — the one idle window there is.
  useEffect(() => {
    if (active.restStartedAt && nextDef) {
      const src = gifSrc(nextDef)
      if (src) new Image().src = src
    }
  }, [active.restStartedAt, nextDef])

  if (overview) {
    return <SessionOverview onClose={() => setOverview(false)} />
  }

  const store = () => useStore.getState()
  const changeSet = (i, patch) => store().adjustSet(exIdx, i, patch)
  const setWeight = (i, kg) => store().setWeight(exIdx, i, Math.max(0, kg))
  const stepWeight = (i, dir) => {
    const cur = current.performed[i].weightKg
    if (cur == null && dir < 0) return
    setWeight(i, (cur ?? 0) + dir * current.increment)
  }
  const stepReps = (i, dir) => changeSet(i, { reps: Math.max(0, current.performed[i].reps + dir) })

  const finish = () => {
    const summary = store().finishWorkout()
    if (summary) onFinish(summary)
  }

  // A custom workout can be finished only once something has actually been lifted — derived
  // from state, never latched, so unticking the last set or removing the last done exercise
  // re-disables it on the next render.
  const canFinish = !active.freeform || active.exercises.some((e) => e.performed.some((s) => s.done))

  const overviewButton = (
    <button type="button" className="btn" onClick={() => setOverview(true)} aria-label="Session overview">
      <Icon name="list" size={20} />
    </button>
  )

  const navActions = (
    <>
      <button
        type="button"
        className="btn"
        disabled={exIdx === 0}
        onClick={() => store().prevExercise()}
      >
        Prev
      </button>
      <button type="button" className="btn" onClick={() => setSwapSheet(true)}>
        Swap
      </button>
      <button type="button" className="btn" onClick={() => setEndSheet(true)}>
        End
      </button>
    </>
  )

  const sheets = (
    <>
      {swapSheet && (
        <Sheet title="Swap exercise" onClose={() => setSwapSheet(false)}>
          <ExerciseBrowser
            selectLabel="Swap exercise"
            suggestFor={exDef}
            exclude={active.exercises.map((x) => x.exerciseId)}
            onSelect={(e) => {
              store().swapMidWorkout(exIdx, e.id)
              setSwapSheet(false)
            }}
          />
        </Sheet>
      )}
      {endSheet && (
        <ActionSheet
          onClose={() => setEndSheet(false)}
          actions={[
            { label: 'Finish Workout', disabled: !canFinish, onClick: finish },
            {
              label: 'Abandon Workout',
              destructive: true,
              // Abandoning ends the workout as surely as finishing does, so an update held
              // back for it has to be released here too — otherwise it waits for the next
              // session you actually finish.
              onClick: () => {
                store().abandonWorkout()
                requestReloadIfIdle()
              },
            },
          ]}
        />
      )}
    </>
  )

  // A custom workout starts with no exercises. There is no logger to render, so the session
  // overview is the whole screen — its "End" opens this flow's end sheet, the only exit until
  // something has been added. The first add drops back into the logger on the next render.
  if (active.freeform && !current) {
    return (
      <>
        <SessionOverview onEnd={() => setEndSheet(true)} />
        {sheets}
      </>
    )
  }

  if (resting) {
    const nextSetIdx = current.performed.findIndex((s) => !s.done)
    const nextSet = current.performed[nextSetIdx]
    return (
      <>
        {/* The exercise name, not the word "Rest" — the ring already says REST in the
            largest type on the screen, and the title was the only thing telling you which
            exercise you were resting inside. Rest only ever happens between sets of the
            same exercise (tickSet starts none after the last one), so this is also the
            "next up" the screen needs. */}
        <NavBar compact title={exerciseName(exDef)} actions={<>{navActions}{overviewButton}</>} />
        <div className="screen-body workout-body">
          {/* Same bar, same position, same meaning as the logger you were on a moment ago. */}
          <div className="logger-bar" aria-hidden="true">
            {active.exercises.map((_, i) => (
              <span
                key={i}
                className="logger-bar-seg"
                data-state={i < exIdx ? 'done' : i === exIdx ? 'current' : 'todo'}
              />
            ))}
          </div>
          <RestTimer
            restStartedAt={active.restStartedAt}
            restSec={active.restDuration}
            sound={state.settings.sound}
            onAdjust={(d) => store().adjustRest(d)}
            onSkip={() => store().skipRest()}
            onComplete={() => store().skipRest()}
          >
            <div className="rest-next">
              <div className="rest-next-set">
                Set {nextSetIdx + 1} of {current.performed.length}
              </div>
              {/* Same shape as the logger's target line, so the number you rest towards and
                  the number you then log are written identically. */}
              <div className="rest-next-target tnum">
                {nextSet.weightKg != null ? `${nextSet.weightKg} kg × ` : ''}
                {current.repsMin}–{current.repsMax}
                {nextSet.weightKg == null ? ' reps' : ''}
              </div>
            </div>
          </RestTimer>
        </div>
        {sheets}
      </>
    )
  }

  if (exerciseDone) {
    const isLast = exIdx === active.exercises.length - 1
    return (
      <>
        <NavBar compact title={exerciseName(exDef)} actions={<>{navActions}{overviewButton}</>} />
        <div className="screen-body">
          <div className="logger-bar" aria-hidden="true">
            {active.exercises.map((_, i) => (
              <span
                key={i}
                className="logger-bar-seg"
                data-state={i < exIdx ? 'done' : i === exIdx ? 'current' : 'todo'}
              />
            ))}
          </div>
          <div className="done-hero">
            <span className="done-mark">
              <Icon name="check" size={26} />
            </span>
            <h2 className="done-title">Exercise complete</h2>
          </div>

          <div className="caption">Performance</div>
          <div className="list perf-list">
            {current.performed.map((s, i) => (
              <div className="perf-row" key={i}>
                <span className="perf-set">Set {i + 1}</span>
                <span className="perf-value tnum">
                  {s.weightKg != null ? `${s.weightKg} × ${s.reps}` : `${s.reps} reps`}
                </span>
              </div>
            ))}
          </div>

          <div className="caption">Progression</div>
          <div className="progression-card">
            <p className="progression-reason">{current.reason}</p>
          </div>

          <button type="button" className="btn-primary" onClick={() => (isLast ? finish() : store().nextExercise())}>
            {isLast ? 'Finish Workout' : 'Next exercise'}
          </button>
          {!isLast && nextDef && <p className="next-up">{exerciseName(nextDef)}</p>}
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => store().untickSet(exIdx, current.performed.length - 1)}
          >
            Back to sets
          </button>
        </div>
        {sheets}
      </>
    )
  }

  const set = current.performed[setIdx]
  const logged = current.performed.filter((s) => s.done)
  // The heaviest completed set, matching workingWeight() in the engine — the same rule the
  // next target was derived from, so the two lines on screen cannot disagree.
  const lastWeight = heaviestDone(current.lastSets)
  const lastReps = (current.lastSets || []).map((s) => (s && s.done ? s.reps : '—')).join(', ')

  return (
    <>
      <NavBar compact title={exerciseName(exDef)} actions={<>{navActions}{overviewButton}</>} />
      <div className="screen-body workout-body">
        {/* One context block instead of three captioned sections. Three `.caption` labels cost
            129px of chrome to say "Target", "Last time" and "This session" — words the
            numbers underneath already say. What replaces them is the same information at a
            third of the height, which is what keeps Complete set above the fold. */}
        <div className="logger-progress">
          <span>
            Set {setIdx + 1} of {current.performed.length}
          </span>
          <span>
            Exercise {exIdx + 1} of {active.exercises.length}
          </span>
        </div>

        {/* One segment per exercise: done, current, still to come. Understated on purpose —
            it answers "how far in am I" and nothing else. No score, no streak, no reward. */}
        <div className="logger-bar" aria-hidden="true">
          {active.exercises.map((_, i) => (
            <span
              key={i}
              className="logger-bar-seg"
              data-state={i < exIdx ? 'done' : i === exIdx ? 'current' : 'todo'}
            />
          ))}
        </div>

        <p className="logger-target tnum">
          {set.weightKg != null ? `${set.weightKg} kg × ` : ''}
          {current.repsMin}–{current.repsMax}
          {set.weightKg == null ? ' reps' : ''}
        </p>

        {/* Shown for every kind of target now, not just a hold. On an advance it is the
            evidence for the jump; on a deload it is the evidence for the drop — which is
            exactly when you most want to see it and exactly when it used to be missing. */}
        {lastWeight != null && (
          <p className="logger-last tnum">
            Last time {lastWeight} kg · {lastReps}
          </p>
        )}
        {weightHint(exDef) && <p className="weight-hint">{weightHint(exDef)}</p>}

        {logged.length > 0 && (
          <div className="session-strip">
            {current.performed.map((s, i) =>
              s.done ? (
                <button
                  type="button"
                  key={i}
                  className="session-chip"
                  onClick={() => store().untickSet(exIdx, i)}
                  aria-label={`Undo set ${i + 1}`}
                >
                  <span className="tnum">
                    {s.weightKg != null ? `${s.weightKg}×${s.reps}` : s.reps}
                  </span>
                </button>
              ) : (
                <span
                  className="session-chip pending"
                  key={i}
                  data-current={i === setIdx || undefined}
                >
                  {i === setIdx ? `${i + 1}` : '—'}
                </span>
              ),
            )}
          </div>
        )}

        {/* Takes the screen's slack so the steppers sit in the middle of the display and
            Complete set lands at the bottom of it. Nothing new is on the screen. */}
        <div className="logger-entry">
          <BigStepper
            label="Weight"
            value={set.weightKg}
            unit="kg"
            onStep={(d) => stepWeight(setIdx, d)}
            onCommit={(v) => setWeight(setIdx, v)}
          />
          <BigStepper
            label="Reps"
            value={set.reps}
            onStep={(d) => stepReps(setIdx, d)}
            onCommit={(v) => changeSet(setIdx, { reps: Math.max(0, Math.round(v)) })}
          />
        </div>

        <button type="button" className="btn-primary" onClick={() => store().tickSet(exIdx, setIdx)}>
          Complete set
        </button>

        <div className="set-count">
          <button
            type="button"
            className="btn"
            onClick={() => store().removeSet(exIdx)}
            disabled={current.performed.length <= 1 || current.performed[current.performed.length - 1].done}
          >
            − Set
          </button>
          <span className="tnum">
            {current.performed.length} {current.performed.length === 1 ? 'set' : 'sets'}
            {current.performed.length !== current.sets && ` · plan says ${current.sets}`}
          </span>
          <button type="button" className="btn" onClick={() => store().addSet(exIdx)}>
            + Set
          </button>
        </div>

        <button type="button" className="btn btn-quiet" onClick={() => setWhyOpen(!whyOpen)}>
          Why this target?
        </button>
        {whyOpen && (
          <div className="why-card">
            <p className="progression-reason">{current.reason}</p>
            <ExerciseMedia exercise={exDef} gif />
            {exDef && exDef.steps && exDef.steps.length > 0 && (
              <ol className="steps">
                {exDef.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            )}
          </div>
        )}
      </div>
      {sheets}
    </>
  )
}
