import { useStore } from '../store.js'
import { Group, Row } from './List.jsx'
import Toggle from './Toggle.jsx'

// A custom workout is extra unless ticked in: it still feeds progression and coverage, and
// only stops using up one of the block's sessions. The finish summary and History's sheet
// both draw it from here.
export default function BlockCountRow({ workout }) {
  const sessionCount = useStore((s) => s.plan.sessionCount)
  const counts = !workout.extra
  return (
    <Group>
      <Row
        title="Counts toward block"
        subtitle={counts ? `One of the block's ${sessionCount} sessions` : 'Extra — on top of the plan'}
        value={
          <Toggle
            label="Counts toward block"
            checked={counts}
            onChange={(v) => useStore.getState().setCountsTowardBlock(workout.id, v)}
          />
        }
      />
    </Group>
  )
}
