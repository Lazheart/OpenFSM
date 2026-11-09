import { useMemo, useState, type FormEvent } from 'react'
import type { WorkOrder } from '../api/types'
import { Icon } from '../components/Icon'
import { Badge, Button, DetailList, Drawer, Field, Modal } from '../components/ui'
import {
  PRIORITY_RANK,
  WO_FLOW,
  errorMessage,
  fmtDateTime,
  fmtTime,
  label,
  shortId,
  slaState,
} from '../lib/format'
import { tenantById } from '../lib/tenants'
import { useData } from '../state/data'
import { useAuthed } from '../state/session'
import { useToast } from '../state/toast'

const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

export function WorkOrderDrawer({ wo, onClose }: { wo: WorkOrder; onClose: () => void }) {
  const d = useData()
  const { session } = useAuthed()
  const toast = useToast()
  const canEdit = session.role !== 'TECHNICIAN'
  const customer = d.customerById.get(wo.customer_id)
  const tech = wo.assigned_technician_id ? d.technicianById.get(wo.assigned_technician_id) : undefined
  const visits = d.visits.filter((v) => v.workorder_id === wo.id)
  const sla = slaState(wo.sla_due_date, wo.status)

  const [busy, setBusy] = useState('')
  const [techId, setTechId] = useState(wo.assigned_technician_id || '')
  const nextHour = new Date()
  nextHour.setMinutes(0, 0, 0)
  nextHour.setHours(nextHour.getHours() + 1)
  const [when, setWhen] = useState(toLocalInput(nextHour))
  const [hours, setHours] = useState(String(wo.estimated_hours ?? 2))
  const [partId, setPartId] = useState('')
  const [qty, setQty] = useState('1')

  const run = async (key: string, fn: () => Promise<void>, ok: string) => {
    setBusy(key)
    try {
      await fn()
      toast({ tone: 'ok', title: ok })
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo completar la acción', detail: errorMessage(e) })
    } finally {
      setBusy('')
    }
  }

  const techs = [...d.technicians].sort((a, b) => a.name.localeCompare(b.name))
  const parts = [...d.inventory].sort((a, b) => a.name.localeCompare(b.name))
  const part = d.inventory.find((p) => p.id === partId)

  return (
    <Drawer
      title={wo.title}
      subtitle={
        <>
          <code>{wo.id}</code>
          <Badge value={wo.status} />
          <Badge value={wo.priority} />
        </>
      }
      onClose={onClose}
    >
      <DetailList
        rows={[
          ['Cliente', customer ? <><strong>{customer.name}</strong><br /><span className="muted">{customer.service_address}, {customer.city}</span></> : shortId(wo.customer_id)],
          ['Técnico', tech ? `${tech.name} · ${tech.specialty ?? ''}` : 'Sin asignar'],
          ['SLA', <Badge toneOverride={sla.tone}>{sla.text}</Badge>],
          ['Horas estimadas', `${wo.estimated_hours ?? '—'} h`],
          ['Creada', fmtDateTime(wo.created_at)],
          ['Tenant', tenantById(wo.tenant_id).name],
        ]}
      />
      {wo.description && <p className="desc">{wo.description}</p>}

      {canEdit && (
        <section className="drawer-section">
          <h3>Estado</h3>
          <div className="status-steps">
            {WO_FLOW.map((s) => (
              <button
                key={s}
                className={`step${wo.status === s ? ' step-on' : ''}`}
                disabled={busy !== '' || wo.status === s}
                onClick={() =>
                  void run('status', () => d.actions.updateWorkOrderStatus(wo.id, s), `Orden → ${label(s)} (evento SNS publicado)`)
                }
              >
                {label(s)}
              </button>
            ))}
          </div>
        </section>
      )}

      {canEdit && wo.status !== 'COMPLETED' && (
        <section className="drawer-section">
          <h3>Agendar visita</h3>
          <div className="grid-3">
            <Field label="Técnico">
              <select value={techId} onChange={(e) => setTechId(e.target.value)}>
                <option value="">Elegir…</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {label(t.status)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Inicio">
              <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
            </Field>
            <Field label="Duración (h)">
              <input type="number" min="0.5" step="0.5" value={hours} onChange={(e) => setHours(e.target.value)} />
            </Field>
          </div>
          <Button
            variant="primary"
            icon="calendar"
            disabled={!techId || busy !== ''}
            onClick={() => {
              const start = new Date(when)
              const end = new Date(start.getTime() + Number(hours || 1) * 3600000)
              void run('schedule', () => d.actions.scheduleWorkOrder(wo, techId, start, end), 'Visita agendada')
            }}
          >
            {busy === 'schedule' ? 'Agendando…' : 'Agendar'}
          </Button>
        </section>
      )}

      <section className="drawer-section">
        <h3>Visitas ({visits.length})</h3>
        {visits.length === 0 ? (
          <p className="muted">Aún no hay visitas. Si la orden se crea con técnico, el visitsWorker (SQS) la agenda automáticamente; si no, agéndala aquí o desde Despacho.</p>
        ) : (
          <ul className="mini-list">
            {visits.map((v) => (
              <li key={v.id}>
                <span className="mini-time">{fmtTime(v.scheduled_start)}</span>
                <div>
                  <strong>{shortId(v.id)}</strong>
                  <span>
                    {fmtDateTime(v.scheduled_start)} · {d.technicianById.get(v.technician_id)?.name ?? 'Sin técnico'}
                  </span>
                </div>
                <Badge value={v.status} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="drawer-section">
        <h3>Registrar repuesto usado</h3>
        <div className="grid-3">
          <Field label="Repuesto">
            <select value={partId} onChange={(e) => setPartId(e.target.value)}>
              <option value="">Elegir…</option>
              {parts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.stock_quantity} en stock)
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cantidad">
            <input type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <div className="field field-end">
            <Button
              icon="box"
              disabled={!partId || busy !== ''}
              onClick={() =>
                void run('part', () => d.actions.consumePart(partId, wo.id, Number(qty || 1)), 'Stock descontado')
              }
            >
              {busy === 'part' ? 'Registrando…' : 'Descontar'}
            </Button>
          </div>
        </div>
        {part && part.stock_quantity <= (part.reorder_point ?? 0) && (
          <p className="warn-text">
            <Icon name="alert" size={14} /> Este repuesto ya está bajo su punto de reorden ({part.reorder_point}).
          </p>
        )}
      </section>
    </Drawer>
  )
}

export function NewWorkOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated?: (wo: WorkOrder) => void }) {
  const d = useData()
  const { session } = useAuthed()
  const toast = useToast()
  const tenant = tenantById(session.tenantId)
  const customers = useMemo(
    () => d.customers.filter((c) => c.status !== 'INACTIVE').sort((a, b) => a.name.localeCompare(b.name)),
    [d.customers],
  )
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState('NORMAL')
  const [techId, setTechId] = useState('')
  const [slaHours, setSlaHours] = useState('24')
  const [est, setEst] = useState('2')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const wo = await d.actions.createWorkOrder({
        customer_id: customerId,
        title: title.trim(),
        description: description.trim(),
        priority,
        assigned_technician_id: techId,
        status: 'CREATED',
        estimated_hours: Number(est),
        sla_due_date: new Date(Date.now() + Number(slaHours) * 3600000).toISOString(),
      })
      toast({ tone: 'ok', title: `Orden ${shortId(wo.id)} creada`, detail: techId ? 'WorkOrderCreated → visitsWorker agendará la visita' : 'Queda pendiente en el tablero de Despacho' })
      onCreated?.(wo)
      onClose()
    } catch (err) {
      toast({ tone: 'danger', title: 'No se pudo crear la orden', detail: errorMessage(err) })
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Nueva orden de trabajo"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="new-wo" disabled={busy || !customerId || !title.trim()}>
            {busy ? 'Creando…' : 'Crear orden'}
          </Button>
        </>
      }
    >
      <form id="new-wo" className="form" onSubmit={(e) => void submit(e)}>
        <Field label="Cliente">
          <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.city}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Título">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={tenant.problems[0]}
            list="wo-problems"
            required
          />
          <datalist id="wo-problems">
            {tenant.problems.map((p) => (
              <option key={p} value={`[${tenant.industry}] ${p}`} />
            ))}
          </datalist>
        </Field>
        <Field label="Descripción">
          <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <div className="grid-2">
          <Field label="Prioridad">
            <select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {Object.keys(PRIORITY_RANK).map((p) => (
                <option key={p} value={p}>
                  {label(p)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Técnico (opcional)">
            <select value={techId} onChange={(e) => setTechId(e.target.value)}>
              <option value="">Asignar después</option>
              {d.technicians
                .filter((t) => t.status !== 'ON_LEAVE')
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.specialty}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="SLA">
            <select value={slaHours} onChange={(e) => setSlaHours(e.target.value)}>
              <option value="4">4 horas</option>
              <option value="12">12 horas</option>
              <option value="24">24 horas</option>
              <option value="48">48 horas</option>
            </select>
          </Field>
          <Field label="Horas estimadas">
            <input type="number" min="0.5" step="0.5" value={est} onChange={(e) => setEst(e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}
