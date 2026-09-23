import { useMemo } from 'react'
import { useStore } from '../store.js'
import { weekDays, weekSummary, recentWeeks } from '../engine/week.js'
import {
  ACTIVITY_TYPES,
  activityName,
  intensityLabel,
  runTypeLabel,
  matchFormatLabel,
} from '../lib/activities.js'
import { fmtDistance } from '../lib/format.js'
import Sheet from './Sheet.jsx'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKS = 6

// Strength plus every activity type the last six weeks actually contain. A category you have
// never trained is noise — "Swim 0" every week says nothing — but one you normally do and
// skipped this week is a real fact, so the vocabulary comes from the window, not from today.
function categories(week, weeks) {
  const seen = new Set()
  for (const w of weeks) for (const a of w.cardioLogs) seen.add(a.type)
  const rows = [{ id: 'lift', label: 'Strength', count: week.lifts }]
  for (const t of ACTIVITY_TYPES) {
    if (!seen.has(t.id)) continue
    rows.push({ id: t.id, label: t.label, count: week.cardioLogs.filter((a) => a.type === t.id).length })
  }
  return rows
}

// What happened on one day, in the order you would say it: what it was, then how it went.
function dayDetail(day) {
  const parts = day.liftLogs.map((w) => w.templateName)
  for (const a of day.cardioLogs) {
    parts.push(
      [
        activityName(a),
        matchFormatLabel(a.matchFormat),
        runTypeLabel(a.runType),
        intensityLabel(a.intensity),
        typeof a.distanceKm === 'number' ? fmtDistance(a.distanceKm) : null,
      ]
        .filter(Boolean)
        .join(' · '),
    )
  }
  return parts
}

export default function WeekSheet({ onClose }) {
  const workouts = useStore((s) => s.workouts)
  const activities = useStore((s) => s.activities)
  const settings = useStore((s) => s.settings)

  const now = useMemo(() => new Date(), [])
  const week = useMemo(() => weekSummary(workouts, activities, now), [workouts, activities, now])
  const days = useMemo(
    () => weekDays(workouts, activities, settings.weekShape || [], now),
    [workouts, activities, settings.weekShape, now],
  )
  const weeks = useMemo(
    () => recentWeeks(workouts, activities, now, WEEKS),
    [workouts, activities, now],
  )

  const rows = categories(week, weeks)
  const most = Math.max(1, ...rows.map((r) => r.count))
  const trained = weeks.filter((w) => w.lifts + w.cardio > 0).length

  return (
    <Sheet title="This week" onClose={onClose}>
      <div className="list">
        {rows.map((r) => (
          <div className="mix-row" key={r.id}>
            <span className="mix-label">{r.label}</span>
            {/* Proportional to the busiest category, not to a target. A bar that fills
                towards a goal is a goal you can fail; this one only says which of these you
                did more of. */}
            <span className="mix-bar" aria-hidden="true">
              <span className="mix-fill" style={{ width: `${(r.count / most) * 100}%` }} />
            </span>
            <span className="mix-count tnum">{r.count}</span>
          </div>
        ))}
      </div>

      {/* What the week actually moved, under the bar that says what it was made of. Both
          halves are omitted rather than zeroed when there is nothing behind them — the same
          rule as `easyPct`: a 0 kg week reads as a failure, an absent line reads as what it
          is, which is a week with no lifting in it yet. */}
      {(week.volumeKg > 0 || week.distanceKm > 0) && (
        <p className="week-facts">
          {[
            week.volumeKg > 0 ? `${Math.round(week.volumeKg).toLocaleString('en-GB')} kg lifted` : null,
            week.distanceKm > 0 ? `${fmtDistance(week.distanceKm)} covered` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {week.lifts + week.cardio === 0 && (
        <p className="ex-empty">Nothing logged this week yet. It starts on Today.</p>
      )}

      <div className="caption">Day by day</div>
      <div className="list">
        {days.map((d) => {
          const detail = dayDetail(d)
          return (
            <div className="wk-day" key={d.index} data-today={d.isToday || undefined}>
              <span className="wk-day-name">{DAY_LABELS[d.index]}</span>
              <span className="wk-day-detail">
                {detail.length > 0 ? (
                  detail.map((line, i) => <span key={i}>{line}</span>)
                ) : (
                  <span className="wk-day-empty">{d.planned === 'rest' ? 'Rest' : '—'}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      <div className="caption">Consistency</div>
      {/* Facts, in the past tense. No streak, no current run, nothing that a quiet week
          resets — the sentence reads the same whether the gap was last week or never. */}
      <p className="consistency-line">
        Trained {trained} of the last {WEEKS} weeks.
      </p>
      <div className="wk-weeks">
        {weeks.map((w) => (
          <span className="wk-week tnum" key={w.start.getTime()}>
            {w.lifts + w.cardio}
          </span>
        ))}
      </div>
      <p className="consistency-note">Sessions per week, oldest first.</p>
    </Sheet>
  )
}
