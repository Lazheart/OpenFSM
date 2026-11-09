export type Tone = 'neutral' | 'info' | 'primary' | 'violet' | 'warn' | 'ok' | 'danger'

export const WO_FLOW = ['CREATED', 'SCHEDULED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED'] as const

const LABELS: Record<string, string> = {
  // Órdenes
  CREATED: 'Nueva',
  SCHEDULED: 'Agendada',
  DISPATCHED: 'Despachada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  CANCELLED: 'Cancelada',
  // Visitas
  EN_ROUTE: 'En camino',
  // Técnicos
  AVAILABLE: 'Disponible',
  ON_DUTY: 'En servicio',
  ON_LEAVE: 'De licencia',
  OFFLINE: 'Fuera de turno',
  // Prioridad
  LOW: 'Baja',
  NORMAL: 'Normal',
  HIGH: 'Alta',
  EMERGENCY: 'Emergencia',
  // Clientes
  ACTIVE: 'Activo',
  INACTIVE: 'Inactivo',
  STANDARD: 'Estándar',
  PREMIUM: 'Premium',
  ENTERPRISE: 'Enterprise',
  // Roles
  ADMIN: 'Administrador',
  DISPATCHER: 'Despachador',
  TECHNICIAN: 'Técnico',
  // Certificación
  LEVEL_1: 'Nivel 1',
  LEVEL_2: 'Nivel 2',
  SENIOR: 'Senior',
  LEAD_ENGINEER: 'Ingeniero líder',
}

export const label = (v: string | undefined) => (v ? (LABELS[v] ?? v.replace(/_/g, ' ').toLowerCase()) : '—')

const TONES: Record<string, Tone> = {
  CREATED: 'neutral',
  SCHEDULED: 'primary',
  DISPATCHED: 'violet',
  EN_ROUTE: 'info',
  IN_PROGRESS: 'warn',
  COMPLETED: 'ok',
  CANCELLED: 'neutral',
  AVAILABLE: 'ok',
  ON_DUTY: 'primary',
  ON_LEAVE: 'neutral',
  OFFLINE: 'neutral',
  LOW: 'neutral',
  NORMAL: 'info',
  HIGH: 'warn',
  EMERGENCY: 'danger',
  ACTIVE: 'ok',
  INACTIVE: 'neutral',
}
export const tone = (v: string | undefined): Tone => (v ? (TONES[v] ?? 'neutral') : 'neutral')

export const PRIORITY_RANK: Record<string, number> = { EMERGENCY: 0, HIGH: 1, NORMAL: 2, LOW: 3 }

const dtf = new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
const df = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
const dshort = new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short' })
const tf = new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', hour12: false })

export const parseDate = (v?: string) => {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
export const fmtDateTime = (v?: string) => {
  const d = parseDate(v)
  return d ? dtf.format(d) : '—'
}
export const fmtTime = (v?: string | Date) => {
  const d = v instanceof Date ? v : parseDate(v)
  return d ? tf.format(d) : '—'
}
export const fmtLongDate = (d: Date) => df.format(d)
export const fmtShortDate = (d: Date) => dshort.format(d)

export function relative(v?: string, now = Date.now()): string {
  const d = parseDate(v)
  if (!d) return '—'
  const diff = d.getTime() - now
  const abs = Math.abs(diff)
  const mins = Math.round(abs / 60000)
  let txt: string
  if (mins < 60) txt = `${mins} min`
  else if (mins < 60 * 48) txt = `${Math.round(mins / 60)} h`
  else txt = `${Math.round(mins / 1440)} d`
  return diff >= 0 ? `en ${txt}` : `hace ${txt}`
}

const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })
export const fmtMoney = (n: number) => money.format(n)
const num = new Intl.NumberFormat('es-PE')
export const fmtNum = (n: number) => num.format(n)
export const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

export const initials = (name?: string) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')

export const shortId = (id?: string) => (id ? (id.includes('#') ? id.split('#')[1] : id) : '—')

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
export const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
export const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`

/** Estado del SLA de una orden abierta. */
export function slaState(sla?: string, status?: string, now = Date.now()): { tone: Tone; text: string } {
  const d = parseDate(sla)
  if (!d) return { tone: 'neutral', text: 'Sin SLA' }
  if (status === 'COMPLETED') return { tone: 'neutral', text: fmtDateTime(sla) }
  const left = d.getTime() - now
  if (left < 0) return { tone: 'danger', text: `Vencido ${relative(sla, now)}` }
  if (left < 4 * 3600000) return { tone: 'warn', text: `Vence ${relative(sla, now)}` }
  return { tone: 'neutral', text: `Vence ${relative(sla, now)}` }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message
  return String(e)
}
