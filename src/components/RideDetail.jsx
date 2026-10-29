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
          <Sparkline cat="cardio" format={fmtDistance} points={history.map((r) => ({ value: r.distanceKm, at: r.at }))} />
        </>
      )}

      {easySpeeds.length > 1 && (
        <>
          <div className="caption">Easy-ride speed</div>
          <Sparkline cat="cardio" format={fmtSpeed} points={easySpeeds.map((r) => ({ value: r.speedKmh, at: r.at }))} />
        </>
      )}

      {easyHr.length > 1 && (
        <>
          {/* Drawn the natural way up, as the run trend's is, with the good direction — lower,
              at the same easy effort — said in words beneath it. */}
          <div className="caption">
            Easy-ride heart rate
            {easyHrStats.hrChange != null && easyHrStats.hrChange !== 0
              ? ` · ${Math.abs(easyHrStats.hrChange)} bpm ${easyHrStats.hrChange < 0 ? 'lower' : 'higher'} since ${fmtDate(easyHrStats.firstHrAt)}`
              : ''}
          </div>
          <Sparkline cat="cardio" format={fmtHr} points={easyHr.map((r) => ({ value: r.avgHr, at: r.at }))} />
          <p className="chart-note">Lower is better at the same effort.</p>
        </>
      )}

      <div className="caption">Recent</div>
      <div className="list">
        {recent.map((r) => (
          <div className="ex-session" key={r.at}>
            <span className="ex-session-date">{fmtDate(r.at)}</span>
            {/* Two lines, the distance on the first, as RunDetail's are. */}
            <span className="ex-session-sets tnum">
              {fmtDistance(r.distanceKm)}
              <span className="ex-session-more">
                {[
                  Number.isFinite(r.minutes) && r.minutes > 0 ? `${r.minutes} min` : null,
                  fmtSpeed(r.speedKmh),
                  fmtHr(r.avgHr),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
