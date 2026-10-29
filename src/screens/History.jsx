import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store.js'
import {
  blockWeightChanges,
  exerciseHistory,
  heaviestDone,
  totalVolume,
  setsCompleted,
  durationSeconds,
  sessionsDone,
  isBlockComplete,
} from '../engine/session.js'
import { groupByDay, monthDays } from '../engine/week.js'
import { getExercise, exerciseName } from '../lib/exercises.js'
import {
  fmtDate,
  fmtDateTime,
  fmtDayHeading,
  fmtActivityCount,
  fmtCount,
  fmtDistance,
  fmtRate,
  fmtBlockChange,
  fmtHr,
  fmtWalkBreaks,
} from '../lib/format.js'
import { ACTIVITY_TYPES, activityName, intensityLabel, runTypeLabel, rideTypeLabel, matchFormatLabel } from '../lib/activities.js'
import NavBar from '../components/NavBar.jsx'
import { Group, Row, Section } from '../components/List.jsx'
import { Thumb, ActivityThumb } from '../components/ExerciseImage.jsx'
import NumCell from '../components/NumCell.jsx'
import Sheet, { ActionSheet } from '../components/Sheet.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import ExerciseDetail from '../components/ExerciseDetail.jsx'
import RunDetail from '../components/RunDetail.jsx'
import RideDetail from '../components/RideDetail.jsx'
import ActivitySheet from '../components/ActivitySheet.jsx'
import WorkoutTimeSheet from '../components/WorkoutTimeSheet.jsx'
import Icon from '../components/Icon.jsx'
import Settings from './Settings.jsx'
import { exportBackup } from '../lib/backup.js'

function countSessionsSince(lastExportAt, workouts) {
  if (lastExportAt == null) return workouts.length
  const t = Date.parse(lastExportAt)
  return workouts.filter((w) => Date.parse(w.finishedAt) > t).length
}

// The timeline is one merged stream. A workout timestamps as `finishedAt` and an activity
// as `at`; normalising here is the only place that asymmetry has to be handled.
function mergeItems(workouts, activities) {
  return [
    ...workouts.map((w) => ({ kind: 'workout', at: w.finishedAt, data: w })),
    ...activities.map((a) => ({ kind: 'activity', at: a.at, data: a })),
  ]
}

// The filter vocabulary. `null` is "All"; `'workout'` isolates lift sessions; each activity
// type id isolates that activity. The glyph is the same picture the row the filter produces
// already draws, so a chip and its results read as one thing.
const FILTERS = [
  { id: null, label: 'All', icon: null },
  { id: 'workout', label: 'Workouts', icon: 'dumbbell' },
  ...ACTIVITY_TYPES.map((t) => ({ id: t.id, label: t.label, icon: t.id })),
]

function matchesFilter(item, filter) {
  if (filter == null) return true
  if (filter === 'workout') return item.kind === 'workout'
  return item.kind === 'activity' && item.data.type === filter
}

function filterLabel(filter) {
  if (filter == null) return null
  if (filter === 'workout') return 'workouts'
  const t = ACTIVITY_TYPES.find((x) => x.id === filter)
  return t ? t.plural.toLowerCase() : null
}

// Blocks still hold their workouts, because the weight-change summary needs them together.
// They are no longer the timeline's structure — just the source for the summary rows the
// walk below drops in at each boundary.
function blockWorkouts(workouts) {
  const map = new Map()
  for (const w of workouts) {
    if (!map.has(w.blockIndex)) map.set(w.blockIndex, [])
    map.get(w.blockIndex).push(w)
  }
  return map
}

// One flat, ordered list of everything the timeline draws. Walking newest to oldest, the
// moment an item belongs to a finished block the walk was not already in, that block's
// summary goes above its newest item — the point where it ended, which is where a
// retrospective belongs. The summary is the block being entered, never the one being left:
// labelling it with the one left put the current block's name above the previous block's
// sessions. The current block never gets one, because it has not ended.
function timelineRows(days, currentBlock, includeBlocks = true) {
  const rows = []
  let prevBlock = null
  // A run is the items between two boundaries. A block marker interrupting a day ends the
  // run, which is correct — the two sides of it belong to different blocks.
  let run = null
  for (const day of days) {
    run = null
    // The heading waits for the day's first item, so a block that ended on the day before
    // puts its marker ABOVE this day's heading rather than between the heading and its
    // items. A marker in the middle of a day repeats the heading below it.
    let headed = false
    for (const item of day.items) {
      const block = item.data.blockIndex
      if (includeBlocks && block !== prevBlock && block !== currentBlock) {
        run = null
        headed = false
        rows.push({ type: 'block', key: `block-${block}`, blockIndex: block })
      }
      prevBlock = block
      if (!headed) {
        headed = true
        rows.push({ type: 'day', key: `day-${day.key}-${block}`, date: day.date, blockIndex: block })
      }
      if (!run) {
        run = { type: 'items', key: `items-${item.data.id}`, items: [] }
        rows.push(run)
      }
      run.items.push(item)
    }
  }
  return rows
}

function BackupBanner({ onExport, onDismiss }) {
  const workouts = useStore((s) => s.workouts)
  const lastExportAt = useStore((s) => s.lastExportAt)
  const since = countSessionsSince(lastExportAt, workouts)
  if (since < 8) return null
  return (
    <div className="banner">
      <span className="banner-text">{since} sessions since your last backup —</span>
      <button type="button" className="btn" onClick={onExport}>
        export?
      </button>
      <button type="button" className="btn btn-destructive" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  )
}

// A closed block, marking the point in the timeline where it ended. Not a list container
// any more — a dated entry in the journal like everything else, carrying the one thing a
// block is actually for: what moved across it. That list is one line per exercise and sits
// in the middle of the stream, so it opens on a tap rather than pushing the older sessions
// down; the heading and dates stay, so a closed block still says what and when.
function BlockMarker({ blockIndex, workouts, activityCount }) {
  const customEx = useStore((s) => s.customEx)
  const [open, setOpen] = useState(false)
  const changes = blockWeightChanges(workouts)
  const first = workouts[0]
  const last = workouts[workouts.length - 1]
  const summary = (
    <>
      <div className="block-marker-head">
        <span className="block-marker-title">Block {blockIndex + 1}</span>
        <span className="block-marker-count tnum">
          {workouts.length} sessions
          {activityCount ? ` · ${activityCount}` : ''}
          {changes.length > 0 && (
            <span className={open ? 'filter-chevron open' : 'filter-chevron'}>
              <Icon name="chevron" size={14} />
            </span>
          )}
        </span>
      </div>
      {first && last && (
        <div className="block-marker-dates tnum">
          {fmtDate(first.startedAt)} – {fmtDate(last.finishedAt)}
        </div>
      )}
    </>
  )
  return (
    <div className="block-marker">
      {changes.length > 0 ? (
        <button type="button" className="block-marker-toggle" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {summary}
        </button>
      ) : (
        summary
      )}
      {changes.length > 0 && (
        <div className="disclosure" data-open={open || undefined}>
          <div className="disclosure-body">
            <div className="block-changes">
              <div className="caption">Working weight</div>
              {changes.map((c) => {
                const ex = getExercise(c.exerciseId, customEx)
                const { text, direction } = fmtBlockChange(c)
                return (
                  <div className="block-change" key={c.exerciseId}>
                    <span className="block-change-name">{exerciseName(ex)}</span>
                    <span className={`block-change-value tnum${direction ? ` ${direction}` : ''}`}>
                      {text}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Sets and volume, as the timeline row and the workout's own sheet both state them.
function workoutFacts(workout) {
  const sets = setsCompleted(workout.entries)
  const volume = totalVolume(workout.entries)
  return [
    `${sets} ${sets === 1 ? 'set' : 'sets'}`,
    volume > 0 ? `${volume.toLocaleString('en-GB')} kg` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function workoutMinutes(workout) {
  return `${Math.round(durationSeconds(workout.startedAt, workout.finishedAt) / 60)} min`
}

// Leads with what it was, not when. The day heading above already carries the date, so
// spending the title on a timestamp was spending it on the one thing already known.
function WorkoutRow({ workout, onSelect }) {
  const customEx = useStore((s) => s.customEx)
  const ex = getExercise(workout.entries[0]?.exerciseId, customEx)
  const detail = workoutFacts(workout)
  return (
    <button type="button" className="row" onClick={onSelect}>
      {ex && <Thumb exercise={ex} />}
      <div className="row-label">
        <div className="title">{workout.templateName}</div>
        <div className="subtitle tnum">{detail}</div>
      </div>
      <span className="row-value metric">{workoutMinutes(workout)}</span>
      <span className="row-chevron">
        <Icon name="chevron" size={16} />
      </span>
    </button>
  )
}

// Reuses the exercise thumbnail's box so the column lines up with workout rows, and reads
// the same way round: what it was, then the facts about it.
function ActivityRow({ activity, onSelect }) {
  // Built by filter/join rather than a chain of ternaries: every part is optional on its
  // own, and records written before distance and intensity existed carry neither.
  const detail = [
    typeof activity.distanceKm === 'number' ? fmtDistance(activity.distanceKm) : null,
    fmtRate(activity.type, activity.distanceKm, activity.minutes),
    fmtHr(activity.avgHr),
    fmtWalkBreaks(activity.walkBreaks),
    matchFormatLabel(activity.matchFormat),
    // Run type and intensity are independent — a run shows both ("Long · Easy"), a match
    // shows format and intensity, and everything else just its intensity. Runs logged before
    // types existed still read their intensity alone.
    runTypeLabel(activity.runType),
    rideTypeLabel(activity.rideType),
    intensityLabel(activity.intensity),
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <button type="button" className="row" onClick={onSelect}>
      <ActivityThumb activity={activity} />
      <div className="row-label">
        <div className="title">{activityName(activity)}</div>
        {detail && <div className="subtitle tnum">{detail}</div>}
        {/* A note is the one free-text field on a row, and run into the facts above it, one
            sentence made the row five lines tall. One line here; the sheet holds the rest. */}
        {activity.note && <div className="subtitle subtitle-note">{activity.note}</div>}
      </div>
      <span className="row-value metric">{activity.minutes} min</span>
      <span className="row-chevron">
        <Icon name="chevron" size={16} />
      </span>
    </button>
  )
}

// The change from the previous session of the same exercise, worded as the finish summary
// words it. Read from this session's place in the exercise's history, so an old workout
// compares against the one before it rather than against today.
function changeFromPrevious(history, finishedAt, topWeight) {
  const i = history.findIndex((h) => h.at === finishedAt)
  if (i < 1 || topWeight == null) return null
  const diff = Math.round((topWeight - history[i - 1].topWeight) * 100) / 100
  return (
    <span className={`delta${diff > 0 ? ' up' : diff < 0 ? ' down' : ''}`}>
      {diff === 0 ? 'Held' : `${diff > 0 ? '+' : '−'}${Math.abs(diff)} kg`}
    </span>
  )
}

function WorkoutDetail({ workout, onClose, onDelete, onEditTimes, onOpenExercise }) {
  const customEx = useStore((s) => s.customEx)
  const workouts = useStore((s) => s.workouts)
  const setSet = (entryIdx, setIdx, patch) => useStore.getState().updateHistoricalSet(workout.id, entryIdx, setIdx, patch)

  return (
    <Sheet title={workout.templateName} onClose={onClose}>
      <p className="detail-meta tnum">
        {fmtDateTime(workout.finishedAt)} · {workoutMinutes(workout)} · {workoutFacts(workout)}
      </p>
      <button type="button" className="ex-open" onClick={onEditTimes}>
        Edit date and time
      </button>
      {workout.entries.map((entry, ei) => {
        const ex = getExercise(entry.exerciseId, customEx)
        const history = exerciseHistory(workouts, entry.exerciseId)
        return (
          <Group key={ei}>
            <Row
              thumb={ex && <Thumb exercise={ex} />}
              title={exerciseName(ex)}
              value={changeFromPrevious(history, workout.finishedAt, heaviestDone(entry.sets))}
              chevron={Boolean(ex)}
              onClick={ex ? () => onOpenExercise(ex) : undefined}
            />
            <div className="set-table">
              <div className="set-table-head">
                <span className="col-set">Set</span>
                <span className="col-num">kg</span>
                <span className="col-num">Reps</span>
                <span />
              </div>
              {entry.sets.map((set, si) => (
                <div key={si} className="set-table-row">
                  <span className="col-set tnum">{si + 1}</span>
                  <NumCell
                    value={set.weightKg}
                    label={`Set ${si + 1} weight in kg`}
                    onCommit={(v) => setSet(ei, si, { weightKg: Math.max(0, v) })}
                  />
                  <NumCell
                    value={set.reps}
                    label={`Set ${si + 1} reps`}
                    onCommit={(v) => setSet(ei, si, { reps: Math.max(0, Math.round(v)) })}
                  />
                  <button
                    type="button"
                    className={`tick${set.done ? ' done' : ''}`}
                    aria-label={set.done ? `Un-tick set ${si + 1}` : `Tick set ${si + 1}`}
                    onClick={() => setSet(ei, si, { done: !set.done })}
                  >
                    {set.done && <Icon name="check" size={20} />}
                  </button>
                </div>
              ))}
            </div>
          </Group>
        )
      })}
      <button type="button" className="btn btn-destructive" onClick={onDelete}>
        Delete workout
      </button>
    </Sheet>
  )
}

// The timeline's days share one card until a block boundary, which breaks the card for the
// block's summary. A card per day was seven floating boxes for a week, most holding one row.
function cardsBetweenBlocks(rows) {
  const out = []
  let card = null
  for (const row of rows) {
    if (row.type === 'block') {
      card = null
      out.push(row)
    } else {
      if (!card) {
        card = { type: 'card', key: `card-${row.key}`, rows: [] }
        out.push(card)
      }
      card.rows.push(row)
    }
  }
  return out
}

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

// A month of what happened, in a sheet behind the calendar button. Owner's decision
// (2026-10-29): this is the one place in the app that draws empty days, because a calendar
// cannot be read without them. It draws them plain and draws nothing for what the week shape
// asked for — there is no planned, due or missed state here, only a lift (square) or cardio
// (circle) where one was logged, the same shape-and-tint code as Today's week strip. The
// timeline still leaves empty days out. The sheet stays open while you page through months;
// tapping a day closes it and jumps there.
function MonthCalendar({ workouts, activities, onPick }) {
  const now = new Date()
  const current = new Date(now.getFullYear(), now.getMonth(), 1)
  const [month, setMonth] = useState(current)
  const first = new Date(
    Math.min(
      ...workouts.map((w) => Date.parse(w.finishedAt)),
      ...activities.map((a) => Date.parse(a.at)),
      current.getTime(),
    ),
  )
  const earliest = new Date(first.getFullYear(), first.getMonth(), 1)
  const days = monthDays(workouts, activities, month, now)
  const step = (n) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="cal">
      <div className="cal-head">
        <button type="button" className="btn" aria-label="Earlier month" disabled={month <= earliest} onClick={() => step(-1)}>
          <span className="cov-back">
            <Icon name="chevron" size={18} />
          </span>
        </button>
        <span className="cal-title">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
        <button type="button" className="btn" aria-label="Later month" disabled={month >= current} onClick={() => step(1)}>
          <Icon name="chevron" size={18} />
        </button>
      </div>
      <div className="cal-grid">
        {DOW.map((d, i) => (
          <span key={`dow-${i}`} className="cal-dow">
            {d}
          </span>
        ))}
        {days.map((d) => {
          if (!d.inMonth) return <span key={d.date.getTime()} className="cal-day" aria-hidden="true" />
          const inner = (
            <>
              <span className="cal-num tnum">{d.date.getDate()}</span>
              <span className="cal-marks">
                {d.lifts > 0 && <span className="cal-mark" data-kind="lift" />}
                {d.cardio > 0 && <span className="cal-mark" data-kind="cardio" />}
              </span>
            </>
          )
          if (d.lifts + d.cardio === 0) {
            return (
              <span key={d.date.getTime()} className="cal-day" data-today={d.isToday || undefined}>
                {inner}
              </span>
            )
          }
          const what = [
            d.lifts ? `${d.lifts} ${d.lifts === 1 ? 'workout' : 'workouts'}` : null,
            d.cardio ? `${d.cardio} ${d.cardio === 1 ? 'activity' : 'activities'}` : null,
          ]
            .filter(Boolean)
            .join(', ')
          return (
            <button
              type="button"
              key={d.date.getTime()}
              className="cal-day"
              data-today={d.isToday || undefined}
              aria-label={`${d.date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}: ${what}`}
              onClick={() => onPick(d.date)}
            >
              {inner}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// The timeline's segments with every finished block but the open ones reduced to its marker.
// A segment belongs to the block marker above it; segments above the first marker are the
// current block's and always show. Nothing here touches the data — it only stops drawing.
function collapseOldBlocks(segments, isOpen) {
  const out = []
  let hiding = false
  for (const seg of segments) {
    if (seg.type === 'block') {
      hiding = !isOpen(seg.blockIndex)
      out.push({ ...seg, collapsed: hiding })
    } else if (!hiding) {
      out.push(seg)
    }
  }
  return out
}

export default function History() {
  const workouts = useStore((s) => s.workouts)
  const activities = useStore((s) => s.activities)
  const progress = useStore((s) => s.progress)
  const sessionCount = useStore((s) => s.plan.sessionCount)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [detailId, setDetailId] = useState(null)
  const [deleteId, setDeleteId] = useState(null)
  const [activityId, setActivityId] = useState(null)
  const [deleteActivityId, setDeleteActivityId] = useState(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [exerciseDetail, setExerciseDetail] = useState(null)
  // null, or the sport the Cardio sheet is showing: 'run' or 'cycle'.
  const [trend, setTrend] = useState(null)
  const [filter, setFilter] = useState(null)
  // 'new' for a past workout being entered, a workout's id for one being re-timed.
  const [timeSheet, setTimeSheet] = useState(null)
  // Finished blocks opened by hand. The newest finished block is open without being asked;
  // anything older shows its summary only, so months of history stay one row per block.
  const [openBlocks, setOpenBlocks] = useState(() => new Set())
  const [calendarOpen, setCalendarOpen] = useState(false)
  // A day the calendar asked to jump to, scrolled to once the render that opens its block
  // has landed. A ref, not state: it schedules nothing and draws nothing.
  const jumpTo = useRef(null)

  const items = useMemo(
    () => mergeItems(workouts, activities).filter((item) => matchesFilter(item, filter)),
    [workouts, activities, filter],
  )
  const rows = useMemo(
    () => timelineRows(groupByDay(items), progress.blockIndex, filter == null),
    [items, filter, progress.blockIndex],
  )
  // The calendar shows what the timeline shows, filter included.
  const calWorkouts = useMemo(() => items.filter((i) => i.kind === 'workout').map((i) => i.data), [items])
  const calActivities = useMemo(() => items.filter((i) => i.kind === 'activity').map((i) => i.data), [items])
  const newestFinished = rows.find((r) => r.type === 'block')?.blockIndex
  const isOpen = (blockIndex) => blockIndex === newestFinished || openBlocks.has(blockIndex)

  const pickDay = (date) => {
    const day = rows.find((r) => r.type === 'day' && r.date.getTime() === date.getTime())
    if (!day) return
    setCalendarOpen(false)
    if (day.blockIndex !== progress.blockIndex && !isOpen(day.blockIndex)) {
      setOpenBlocks((prev) => new Set(prev).add(day.blockIndex))
    }
    jumpTo.current = day.key
    // A day already on screen re-renders nothing, so the effect below would not run for it.
    const el = document.getElementById(day.key)
    if (el) {
      jumpTo.current = null
      el.scrollIntoView({ block: 'start' })
    }
  }

  useEffect(() => {
    if (!jumpTo.current) return
    const el = document.getElementById(jumpTo.current)
    jumpTo.current = null
    if (el) el.scrollIntoView({ block: 'start' })
  })
  const byBlock = useMemo(() => blockWorkouts(workouts), [workouts])
  const blockDone = sessionsDone(workouts, progress.blockIndex)
  const activityCounts = useMemo(() => {
    const map = new Map()
    for (const a of activities) map.set(a.blockIndex, (map.get(a.blockIndex) || 0) + 1)
    return map
  }, [activities])

  const doExport = () => exportBackup(useStore)

  const detail = detailId != null ? workouts.find((w) => w.id === detailId) : null
  const activityDetail = activityId != null ? activities.find((a) => a.id === activityId) : null

  return (
    <>
      <NavBar
        title="History"
        actions={
          <>
            {rows.length > 0 && (
              <button type="button" className="btn" aria-label="Calendar" onClick={() => setCalendarOpen(true)}>
                <Icon name="calendar" size={22} />
              </button>
            )}
            <button type="button" className="btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
              <Icon name="gear" size={22} />
            </button>
          </>
        }
      />
      <div className="screen-body">
        {!bannerDismissed && <BackupBanner onExport={doExport} onDismiss={() => setBannerDismissed(true)} />}

        {/* A filter is only worth showing once there is something to filter. Single-select:
            tapping a chip shows that kind alone, tapping it again clears back to All. The
            active chip leads the row the same way the Library filters do. */}
        {workouts.length + activities.length > 0 && (
          <div className="filter-group">
            <div className="filter-label">Show</div>
            <div className="filter-chips">
              {FILTERS.map((f) => (
                <button
                  key={f.id ?? 'all'}
                  type="button"
                  className="chip"
                  data-active={filter === f.id}
                  onClick={() => setFilter(filter === f.id ? null : f.id)}
                >
                  {f.icon && <Icon name={f.icon} size={16} />}
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="empty-state">
            <span className="empty-glyph"><Icon name="history" size={28} /></span>
            <p className="empty-title">
              {filter == null ? 'Nothing logged yet' : `No ${filterLabel(filter)} logged yet`}
            </p>
            <p className="empty-body">
              {filter == null
                ? 'Finish a session or log a run on Today and it will appear here — every workout, run and match on one timeline, newest first.'
                : 'Try a different filter.'}
            </p>
          </div>
        ) : (
          <>
            {/* Counted from the logs, not from progress.sessionIndex — deleting a session
                on this very screen leaves that counter behind. Today adds one to name the
                session about to be done; this screen is a record, so it counts what
                happened. */}
            <Section>Block {progress.blockIndex + 1}</Section>
            <div className="block-lead tnum">
              <ProgressRing fraction={blockDone / sessionCount} size={44} stroke={5} />
              <span className="block-lead-figure">
                {blockDone}
                <span className="block-lead-of"> / {sessionCount}</span>
              </span>
              <span className="block-lead-caption">sessions done</span>
            </div>
            {/* A session forgotten in the gym counts toward the block like any other, so
                there is nowhere to put one once the block is full. */}
            {!isBlockComplete(blockDone, sessionCount) && (
              <Group>
                <Row title="Log a past workout" chevron onClick={() => setTimeSheet('new')} />
              </Group>
            )}
            {/* One stream. A day heading, the items logged that day, and a block's summary
                where the walk crosses out of it. Days with nothing in them are absent
                rather than drawn as rest: this is a record of what happened, and padding it
                with what did not is how a log starts keeping score. */}
            {collapseOldBlocks(cardsBetweenBlocks(rows), isOpen).map((seg) =>
              seg.type === 'block' ? (
                <Fragment key={seg.key}>
                  <BlockMarker
                    blockIndex={seg.blockIndex}
                    workouts={byBlock.get(seg.blockIndex) || []}
                    activityCount={fmtActivityCount(activityCounts.get(seg.blockIndex) || 0)}
                  />
                  {seg.collapsed && (
                    <Group>
                      <Row
                        title={`Show ${[
                          fmtCount((byBlock.get(seg.blockIndex) || []).length, 'session'),
                          fmtActivityCount(activityCounts.get(seg.blockIndex) || 0),
                        ]
                          .filter(Boolean)
                          .join(' · ')}`}
                        chevron
                        onClick={() => setOpenBlocks((prev) => new Set(prev).add(seg.blockIndex))}
                      />
                    </Group>
                  )}
                </Fragment>
              ) : (
                <Group key={seg.key}>
                  {seg.rows.map((row) =>
                    row.type === 'day' ? (
                      <div key={row.key} id={row.key} className="timeline-day">
                        {fmtDayHeading(row.date)}
                      </div>
                    ) : (
                      row.items.map((item) =>
                        item.kind === 'workout' ? (
                          <WorkoutRow
                            key={item.data.id}
                            workout={item.data}
                            onSelect={() => setDetailId(item.data.id)}
                          />
                        ) : (
                          <ActivityRow
                            key={item.data.id}
                            activity={item.data}
                            onSelect={() => setActivityId(item.data.id)}
                          />
                        ),
                      )
                    ),
                  )}
                </Group>
              ),
            )}
          </>
        )}
      </div>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
      {calendarOpen && (
        <Sheet title="Calendar" onClose={() => setCalendarOpen(false)}>
          <MonthCalendar workouts={calWorkouts} activities={calActivities} onPick={pickDay} />
        </Sheet>
      )}
      {detail && (
        <WorkoutDetail
          workout={detail}
          onClose={() => setDetailId(null)}
          onDelete={() => setDeleteId(detail.id)}
          onEditTimes={() => setTimeSheet(detail.id)}
          onOpenExercise={setExerciseDetail}
        />
      )}
      {timeSheet && (
        <WorkoutTimeSheet
          workout={timeSheet === 'new' ? null : workouts.find((w) => w.id === timeSheet)}
          onLogged={(id) => {
            setTimeSheet(null)
            setDetailId(id)
          }}
          onClose={() => setTimeSheet(null)}
        />
      )}
      {exerciseDetail && (
        <Sheet title={exerciseName(exerciseDetail)} onClose={() => setExerciseDetail(null)}>
          <ExerciseDetail exercise={exerciseDetail} />
        </Sheet>
      )}
      {activityDetail && (
        <ActivitySheet
          activity={activityDetail}
          onSave={(patch) => useStore.getState().updateActivity(activityDetail.id, patch)}
          onDelete={() => setDeleteActivityId(activityDetail.id)}
          onOpenTrend={setTrend}
          onClose={() => setActivityId(null)}
        />
      )}
      {/* Each sport keeps its own trend — kilometres on a bike and on foot are not the same
          effort — so the sheet switches between them rather than drawing one line. */}
      {trend && (
        <Sheet title="Cardio" onClose={() => setTrend(null)}>
          <div className="segmented">
            <button type="button" aria-pressed={trend === 'run'} onClick={() => setTrend('run')}>
              Running
            </button>
            <button type="button" aria-pressed={trend === 'cycle'} onClick={() => setTrend('cycle')}>
              Cycling
            </button>
          </div>
          {trend === 'run' ? <RunDetail /> : <RideDetail />}
        </Sheet>
      )}
      {deleteId && (
        <ActionSheet
          onClose={() => setDeleteId(null)}
          actions={[
            {
              label: 'Delete Workout',
              destructive: true,
              onClick: () => {
                useStore.getState().deleteWorkout(deleteId)
                setDetailId(null)
              },
            },
          ]}
        />
      )}
      {deleteActivityId && (
        <ActionSheet
          onClose={() => setDeleteActivityId(null)}
          actions={[
            {
              label: 'Delete Activity',
              destructive: true,
              onClick: () => {
                useStore.getState().deleteActivity(deleteActivityId)
                setActivityId(null)
              },
            },
          ]}
        />
      )}
    </>
  )
}
