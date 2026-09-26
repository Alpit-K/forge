import { useLayoutEffect, useRef, useState } from 'react'
import { useStore } from './store.js'
import TabBar from './components/TabBar.jsx'
import Today from './screens/Today.jsx'
import Plan from './screens/Plan.jsx'
import Library from './screens/Library.jsx'
import History from './screens/History.jsx'

function App() {
  const [tab, setTab] = useState('today')
  const active = useStore((s) => s.active)
  const screenRef = useRef(null)

  // Every tab renders into the one scroller below, so without this a tab opened at the
  // previous tab's offset. A layout effect, so the new tab never paints scrolled; it runs
  // before NavBar's effect reads scrollTop for its collapsed state.
  useLayoutEffect(() => {
    screenRef.current.scrollTop = 0
  }, [tab])

  return (
    <div className="app">
      <main ref={screenRef} className={`screen${active ? ' screen-modal' : ''}`}>
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
