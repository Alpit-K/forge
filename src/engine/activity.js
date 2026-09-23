// The running record. Pure: activities in, numbers out. Nothing is stored — the same rule
// the progression engine follows, which is why correcting a run's distance in History moves
// every number here on the next render.
//
// Runs only. Cycling, swimming and walking carry a distance too, but they are not the same
// effort and averaging them together would describe nobody's training.

// Seconds per kilometre, unrounded. Rounding belongs in `fmtPaceSec` at the point of
// display: a difference between two rounded paces is off by up to a second for no reason.
function paceOf(activity) {
  const { distanceKm, minutes } = activity
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return (minutes * 60) / distanceKm
}

// Runs with a distance, oldest first.
//
// A run logged without a distance is DROPPED rather than counted as zero — the same rule
// `exerciseHistory` applies to an entry where nothing was ticked. The run happened; it just
// has nothing to plot, and a zero would drag every line through the floor.
//
// Sorted explicitly, because unlike `workouts` this array is not in chronological order: a
// run can be logged today and back-dated to Saturday in the same sheet.
export function runHistory(activities) {
  return activities
    .filter(
      (a) =>
        a.type === 'run' &&
        typeof a.distanceKm === 'number' &&
        Number.isFinite(a.distanceKm) &&
        a.distanceKm > 0,
    )
    .map((a) => ({
      at: a.at,
      distanceKm: a.distanceKm,
      minutes: a.minutes,
      paceSecPerKm: paceOf(a),
      runType: a.runType || null,
      intensity: a.intensity || null,
      // Descriptive only. `intensity` stays the load-bearing field the 80/20 guard and
      // `easyPct` read, and nothing derives one from the other — a second source of truth
      // for how hard a run was is how the two drift apart. Absent on every run logged
      // before the field existed, so it is null rather than assumed.
      avgHr: typeof a.avgHr === 'number' && Number.isFinite(a.avgHr) ? a.avgHr : null,
    }))
    .sort((x, y) => Date.parse(x.at) - Date.parse(y.at))
}

// The quiet facts about a list of runs. It is given a list the caller has already narrowed,
// because a pace across every kind of run is a number about nothing: intervals at 4:10 and a
// long run at 6:30 average to a pace nobody has ever run. Distance compares long runs with
// long runs; pace compares short easy runs with short easy runs.
export function runStats(history) {
  if (history.length === 0) return null

  let totalKm = 0
  let longest = null
  for (const run of history) {
    totalKm += run.distanceKm
    // Strictly greater, so a tie keeps the EARLIEST — the first time you ran that far is the
    // answer to "when did I first do this", and matching it should not silently reset it.
    if (longest === null || run.distanceKm > longest.distanceKm) {
      longest = { distanceKm: run.distanceKm, at: run.at }
    }
  }

  const paced = history.filter((r) => r.paceSecPerKm != null)
  const first = paced.length > 0 ? paced[0] : null
  const latest = paced.length > 0 ? paced[paced.length - 1] : null

  // Its own population, not the paced one — a run can carry a distance and no heart rate,
  // or the reverse. A run without a reading is dropped rather than counted as zero, the
  // same rule pace follows and for the same reason: it would drag the line through the
  // floor and read as the fittest run in the record.
  const withHr = history.filter((r) => r.avgHr != null)
  const firstHr = withHr.length > 0 ? withHr[0] : null
  const latestHr = withHr.length > 0 ? withHr[withHr.length - 1] : null

  return {
    runs: history.length,
    totalKm: Math.round(totalKm * 10) / 10,
    longest,
    firstPace: first ? first.paceSecPerKm : null,
    latestPace: latest ? latest.paceSecPerKm : null,
    firstPaceAt: first ? first.at : null,
    // Negative is faster. Null rather than 0 on a single run, for the same reason
    // `exerciseStats` returns a null change: there is nothing to compare against yet, and a
    // "0" reads as "you have not improved".
    paceChange: paced.length < 2 ? null : Math.round(latest.paceSecPerKm - first.paceSecPerKm),
    latestHr: latestHr ? latestHr.avgHr : null,
    // Dated from the first run carrying a READING, not the first run — a heart rate that
    // starts halfway through the record must not claim a change since before it was logged.
    firstHrAt: firstHr ? firstHr.at : null,
    // Negative is a lower heart rate, which on a like-for-like run is the earliest evidence
    // the aerobic base is building — it moves weeks before the pace does. Null rather than 0
    // on a single reading, the same rule as `paceChange`.
    hrChange: withHr.length < 2 ? null : Math.round(latestHr.avgHr - firstHr.avgHr),
  }
}
