import { useMemo } from 'react'
import { BarChart, Gauge, StackBar } from '../components/charts'
import { Icon } from '../components/Icon'
import { Avatar, Badge, Card, Empty, Kpi, Meter, PageHeader, Spinner } from '../components/ui'
import type { WorkOrder } from '../api/types'
import {
  WO_FLOW,
  dayKey,
  fmtLongDate,
  fmtNum,
  fmtShortDate,
  fmtTime,
  label,
  parseDate,
  pct,
  sameDay,
  shortId,
  startOfDay,
  tone,
} from '../lib/format'
import { navigate } from '../lib/router'
import { tenantById } from '../lib/tenants'
import { useData } from '../state/data'
import { useAuthed } from '../state/session'

/** Fecha de referencia: hoy, o la última fecha con datos si el seed es antiguo. */
export function anchorDate(workorders: WorkOrder[]): Date {
  const now = new Date()
  let latest = 0
  for (const w of workorders) {
    const t = parseDate(w.created_at)?.getTime() ?? 0
    if (t > latest) latest = t
  }
  if (!latest || now.getTime() - latest < 14 * 86400000) return now
  return new Date(latest)
}

export function Dashboard() {
  const { session } = useAuthed()
  const d = useData()
  const tenant = tenantById(session.tenantId)

  const m = useMemo(() => {
    const anchor = anchorDate(d.workorders)
    const isNow = sameDay(anchor, new Date())
    const ref = anchor.getTime()

    const byStatus: Record<string, number> = {}
    for (const w of d.workorders) byStatus[w.status] = (byStatus[w.status] ?? 0) + 1
    const open = d.workorders.filter((w) => w.status !== 'COMPLETED' && w.status !== 'CANCELLED')
    const overdue = open.filter((w) => {
      const s = parseDate(w.sla_due_date)
      return s && s.getTime() < ref
    })

    // Órdenes creadas por día (14 días hasta la fecha de referencia)
    const counts = new Map<string, number>()
    for (const w of d.workorders) {
      const c = parseDate(w.created_at)
      if (c) counts.set(dayKey(c), (counts.get(dayKey(c)) ?? 0) + 1)
    }
    const start = startOfDay(anchor)
    const trend = Array.from({ length: 14 }, (_, i) => {
      const day = new Date(start.getTime() - (13 - i) * 86400000)
      return { label: fmtShortDate(day), value: counts.get(dayKey(day)) ?? 0, highlight: i === 13 }
    })

    // Cumplimiento SLA: visitas completadas antes del vencimiento de su orden
    const woById = d.workorderById
    let done = 0
    let onTime = 0
    for (const v of d.visits) {
      if (v.status !== 'COMPLETED') continue
      const w = woById.get(v.workorder_id)
      const end = parseDate(v.actual_end)
      const sla = parseDate(w?.sla_due_date)
      if (!end || !sla) continue
      done++
      if (end <= sla) onTime++
    }

    const priorities = ['EMERGENCY', 'HIGH', 'NORMAL', 'LOW'].map((p) => ({
      label: label(p),
      value: open.filter((w) => w.priority === p).length,
      cls: `fill-${tone(p)}`,
    }))

    // Ranking de técnicos
    const stats = new Map<string, { total: number; completed: number; hours: number }>()
    for (const v of d.visits) {
      if (!v.technician_id) continue
      const s = stats.get(v.technician_id) ?? { total: 0, completed: 0, hours: 0 }
      s.total++
      if (v.status === 'COMPLETED') {
        s.completed++
        const a = parseDate(v.actual_start || v.scheduled_start)
        const b = parseDate(v.actual_end)
        if (a && b) s.hours += Math.max(0, (b.getTime() - a.getTime()) / 3600000)
      }
      stats.set(v.technician_id, s)
    }
    const leaderboard = d.technicians
      .map((t) => ({ t, s: stats.get(t.id) ?? { total: 0, completed: 0, hours: 0 } }))
      .sort((a, b) => b.s.completed - a.s.completed || b.s.total - a.s.total)
      .slice(0, 8)

    const todayVisits = d.visits
      .filter((v) => {
        const s = parseDate(v.scheduled_start)
        return s && sameDay(s, anchor) && v.technician_id
      })
      .sort((a, b) => a.scheduled_start.localeCompare(b.scheduled_start))

    const available = d.technicians.filter((t) => t.status === 'AVAILABLE').length
    const lowStock = d.inventory.filter((i) => i.stock_quantity <= (i.reorder_point ?? 0)).length

    return { anchor, isNow, byStatus, open, overdue, trend, done, onTime, priorities, leaderboard, todayVisits, available, lowStock }
  }, [d.workorders, d.visits, d.technicians, d.inventory, d.workorderById])

  if (!d.loaded) return <Spinner text="Cargando datos del tenant…" />

  const total = d.workorders.length
  return (
    <>
      <PageHeader
        title={`Hola, ${session.username}`}
        subtitle={
          <>
            Operación de <strong>{tenant.name}</strong> · {fmtLongDate(m.anchor)}
            {!m.isNow && <span className="muted"> (última fecha con datos)</span>}
          </>
        }
      />

      <div className="kpis">
        <Kpi icon="orders" label="Órdenes abiertas" value={fmtNum(m.open.length)} hint={`de ${fmtNum(total)} cargadas`} onClick={() => navigate('workorders?status=OPEN')} />
        <Kpi icon="clock" t="warn" label="En curso" value={fmtNum(m.byStatus.IN_PROGRESS ?? 0)} hint="técnicos trabajando" onClick={() => navigate('workorders?status=IN_PROGRESS')} />
        <Kpi icon="alert" t="danger" label="SLA vencido" value={fmtNum(m.overdue.length)} hint="órdenes abiertas fuera de plazo" onClick={() => navigate('workorders?status=OVERDUE')} />
        <Kpi icon="technicians" t="ok" label="Técnicos disponibles" value={`${m.available}/${d.technicians.length}`} hint="listos para despacho" onClick={() => navigate('technicians')} />
        <Kpi icon="box" t="violet" label="Stock bajo" value={fmtNum(m.lowStock)} hint="repuestos bajo el punto de reorden" onClick={() => navigate('inventory?low=1')} />
      </div>

      <Card title="Flujo de órdenes de trabajo" className="mb">
        <div className="pipeline">
          {WO_FLOW.map((s, i) => {
            const n = m.byStatus[s] ?? 0
            return (
              <button key={s} className={`stage stage-${tone(s)}`} onClick={() => navigate(`workorders?status=${s}`)}>
                <span className="stage-name">{label(s)}</span>
                <span className="stage-count">{fmtNum(n)}</span>
                <span className="stage-pct">{pct(n, total)}% del total</span>
                {i < WO_FLOW.length - 1 && <Icon name="chevronRight" className="stage-arrow" />}
              </button>
            )
          })}
        </div>
      </Card>

      <div className="grid-dash">
        <Card title="Órdenes creadas · últimos 14 días">
          <BarChart data={m.trend} unit=" órdenes" />
        </Card>
        <Card title="Cumplimiento de SLA">
          <Gauge
            value={pct(m.onTime, m.done)}
            label="Visitas cerradas dentro del SLA"
            sub={`${fmtNum(m.onTime)} de ${fmtNum(m.done)} visitas completadas`}
          />
        </Card>
      </div>

      <div className="grid-dash">
        <Card title="Rendimiento de técnicos" pad={false} action={<a className="link" href="#/technicians">Ver todos</a>}>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Técnico</th>
                  <th className="num">Visitas</th>
                  <th className="num">Completadas</th>
                  <th>Tasa de cierre</th>
                  <th className="num">Horas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {m.leaderboard.map(({ t, s }) => {
                  const rate = pct(s.completed, s.total)
                  return (
                    <tr key={t.id}>
                      <td>
                        <div className="who">
                          <Avatar name={t.name} size={28} />
                          <div>
                            <strong>{t.name}</strong>
                            <span>{t.specialty}</span>
                          </div>
                        </div>
                      </td>
                      <td className="num">{s.total}</td>
                      <td className="num">{s.completed}</td>
                      <td>
                        <div className="rate">
                          <Meter value={rate} max={100} t={rate >= 70 ? 'ok' : rate >= 40 ? 'warn' : 'danger'} />
                          <span>{rate}%</span>
                        </div>
                      </td>
                      <td className="num">{s.hours.toFixed(1)}</td>
                      <td>
                        <Badge value={t.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="stack-col">
          <Card title="Órdenes abiertas por prioridad">
            <StackBar parts={m.priorities} />
          </Card>
          <Card
            title={m.isNow ? 'Visitas de hoy' : `Visitas del ${fmtShortDate(m.anchor)}`}
            pad={false}
            action={<a className="link" href="#/dispatch">Despacho</a>}
          >
            {m.todayVisits.length === 0 ? (
              <Empty icon="calendar" title="Sin visitas agendadas" />
            ) : (
              <ul className="mini-list">
                {m.todayVisits.slice(0, 6).map((v) => {
                  const w = d.workorderById.get(v.workorder_id)
                  const t = d.technicianById.get(v.technician_id)
                  return (
                    <li key={v.id}>
                      <span className="mini-time">{fmtTime(v.scheduled_start)}</span>
                      <div>
                        <strong>{w?.title ?? shortId(v.workorder_id)}</strong>
                        <span>{t?.name ?? shortId(v.technician_id)}</span>
                      </div>
                      <Badge value={v.status} />
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </>
  )
}
