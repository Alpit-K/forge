import { useMemo } from 'react'
import { useStore } from '../store.js'
import { weekDays, recentWeeks } from '../engine/week.js'
import { weekForecast } from '../engine/coach.js'
import {
  activityName,
  intensityLabel,
  runTypeLabel,
  rideTypeLabel,
  matchFormatLabel,
} from '../lib/activities.js'
import { fmtDistance } from '../lib/format.js'
import Sheet from './Sheet.jsx'
import { WeekPlanner } from '../screens/Settings.jsx'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKS = 6

// What happened on one day, in the order you would say it: what it was, then how it went.
function dayDetail(day) {
  const parts = day.liftLogs.map((w) => w.templateName)
  for (const a of day.cardioLogs) {
    parts.push(
      [
        activityName(a),
        matchFormatLabel(a.matchFormat),
        runTypeLabel(a.runType),
        rideTypeLabel(a.rideType),
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
  const state = useStore((s) => s)

  const now = useMemo(() => new Date(), [])
  const days = useMemo(
    () => weekDays(workouts, activities, settings.weekShape || [], now),
    [workouts, activities, settings.weekShape, now],
  )
  // The same kinds the strip draws, so an empty day reads "Rest" here exactly where the strip
  // shows a rest dot.
  const forecast = useMemo(() => weekForecast(state, now), [state, now])
  const weeks = useMemo(
    () => recentWeeks(workouts, activities, now, WEEKS),
    [workouts, activities, now],
  )

  const trained = weeks.filter((w) => w.lifts + w.cardio > 0).length

  return (
    <Sheet title="This week" onClose={onClose}>
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
                  <span className="wk-day-empty">{forecast[d.index] === 'rest' ? 'Rest' : '—'}</span>
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

      {/* The shape Today reads, editable where you are looking when its suggestion surprises
          you. The same planner Settings draws, writing the same setting. */}
      <div className="caption">Your usual week</div>
      <div className="list">
        <WeekPlanner
          shape={settings.weekShape}
          onChange={(i, kind) =>
            useStore.getState().setSetting('weekShape', settings.weekShape.map((k, j) => (j === i ? kind : k)))
          }
        />
      </div>
      <p className="consistency-note">
        Tap a day to cycle it: lift, cardio, long, rest. These days set your weekly targets.
      </p>
    </Sheet>
  )
}
