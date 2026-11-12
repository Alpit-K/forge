import { Fragment, useEffect, useMemo, useState } from 'react'
import { useStore, UNPLANNED } from '../store.js'
import { nextTarget, targetFor, findSlotFor, weightLogs } from '../engine/progression.js'
import {
  buildWorkoutLog,
  blockWeightChanges,
  lastDoneByRotation,
  heaviestDone,
  slotResult,
  sessionsDone,
  customSessions,
  extraSessions,
  isBlockComplete,
  nextUnfinished,
  typicalMinutes,
  setsCompleted,
  totalVolume,
  durationSeconds,
  blockOwed,
  SKIP_REASONS,
} from '../engine/session.js'
import { recommend, nextSession, sportNoun, weekForecast } from '../engine/coach.js'
import { weekDays, dayIndex, weekSummary, shapeCounts } from '../engine/week.js'
import { getExercise, exerciseName, gifSrc, weightHint, platesOnly, perSide, warmupSteps } from '../lib/exercises.js'
import { ACTIVITY_TYPES, intensityLabel } from '../lib/activities.js'
import NavBar from '../components/NavBar.jsx'
import { Group, Row, Section } from '../components/List.jsx'
import { Thumb, ExerciseMedia } from '../components/ExerciseImage.jsx'
import BigStepper from '../components/BigStepper.jsx'
import RestTimer from '../components/RestTimer.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import Sheet, { ActionSheet } from '../components/Sheet.jsx'
import ExerciseBrowser from '../components/ExerciseBrowser.jsx'
import SessionOverview from '../components/SessionOverview.jsx'
import ActivitySheet from '../components/ActivitySheet.jsx'
import WeekSheet from '../components/WeekSheet.jsx'
import BlockCountRow from '../components/BlockCountRow.jsx'
import { requestReloadIfIdle } from '../lib/update.js'
import { announce } from '../lib/announce.js'
import Icon from '../components/Icon.jsx'
import { fmtDate, fmtGreeting, fmtAgo, fmtActivityCount, fmtCount, fmtDistance, fmtBlockChange, fmtHoursMinutes, fmtHr } from '../lib/format.js'

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
// itself will use, so the next-session preview can never disagree with the first screen of
// the workout.
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

// A target in the few words a one-line row has room for. The full reason is on the logger;
// this is only the direction, read from the numbers the target already carries — the
// weight it asks for against the heaviest set it came from — so it cannot say anything the
// engine did not decide.
function shortTarget(target) {
  if (target.kind === 'first') return 'First time'
  const last = heaviestDone(target.lastSets)
  const diff = last != null && target.weightKg != null ? Math.round((target.weightKg - last) * 100) / 100 : 0
  if (diff > 0) return `Up ${diff} kg`
  if (diff < 0) return `Down ${Math.abs(diff)} kg`
  return 'Hold'
}

// The most recent session of the sport the card is suggesting, whatever its tag, as the
// reference number — the cardio card's equivalent of a lift's opening target. It was the
// last EASY one, which went two weeks stale behind three rides tagged hard; the tag is
// printed beside the figures instead. Nothing dated after now: a session still to come has
// not happened (the same cutoff coach.js applies).
function lastOfSport(activities, sport, now) {
  let best = null
  for (const a of activities) {
    if (a.type !== sport) continue
    const t = Date.parse(a.at)
    if (!Number.isFinite(t) || t > now.getTime()) continue
    if (!best || t > Date.parse(best.at)) best = a
  }
  return best
}

// Seven derived cells, carrying two independent facts: colour says whether the day is
// training at all, fill says whether it happened. So a planned day is an accent ring and a
// rest day is a small grey dot — the two used to be a grey ring and a grey dot of the same
// size, which is no distinction at all on a phone.
//
// The kind comes from `weekForecast`, not the shape: a past day with nothing logged is rest,
// and today onwards is what the coach would say, so a rested lift reappears on the day it
// will actually be offered. A day that did not happen is drawn as rest — never as missed.
function WeekStrip({ days, forecast }) {
  // The strip says everything by shape and colour, so it is one image with the seven days
  // spelt out — the same two facts per day the dots carry.
  const words = days
    .map((d) => {
      const kind = forecast[d.index] === 'rest' ? null : forecast[d.index]
      const what = d.lifts + d.cardioCounted > 0 ? `${d.lifts > 0 ? 'lift' : 'cardio'} done` : kind ? `${kind} to come` : 'rest'
      return `${DAY_NAMES[d.index]} ${what}`
    })
    .join(', ')
  return (
    <div className="week-strip" role="img" aria-label={`This week: ${words}`}>
      {days.map((d) => {
        // Two independent facts, two independent attributes — they were one before, which is
        // why the dot could say "planned" or "lift" but never "a lift day, still to come".
        // `data-state` is whether it happened; `data-kind` is which of the two it is or was.
        // A long run is the cardio kind here exactly as it is in the week planner: the shape
        // sets four kinds, the strip reports two.
        const kind = forecast[d.index] === 'rest' ? null : forecast[d.index]
        // Done is what filled a target, the same count the card beside it prints: a day with
        // only a walk on it is not drawn as cardio done.
        const state = d.lifts + d.cardioCounted > 0 ? 'done' : kind ? 'planned' : 'rest'
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
function CoachCard({ rec, meta, lastSession, ceiling, onStart, onLog }) {
  const kind = rec.kind === 'lift' ? 'Lift' : rec.kind === 'cardio' ? 'Cardio' : 'Rest'
  const noun = rec.kind === 'cardio' ? sportNoun(rec.sport) : null
  // The same four glyphs and the same two tints the week planner in Settings draws, so the
  // suggestion and the shape it came from are plainly the same vocabulary. A suggested long
  // run takes `route` for the reason it does there: it is the cardio kind done further, and
  // a second blue would read as a fault rather than a distinction.
  const glyph =
    rec.kind === 'lift' ? 'dumbbell' : rec.kind === 'rest' ? 'rest' : rec.cardioKind === 'long' ? 'route' : rec.sport || 'run'
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

      {rec.kind === 'lift' && (
        <button type="button" className="btn-primary" onClick={onStart}>
          Start workout
        </button>
      )}
      {/* The last session of the sport, as a reference number. The
          ceiling is the user's own limit, set in Settings — the app proposes no target of
          its own. */}
      {rec.kind === 'cardio' && (lastSession || ceiling) && (
        <div className="coach-ref">
          {lastSession && (
            <div className="coach-last">
              <span className="coach-target-name">Last {noun || 'session'} · {fmtDate(lastSession.at)}</span>
              <span className="coach-last-value tnum">
                {[
                  typeof lastSession.distanceKm === 'number' ? fmtDistance(lastSession.distanceKm) : null,
                  `${lastSession.minutes} min`,
                  fmtHr(lastSession.avgHr),
                  intensityLabel(lastSession.intensity),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </div>
          )}
          {ceiling && <div className="coach-ceiling tnum">Keep under {ceiling} bpm</div>}
        </div>
      )}

      {rec.kind === 'cardio' && (
        <button type="button" className="btn-primary" onClick={onLog}>
          {noun ? `Log ${noun}` : 'Log it'}
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
  const forecast = useMemo(() => weekForecast(state), [state])
  const days = useMemo(
    () => weekDays(workouts, activities, settings.weekShape || [], new Date(), settings.cardioSport),
    [workouts, activities, settings.weekShape, settings.cardioSport],
  )

  const week = rec.week
  const suggestedIndex = rec.kind === 'lift' ? rec.rotationIndex : null
  const now = new Date()

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
  // How long the suggested slot usually takes, from its own logs. On a busy evening it is
  // the number that decides whether you start.
  const typical = suggestedIndex == null ? null : typicalMinutes(workouts, suggestedIndex, plan.rotation.length)
  const shown = typical == null ? rec : { ...rec, detail: `${rec.detail} · usually ${typical} min` }
  const lastSession = rec.kind === 'cardio' ? lastOfSport(activities, rec.sport, now) : null
  // Exercises skipped inside sessions that happened, offered on a lift day as a light day
  // to build. Derived per render like everything else here.
  const owed = rec.kind === 'lift' ? blockOwed(plan, swaps, workouts, progress.blockIndex) : []
  const mix = activityMix(week.cardioLogs)
  const targets = shapeCounts(settings.weekShape || [])

  // The coach only ever suggests easy cardio, so "Log it" opens with Easy chosen and the
  // current sport from Settings — the user's own setting, never a guess from the last log.
  // A run type would be a guess, so none is set.
  const logSuggested = () => setActivitySheet({ intensity: 'easy' })

  return (
    <>
      {/* "Today" restated, vaguely, what the date line directly beneath it already said
          precisely. The date is now the bar's own subtitle and the title carries the app's
          identity instead — this screen only. */}
      <NavBar
        title="Forge"
        mark={<Icon name="anvil" size={30} />}
        subtitle={`${fmtGreeting(now)} · ${DAY_NAMES[dayIndex(now)]} ${fmtDate(now.toISOString())}`}
      />
      <div className="screen-body">
        <CoachCard
          rec={shown}
          meta={meta}
          lastSession={lastSession}
          ceiling={rec.kind === 'cardio' ? settings.hrCeiling : null}
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
                  subtitle={`${t.sets} × ${t.repsMin}–${t.repsMax} · ${shortTarget(target)}`}
                  value={target.weightKg != null ? `${target.weightKg} kg` : null}
                  metric
                  thumb={<Thumb exercise={ex} />}
                />
              )
            })}
          </Group>
        )}

        {owed.length > 0 && (
          <Group>
            <Row
              title="Build a light day"
              subtitle={
                <span className="tnum">
                  Left over this block:{' '}
                  {owed
                    .map((r) => `${exerciseName(getExercise(r.exerciseId, customEx))} ${r.done} of ${r.planned}`)
                    .join(' · ')}
                </span>
              }
              chevron
              onClick={() => useStore.getState().startFreeWorkout()}
            />
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
          <div className="disclosure" data-open={expanded || undefined} inert={!expanded}>
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
                          subtitle={`${t.sets} × ${t.repsMin}–${t.repsMax} · ${shortTarget(target)}`}
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
        <div className="disclosure" data-open={expanded || undefined} inert={!expanded}>
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
          <WeekStrip days={days} forecast={forecast} />
          <div className="week-counts tnum">
            <span>
              Lifts {week.liftsCounted} of {targets.lift}
            </span>
            <span>
              Cardio {week.cardioCounted} of {targets.cardio}
              {week.cardioMinutes > 0 && ` · ${week.cardioMinutes} min`}
            </span>
          </div>
          {(mix.length > 0 || week.distanceKm > 0) && (
            <div className="week-meta tnum">
              {mix.map((m) => (
                <span key={m.label}>
                  {m.label} {m.count}
                </span>
              ))}
              {week.distanceKm > 0 && <span>{fmtDistance(week.distanceKm)}</span>}
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

// The anvil with the icon's sparks struck off it — the finish summary's mark. The sparks are
// three of public/icon.svg's five, carried onto Icon's 24 grid by the same transform the
// anvil glyph uses and trimmed to their outer four fifths so they clear the anvil's face. They
// draw in once on mount, which is the direct result of tapping Finish; reduced motion drops
// the animation and leaves them drawn.
const SPARKS = [
  'M16.86 3.99 Q17.59 -0.02 19.48 -2.76',
  'M17.34 4.21 Q19.09 0.72 21.55 -1.26',
  'M17.61 4.72 Q19.92 2.36 22.47 1.04',
]

function StruckAnvil() {
  return (
    <span className="struck-anvil" aria-hidden="true">
      <Icon name="anvil" size={44} />
      <svg className="struck-sparks" width="44" height="44" viewBox="0 0 24 24">
        {SPARKS.map((d) => (
          <path key={d} d={d} pathLength="1" />
        ))}
      </svg>
    </span>
  )
}

// The sets of one entry as a strip and a line: a bar per set, filled to reps ÷ repsMax for a
// set you logged and left as an empty outline for one you did not — so a missed set reads in
// greyscale as a hole, not as a lighter colour.
function SetStrip({ sets, repsMax }) {
  return (
    <span className="set-strip" aria-hidden="true">
      {sets.map((s, i) => (
        <span key={i} className="set-bar" data-done={s.done || undefined}>
          {s.done && <span style={{ height: `${Math.max(0.12, Math.min(1, (s.reps || 0) / repsMax)) * 100}%` }} />}
        </span>
      ))}
    </span>
  )
}

// "67.5 kg × 4, 4, 4", grouped where the weight changed: "60 kg × 12 · 70 kg × 10, 10".
function setsLine(sets) {
  const groups = []
  for (const s of sets) {
    if (!s.done) continue
    const last = groups[groups.length - 1]
    if (last && last.w === s.weightKg) last.reps.push(s.reps)
    else groups.push({ w: s.weightKg, reps: [s.reps] })
  }
  return groups.map((g) => (g.w != null ? `${g.w} kg × ${g.reps.join(', ')}` : `${g.reps.join(', ')} reps`)).join(' · ')
}

// Post-workout. The progression list is computed from state AFTER the log is saved, so it
// is the real next target for each slot — the same nextTarget() the next session will use,
// not a copy of it. Reads the plan's rotation rather than the log's entries because "next
// time" means the plan's slots, which a mid-session swap does not change.
function SummaryView({ summary, onDone }) {
  const state = useStore((s) => s)
  const { plan, swaps, customEx, workouts, activities, settings } = state
  const rotationIndex = summary.log.rotationIndex

  // The last time this same session was done, stated beside today's figures — no colour and
  // no arrow, the way "Held" is stated. A custom workout has no "same session" to compare.
  const previous = summary.log.freeform
    ? null
    : workouts.findLast((w) => w.id !== summary.log.id && !w.freeform && w.templateName === summary.log.templateName)
  const previousVolume = previous ? totalVolume(previous.entries) : 0
  const previousLine = previous
    ? [
        `Last ${previous.templateName}: ${Math.round(durationSeconds(previous.startedAt, previous.finishedAt) / 60)} min`,
        `${setsCompleted(previous.entries)} sets`,
        previousVolume > 0 ? `${previousVolume.toLocaleString('en-GB')} kg` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null
  const week = weekSummary(workouts, activities)
  // The reason is written to the stored log after the summary was taken, so it is read back
  // from the store, never from `summary.log`.
  const saved = workouts.find((w) => w.id === summary.log.id)
  const rotation = rotationIndex != null ? plan.rotation[rotationIndex] : null

  const rows = rotation
    ? rotation.exercises.map((t) => {
        const target = nextTarget(t.exerciseId, state, rotationIndex)
        const effectiveId = swaps[t.exerciseId] || t.exerciseId
        const did = slotResult(summary.log, t.exerciseId, effectiveId)
        // No change across a swap: the slot reverts next session, so the two weights belong
        // to two different lifts. Nothing is shown rather than a number that reads as progress.
        const change =
          !did || did.swapped || did.weightKg == null || target.weightKg == null
            ? null
            : Math.round((target.weightKg - did.weightKg) * 100) / 100
        const sets = did ? did.sets : []
        return {
          id: t.exerciseId,
          entryId: did ? did.exerciseId : null,
          name: exerciseName(getExercise(did ? did.exerciseId : effectiveId, customEx)),
          inPlaceOf: did?.swapped ? exerciseName(getExercise(effectiveId, customEx)) : null,
          // A prescribed set removed mid-session is still a set the plan asked for.
          sets: [...sets, ...Array.from({ length: Math.max(0, t.sets - sets.length) }, () => ({ done: false }))],
          repsMax: t.repsMax,
          target,
          change,
        }
      })
    : summary.log.entries.map((e) => {
        // A custom workout has no slot to read a rep window from; one in the plan takes its
        // slot's, anything else the unplanned default of 8–12.
        const home = findSlotFor(plan, swaps, e.exerciseId)
        const slot = home && plan.rotation[home.rotationIndex].exercises.find((x) => x.exerciseId === home.slotId)
        return {
          id: e.exerciseId,
          entryId: e.exerciseId,
          name: exerciseName(getExercise(e.exerciseId, customEx)),
          inPlaceOf: null,
          sets: e.sets,
          repsMax: slot ? slot.repsMax : UNPLANNED.repsMax,
          target: null,
          change: null,
        }
      })

  // Exercises you actually logged something on, not exercises the session contained — an
  // untouched one is in `entries` with every set unticked and is not a thing you did.
  const exercisesDone = summary.log.entries.filter((e) => e.sets.some((st) => st.done)).length
  const total = summary.log.entries.length
  const facts = [
    exercisesDone === total ? fmtCount(total, 'exercise') : `${exercisesDone} of ${fmtCount(total, 'exercise')}`,
    fmtCount(summary.sets, 'set'),
    summary.volume > 0 ? `${summary.volume.toLocaleString('en-GB')} kg` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <>
      <NavBar title="Today" />
      <div className="screen-body">
        <div className="finish-hero">
          <StruckAnvil />
          <div>
            <h2 className="done-title">Session complete</h2>
            <p className="hero-sub">{summary.log.templateName}</p>
          </div>
        </div>

        {/* One figure, in whole minutes — the way History's row states it. */}
        <p className="done-figure">
          {Math.round(summary.durationSec / 60)}
          <span className="done-figure-unit">min</span>
        </p>
        <div className="summary-context tnum">
          <p className="summary-facts">{facts}</p>
          {previousLine && <p>{previousLine}</p>}
          <p>
            Lifts {week.liftsCounted} of {shapeCounts(settings.weekShape || []).lift} this week
          </p>
        </div>

        <div className="section-header lifted-header">
          <span>What you lifted</span>
          {rotation && <span>Next time</span>}
        </div>
        <Group>
          {rows.map((r) => {
            const line = setsLine(r.sets)
            // An exercise removed mid-session has no entry to hold a reason.
            const untouched = r.entryId != null && !r.sets.some((s) => s.done)
            const reason = untouched ? saved?.entries.find((e) => e.exerciseId === r.entryId)?.skipReason : null
            return (
              <Fragment key={r.id}>
              <Row
                title={r.name}
                subtitle={r.inPlaceOf ? `In place of ${r.inPlaceOf}` : null}
                value={
                  r.target && (
                    <span className="lifted-next">
                      <span className="prog-target">{r.target.weightKg != null ? `${r.target.weightKg} kg` : 'First time'}</span>
                      {/* The glyph sits with the change, not the weight: a minus beside
                          "67.5 kg" read as a negative number. The change is stated rather
                          than celebrated — "Held" is what most sessions do, not a failure. */}
                      {r.target.kind !== 'first' && (
                        <span className="lifted-next-change">
                          <span className={`prog-mark ${r.target.kind}`}>
                            <Icon
                              name={r.target.kind === 'advance' ? 'arrow-up' : r.target.kind === 'deload' ? 'arrow-down' : 'minus'}
                              size={14}
                            />
                          </span>
                          {r.change != null && (
                            <span className={`prog-change${r.change > 0 ? ' up' : r.change < 0 ? ' down' : ''}`}>
                              {r.change === 0 ? 'Held' : `${r.change > 0 ? '+' : '−'}${Math.abs(r.change)} kg`}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                  )
                }
              >
                <div className="lifted-sets">
                  <SetStrip sets={r.sets} repsMax={r.repsMax} />
                  <span className="lifted-reps">{line || 'Not done'}</span>
                </div>
              </Row>
              {/* Under the row at the card's full width, not inside its label: beside the value
                  column the four chips wrapped unevenly and pushed Done off the screen. */}
              {untouched && (
                <div className="row skip-row">
                  <div className="chip-row skip-why" role="group" aria-label={`Why ${r.name} was not done`}>
                    {SKIP_REASONS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="chip"
                        data-active={reason === o.id}
                        aria-pressed={reason === o.id}
                        onClick={() =>
                          useStore.getState().setSkipReason(summary.log.id, r.entryId, reason === o.id ? null : o.id)
                        }
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              </Fragment>
            )
          })}
        </Group>
        {/* A custom workout has no rotation slot, so there is no "next time" to list — but
            say so, rather than let the missing column read as missing data. */}
        {summary.log.freeform && (
          <p className="summary-note">
            {saved?.extra
              ? 'An extra session leaves the targets of your planned lifts where they were.'
              : 'Targets update next time these lifts appear in a scheduled session.'}
          </p>
        )}
        {saved?.freeform && <BlockCountRow workout={saved} />}

        <button type="button" className="btn-primary" onClick={onDone}>
          Done
        </button>
      </div>
    </>
  )
}

// A block's lift, as a line from its first weight to its last, scaled within the glyph — so
// it says which way, not how far. Flat when the weight held, whatever the reps did; the
// colour beside it is the same `.delta` direction the words carry.
function Slope({ first, last, direction }) {
  const [y1, y2] = last > first ? [13, 3] : last < first ? [3, 13] : [8, 8]
  return (
    <svg className={`slope delta${direction ? ` ${direction}` : ''}`} width="28" height="16" viewBox="0 0 28 16" aria-hidden="true">
      <path d={`M3 ${y1} L25 ${y2}`} />
      <circle cx="3" cy={y1} r="2" />
      <circle cx="25" cy={y2} r="2" />
    </svg>
  )
}

const DIRECTION_ORDER = { up: 0, held: 1, down: 2 }

function BlockCompleteView() {
  const progress = useStore((s) => s.progress)
  const workouts = useStore((s) => s.workouts)
  const activities = useStore((s) => s.activities)
  const customEx = useStore((s) => s.customEx)
  const plan = useStore((s) => s.plan)
  const swaps = useStore((s) => s.swaps)
  const sessionCount = plan.sessionCount

  const blockWorkouts = workouts.filter((w) => w.blockIndex === progress.blockIndex)
  const done = sessionsDone(workouts, progress.blockIndex)
  const activityCount = fmtActivityCount(activities.filter((a) => a.blockIndex === progress.blockIndex).length)
  const first = blockWorkouts[0]
  const last = blockWorkouts[blockWorkouts.length - 1]
  const custom = customSessions(workouts, progress.blockIndex)
  const extra = extraSessions(workouts, progress.blockIndex)
  const seconds = blockWorkouts.reduce((n, w) => n + durationSeconds(w.startedAt, w.finishedAt), 0)
  const volume = blockWorkouts.reduce((n, w) => n + totalVolume(w.entries), 0)
  const facts = [
    fmtCount(done, 'session'),
    custom > 0 ? `${custom} custom` : null,
    extra > 0 ? `${extra} extra` : null,
    fmtHoursMinutes(seconds),
    volume > 0 ? `${(volume / 1000).toFixed(1)} t lifted` : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const changes = blockWeightChanges(blockWorkouts, plan, swaps)
    .map((c) => ({ ...c, ...fmtBlockChange(c) }))
    .sort((a, b) => DIRECTION_ORDER[a.direction || 'held'] - DIRECTION_ORDER[b.direction || 'held'])
  const tally = { up: 0, held: 0, down: 0 }
  for (const c of changes) tally[c.direction || 'held'] += 1

  return (
    <>
      <NavBar title="Today" />
      <div className="screen-body">
        <div className="block-hero">
          <ProgressRing fraction={done / sessionCount} size={120} stroke={8} heat>
            <span className="block-ring-count tnum">
              {done}
              <span className="block-ring-of"> / {sessionCount}</span>
            </span>
          </ProgressRing>
          <h2 className="done-title">Block {progress.blockIndex + 1} complete</h2>
          {first && last && (
            <p className="hero-sub tnum">
              {fmtDate(first.startedAt)} – {fmtDate(last.finishedAt)}
            </p>
          )}
        </div>

        {/* One bar per session in the order done, filled to the share of its listed sets that
            were completed, in one column per session of the block — so the strip spans the
            card whatever the block's length. A custom session is outlined rather than filled,
            so it reads differently in greyscale as well as in the facts line. */}
        <div className="block-strip">
          <div className="block-strip-bars" style={{ '--n': Math.max(sessionCount, blockWorkouts.length) }} aria-hidden="true">
            {blockWorkouts.map((w) => {
              const listed = w.entries.reduce((n, e) => n + e.sets.length, 0)
              const share = listed > 0 ? setsCompleted(w.entries) / listed : 0
              return (
                <span
                  key={w.id}
                  className="block-strip-bar"
                  data-custom={w.freeform || undefined}
                  style={{ height: `${Math.max(0.06, share) * 100}%` }}
                />
              )
            })}
          </div>
          <p className="block-strip-facts">
            {custom > 0 && <span className="block-strip-key" aria-hidden="true" />}
            {facts}
          </p>
          {activityCount && <p className="block-strip-facts">{activityCount}</p>}
        </div>

        {changes.length > 0 && (
          <>
            <div className="section-header tnum">
              {tally.up} up · {tally.held} held · {tally.down} down
            </div>
            <Group>
              {changes.map((c) => (
                // The change sits under the name rather than beside it: "15 kg: 10s → 11s"
                // beside "Cable Pushdown (with Rope Attachment)" squeezed the name to four
                // lines. Under it, every row reads the same way whatever the name's length.
                <Row
                  key={c.exerciseId}
                  title={exerciseName(getExercise(c.exerciseId, customEx))}
                  subtitle={<span className={`delta${c.direction ? ` ${c.direction}` : ''}`}>{c.text}</span>}
                  value={<Slope first={c.first} last={c.last} direction={c.direction} />}
                />
              ))}
            </Group>
          </>
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
// One segment per exercise. "Done" is read from the sets, never from position: the overview
// lets you take exercises in any order, and shading everything before the current one marked
// exercises you had jumped past as finished.
function MomentumBar({ exercises, current }) {
  return (
    <div className="logger-bar" aria-hidden="true">
      {exercises.map((e, i) => (
        <span
          key={i}
          className="logger-bar-seg"
          data-state={i === current ? 'current' : e.performed.every((s) => s.done) ? 'done' : 'todo'}
        />
      ))}
    </div>
  )
}

// The target an exercise's first open set is prefilled with, written the way the logger
// writes its own target line.
function nextUpTarget(ex) {
  const set = ex.performed.find((s) => !s.done) || ex.performed[0]
  const reps = `${ex.repsMin}–${ex.repsMax}`
  return set && set.weightKg != null ? `${set.weightKg} kg × ${reps}` : `${reps} reps`
}

function WorkoutFlow({ onFinish }) {
  const state = useStore((s) => s)
  const { active, customEx } = state
  const [swapSheet, setSwapSheet] = useState(false)
  const [endSheet, setEndSheet] = useState(false)
  const [whyOpen, setWhyOpen] = useState(false)
  const [overview, setOverview] = useState(false)
  const [warmedUp, setWarmedUp] = useState([])
  const [editLogged, setEditLogged] = useState(false)

  const exIdx = active.currentIndex
  const current = active.exercises[exIdx] || null
  const exDef = current ? getExercise(current.exerciseId, customEx) : null
  const nextIdx = current ? nextUnfinished(active.exercises, exIdx) : -1
  const nextDef = nextIdx !== -1 ? getExercise(active.exercises[nextIdx].exerciseId, customEx) : null

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
            // The rack is taken: here rather than on the logger, whose height is a measured
            // budget. Offered only when another exercise still has a set to do.
            lead={
              nextIdx !== -1 && (
                <Group>
                  <Row
                    title="Do this later"
                    subtitle="Leave it in the session and move to the next exercise"
                    onClick={() => {
                      store().doLater()
                      setSwapSheet(false)
                    }}
                  />
                </Group>
              )
            }
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

  // A custom workout is built before it starts. While `building`, the session overview is the
  // whole screen — adds land in its list, its "End" opens this flow's end sheet, and its
  // Start button is what hands over to the logger. `!current` keeps an empty custom workout
  // stored before `building` existed on this screen rather than in a logger with no exercise.
  if (active.building || !current) {
    return (
      <>
        <SessionOverview onEnd={() => setEndSheet(true)} onStart={active.building ? () => store().beginFreeWorkout() : undefined} />
        {sheets}
      </>
    )
  }

  if (resting) {
    const nextSetIdx = current.performed.findIndex((s) => !s.done)
    const nextSet = current.performed[nextSetIdx]
    // The set just logged — rest is when you notice it was 9, not 8. Corrected in place, so
    // the timer, which renders from restStartedAt, keeps running underneath the sheet.
    const lastIdx = current.performed.findLastIndex((s) => s.done)
    const lastSet = current.performed[lastIdx]
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
          <MomentumBar exercises={active.exercises} current={exIdx} />
          <RestTimer
            restStartedAt={active.restStartedAt}
            restSec={active.restDuration}
            sound={state.settings.sound}
            onAdjust={(d) => store().adjustRest(d)}
            onSkip={() => store().skipRest()}
            onComplete={() => {
              store().skipRest()
              announce(`Rest over. Set ${nextSetIdx + 1} of ${current.performed.length}`)
            }}
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
            {lastSet && (
              <button type="button" className="just-logged" onClick={() => setEditLogged(true)}>
                <span className="just-logged-label">Just logged · Set {lastIdx + 1}</span>
                <span className="just-logged-value tnum">
                  {lastSet.weightKg != null ? `${lastSet.weightKg} × ${lastSet.reps}` : `${lastSet.reps} reps`}
                </span>
                <span className="just-logged-edit">Edit</span>
              </button>
            )}
          </RestTimer>
        </div>
        {editLogged && lastSet && (
          <Sheet title={`Set ${lastIdx + 1}`} onClose={() => setEditLogged(false)}>
            <BigStepper
              label="Weight"
              value={lastSet.weightKg}
              unit="kg"
              onStep={(d) => stepWeight(lastIdx, d)}
              onCommit={(v) => setWeight(lastIdx, v)}
            />
            <BigStepper
              label="Reps"
              value={lastSet.reps}
              onStep={(d) => stepReps(lastIdx, d)}
              onCommit={(v) => changeSet(lastIdx, { reps: Math.max(0, Math.round(v)) })}
            />
            <button type="button" className="btn-primary" onClick={() => setEditLogged(false)}>
              Done
            </button>
          </Sheet>
        )}
        {sheets}
      </>
    )
  }

  if (exerciseDone) {
    const allDone = nextIdx === -1
    // What this exercise will ask for next time, as if the session ended now — the same
    // decision through targetFor, recomputed per render and never stored. The frozen
    // `current.reason` explains the target you were given, which after the last set is
    // the past: it said "first time" beneath 3×12 on a first session.
    const ahead = targetFor(
      current.exerciseId,
      { repsMin: current.repsMin, repsMax: current.repsMax, prescribed: current.sets, increment: current.increment },
      weightLogs([...state.workouts, buildWorkoutLog(active, new Date().toISOString())], state.plan, state.swaps, current.exerciseId),
    )
    return (
      <>
        <NavBar compact title={exerciseName(exDef)} actions={<>{navActions}{overviewButton}</>} />
        <div className="screen-body">
          <MomentumBar exercises={active.exercises} current={exIdx} />
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

          <div className="caption">Next time</div>
          <div className="progression-card">
            {ahead.weightKg != null && <p className="progression-next tnum">{ahead.weightKg} kg</p>}
            <p className="progression-reason">{ahead.reason}</p>
          </div>

          <button type="button" className="btn-primary" onClick={() => (allDone ? finish() : store().goToExercise(nextIdx))}>
            {allDone ? 'Finish Workout' : 'Next exercise'}
          </button>
          {/* What is next, as a row you can read walking to the machine: the thumbnail, the
              name, and the target its first open set is prefilled with. */}
          {!allDone && nextDef && (
            <Group className="next-up-row">
              <Row
                thumb={<Thumb exercise={nextDef} />}
                title={exerciseName(nextDef)}
                subtitle={nextUpTarget(active.exercises[nextIdx])}
              />
            </Group>
          )}
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
  // One weight for every set reads "27.5 kg · 12, 12, 10". Mixed weights print each set's own,
  // or the heaviest beside every rep count claims sets at 27.5 that were done lighter.
  const lastDone = (current.lastSets || []).filter((s) => s && s.done)
  const lastMixed = lastDone.some((s) => s.weightKg !== lastWeight)
  const lastReps = (current.lastSets || [])
    .map((s) => (!s || !s.done ? '—' : lastMixed ? `${s.weightKg ?? '–'} × ${s.reps}` : s.reps))
    .join(lastMixed ? ' · ' : ', ')
  const plates = platesOnly(exDef)
  // A warm-up ramp only before the first set of the session's first lift, and only on a
  // barbell, where the per-side arithmetic is what you are doing at the rack anyway. Ticks
  // live in this component and nowhere else: a warm-up is never a set and never reaches a log.
  const warmup =
    plates && exIdx === 0 && setIdx === 0 && logged.length === 0 ? warmupSteps(set.weightKg) : []

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
        <MomentumBar exercises={active.exercises} current={exIdx} />

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
            {lastMixed ? `Last time ${lastReps} kg` : `Last time ${lastWeight} kg · ${lastReps}`}
          </p>
        )}
        {/* The reason, frozen at startWorkout, so it cannot move while you lift. It was
            behind "Why this target?", and it is the sentence that says what the set is for. */}
        {current.reason && <p className="logger-reason">{current.reason}</p>}
        {/* A barbell's per-side figure replaces this line under the weight stepper below. */}
        {!plates && weightHint(exDef) && <p className="weight-hint">{weightHint(exDef)}</p>}

        {warmup.length > 0 && (
          <div className="warmup" aria-label="Warm-up">
            <span className="warmup-label">Warm-up · a side</span>
            {warmup.map((w, i) => (
              <button
                type="button"
                key={i}
                className="chip warmup-step tnum"
                data-active={warmedUp.includes(i)}
                aria-pressed={warmedUp.includes(i)}
                onClick={() => setWarmedUp(warmedUp.includes(i) ? warmedUp.filter((x) => x !== i) : [...warmedUp, i])}
              >
                {w.sideKg == null ? 'Bar' : w.sideKg} × {w.reps}
              </button>
            ))}
          </div>
        )}

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
            note={plates && set.weightKg != null ? `Plates only · ${perSide(set.weightKg)} a side` : null}
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

        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            store().tickSet(exIdx, setIdx)
            announce(`Set ${setIdx + 1} logged, ${set.weightKg != null ? `${set.weightKg} kilos, ` : ''}${set.reps} reps`)
          }}
        >
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
          How to do it
        </button>
        {whyOpen && (
          <div className="why-card">
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
