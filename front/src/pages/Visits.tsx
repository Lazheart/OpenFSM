import { useMemo, useState } from 'react'
import { Badge, Button, Empty, PageHeader, SearchInput, Spinner } from '../components/ui'
import { fmtDateTime, fmtNum, label, parseDate, shortId } from '../lib/format'
import { useData } from '../state/data'
import { VisitDrawer } from './VisitPanels'

const STATUSES = ['ALL', 'SCHEDULED', 'EN_ROUTE', 'IN_PROGRESS', 'COMPLETED']
const PAGE = 50

export function Visits() {
  const d = useData()
  const [status, setStatus] = useState('ALL')
  const [q, setQ] = useState('')
  const [limit, setLimit] = useState(PAGE)
  const [selected, setSelected] = useState<string | null>(null)

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: d.visits.length }
    for (const v of d.visits) c[v.status] = (c[v.status] ?? 0) + 1
    return c
  }, [d.visits])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return d.visits
      .filter((v) => status === 'ALL' || v.status === status)
      .filter((v) => {
        if (!needle) return true
        const wo = d.workorderById.get(v.workorder_id)
        const tech = d.technicianById.get(v.technician_id)
        return `${v.id} ${wo?.title ?? ''} ${tech?.name ?? ''}`.toLowerCase().includes(needle)
      })
      .sort((a, b) => (parseDate(b.scheduled_start)?.getTime() ?? 0) - (parseDate(a.scheduled_start)?.getTime() ?? 0))
  }, [d.visits, d.workorderById, d.technicianById, status, q])

  const visit = selected ? d.visits.find((v) => v.id === selected) : undefined

  return (
    <>
      <PageHeader title="Visitas de campo" subtitle="Checklist, notas, fotos y firma del cliente se suben directo a S3 con URL prefirmada." />

      <div className="tabs" role="tablist">
        {STATUSES.map((s) => (
          <button
            key={s}
            role="tab"
            aria-selected={status === s}
            className={`tab${status === s ? ' tab-on' : ''}`}
            onClick={() => {
              setStatus(s)
              setLimit(PAGE)
            }}
          >
            {s === 'ALL' ? 'Todas' : label(s)}
            <span className="tab-count">{fmtNum(counts[s] ?? 0)}</span>
          </button>
        ))}
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por orden, técnico o ID" />
        <span className="muted toolbar-count">{fmtNum(rows.length)} resultados</span>
      </div>

      {!d.loaded ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon="visits" title="No hay visitas con estos filtros" />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table table-click">
              <thead>
                <tr>
                  <th>Visita</th>
                  <th>Técnico</th>
                  <th>Programada</th>
                  <th>Estado</th>
                  <th className="num">Checklist</th>
                  <th className="num">Evidencias</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((v) => {
                  const wo = d.workorderById.get(v.workorder_id)
                  const tech = d.technicianById.get(v.technician_id)
                  const cl = v.checklist ?? []
                  return (
                    <tr key={v.id} onClick={() => setSelected(v.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(v.id)}>
                      <td>
                        <div className="cell-title">
                          <strong>{wo?.title ?? shortId(v.workorder_id)}</strong>
                          <code>{shortId(v.id)}</code>
                        </div>
                      </td>
                      <td>{tech?.name ?? <span className="muted">Sin técnico</span>}</td>
                      <td className="nowrap">{fmtDateTime(v.scheduled_start)}</td>
                      <td>
                        <Badge value={v.status} />
                      </td>
                      <td className="num">
                        {cl.filter((c) => c.passed).length}/{cl.length}
                      </td>
                      <td className="num">
                        {(v.evidence_photos?.length ?? 0) + (v.signature_key ? 1 : 0)}
                      </td>
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

      {visit && <VisitDrawer visit={visit} onClose={() => setSelected(null)} />}
    </>
  )
}
