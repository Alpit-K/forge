import { useEffect } from 'react'
import { createPortal } from 'react-dom'

export default function Sheet({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Portalled out of the app shell: `.screen` is the only scroll container, and a sheet
  // rendered inside it pans the screen behind instead of scrolling itself.
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        {title && <h2 className="sheet-title">{title}</h2>}
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function ActionSheet({ onClose, actions }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-grabber" />
        <div className="list">
          {actions.map((a, i) => (
            <button
              key={i}
              type="button"
              className={`action-sheet-btn${a.destructive ? ' destructive' : ''}`}
              disabled={a.disabled || false}
              onClick={() => {
                onClose()
                if (a.onClick) a.onClick()
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
        <button type="button" className="action-sheet-btn cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}
