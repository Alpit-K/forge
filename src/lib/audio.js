// A short synthesised rest cue via the Web Audio API — no audio files. iOS requires a user
// gesture to unlock the audio context, so the context is created/resumed inside the tap that
// starts a workout.

let ctx = null
let gestureArmed = false

const GESTURE_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown']

// iOS only resumes a suspended context inside a user gesture. When ensureAudioContext runs
// outside one (resuming a killed session), arm a one-shot listener that retries on the next
// tap so the first rest cue after resume still sounds.
function armGestureResume() {
  if (gestureArmed || typeof window === 'undefined') return
  gestureArmed = true
  const onGesture = () => {
    if (ctx && ctx.state === 'suspended') ctx.resume()
    if (!ctx || ctx.state === 'running') {
      gestureArmed = false
      for (const ev of GESTURE_EVENTS) window.removeEventListener(ev, onGesture)
    }
  }
  for (const ev of GESTURE_EVENTS) window.addEventListener(ev, onGesture, { passive: true })
}

// iOS routes Web Audio through the "ambient" audio session by default, which mixes with
// whatever else is playing. `transient` is the ping-shaped type — the spec says such audio
// "usually should play on top of playback audio (and maybe also 'duck' persistent audio)".
// That "maybe" is not rhetorical: iOS does not duck, so the cue plays at full mix under
// music rather than over it. The answer to that is a cue that can compete, below.
//
// **Do NOT reach for `transient-solo` or `playback` to force the ducking.** Tried on
// `2026-09-07` with Spotify playing in headphones: claiming exclusivity while another app
// already holds the audio session does not take the session from it — iOS interrupts ours
// instead, the AudioContext goes to WebKit's `interrupted` state, and the cue stops playing
// at all. Silence is strictly worse than quiet. `transient` keeps the context running
// alongside the music, and that is the property being bought here.
//
// An invalid enum value is ignored per WebIDL, so reading the attribute back is a real
// feature test. iOS 17+; older versions have no audioSession and are unchanged.
function claimAudioSession() {
  const session = navigator.audioSession
  if (!session) return
  session.type = 'transient'
}

export function ensureAudioContext() {
  if (typeof window === 'undefined') return
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return
  claimAudioSession()
  if (!ctx) ctx = new Ctor()
  if (ctx.state === 'suspended') {
    ctx.resume()
    armGestureResume()
  }
}

// A rising three-note pattern rather than one ping: a short rhythm is what makes a sound
// read as a signal rather than as part of the track you are listening to. Two things besides
// the rhythm are doing work here, and both were paid for by a cue nobody could hear over
// music in headphones:
//
//   Pitch — 2 to 3 kHz, where the ear is most sensitive and where a mix carries least
//   sustained energy. The original A5-E6 pattern sat in the middle of the music and was
//   masked by it.
//
//   Envelope — 4 ms attack, then **held at peak** for half the note. A transient survives
//   masking where a soft ramp does not, and the hold is where the volume lives: the very
//   first version decayed from its peak across the whole note, so it measured loud and
//   sounded like a click. Peak amplitude is the ceiling, average amplitude is what you
//   hear, and only the second one ever had room in it. **Do not shorten the hold to soften
//   the sound** — that is the one lever that spends audibility directly.
//
// The third thing used to be a triangle fundamental, and it is what made the cue harsh. A
// triangle's odd harmonics fall as 1/n², so at PEAK they contribute 0.07 at 3f and 0.03 at
// 5f — nearly nothing to loudness, and everything to the edge. It is now a struck-bell
// spectrum instead: a sine fundamental with TUNED partials at 2f and 3f, which puts more
// energy in the 2-5 kHz band than the triangle did while spending it on two discrete tones
// rather than a dense series. Each partial is shorter than the fundamental, so the strike is
// bright and the tail is warm — a bell's higher modes decay first, and imitating that is the
// whole difference between a chime and a beep.
//
// **The gains must sum below 1**: above that the destination clips and the cue turns to
// buzz, so raising one means lowering the other. That ceiling is why loudness is bought from
// the envelope and the note length rather than from the numbers below.
const CUE_NOTES = [1760, 2217.46, 2637.02] // A6, C#7, E7
// 260 ms rings; the hold inside it is 130 ms, so the fundamental carries the same energy at
// peak as the 160 ms held-then-cut note it replaces. Perceived loudness keeps rising with
// duration to roughly 200 ms, so neither number may come down without the cue going quieter.
const NOTE_SEC = 0.26
const HOLD_FRACTION = 0.5
// Strikes overlap: by the time the next one lands the previous note is 4% of its peak, which
// is what keeps the sum under the ceiling while the tails still ring into each other.
const STRIKE_SEC = 0.17
const PEAK = 0.56
// ratio × the fundamental, and a length as a fraction of the note — higher modes decay first.
const PARTIALS = [
  { ratio: 2, gain: 0.24, length: 0.6 },
  { ratio: 3, gain: 0.14, length: 0.4 },
]
const ATTACK_SEC = 0.004

function voice(at, freq, peak, seconds) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, at)
  gain.gain.exponentialRampToValueAtTime(peak, at + ATTACK_SEC)
  gain.gain.setValueAtTime(peak, at + seconds * HOLD_FRACTION)
  gain.gain.exponentialRampToValueAtTime(0.0001, at + seconds)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(at)
  osc.stop(at + seconds)
}

function schedule() {
  const start = ctx.currentTime + 0.02
  CUE_NOTES.forEach((freq, i) => {
    const at = start + i * STRIKE_SEC
    voice(at, freq, PEAK, NOTE_SEC)
    for (const p of PARTIALS) voice(at, freq * p.ratio, p.gain, NOTE_SEC * p.length)
  })
}

// A context that is not running is recoverable, and returning silently from one is what made
// a broken cue look exactly like a working one for as long as it did. Two states reach here:
// `suspended`, after iOS throttled us in the background, and `interrupted` — WebKit's own
// state, not in the spec — when another app took the audio session. Both answer to resume().
// It is asynchronous, so the cue arrives a few milliseconds late rather than not at all.
export function playCue() {
  if (!ctx) return
  if (ctx.state === 'running') {
    schedule()
    return
  }
  ctx
    .resume()
    .then(() => {
      if (ctx.state === 'running') schedule()
    })
    .catch(() => {
      // Refused outside a gesture, or in Low Power Mode. Nothing further to try.
    })
}
