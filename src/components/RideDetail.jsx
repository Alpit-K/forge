import { useStore } from '../store.js'
import { rideHistory, rideStats } from '../engine/activity.js'
import { fmtCount, fmtDate, fmtDistance, fmtHr, fmtSpeed } from '../lib/format.js'
import { Stat } from './ExerciseDetail.jsx'
import Sparkline from './Sparkline.jsx'

// The same window RunDetail uses.
const RECENT = 5

// Cycling as a training record, beside RunDetail and built the same way: facts, never a
// target. Kilometres are not shared with the run trend — ten on a bike is not ten on foot.
//
// Speed and heart rate are drawn over every EASY ride, with no long/short split. Rides carry
// no run type, and on the bike a 30- and a 60-minute ride came in at the same speed, so the
// split the run trend needs would only halve two short lines (owner's decision, 2026-10-28).
// Hard and untagged rides are in neither: untagged is unknown, not easy.
export default function RideDetail() {
  const activities = useStore((s) => s.activities)
  const history = rideHistory(activities)
  const stats = rideStats(history)
  const easySpeeds = history.filter((r) => r.intensity === 'easy' && r.speedKmh != null)
  const easyStats = rideStats(easySpeeds)
  const easyHr = history.filter((r) => r.intensity === 'easy' && r.avgHr != null)
  const easyHrStats = rideStats(easyHr)
  const recent = history.slice(-RECENT).reverse()

  if (!stats) {
    return (
      <p className="ex-empty">
        No rides with a distance yet. Add a distance when you log a ride and the trend will
        build here.
      </p>
    )
  }

  return (
    <>
      <div className="ex-stats">
        <Stat
          label="Longest"
          value={fmtDistance(stats.longest.distanceKm)}
          note={fmtDate(stats.longest.at)}
        />
        <Stat
          label="Easy speed"
          value={easyStats ? fmtSpeed(easyStats.latestSpeed) : '—'}
          note={
            easyStats && easyStats.speedChange != null && easyStats.speedChange !== 0
              ? `${Math.abs(easyStats.speedChange)} km/h ${easyStats.speedChange > 0 ? 'faster' : 'slower'} since ${fmtDate(easyStats.firstSpeedAt)}`
              : null
          }
        />
        <Stat label="Total" value={fmtDistance(stats.totalKm)} note={fmtCount(stats.rides, 'ride')} />
      </div>

      {history.length > 1 && (
        <>
          <div className="caption">Ride distance</div>
          <Sparkline cat="cardio" values={history.map((r) => r.distanceKm)} />
        </>
      )}

      {easySpeeds.length > 1 && (
        <>
          {/* Not negated: unlike pace, a higher speed is already the good direction. */}
          <div className="caption">Easy-ride speed</div>
          <Sparkline cat="cardio" values={easySpeeds.map((r) => r.speedKmh)} />
        </>
      )}

      {easyHr.length > 1 && (
        <>
          {/* Negated, as the run trend's is — at the same easy effort a lower heart rate is the
              good direction, and every sparkline in the app rises towards the good one. */}
          <div className="caption">
            Easy-ride heart rate
            {easyHrStats.hrChange != null && easyHrStats.hrChange !== 0
              ? ` · ${Math.abs(easyHrStats.hrChange)} bpm ${easyHrStats.hrChange < 0 ? 'lower' : 'higher'} since ${fmtDate(easyHrStats.firstHrAt)}`
              : ''}
          </div>
          <Sparkline cat="cardio" values={easyHr.map((r) => -r.avgHr)} />
        </>
      )}

      <div className="caption">Recent</div>
      <div className="list">
        {recent.map((r) => (
          <div className="ex-session" key={r.at}>
            <span className="ex-session-date">{fmtDate(r.at)}</span>
            <span className="ex-session-sets tnum">
              {[
                fmtDistance(r.distanceKm),
                Number.isFinite(r.minutes) && r.minutes > 0 ? `${r.minutes} min` : null,
                fmtSpeed(r.speedKmh),
                fmtHr(r.avgHr),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
