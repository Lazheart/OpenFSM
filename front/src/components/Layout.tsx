import { useEffect, useState, type ReactNode } from 'react'
import type { Role } from '../api/types'
import { useEvents } from '../lib/events'
import { label } from '../lib/format'
import { navigate } from '../lib/router'
import { tenantById } from '../lib/tenants'
import { SERVICE_LABEL, useData, type CollectionKey } from '../state/data'
import { useAuthed } from '../state/session'
import { Icon, type IconName } from './Icon'
import { NotificationBell } from './NotificationBell'
import { Avatar } from './ui'

interface NavItem {
  path: string
  text: string
  icon: IconName
  roles?: Role[]
}

export const NAV: NavItem[] = [
  { path: 'dashboard', text: 'Panel', icon: 'dashboard', roles: ['ADMIN', 'DISPATCHER'] },
  { path: 'dispatch', text: 'Despacho', icon: 'dispatch', roles: ['ADMIN', 'DISPATCHER'] },
  { path: 'workorders', text: 'Órdenes de trabajo', icon: 'orders' },
  { path: 'visits', text: 'Visitas', icon: 'visits' },
  { path: 'customers', text: 'Clientes', icon: 'customers', roles: ['ADMIN', 'DISPATCHER'] },
  { path: 'technicians', text: 'Técnicos', icon: 'technicians', roles: ['ADMIN', 'DISPATCHER'] },
  { path: 'inventory', text: 'Inventario', icon: 'inventory' },
  { path: 'events', text: 'Eventos', icon: 'events' },
]

export const navFor = (role: Role) => NAV.filter((n) => !n.roles || n.roles.includes(role))

export function Layout({ current, children }: { current: string; children: ReactNode }) {
  const { session, logout } = useAuthed()
  const { reload, loading, errors } = useData()
  const events = useEvents()
  const [open, setOpen] = useState(false)
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light',
  )
  const tenant = tenantById(session.tenantId)
  const items = navFor(session.role)
  const failing = Object.keys(errors) as CollectionKey[]

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('openfsm.theme', theme)
    } catch {
      /* sin almacenamiento */
    }
  }, [theme])

  useEffect(() => setOpen(false), [current])

  return (
    <div className="app">
      <aside className={`side${open ? ' side-open' : ''}`}>
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="bolt" size={18} />
          </span>
          <span className="brand-name">
            Open<b>FSM</b>
          </span>
        </div>

        <div className="tenant-chip" style={{ ['--tenant' as string]: tenant.color }}>
          <span className="tenant-dot" />
          <div>
            <strong>{tenant.short}</strong>
            <span>{tenant.industry}</span>
          </div>
        </div>

        <nav className="nav" aria-label="Principal">
          {items.map((n) => (
            <a
              key={n.path}
              href={`#/${n.path}`}
              className={`nav-item${current === n.path ? ' active' : ''}`}
              aria-current={current === n.path ? 'page' : undefined}
            >
              <Icon name={n.icon} />
              <span>{n.text}</span>
              {n.path === 'events' && events.length > 0 && <span className="nav-count">{events.length}</span>}
            </a>
          ))}
        </nav>

        <div className="side-foot">
          <div className={`mode-pill ${session.mode === 'demo' ? 'mode-demo' : 'mode-live'}`}>
            <span className="mode-dot" />
            {session.mode === 'demo' ? 'Modo demo (datos simulados)' : 'Conectado a AWS'}
          </div>
        </div>
      </aside>
      {open && <div className="side-scrim" onClick={() => setOpen(false)} />}

      <div className="main">
        <header className="top">
          <button className="icon-btn only-mobile" onClick={() => setOpen(true)} aria-label="Abrir menú">
            <Icon name="menu" />
          </button>
          <div className="top-title">{items.find((i) => i.path === current)?.text ?? ''}</div>
          <div className="top-actions">
            <button className="icon-btn" onClick={() => void reload()} aria-label="Recargar datos" title="Recargar datos">
              <Icon name="refresh" className={loading ? 'spin' : ''} />
            </button>
            <NotificationBell />
            <button
              className="icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="Cambiar tema"
              title="Cambiar tema"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <div className="user">
              <Avatar name={session.username} size={30} />
              <div className="user-meta">
                <strong>{session.username}</strong>
                <span>{label(session.role)}</span>
              </div>
            </div>
            <button
              className="icon-btn"
              onClick={() => {
                logout()
                navigate('dashboard')
              }}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
            >
              <Icon name="logout" />
            </button>
          </div>
        </header>

        {failing.length > 0 && (
          <div className="banner banner-danger" role="alert">
            <Icon name="alert" />
            <div>
              <strong>No se pudieron cargar: {failing.map((k) => SERVICE_LABEL[k]).join(', ')}.</strong>
              <span>{errors[failing[0]]}</span>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={() => void reload(failing)}>
              Reintentar
            </button>
          </div>
        )}

        <main className="content">{children}</main>
      </div>
    </div>
  )
}
