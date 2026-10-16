import { Component, useState } from 'react'
import { useStore } from '../store.js'
import { backupFilename, triggerDownload } from '../lib/backup.js'
import NavBar from './NavBar.jsx'
import { ActionSheet } from './Sheet.jsx'
import Icon from './Icon.jsx'

// Without this, a render that throws unmounts the whole tree and leaves a blank screen. When
// the cause is stored state it throws again on every launch, and the export and the reset in
// Settings are out of reach behind it. This is the way out: the data first, then a clean start.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return <CrashScreen error={this.state.error} onReset={() => this.setState({ error: null })} />
  }
}

function CrashScreen({ error, onReset }) {
  const [confirmReset, setConfirmReset] = useState(false)
  // The state as persistence writes it, not serializeState's export: that walks every log to
  // name its exercises, and state bad enough to crash a screen can crash that walk too. This
  // is the data exactly as it stands, which is what a repair needs. Import still validates it.
  const exportRaw = () => triggerDownload(JSON.stringify(useStore.getState(), null, 2), backupFilename())

  return (
    <div className="app">
      <main className="screen">
        <NavBar title="Forge" compact />
        <div className="screen-body">
          <div className="empty-state">
            <span className="empty-glyph"><Icon name="anvil" size={28} /></span>
            <p className="empty-title">Something went wrong</p>
            {/* The message is what turns a crash seen only on the phone into something that
                can be fixed, rather than guessed at. */}
            <p className="empty-body">{String(error?.message || error)}</p>
          </div>
          <button type="button" className="btn-primary" onClick={exportRaw}>
            Export backup
          </button>
          <button type="button" className="btn" onClick={() => window.location.reload()}>
            Reload
          </button>
          <button type="button" className="btn btn-destructive" onClick={() => setConfirmReset(true)}>
            Reset everything
          </button>
        </div>
      </main>
      {confirmReset && (
        <ActionSheet
          onClose={() => setConfirmReset(false)}
          actions={[
            {
              label: 'Reset All Data',
              destructive: true,
              onClick: () => {
                useStore.getState().resetAllData()
                onReset()
              },
            },
          ]}
        />
      )}
    </div>
  )
}
