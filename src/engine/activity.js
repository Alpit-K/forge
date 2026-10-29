// The cardio record. Pure: activities in, numbers out. Nothing is stored — the same rule
// the progression engine follows, which is why correcting a run's distance in History moves
// every number here on the next render.
//
// Runs and rides, each on its own. Swimming and walking carry a distance too, and none of
// them are the same effort: averaging two sports together would describe nobody's training,
// so every function here takes one sport.

// Seconds per kilometre, unrounded. Rounding belongs in `fmtPaceSec` at the point of
// display: a difference between two rounded paces is off by up to a second for no reason.
function paceOf(activity) {
  const { distanceKm, minutes } = activity
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return (minutes * 60) / distanceKm
}

// Kilometres per hour, unrounded, for the same reason pace is.
function speedOf(activity) {
  const { distanceKm, minutes } = activity
  if (!Number.isFinite(minutes) || minutes <= 0) return null
  return (distanceKm / minutes) * 60
}

// An activity of this type with a distance to plot.
//
// One logged without a distance is DROPPED rather than counted as zero — the same rule
// `exerciseHistory` applies to an entry where nothing was ticked. It happened; it just has
// nothing to plot, and a zero would drag every line through the floor.
function hasDistance(a, type) {
  return (
    a.type === type &&
    typeof a.distanceKm === 'number' &&
    Number.isFinite(a.distanceKm) &&
    a.distanceKm > 0
  )
}

// Descriptive only. `intensity` stays the load-bearing field the 80/20 guard and `easyPct`
// read, and nothing derives one from the other — a second source of truth for how hard a
// session was is how the two drift apart. Absent on everything logged before the field
// existed, so it is null rather than assumed.
function hrOf(a) {
  return typeof a.avgHr === 'number' && Number.isFinite(a.avgHr) ? a.avgHr : null
}

// Sorted explicitly, because unlike `workouts` the activities array is not in chronological
// order: a run can be logged today and back-dated to Saturday in the same sheet.
function oldestFirst(history) {
  return history.sort((x, y) => Date.parse(x.at) - Date.parse(y.at))
}

// Runs with a distance, oldest first.
export function runHistory(activities) {
  return oldestFirst(
    activities
      .filter((a) => hasDistance(a, 'run'))
      .map((a) => ({
        at: a.at,
        distanceKm: a.distanceKm,
        minutes: a.minutes,
        paceSecPerKm: paceOf(a),
        runType: a.runType || null,
        intensity: a.intensity || null,
        avgHr: hrOf(a),
        walkBreaks: Number.isInteger(a.walkBreaks) ? a.walkBreaks : null,
      })),
  )
}

// Rides with a distance, oldest first.
export function rideHistory(activities) {
  return oldestFirst(
    activities
      .filter((a) => hasDistance(a, 'cycle'))
      .map((a) => ({
        at: a.at,
        distanceKm: a.distanceKm,
        minutes: a.minutes,
        speedKmh: speedOf(a),
        intensity: a.intensity || null,
        avgHr: hrOf(a),
      })),
  )
}

// What every sport reports the same way: how far in all, the furthest, and the heart rate.
function distanceAndHr(history) {
  let totalKm = 0
  let longest = null
  for (const item of history) {
    totalKm += item.distanceKm
    // Strictly greater, so a tie keeps the EARLIEST — the first time you went that far is the
    // answer to "when did I first do this", and matching it should not silently reset it.
    if (longest === null || item.distanceKm > longest.distanceKm) {
      longest = { distanceKm: item.distanceKm, at: item.at }
    }
  }

  // Its own population — a session can carry a distance and no heart rate, or the reverse.
  // One without a reading is dropped rather than counted as zero, the same rule pace follows
  // and for the same reason: it would drag the line through the floor and read as the
  // fittest session in the record.
  const withHr = history.filter((r) => r.avgHr != null)
  const firstHr = withHr.length > 0 ? withHr[0] : null
  const latestHr = withHr.length > 0 ? withHr[withHr.length - 1] : null

  return {
    totalKm: Math.round(totalKm * 10) / 10,
    longest,
    latestHr: latestHr ? latestHr.avgHr : null,
    // Dated from the first session carrying a READING, not the first session — a heart rate
    // that starts halfway through the record must not claim a change since before it was
    // logged.
    firstHrAt: firstHr ? firstHr.at : null,
    // Negative is a lower heart rate, which on a like-for-like session is the earliest
    // evidence the aerobic base is building — it moves weeks before the pace does. Null
    // rather than 0 on a single reading, for the same reason `exerciseStats` returns a null
    // change: there is nothing to compare against yet, and a "0" reads as "you have not
    // improved".
    hrChange: withHr.length < 2 ? null : Math.round(latestHr.avgHr - firstHr.avgHr),
  }
}

// The quiet facts about a list of runs. It is given a list the caller has already narrowed,
// because a pace across every kind of run is a number about nothing: intervals at 4:10 and a
// long run at 6:30 average to a pace nobody has ever run. Distance compares long runs with
// long runs; pace compares short easy runs with short easy runs.
export function runStats(history) {
  if (history.length === 0) return null

  const paced = history.filter((r) => r.paceSecPerKm != null)
  const first = paced.length > 0 ? paced[0] : null
  const latest = paced.length > 0 ? paced[paced.length - 1] : null

  return {
    runs: history.length,
    ...distanceAndHr(history),
    firstPace: first ? first.paceSecPerKm : null,
    latestPace: latest ? latest.paceSecPerKm : null,
    firstPaceAt: first ? first.at : null,
    // Negative is faster. Null rather than 0 on a single run.
    paceChange: paced.length < 2 ? null : Math.round(latest.paceSecPerKm - first.paceSecPerKm),
  }
}

// The same facts about a list of rides, with speed in place of pace. Narrowed by the caller
// for the same reason as runStats.
export function rideStats(history) {
  if (history.length === 0) return null

  const timed = history.filter((r) => r.speedKmh != null)
  const first = timed.length > 0 ? timed[0] : null
  const latest = timed.length > 0 ? timed[timed.length - 1] : null

  return {
    rides: history.length,
    ...distanceAndHr(history),
    latestSpeed: latest ? latest.speedKmh : null,
    firstSpeedAt: first ? first.at : null,
    // Positive is faster. Null rather than 0 on a single ride.
    speedChange: timed.length < 2 ? null : Math.round((latest.speedKmh - first.speedKmh) * 10) / 10,
  }
}
