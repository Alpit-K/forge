import Icon from './Icon.jsx'

export function Section({ children }) {
  return <div className="section-header">{children}</div>
}

export function Group({ children, className }) {
  return <div className={className ? `list ${className}` : 'list'}>{children}</div>
}

// A row's leading glyph. Not decoration — it is what makes a row findable on the second
// visit, on the screens that are all words and no numbers. `cat` puts it on a category tint
// and its ground; `danger` tints the glyph alone, the way Row's own `danger` does the title.
export function RowIcon({ name, cat, danger = false, size = 17 }) {
  return (
    <span className="row-icon" data-cat={cat} data-danger={danger || undefined}>
      <Icon name={name} size={size} />
    </span>
  )
}

// `accent` and `danger` tint the title only, never the row — an inline style on `.row`
// itself out-specifies the stylesheet and is what once cancelled every separator in the app.
// `disabled` is only meaningful with onClick, which is the only case that renders a button.
const TITLE_TONE = { accent: { color: 'var(--accent)' }, danger: { color: 'var(--danger)' } }

export function Row({ title, subtitle, value, metric = false, thumb, chevron = false, open, onClick, children, danger = false, accent = false, disabled = false }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag className="row" onClick={onClick} disabled={onClick && disabled ? true : undefined}>
      {thumb}
      <div className="row-label">
        <div className="title" style={danger ? TITLE_TONE.danger : accent ? TITLE_TONE.accent : undefined}>{title}</div>
        {subtitle && <div className="subtitle">{subtitle}</div>}
        {children}
      </div>
      {/* `metric` promotes the value from the metadata tier to the primary one — the number
          the row exists to report, rather than a date or a prescription. See .row-value. */}
      {value != null && <span className={metric ? 'row-value metric' : 'row-value'}>{value}</span>}
      {/* `open` turns the navigation chevron into a disclosure one: it points down when the
          row is closed and up when it is open, the same convention the Library filter bar
          uses. Absent on an ordinary row, which keeps the plain right-pointing chevron. */}
      {chevron && (
        <span className="row-chevron" data-open={open == null ? undefined : String(open)}>
          <Icon name="chevron" size={16} />
        </span>
      )}
    </Tag>
  )
}
