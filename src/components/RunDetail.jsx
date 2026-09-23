import { useStore } from '../store.js'
import { runHistory, runStats } from '../engine/activity.js'
import { fmtDate, fmtDistance, fmtHr, fmtPaceSec, fmtRunCount } from '../lib/format.js'
import { runTypeLabel } from '../lib/activities.js'
import { Stat } from './ExerciseDetail.jsx'
import Sparkline from './Sparkline.jsx'

// The last few runs, newest first — the same window the exercise record uses, and further
// back is what the sparklines are for.
const RECENT = 5

// Running as a training record, the cardio counterpart to ExerciseDetail. It states facts
// and never a target: there is no goal distance, no prescribed pace and nothing here that
// can be failed.
//
// The two lines deliberately draw different populations. Distance is long runs only, which
// is the question that matters on the way to a 10k. Pace is short EASY runs only — a run
// whose type is short and whose intensity is easy, because a long run is slower than a short
// one by design, not fitness, and a hard short run is faster because it was harder. One line
// through all of them would draw the week's shape and call it fitness. Untagged runs are in
// neither population: untagged is unknown, not easy.
export default function RunDetail() {
  const activities = useStore((s) => s.activities)
  const history = runHistory(activities)
  const stats = runStats(history)
  const longRuns = history.filter((r) => r.runType === 'long')
  const easyPaces = history.filter(
    (r) => r.runType === 'short' && r.intensity === 'easy' && r.paceSecPerKm != null,
  )
  const easyStats = runStats(easyPaces)
  // Easy runs again, and deliberately the same population as the pace line: a heart rate is
  // only comparable against runs of the same kind. A long run and an interval session sit at
  // different heart rates by design, so one line through all three would draw the week's
  // shape and call it fitness — the same trap the pace line is filtered to avoid.
  const easyHr = history.filter(
    (r) => r.runType === 'short' && r.intensity === 'easy' && r.avgHr != null,
  )
  const easyHrStats = runStats(easyHr)
  const recent = history.slice(-RECENT).reverse()

  if (!stats) {
    return (
      <p className="ex-empty">
        No runs with a distance yet. Add a distance when you log a run and the trend will
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
          label="Easy-run pace"
          value={easyStats && easyStats.latestPace != null ? fmtPaceSec(easyStats.latestPace) : '—'}
          /* A recorded difference, not an award. Null on a single easy run, because there is
             nothing to compare against — and negative seconds per kilometre is faster, which
             is said in words rather than with an arrow that would point the wrong way. */
          note={
            easyStats && easyStats.paceChange != null && easyStats.paceChange !== 0
              ? `${Math.abs(easyStats.paceChange)} s/km ${easyStats.paceChange < 0 ? 'faster' : 'slower'} since ${fmtDate(easyStats.firstPaceAt)}`
              : null
          }
        />
        <Stat label="Total" value={fmtDistance(stats.totalKm)} note={fmtRunCount(stats.runs)} />
      </div>

      {longRuns.length > 1 && (
        <>
          <div className="caption">Long runs</div>
          <Sparkline cat="cardio" values={longRuns.map((r) => r.distanceKm)} />
        </>
      )}

      {easyPaces.length > 1 && (
        <>
          <div className="caption">Easy-run pace</div>
          {/* Negated so the line rises as you get faster. Every other sparkline in the app
              means "up is more of a good thing", and pace is the one number where the good
              direction is down. The drawing is unlabelled and decorative — the stat above
              carries the numbers — so matching the convention beats plotting it literally. */}
          <Sparkline cat="cardio" values={easyPaces.map((r) => -r.paceSecPerKm)} />
        </>
      )}

      {easyHr.length > 1 && (
        <>
          {/* The change is stated in the caption rather than as a fourth stat: the row above
              holds three and is measured to fit one line without wrapping. Negated for the
              same reason as the pace line — on a like-for-like easy run a lower heart rate is
              the good direction, and every sparkline in the app rises towards the good one. */}
          <div className="caption">
            Easy-run heart rate
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
                runTypeLabel(r.runType),
                fmtDistance(r.distanceKm),
                fmtPaceSec(r.paceSecPerKm),
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
