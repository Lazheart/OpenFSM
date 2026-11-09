import { useEffect, useRef, useState } from 'react'
import { relative, type Tone } from '../lib/format'
import { storage } from '../lib/router'
import { useData } from '../state/data'
import { useAuthed } from '../state/session'
import { Icon } from './Icon'

const SEVERITY_TONE: Record<string, Tone> = { CRITICAL: 'danger', WARNING: 'warn', SUCCESS: 'ok', INFO: 'primary' }

/** Campana con el feed del microservicio Notifications (GET /notifications). */
export function NotificationBell() {
  const { notifications } = useData()
  const { session } = useAuthed()
  const key = `openfsm.seen.${session.tenantId}`
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(() => storage.get(key) ?? '')
  const ref = useRef<HTMLDivElement>(null)

  const unread = notifications.filter((n) => n.created_at > seen).length

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    if (!open && notifications[0]) {
      const latest = notifications.reduce((m, n) => (n.created_at > m ? n.created_at : m), seen)
      setSeen(latest)
      storage.set(key, latest)
    }
    setOpen(!open)
  }

  return (
    <div className="bell" ref={ref}>
      <button className="icon-btn" onClick={toggle} aria-label={`Notificaciones (${unread} sin leer)`} aria-expanded={open}>
        <Icon name="bell" />
        {unread > 0 && <span className="bell-count">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="dialog" aria-label="Notificaciones">
          <header>
            <strong>Notificaciones</strong>
            <span className="muted small">microservicio Notifications</span>
          </header>
          {notifications.length === 0 ? (
            <p className="muted bell-empty">Sin notificaciones todavía.</p>
          ) : (
            <ul>
              {notifications.slice(0, 20).map((n) => (
                <li key={n.id} className={n.created_at > seen ? 'bell-new' : ''}>
                  <span className={`dot dot-${SEVERITY_TONE[n.severity] ?? 'neutral'}`} />
                  <div>
                    <strong>{n.title}</strong>
                    {n.detail && <span>{n.detail}</span>}
                    <small>
                      {n.event_type} · {relative(n.created_at)}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
