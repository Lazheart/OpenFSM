import { useMemo, useState } from 'react'
import { Badge, Button, Empty, PageHeader, SearchInput, Spinner } from '../components/ui'
import { PRIORITY_RANK, WO_FLOW, fmtDateTime, fmtNum, label, parseDate, shortId, slaState } from '../lib/format'
import { navigate, type Route } from '../lib/router'
import { useData } from '../state/data'
import { useAuthed } from '../state/session'
import { NewWorkOrderModal, WorkOrderDrawer } from './WorkOrderPanels'

const PAGE = 50

export function WorkOrders({ route }: { route: Route }) {
  const d = useData()
  const { session } = useAuthed()
  const status = route.params.get('status') ?? 'ALL'
  const [q, setQ] = useState('')
  const [priority, setPriority] = useState('ALL')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: d.workorders.length, OPEN: 0, OVERDUE: 0 }
    const now = Date.now()
    for (const w of d.workorders) {
      c[w.status] = (c[w.status] ?? 0) + 1
      if (w.status !== 'COMPLETED') {
        c.OPEN++
        const s = parseDate(w.sla_due_date)
        if (s && s.getTime() < now) c.OVERDUE++
      }
    }
    return c
  }, [d.workorders])

  const rows = useMemo(() => {
    const now = Date.now()
    const needle = q.trim().toLowerCase()
    return d.workorders
      .filter((w) => {
        if (status === 'OPEN' && w.status === 'COMPLETED') return false
        if (status === 'OVERDUE') {
          const s = parseDate(w.sla_due_date)
          if (w.status === 'COMPLETED' || !s || s.getTime() >= now) return false
        }
        if (!['ALL', 'OPEN', 'OVERDUE'].includes(status) && w.status !== status) return false
        if (priority !== 'ALL' && w.priority !== priority) return false
        if (!needle) return true
        const cust = d.customerById.get(w.customer_id)?.name ?? ''
        const tech = d.technicianById.get(w.assigned_technician_id ?? '')?.name ?? ''
        return `${w.id} ${w.title} ${cust} ${tech}`.toLowerCase().includes(needle)
      })
      .sort(
        (a, b) =>
          (a.status === 'COMPLETED' ? 1 : 0) - (b.status === 'COMPLETED' ? 1 : 0) ||
          (PRIORITY_RANK[a.priority] ?? 9) - (PRIORITY_RANK[b.priority] ?? 9) ||
          (b.created_at ?? '').localeCompare(a.created_at ?? ''),
      )
  }, [d.workorders, d.customerById, d.technicianById, status, priority, q])

  const selectedWo = selected ? d.workorderById.get(selected) : undefined
  const tabs = ['ALL', 'OPEN', 'OVERDUE', ...WO_FLOW]
  const tabLabel = (t: string) => (t === 'ALL' ? 'Todas' : t === 'OPEN' ? 'Abiertas' : t === 'OVERDUE' ? 'SLA vencido' : label(t))

  return (
    <>
      <PageHeader
        title="Órdenes de trabajo"
        subtitle="Cada orden nueva publica WorkOrderCreated en SNS; el worker SQS agenda su primera visita."
        actions={
          session.role !== 'TECHNICIAN' && (
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              Nueva orden
            </Button>
          )
        }
      />

      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={status === t}
            className={`tab${status === t ? ' tab-on' : ''}${t === 'OVERDUE' ? ' tab-danger' : ''}`}
            onClick={() => {
              setLimit(PAGE)
              navigate(t === 'ALL' ? 'workorders' : `workorders?status=${t}`)
            }}
          >
            {tabLabel(t)}
            <span className="tab-count">{fmtNum(counts[t] ?? 0)}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por título, cliente, técnico o ID" />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Prioridad">
          <option value="ALL">Todas las prioridades</option>
          {Object.keys(PRIORITY_RANK).map((p) => (
            <option key={p} value={p}>
              {label(p)}
            </option>
          ))}
        </select>
        <span className="muted toolbar-count">{fmtNum(rows.length)} resultados</span>
      </div>

      {!d.loaded ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty title="No hay órdenes con estos filtros" icon="orders" />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table table-click">
              <thead>
                <tr>
                  <th>Orden</th>
                  <th>Cliente</th>
                  <th>Técnico</th>
                  <th>Prioridad</th>
                  <th>Estado</th>
                  <th>SLA</th>
                  <th>Creada</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((w) => {
                  const sla = slaState(w.sla_due_date, w.status)
                  const tech = d.technicianById.get(w.assigned_technician_id ?? '')
                  return (
                    <tr key={w.id} onClick={() => setSelected(w.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(w.id)}>
                      <td>
                        <div className="cell-title">
                          <strong>{w.title}</strong>
                          <code>{shortId(w.id)}</code>
                        </div>
                      </td>
                      <td>{d.customerById.get(w.customer_id)?.name ?? shortId(w.customer_id)}</td>
                      <td>{tech?.name ?? <span className="muted">Sin asignar</span>}</td>
                      <td>
                        <Badge value={w.priority} />
                      </td>
                      <td>
                        <Badge value={w.status} />
                      </td>
                      <td>
                        <span className={`sla sla-${sla.tone}`}>{sla.text}</span>
                      </td>
                      <td className="nowrap muted">{fmtDateTime(w.created_at)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {rows.length > limit && (
            <div className="table-more">
              <Button onClick={() => setLimit(limit + PAGE)}>Mostrar {Math.min(PAGE, rows.length - limit)} más</Button>
            </div>
          )}
        </div>
      )}

      {selectedWo && <WorkOrderDrawer wo={selectedWo} onClose={() => setSelected(null)} />}
      {creating && <NewWorkOrderModal onClose={() => setCreating(false)} onCreated={(wo) => setSelected(wo.id)} />}
    </>
  )
}
