import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { createDemoApi } from '../api/demo'
import { createHttpApi } from '../api/http'
import type { FsmApi, Role } from '../api/types'
import { emitEvent } from '../lib/events'
import { storage } from '../lib/router'

export type Mode = 'live' | 'demo'

export interface Session {
  mode: Mode
  apiBase: string
  token: string
  tenantId: string
  username: string
  userId: string
  role: Role
}

interface SessionCtx {
  session: Session | null
  api: FsmApi | null
  login(mode: Mode, apiBase: string, tenantId: string, username: string, password: string): Promise<void>
  logout(reason?: string): void
  logoutReason: string
}

const KEY = 'openfsm.session'
export const DEFAULT_API_BASE: string = import.meta.env.VITE_API_BASE_URL ?? ''

function buildApi(s: Pick<Session, 'mode' | 'apiBase' | 'tenantId' | 'token'>): FsmApi {
  return s.mode === 'demo' ? createDemoApi(() => s.tenantId) : createHttpApi(s.apiBase, () => s.token)
}

function tokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number }
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()
  } catch {
    return false
  }
}

function restore(): Session | null {
  const raw = storage.get(KEY)
  if (!raw) return null
  try {
    const s = JSON.parse(raw) as Session
    if (s.mode === 'live' && tokenExpired(s.token)) return null
    return s
  } catch {
    return null
  }
}

const Ctx = createContext<SessionCtx | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(restore)
  const [logoutReason, setLogoutReason] = useState('')

  const api = useMemo(() => (session ? buildApi(session) : null), [session])

  const login = useCallback(
    async (mode: Mode, apiBase: string, tenantId: string, username: string, password: string) => {
      const res = await buildApi({ mode, apiBase, tenantId, token: '' }).login(tenantId, username, password)
      const s: Session = {
        mode,
        apiBase,
        token: res.token,
        tenantId: res.tenant_id || tenantId,
        username: res.username || username,
        userId: res.user_id,
        role: res.role,
      }
      storage.set(KEY, JSON.stringify(s))
      setLogoutReason('')
      setSession(s)
      emitEvent({
        channel: 'AUTH',
        type: 'POST /auth/login',
        detail: `JWT emitido para ${s.username} (${s.role}) en ${s.tenantId}`,
      })
    },
    [],
  )

  const logout = useCallback((reason?: string) => {
    storage.set(KEY, null)
    setLogoutReason(reason ?? '')
    setSession(null)
  }, [])

  const value = useMemo(() => ({ session, api, login, logout, logoutReason }), [session, api, login, logout, logoutReason])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useSession(): SessionCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSession fuera de SessionProvider')
  return ctx
}

/** Para componentes que solo se montan con sesión iniciada. */
export function useAuthed(): { session: Session; api: FsmApi; logout: (reason?: string) => void } {
  const { session, api, logout } = useSession()
  if (!session || !api) throw new Error('Sesión requerida')
  return { session, api, logout }
}
