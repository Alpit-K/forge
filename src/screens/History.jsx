import { useMemo, useState } from 'react'
import { useStore } from '../store.js'
import {
  blockWeightChanges,
  exerciseHistory,
  heaviestDone,
  totalVolume,
  setsCompleted,
  durationSeconds,
  sessionsDone,
} from '../engine/session.js'
import { groupByDay } from '../engine/week.js'
import { getExercise, exerciseName } from '../lib/exercises.js'
import {
  fmtDate,
  fmtDateTime,
  fmtDayHeading,
  fmtActivityCount,
  fmtDistance,
  fmtPace,
  fmtHr,
} from '../lib/format.js'
import { ACTIVITY_TYPES, activityName, intensityLabel, runTypeLabel, matchFormatLabel } from '../lib/activities.js'
import NavBar from '../components/NavBar.jsx'
import { Group, Row, Section } from '../components/List.jsx'
import { Thumb, ActivityThumb } from '../components/ExerciseImage.jsx'
import NumCell from '../components/NumCell.jsx'
import Sheet, { ActionSheet } from '../components/Sheet.jsx'
import ProgressRing from '../components/ProgressRing.jsx'
import ExerciseDetail from '../components/ExerciseDetail.jsx'
import RunDetail from '../components/RunDetail.jsx'
import ActivitySheet from '../components/ActivitySheet.jsx'
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
        rows.push({ type: 'day', key: `day-${day.key}-${block}`, date: day.date })
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
              {changes.map((c) => {
                const ex = getExercise(c.exerciseId, customEx)
                const diff = Math.round((c.last - c.first) * 100) / 100
                return (
                  <div className="block-change" key={c.exerciseId}>
                    <span className="block-change-name">{exerciseName(ex)}</span>
                    <span className={`block-change-value tnum${diff > 0 ? ' up' : diff < 0 ? ' down' : ''}`}>
                      {c.first} → {c.last} kg
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
    fmtPace(activity.distanceKm, activity.minutes),
    fmtHr(activity.avgHr),
    matchFormatLabel(activity.matchFormat),
    // Run type and intensity are independent — a run shows both ("Long · Easy"), a match
    // shows format and intensity, and everything else just its intensity. Runs logged before
    // types existed still read their intensity alone.
    runTypeLabel(activity.runType),
    intensityLabel(activity.intensity),
    activity.note,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <button type="button" className="row" onClick={onSelect}>
      <ActivityThumb activity={activity} />
      <div className="row-label">
        <div className="title">{activityName(activity)}</div>
        {detail && <div className="subtitle tnum">{detail}</div>}
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

function WorkoutDetail({ workout, onClose, onDelete, onOpenExercise }) {
  const customEx = useStore((s) => s.customEx)
  const workouts = useStore((s) => s.workouts)
  const setSet = (entryIdx, setIdx, patch) => useStore.getState().updateHistoricalSet(workout.id, entryIdx, setIdx, patch)

  return (
    <Sheet title={workout.templateName} onClose={onClose}>
      <p className="detail-meta tnum">
        {fmtDateTime(workout.finishedAt)} · {workoutMinutes(workout)} · {workoutFacts(workout)}
      </p>
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
  const [trendOpen, setTrendOpen] = useState(false)
  const [filter, setFilter] = useState(null)

  const rows = useMemo(() => {
    const items = mergeItems(workouts, activities).filter((item) => matchesFilter(item, filter))
    return timelineRows(groupByDay(items), progress.blockIndex, filter == null)
  }, [workouts, activities, filter, progress.blockIndex])
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
          <button type="button" className="btn" aria-label="Settings" onClick={() => setSettingsOpen(true)}>
            <Icon name="gear" size={22} />
          </button>
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
            {/* One stream. A day heading, the items logged that day, and a block's summary
                where the walk crosses out of it. Days with nothing in them are absent
                rather than drawn as rest: this is a record of what happened, and padding it
                with what did not is how a log starts keeping score. */}
            {cardsBetweenBlocks(rows).map((seg) =>
              seg.type === 'block' ? (
                <BlockMarker
                  key={seg.key}
                  blockIndex={seg.blockIndex}
                  workouts={byBlock.get(seg.blockIndex) || []}
                  activityCount={fmtActivityCount(activityCounts.get(seg.blockIndex) || 0)}
                />
              ) : (
                <Group key={seg.key}>
                  {seg.rows.map((row) =>
                    row.type === 'day' ? (
                      <div key={row.key} className="timeline-day">
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
      {detail && (
        <WorkoutDetail
          workout={detail}
          onClose={() => setDetailId(null)}
          onDelete={() => setDeleteId(detail.id)}
          onOpenExercise={setExerciseDetail}
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
          onOpenTrend={() => setTrendOpen(true)}
          onClose={() => setActivityId(null)}
        />
      )}
      {trendOpen && (
        <Sheet title="Running" onClose={() => setTrendOpen(false)}>
          <RunDetail />
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
