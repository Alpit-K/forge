import { useRef, useState } from 'react'
import { useStore } from '../store.js'
import Sheet, { ActionSheet } from '../components/Sheet.jsx'
import Icon from '../components/Icon.jsx'
import Selector from '../components/Selector.jsx'
import { Group, Row, RowIcon, Section } from '../components/List.jsx'
import { exportBackup } from '../lib/backup.js'
import { MEDIA_ENABLED } from '../lib/exercises.js'
import { WEEK_SHAPE_KINDS } from '../lib/seed.js'
import { fmtAgo } from '../lib/format.js'

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={`toggle${checked ? ' on' : ''}`}
      onClick={() => onChange(!checked)}
    >
      <span className="knob" />
    </button>
  )
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// The four kinds, each with the glyph and the category tint that draw it. `cat` is the
// colour and `icon` is the shape, and they are deliberately not one field: a long run is
// the cardio tint with its own glyph, because it is the same kind of day done further.
const KINDS = {
  lift: { label: 'Lift', icon: 'dumbbell', cat: 'lift' },
  cardio: { label: 'Cardio', icon: 'run', cat: 'cardio' },
  long: { label: 'Long', icon: 'route', cat: 'cardio' },
  rest: { label: 'Rest', icon: 'rest', cat: 'rest' },
}

// A stepper rather than a free number field: the range is 0–7 and a keyboard here would be
// three taps and a dismiss for a number you change twice a year.
function Stepper({ value, min, max, onChange }) {
  return (
    <span className="stepper">
      <button type="button" aria-label="Decrease" disabled={value <= min} onClick={() => onChange(value - 1)}>
        <Icon name="minus" size={16} />
      </button>
      <span className="tnum stepper-value">{value}</span>
      <button type="button" aria-label="Increase" disabled={value >= max} onClick={() => onChange(value + 1)}>
        <Icon name="plus" size={16} />
      </button>
    </span>
  )
}

// Seven columns rather than seven rows, because the thing being set is a SHAPE and a stack
// of rows cannot show one. Tap still cycles the kind — a picker per day would be 28 taps of
// chrome for something set once — and the underlying value is untouched: seven strings,
// Monday first, naming the kind of day and never a specific session.
function WeekPlanner({ shape, onChange }) {
  return (
    <div className="planner">
      {DAY_LABELS.map((day, i) => {
        const kind = shape[i] || 'rest'
        const k = KINDS[kind] || KINDS.rest
        const next = WEEK_SHAPE_KINDS[(WEEK_SHAPE_KINDS.indexOf(kind) + 1) % WEEK_SHAPE_KINDS.length]
        return (
          <button
            key={day}
            type="button"
            className="planner-day"
            data-cat={k.cat}
            // The colour and the glyph say this to a sighted reader; the label has to say it
            // outright, because the button's own text is a day name and a kind, which on its
            // own reads as a heading rather than as something you can change.
            aria-label={`${day}: ${k.label}. Change to ${KINDS[next].label}.`}
            onClick={() => onChange(i, next)}
          >
            <span className="planner-name">{day}</span>
            <span className="planner-tile">
              <Icon name={k.icon} size={20} />
            </span>
            <span className="planner-kind">{k.label}</span>
          </button>
        )
      })}
    </div>
  )
}

// Sessions finished since the last export. The banner in History counts the same way; this
// is the same fact stated calmly next to the button that fixes it, rather than only as a
// warning after it has built up.
function countSessionsSince(lastExportAt, workouts) {
  if (lastExportAt == null) return workouts.length
  const t = Date.parse(lastExportAt)
  return workouts.filter((w) => Date.parse(w.finishedAt) > t).length
}

export default function Settings({ onClose }) {
  const settings = useStore((s) => s.settings)
  const workouts = useStore((s) => s.workouts)
  const lastExportAt = useStore((s) => s.lastExportAt)
  const since = countSessionsSince(lastExportAt, workouts)
  const setSetting = useStore((s) => s.setSetting)
  const fileRef = useRef(null)
  const [importMessage, setImportMessage] = useState(null)
  const [importError, setImportError] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const [confirmImport, setConfirmImport] = useState(false)

  const doExport = () => exportBackup(useStore)

  const onImportFile = (e) => {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = useStore.getState().importBackup(String(reader.result))
      if (result.ok) {
        setImportError(false)
        setImportMessage('Backup restored.')
      } else {
        setImportError(true)
        setImportMessage(result.message)
      }
    }
    reader.readAsText(file)
  }

  return (
    <>
    <Sheet title="Settings" onClose={onClose}>
      {/* The first group had no header while the three below it did, so it read as a
          preamble rather than as one of four things. Naming it is what turns the sheet
          into groups you can navigate by. */}
      <Section>Workout experience</Section>
      <Group>
        <Row
          title="Default rest"
          thumb={<RowIcon name="timer" />}
          value={
            <Selector
              label="Default rest"
              value={settings.defaultRestSec}
              options={[30, 45, 60, 90, 120, 150, 180, 240].map((n) => ({ value: n, label: `${n}s` }))}
              onChange={(v) => setSetting('defaultRestSec', Number(v))}
            />
          }
        />
        <Row
          title="Keep screen awake"
          thumb={<RowIcon name="sun" />}
          value={<Toggle checked={settings.keepAwake} onChange={(v) => setSetting('keepAwake', v)} />}
        />
        <Row
          title="Sound"
          thumb={<RowIcon name="speaker" />}
          value={<Toggle checked={settings.sound} onChange={(v) => setSetting('sound', v)} />}
        />
      </Group>

      <Section>Weekly targets</Section>
      <Group>
        {/* "Lifts 3" alone leaves the unit to be guessed at — per week, per block, per
            rotation are all plausible for a number in this app. The subtitle is the unit. */}
        <Row
          title="Lifts"
          subtitle="Strength sessions per week"
          thumb={<RowIcon name="dumbbell" />}
          value={<Stepper value={settings.weeklyLifts} min={0} max={7} onChange={(v) => setSetting('weeklyLifts', v)} />}
        />
        <Row
          title="Cardio"
          subtitle="Runs, rides and matches per week"
          thumb={<RowIcon name="run" />}
          value={<Stepper value={settings.weeklyCardio} min={0} max={7} onChange={(v) => setSetting('weeklyCardio', v)} />}
        />
      </Group>

      <Section>Your usual week</Section>
      <Group>
        <WeekPlanner
          shape={settings.weekShape}
          onChange={(i, kind) =>
            setSetting('weekShape', settings.weekShape.map((k, j) => (j === i ? kind : k)))
          }
        />
      </Group>
      <p className="settings-note">
        Tap a day to cycle it: lift, cardio, long run, rest. A shape, not a schedule — Today
        reads it to decide what to suggest, and a day that does not happen is never recorded
        as missed.
      </p>

      <Section>Your data</Section>
      <Group>
        <Row
          title="Last backup"
          thumb={<RowIcon name="archive" />}
          value={<span className="tnum">{lastExportAt ? fmtAgo(lastExportAt) : 'Never'}</span>}
        />
        <Row
          title="Sessions since"
          subtitle={since === 0 ? 'Everything is backed up.' : 'A backup is a file you keep, not a service.'}
          thumb={<RowIcon name="history" />}
          value={<span className="tnum">{since}</span>}
        />
        <Row title="Export backup" thumb={<RowIcon name="export" />} chevron onClick={doExport} />
        <Row
          title="Import backup"
          subtitle="Replaces everything currently in the app."
          thumb={<RowIcon name="import" />}
          chevron
          onClick={() => setConfirmImport(true)}
        />
      </Group>
      {/* Stated as a property of the app, not as a warning. It is the reason there is no
          account to make and nothing to sign in to, and it is why exporting matters. */}
      <p className="settings-note">
        Forge keeps your training on this device. There is no account and nothing is sent
        anywhere, so it works with no signal — and a backup is the only copy that survives
        losing the phone.
      </p>

      {importMessage && (
        <p className={`import-message${importError ? ' error' : ''}`}>
          {importMessage}
        </p>
      )}

      <Group>
        <Row
          title="Reset all data"
          subtitle="Deletes every workout, weight and custom exercise, and returns to session 1."
          thumb={<RowIcon name="trash" danger />}
          danger
          onClick={() => setConfirmReset(true)}
        />
      </Group>

      <Group>
        <Row title="Exercise dataset" subtitle="© 2026 Hasan Emir Yıldırım (MIT)" />
        {MEDIA_ENABLED && <Row title="Exercise media" subtitle="© Gym visual — gymvisual.com" />}
      </Group>

      <input ref={fileRef} type="file" accept="application/json,.json" className="visually-gone" onChange={onImportFile} />
    </Sheet>

    {confirmImport && (
      <ActionSheet
        onClose={() => setConfirmImport(false)}
        actions={[
          {
            label: 'Choose Backup File',
            destructive: true,
            onClick: () => fileRef.current && fileRef.current.click(),
          },
        ]}
      />
    )}

    {confirmReset && (
      <ActionSheet
        onClose={() => setConfirmReset(false)}
        actions={[
          {
            label: 'Reset All Data',
            destructive: true,
            onClick: () => {
              useStore.getState().resetAllData()
              onClose()
            },
          },
        ]}
      />
    )}
    </>
  )
}
