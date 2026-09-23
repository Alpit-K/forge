// What to do today. Pure: state and a clock in, one recommendation out. Nothing is stored —
// the same rule the progression engine follows, which is why a skipped day needs no record
// and can never accumulate into something the user has to resolve.
//
// The week shape is an INPUT to this calculation, not a set of appointments. A day the shape
// asked for that did not happen is simply absent from history, and the next call reads the
// history that actually exists. There is no missed state anywhere in this file by design.

import { dayIndex, weekSummary, rollingSummary, daysBetween, summarise, startOfDay, addDays } from './week.js'
import { lastDoneByRotation } from './session.js'

export const ROLLING_DAYS = 7

// Every rotation slot in the shipped plan contains a leg exercise — squat, Romanian
// deadlift and leg press respectively. So "don't suggest a hard run the day after legs"
// would, on a three-lifts-a-week schedule, leave exactly one eligible day in the whole week
// and make the 80/20 unreachable. The guard therefore splits by what actually conflicts:
//
//   hard (intervals) — suppressed by a lift or a hard session today or yesterday
//   long (steady)    — suppressed only by something already logged today
//
// Steady distance and intervals are not the same stress on legs that lifted yesterday, and
// treating them as one is what made the original rule unusable.
function guard(liftDays, hardDays) {
  return {
    allowHard: !(liftDays !== null && liftDays <= 1) && !(hardDays !== null && hardDays <= 1),
    allowLong: !(hardDays !== null && hardDays === 0),
  }
}

// Anything dated after `now` is ignored. A session in the future has not happened, and
// counting it makes daysBetween negative — which reads as "today or yesterday" to every
// guard below, so one mistyped date suppresses intervals and puts "Hard session yesterday"
// on a card about something still to come.
function lastAt(items, field, now, predicate = () => true) {
  let best = null
  const cutoff = now.getTime()
  for (const item of items) {
    if (!predicate(item)) continue
    const t = Date.parse(item[field])
    if (!Number.isFinite(t) || t > cutoff) continue
    if (best === null || t > best) best = t
  }
  return best === null ? null : new Date(best).toISOString()
}

// What the rest of the week's shape still offers, by kind, for the days AFTER today. The
// weekly target is a count and the shape is an input, so a shortfall the days ahead already
// cover is not a shortfall today — which is what lets a run move a day earlier and cost
// nothing. Without it the day the run moved off is still read as short and the card asks for
// one session more than the week wants.
//
// Strictly after today, because today is the day being decided and counting it would make
// every day cover itself. This is not a schedule: it reads the same input `planned` reads,
// one day further along, exactly as nextSession already does. Nothing is stored and a day
// that does not happen still leaves no trace.
function remainingShape(shape, todayIdx) {
  let lift = 0
  let cardio = 0
  for (let i = todayIdx + 1; i < 7; i += 1) {
    if (shape[i] === 'lift') lift += 1
    else if (shape[i] === 'cardio' || shape[i] === 'long') cardio += 1
  }
  return { lift, cardio }
}

function liftSuggestion(state, reason, now = new Date()) {
  const rotation = state.plan.rotation
  if (!rotation.length) return { kind: 'rest', title: 'Rest', detail: 'No sessions in the plan.', reason: '' }

  // The slot left longest, which is the same rule the session picker already applies.
  const lastDone = lastDoneByRotation(state.workouts, rotation.length)
  let pick = 0
  let oldest = Infinity
  for (let i = 0; i < rotation.length; i += 1) {
    const t = lastDone[i] ? Date.parse(lastDone[i]) : -Infinity
    if (t < oldest) {
      oldest = t
      pick = i
    }
  }

  // The gap that chose this slot, said out loud. It is already computed above, and a
  // recommendation that shows its arithmetic is one you can disagree with on the evidence
  // rather than on a feeling — which is the whole reason the override is one tap away.
  const gap = lastDone[pick] ? daysBetween(lastDone[pick], now) : null
  const since =
    gap == null
      ? 'not trained yet this plan'
      : gap === 0
        ? 'trained today'
        : gap === 1
          ? 'last trained yesterday'
          : `last trained ${gap} days ago`

  return {
    kind: 'lift',
    cardioKind: null,
    rotationIndex: pick,
    title: rotation[pick].name,
    detail: `${rotation[pick].exercises.length} exercises · ${since}`,
    reason,
  }
}

const CARDIO_COPY = {
  easy: { title: 'Easy run', detail: 'Conversational pace — you can hold a sentence' },
  hard: { title: 'Hard session', detail: 'Intervals or a tempo effort' },
  long: { title: 'Long run', detail: 'Steady, and further than last week' },
}

function cardioSuggestion(cardioKind, reason) {
  return { kind: 'cardio', cardioKind, rotationIndex: null, ...CARDIO_COPY[cardioKind], reason }
}

function rest(reason, detail = 'Nothing due today') {
  return { kind: 'rest', cardioKind: null, rotationIndex: null, title: 'Rest', detail, reason }
}

// Which cardio, when the shape has already said today is a cardio day.
function chooseCardio(rolling, allowHard, liftDays, hardDays) {
  if (hardDays !== null && hardDays <= 1) {
    return cardioSuggestion('easy', 'Hard session yesterday — keep this one easy.')
  }
  if (liftDays === 0) {
    return cardioSuggestion('easy', 'You lifted today. Easy only.')
  }
  // Untagged is unknown, not all-easy. Defaulting to easy is the safe read and the reason
  // line says so rather than implying the app knows something it does not.
  if (rolling.tagged === 0) {
    return cardioSuggestion('easy', 'Nothing tagged easy or hard yet — starting you easy.')
  }
  if (allowHard && rolling.hard === 0 && rolling.cardio >= 2) {
    return cardioSuggestion('hard', `No hard session in the last ${ROLLING_DAYS} days.`)
  }
  if (rolling.easyPct !== null && rolling.easyPct < 70) {
    // Names its own window, because the Today readout beside it shows week-to-date and the
    // two disagree by design. Without the window this reads as a contradiction.
    return cardioSuggestion(
      'easy',
      `${rolling.hard} of your last ${rolling.tagged} tagged sessions were hard. Easy today.`,
    )
  }
  if (!allowHard && rolling.hard === 0) {
    return cardioSuggestion('easy', 'Lifted yesterday — easy today rather than intervals.')
  }
  return cardioSuggestion('easy', 'Building the base. Easy today.')
}

export function recommend(state, now = new Date()) {
  const { settings, workouts, activities } = state
  const shape = Array.isArray(settings.weekShape) ? settings.weekShape : []
  const todayIdx = dayIndex(now)
  const planned = shape[todayIdx] || 'rest'

  const week = weekSummary(workouts, activities, now)
  const rolling = rollingSummary(workouts, activities, now, ROLLING_DAYS)

  const today = summarise(workouts, activities, startOfDay(now), addDays(startOfDay(now), 1))
  const liftDays = daysBetween(lastAt(workouts, 'finishedAt', now), now)
  const hardDays = daysBetween(lastAt(activities, 'at', now, (a) => a.intensity === 'hard'), now)
  const { allowHard, allowLong } = guard(liftDays, hardDays)

  // Already trained today. Nothing else is offered, and the detail says what you did rather
  // than what is missing — the card is a suggestion for an empty day, not a prompt for a
  // second session. The reason line does NOT repeat that it was logged: the detail directly
  // above it already says so, and more precisely.
  if (today.lifts + today.cardio > 0) {
    const parts = []
    if (today.lifts > 0) parts.push(`${today.lifts} ${today.lifts === 1 ? 'session' : 'sessions'}`)
    if (today.cardio > 0) parts.push(`${today.cardio} ${today.cardio === 1 ? 'activity' : 'activities'}`)
    return {
      ...rest('The rest of the day is yours.', `${parts.join(' · ')} logged`),
      planned,
      week,
      rolling,
    }
  }

  const liftsShort = Math.max(0, (settings.weeklyLifts || 0) - week.lifts)
  const cardioShort = Math.max(0, (settings.weeklyCardio || 0) - week.cardio)
  const daysLeft = 6 - todayIdx

  // Spare: the shortfall is real and the days ahead hold EXACTLY enough of that kind to
  // cover it, so today is one session more than the week asks for. Two boundaries and both
  // are load-bearing. A met target is not spare — it keeps following the shape exactly as it
  // always has. And `===` rather than `>=`, because supply beyond the demand means the shape
  // itself has slack: a seven-lift-day shape against three lifts would make every day spare
  // and defer the week to the end of it. Equal supply is what a session banked early leaves
  // behind, which is the only case this exists for.
  const remaining = remainingShape(shape, todayIdx)
  const liftsSettled = remaining.lift >= liftsShort
  const cardioSettled = remaining.cardio >= cardioShort
  const liftsSpare = liftsShort > 0 && remaining.lift === liftsShort
  const cardioSpare = cardioShort > 0 && remaining.cardio === cardioShort
  const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`
  const weekSoFar = `${week.lifts} lifts · ${week.cardio} cardio this week`

  const decide = () => {
    if (planned === 'lift') {
      // Today's lift is already spoken for by a day still to come — so spend the day on what
      // is genuinely scarce, or hand it back. Both say the arithmetic that decided it.
      if (liftsSpare) {
        if (cardioShort > 0 && !cardioSettled) {
          return {
            ...chooseCardio(rolling, allowHard, liftDays, hardDays),
            reason: `${liftsShort} ${liftsShort === 1 ? 'lift' : 'lifts'} left and ${days(remaining.lift)} still shaped for ${liftsShort === 1 ? 'it' : 'them'} — cardio today instead.`,
          }
        }
        return rest(
          `${liftsShort} ${liftsShort === 1 ? 'lift' : 'lifts'} left and ${days(remaining.lift)} still shaped for ${liftsShort === 1 ? 'it' : 'them'} — today is spare.`,
          weekSoFar,
        )
      }
      // Target already met and cardio is not — the shape is a preference, and following it
      // past the point it helps is how a plan quietly stops matching the goal.
      if (liftsShort === 0 && cardioShort > 0) {
        return chooseCardio(rolling, allowHard, liftDays, hardDays)
      }
      return liftSuggestion(state, 'Your lifting day, and this is the slot left longest.', now)
    }

    if (planned === 'cardio') {
      if (cardioSpare) {
        if (liftsShort > 0 && !liftsSettled) {
          return liftSuggestion(
            state,
            `${cardioShort} cardio left and ${days(remaining.cardio)} still shaped for ${cardioShort === 1 ? 'it' : 'them'} — lift today instead.`,
            now,
          )
        }
        return rest(
          `${cardioShort} cardio left and ${days(remaining.cardio)} still shaped for ${cardioShort === 1 ? 'it' : 'them'} — today is spare.`,
          weekSoFar,
        )
      }
      if (cardioShort === 0 && liftsShort > 0) {
        return liftSuggestion(state, 'Cardio target already met this week — lift instead.', now)
      }
      return chooseCardio(rolling, allowHard, liftDays, hardDays)
    }

    if (planned === 'long') {
      if (!allowLong) return cardioSuggestion('easy', 'Hard session today already — keep it easy.')
      if (hardDays !== null && hardDays <= 1) {
        return cardioSuggestion('easy', 'Hard session yesterday — easy rather than long today.')
      }
      return cardioSuggestion('long', 'Your long run. This is the one that builds to 10k.')
    }

    // A rest day in the shape. It stays rest unless the week can no longer be finished by
    // resting through it — and even then it is offered with the arithmetic, never demanded.
    // daysLeft excludes today, which is what makes the comparison right — the question is
    // whether what is left fits in the days AFTER this one. The sentence has to count today
    // back in, because the card is asking to spend it.
    const daysToGo = `${daysLeft + 1} ${daysLeft === 0 ? 'day' : 'days'}`
    if (liftsShort > daysLeft) {
      return liftSuggestion(
        state,
        `Your rest day, but ${liftsShort} ${liftsShort === 1 ? 'lift' : 'lifts'} left and ${daysToGo} to do them.`,
        now,
      )
    }
    if (cardioShort > daysLeft) {
      return {
        ...chooseCardio(rolling, allowHard, liftDays, hardDays),
        reason: `Your rest day, but ${cardioShort} cardio left and ${daysToGo} to do them.`,
      }
    }
    return rest('Your rest day, and the week is on track.', weekSoFar)
  }

  return { ...decide(), planned, week, rolling }
}

// What is coming, for the days the card above has nothing left to offer — after you have
// already trained, or on a rest day the week is on track for. It walks forward to the first
// day the shape asks for something and asks recommend() what that day would be.
//
// This is a forecast, not an appointment. It is recomputed from history on every render like
// everything else here, so training tomorrow rather than resting simply produces a different
// answer the next time it is called, and there is nothing to store, miss or resolve. A week
// of rest days returns null rather than an empty card.
export function nextSession(state, now = new Date()) {
  for (let i = 1; i <= 7; i += 1) {
    const date = addDays(startOfDay(now), i)
    const rec = recommend(state, date)
    if (rec.kind !== 'rest') return { date, days: i, rec }
  }
  return null
}
