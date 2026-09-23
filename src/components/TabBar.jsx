import Icon from './Icon.jsx'

const TABS = [
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'plan', label: 'Plan', icon: 'plan' },
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'history', label: 'History', icon: 'history' },
]

export default function TabBar({ tab, onChange }) {
  return (
    <nav className="tabbar" role="tablist">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={`tabbar-item${tab === t.id ? ' active' : ''}`}
          onClick={() => onChange(t.id)}
        >
          <Icon name={t.icon} size={26} strong={tab === t.id} />
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  )
}
