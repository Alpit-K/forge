import { useState } from 'react'
import { useStore } from './store.js'
import TabBar from './components/TabBar.jsx'
import Today from './screens/Today.jsx'
import Plan from './screens/Plan.jsx'
import Library from './screens/Library.jsx'
import History from './screens/History.jsx'

function App() {
  const [tab, setTab] = useState('today')
  const active = useStore((s) => s.active)

  return (
    <div className="app">
      <main className={`screen${active ? ' screen-modal' : ''}`}>
        {tab === 'today' && <Today />}
        {tab === 'plan' && <Plan />}
        {tab === 'library' && <Library />}
        {tab === 'history' && <History />}
      </main>
      {/* A workout is a modal flow — End and Finish are its only exits. */}
      {!active && <TabBar tab={tab} onChange={setTab} />}
    </div>
  )
}

export default App
