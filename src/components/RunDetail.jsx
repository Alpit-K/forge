import { useStore } from '../store.js'
import { runHistory, runStats } from '../engine/activity.js'
import { fmtDate, fmtDistance, fmtCount, fmtHr, fmtPaceSec, fmtWalkBreaks } from '../lib/format.js'
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
        <Stat label="Total" value={fmtDistance(stats.totalKm)} note={fmtCount(stats.runs, 'run')} />
      </div>

      {longRuns.length > 1 && (
        <>
          <div className="caption">Long runs</div>
          <Sparkline cat="cardio" format={fmtDistance} points={longRuns.map((r) => ({ value: r.distanceKm, at: r.at }))} />
        </>
      )}

      {easyPaces.length > 1 && (
        <>
          <div className="caption">Easy-run pace</div>
          {/* Drawn the natural way up, now the chart prints its numbers: negated, a 6:10
              would sit above a 6:40. Lower is the good direction, so it is said in words. */}
          <Sparkline
            cat="cardio"
            format={fmtPaceSec}
            points={easyPaces.map((r) => ({ value: r.paceSecPerKm, at: r.at }))}
          />
          <p className="chart-note">Lower is better at the same effort.</p>
        </>
      )}

      {easyHr.length > 1 && (
        <>
          {/* The change is stated in the caption rather than as a fourth stat: the row above
              holds three and is measured to fit one line without wrapping. Drawn the natural
              way up, as the pace line is, with the good direction said in words. */}
          <div className="caption">
            Easy-run heart rate
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
            {/* Two lines, the distance on the first: one line of five facts broke after the
                heart rate and left "bpm" on a line of its own. */}
            <span className="ex-session-sets tnum">
              {fmtDistance(r.distanceKm)}
              <span className="ex-session-more">
                {[runTypeLabel(r.runType), fmtPaceSec(r.paceSecPerKm), fmtHr(r.avgHr), fmtWalkBreaks(r.walkBreaks)]
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
