import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { Visit, WorkOrder } from '../api/types'
import { Icon } from '../components/Icon'
import { Avatar, Badge, Button, Empty, Field, Modal, PageHeader, SearchInput, Spinner } from '../components/ui'
import {
  PRIORITY_RANK,
  dayKey,
  errorMessage,
  fmtLongDate,
  fmtShortDate,
  fmtTime,
  label,
  parseDate,
  pct,
  sameDay,
  shortId,
  slaState,
  startOfDay,
  tone,
} from '../lib/format'
import { useData } from '../state/data'
import { useToast } from '../state/toast'
import { VisitDrawer } from './VisitPanels'
import { WorkOrderDrawer } from './WorkOrderPanels'

const START_H = 7
const END_H = 20
const SPAN = END_H - START_H
const WORKDAY_H = 9

interface Block {
  visit: Visit
  wo?: WorkOrder
  start: Date
  end: Date
}

interface DropTarget {
  wo: WorkOrder
  techId: string
  start: Date
}

function visitRange(v: Visit, wo?: WorkOrder): { start: Date; end: Date } | null {
  const start = parseDate(v.scheduled_start)
  if (!start) return null
  const end = parseDate(v.scheduled_end) ?? new Date(start.getTime() + (wo?.estimated_hours ?? 1) * 3600000)
  return { start, end: end > start ? end : new Date(start.getTime() + 3600000) }
}

export function Dispatch() {
  const d = useData()
  const [date, setDate] = useState(() => startOfDay(new Date()))
  const [notice, setNotice] = useState('')
  const [q, setQ] = useState('')
  const [specialty, setSpecialty] = useState('ALL')
  const [hover, setHover] = useState<{ block: Block; x: number; y: number } | null>(null)
  const [visitId, setVisitId] = useState<string | null>(null)
  const [woId, setWoId] = useState<string | null>(null)
  const [drop, setDrop] = useState<DropTarget | null>(null)
  const [overRow, setOverRow] = useState<string | null>(null)
  const dragWo = useRef<WorkOrder | null>(null)
  const positioned = useRef(false)

  // Si hoy no hay visitas (p. ej. seed de enero), salta a la fecha con más actividad.
  const busiest = useMemo(() => {
    const counts = new Map<string, { d: Date; n: number }>()
    for (const v of d.visits) {
      const s = parseDate(v.scheduled_start)
      if (!s || !v.technician_id) continue
      const k = dayKey(s)
      const e = counts.get(k) ?? { d: startOfDay(s), n: 0 }
      e.n++
      counts.set(k, e)
    }
    let best: { d: Date; n: number } | null = null
    for (const e of counts.values()) if (!best || e.n > best.n) best = e
    return { best, counts }
  }, [d.visits])

  useEffect(() => {
    if (!d.loaded || positioned.current) return
    positioned.current = true
    const today = startOfDay(new Date())
    if (!busiest.counts.get(dayKey(today)) && busiest.best) {
      setDate(busiest.best.d)
      setNotice(`Hoy no hay visitas agendadas; se muestra el ${fmtShortDate(busiest.best.d)}, el día con más actividad.`)
    }
  }, [d.loaded, busiest])

  const specialties = useMemo(
    () => [...new Set(d.technicians.map((t) => t.specialty).filter(Boolean) as string[])].sort(),
    [d.technicians],
  )

  const rows = useMemo(() => {
    const byTech = new Map<string, Block[]>()
    for (const v of d.visits) {
      if (!v.technician_id) continue
      const wo = d.workorderById.get(v.workorder_id)
      const r = visitRange(v, wo)
      if (!r || !sameDay(r.start, date)) continue
      const list = byTech.get(v.technician_id) ?? []
      list.push({ visit: v, wo, ...r })
      byTech.set(v.technician_id, list)
    }
    const needle = q.trim().toLowerCase()
    return d.technicians
      .filter((t) => specialty === 'ALL' || t.specialty === specialty)
      .filter((t) => !needle || `${t.name} ${t.specialty} ${t.vehicle_id}`.toLowerCase().includes(needle))
      .map((t) => {
        const blocks = (byTech.get(t.id) ?? []).sort((a, b) => a.start.getTime() - b.start.getTime())
        const hours = blocks.reduce((s, b) => s + (b.end.getTime() - b.start.getTime()) / 3600000, 0)
        return { t, blocks, hours, util: Math.min(100, pct(hours, WORKDAY_H)) }
      })
      .filter((r) => r.t.status !== 'ON_LEAVE' || r.blocks.length > 0)
      .sort((a, b) => b.blocks.length - a.blocks.length || a.t.name.localeCompare(b.t.name))
      .slice(0, 40)
  }, [d.visits, d.technicians, d.workorderById, date, q, specialty])

  const backlog = useMemo(
    () =>
      d.workorders
        .filter((w) => w.status === 'CREATED')
        .sort(
          (a, b) =>
            (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
            (a.sla_due_date ?? '').localeCompare(b.sla_due_date ?? ''),
        ),
    [d.workorders],
  )

  const totalBlocks = rows.reduce((s, r) => s + r.blocks.length, 0)
  const avgUtil = rows.length ? Math.round(rows.reduce((s, r) => s + r.util, 0) / rows.length) : 0
  const isToday = sameDay(date, new Date())
  const now = new Date()
  const nowPos = ((now.getHours() + now.getMinutes() / 60 - START_H) / SPAN) * 100
  const hours = Array.from({ length: SPAN }, (_, i) => START_H + i)

  const shift = (days: number) => {
    setNotice('')
    setDate(new Date(date.getTime() + days * 86400000))
  }

  const onDrop = (e: DragEvent<HTMLDivElement>, techId: string) => {
    e.preventDefault()
    setOverRow(null)
    const wo = dragWo.current
    dragWo.current = null
    if (!wo) return
    const rect = e.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const h = Math.round((START_H + ratio * SPAN) * 2) / 2
    const start = new Date(date.getTime() + h * 3600000)
    setDrop({ wo, techId, start })
  }

  if (!d.loaded) return <Spinner text="Cargando tablero de despacho…" />

  return (
    <>
      <PageHeader
        title="Despacho"
        subtitle="Arrastra una orden pendiente sobre la fila de un técnico para agendar la visita."
        actions={
          <div className="date-nav">
            <button className="icon-btn" onClick={() => shift(-1)} aria-label="Día anterior">
              <Icon name="chevronLeft" />
            </button>
            <Button
              size="sm"
              onClick={() => {
                setNotice('')
                setDate(startOfDay(new Date()))
              }}
            >
              Hoy
            </Button>
            <button className="icon-btn" onClick={() => shift(1)} aria-label="Día siguiente">
              <Icon name="chevronRight" />
            </button>
            <input
              type="date"
              aria-label="Fecha"
              value={`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`}
              onChange={(e) => {
                if (!e.target.value) return
                const [y, m, dd] = e.target.value.split('-').map(Number)
                setNotice('')
                setDate(new Date(y, m - 1, dd))
              }}
            />
          </div>
        }
      />

      {notice && (
        <div className="banner banner-info">
          <Icon name="calendar" />
          <span>{notice}</span>
        </div>
      )}

      <div className="dispatch">
        <div className="card board-card">
          <div className="board-toolbar">
            <strong className="board-date">{fmtLongDate(date)}</strong>
            <span className="muted">
              {totalBlocks} visitas · {rows.length} técnicos · utilización media {avgUtil}%
            </span>
            <div className="board-filters">
              <SearchInput value={q} onChange={setQ} placeholder="Buscar técnico" />
              <select value={specialty} onChange={(e) => setSpecialty(e.target.value)} aria-label="Especialidad">
                <option value="ALL">Todas las especialidades</option>
                {specialties.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="board-scroll">
            <div className="board">
              <div className="board-head">
                <div className="board-res">Técnico</div>
                <div className="board-hours">
                  {hours.map((h) => (
                    <span key={h} style={{ left: `${((h - START_H) / SPAN) * 100}%` }}>
                      {String(h).padStart(2, '0')}:00
                    </span>
                  ))}
                </div>
              </div>

              {rows.length === 0 && <Empty icon="technicians" title="Ningún técnico coincide con el filtro" />}

              {rows.map(({ t, blocks, util }) => (
                <div key={t.id} className="board-row">
                  <div className="board-res">
                    <Avatar name={t.name} size={30} />
                    <div className="res-meta">
                      <strong>{t.name}</strong>
                      <span>{t.specialty}</span>
                    </div>
                    <span className={`util util-${util >= 85 ? 'danger' : util >= 50 ? 'ok' : 'neutral'}`} title="Utilización de la jornada">
                      {util}%
                    </span>
                  </div>
                  <div
                    className={`board-track${overRow === t.id ? ' drop-on' : ''}`}
                    onDragOver={(e) => {
                      e.preventDefault()
                      if (overRow !== t.id) setOverRow(t.id)
                    }}
                    onDragLeave={() => setOverRow(null)}
                    onDrop={(e) => onDrop(e, t.id)}
                  >
                    {hours.map((h) => (
                      <span key={h} className="hour-line" style={{ left: `${((h - START_H) / SPAN) * 100}%` }} />
                    ))}
                    {t.status === 'ON_LEAVE' && <span className="leave">De licencia</span>}
                    {isToday && nowPos > 0 && nowPos < 100 && <span className="now-line" style={{ left: `${nowPos}%` }} />}
                    {blocks.map((b) => {
                      const s = Math.max(START_H, b.start.getHours() + b.start.getMinutes() / 60)
                      const e = Math.min(END_H, s + (b.end.getTime() - b.start.getTime()) / 3600000)
                      if (e <= START_H || s >= END_H) return null
                      return (
                        <button
                          key={b.visit.id}
                          className={`block block-${tone(b.visit.status)}${b.wo?.priority === 'EMERGENCY' ? ' block-emergency' : ''}`}
                          style={{ left: `${((s - START_H) / SPAN) * 100}%`, width: `${((e - s) / SPAN) * 100}%` }}
                          onClick={() => setVisitId(b.visit.id)}
                          onMouseMove={(ev) => setHover({ block: b, x: ev.clientX, y: ev.clientY })}
                          onMouseLeave={() => setHover(null)}
                        >
                          {b.wo?.priority === 'EMERGENCY' && <Icon name="alert" size={12} />}
                          <span>{b.wo?.title.replace(/^\[[^\]]+\]\s*/, '') ?? shortId(b.visit.workorder_id)}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="board-legend">
            {['SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED'].map((s) => (
              <span key={s}>
                <span className={`legend-swatch fill-${tone(s)}`} />
                {label(s)}
              </span>
            ))}
          </div>
        </div>

        <aside className="card backlog">
          <header className="card-head">
            <h2>Por agendar</h2>
            <span className="badge badge-neutral">{backlog.length}</span>
          </header>
          {backlog.length === 0 ? (
            <Empty icon="check" title="Todo agendado">
              No hay órdenes en estado Nueva.
            </Empty>
          ) : (
            <ul className="backlog-list">
              {backlog.slice(0, 40).map((w) => {
                const sla = slaState(w.sla_due_date, w.status)
                return (
                  <li
                    key={w.id}
                    draggable
                    onDragStart={(e) => {
                      dragWo.current = w
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', w.id)
                    }}
                    onDragEnd={() => setOverRow(null)}
                    className={`backlog-item prio-${tone(w.priority)}`}
                  >
                    <Icon name="grip" size={16} className="grip" />
                    <div>
                      <strong>{w.title.replace(/^\[[^\]]+\]\s*/, '')}</strong>
                      <span>{d.customerById.get(w.customer_id)?.name ?? shortId(w.customer_id)}</span>
                      <div className="backlog-meta">
                        <Badge value={w.priority} />
                        <span className={`sla sla-${sla.tone}`}>{sla.text}</span>
                      </div>
                    </div>
                    <button className="icon-btn" aria-label="Ver orden" onClick={() => setWoId(w.id)}>
                      <Icon name="chevronRight" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </aside>
      </div>

      {hover && (
        <div className="tip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <strong>{hover.block.wo?.title ?? shortId(hover.block.visit.workorder_id)}</strong>
          <span>
            {fmtTime(hover.block.start)} – {fmtTime(hover.block.end)} · {label(hover.block.visit.status)}
          </span>
          {hover.block.wo && (
            <span>
              {d.customerById.get(hover.block.wo.customer_id)?.name} · Prioridad {label(hover.block.wo.priority).toLowerCase()}
            </span>
          )}
          <code>{hover.block.visit.id}</code>
        </div>
      )}

      {drop && <ScheduleModal target={drop} onClose={() => setDrop(null)} />}
      {visitId && d.visits.find((v) => v.id === visitId) && (
        <VisitDrawer visit={d.visits.find((v) => v.id === visitId)!} onClose={() => setVisitId(null)} />
      )}
      {woId && d.workorderById.get(woId) && <WorkOrderDrawer wo={d.workorderById.get(woId)!} onClose={() => setWoId(null)} />}
    </>
  )
}

function ScheduleModal({ target, onClose }: { target: DropTarget; onClose: () => void }) {
  const d = useData()
  const toast = useToast()
  const [techId, setTechId] = useState(target.techId)
  const [time, setTime] = useState(
    `${String(target.start.getHours()).padStart(2, '0')}:${String(target.start.getMinutes()).padStart(2, '0')}`,
  )
  const [hours, setHours] = useState(String(target.wo.estimated_hours ?? 2))
  const [busy, setBusy] = useState(false)

  const confirm = async () => {
    const [h, m] = time.split(':').map(Number)
    const start = new Date(startOfDay(target.start).getTime() + (h * 60 + m) * 60000)
    const end = new Date(start.getTime() + Number(hours || 1) * 3600000)
    setBusy(true)
    try {
      await d.actions.scheduleWorkOrder(target.wo, techId, start, end)
      toast({ tone: 'ok', title: 'Visita agendada', detail: `${d.technicianById.get(techId)?.name} · ${fmtTime(start)}` })
      onClose()
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo agendar', detail: errorMessage(e) })
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Agendar visita"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={() => void confirm()} disabled={busy}>
            {busy ? 'Agendando…' : 'Confirmar'}
          </Button>
        </>
      }
    >
      <p className="modal-lead">
        <strong>{target.wo.title}</strong>
        <br />
        <span className="muted">{d.customerById.get(target.wo.customer_id)?.name}</span>
      </p>
      <div className="grid-3">
        <Field label="Técnico">
          <select value={techId} onChange={(e) => setTechId(e.target.value)}>
            {d.technicians.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={`Hora (${fmtShortDate(target.start)})`}>
          <input type="time" value={time} step={1800} onChange={(e) => setTime(e.target.value)} />
        </Field>
        <Field label="Duración (h)">
          <input type="number" min="0.5" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
        </Field>
      </div>
      <p className="muted small">Se crea la visita (POST /visits) y la orden pasa a Agendada, publicando WorkOrderStatusChanged.</p>
    </Modal>
  )
}
