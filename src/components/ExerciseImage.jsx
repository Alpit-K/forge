import { useState } from 'react'
import { thumbSrc, gifSrc, exerciseName } from '../lib/exercises.js'
import { ACTIVITY_TYPES, activityName } from '../lib/activities.js'
import Icon from './Icon.jsx'

// Thumbnail used in list views — 180×180 only, lazy-loaded. Never the GIF.
export function Thumb({ exercise }) {
  const [failed, setFailed] = useState(false)
  const src = thumbSrc(exercise)
  if (!src || failed) {
    return (
      <div className="thumb">
        <div className="placeholder">{exerciseName(exercise).charAt(0)}</div>
      </div>
    )
  }
  return (
    <div className="thumb">
      <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />
    </div>
  )
}

// Full exercise media. The GIF (or thumbnail) is an enhancement; the box keeps its space
// and shows a neutral placeholder when the image cannot load.
export function ExerciseMedia({ exercise, gif = false }) {
  const [failedSrc, setFailedSrc] = useState(null)
  const src = gif ? gifSrc(exercise) : thumbSrc(exercise)
  if (!src || failedSrc === src) {
    return (
      <div className="exercise-image">
        <div className="placeholder">{exerciseName(exercise)}</div>
      </div>
    )
  }
  return (
    <div className="exercise-image">
      <img
        key={src}
        src={src}
        alt={exerciseName(exercise)}
        onError={() => setFailedSrc(src)}
      />
    </div>
  )
}

// Activity thumbnail. The same 48×48 box as Thumb so the two line up in History's merged
// timeline, but drawn locally — an activity row must not cost a CDN request, and the media
// dataset has no picture of a tennis match to give it. Falls back to the type's initial for
// an id the vocabulary no longer has.
export function ActivityThumb({ activity }) {
  const type = ACTIVITY_TYPES.find((t) => t.id === activity.type)
  return (
    <div className="thumb thumb-activity">
      {type ? <Icon name={type.id} size={26} /> : <div className="placeholder">{activityName(activity).charAt(0)}</div>}
    </div>
  )
}
