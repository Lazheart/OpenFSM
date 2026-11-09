import { useMemo, useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { Avatar, Badge, Button, Empty, Field, Modal, PageHeader, SearchInput, Spinner } from '../components/ui'
import { errorMessage, fmtNum, label } from '../lib/format'
import { tenantById } from '../lib/tenants'
import { useData } from '../state/data'
import { useAuthed } from '../state/session'
import { useToast } from '../state/toast'

const STATUSES = ['AVAILABLE', 'ON_DUTY', 'ON_LEAVE', 'OFFLINE']

export function Technicians() {
  const d = useData()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('ALL')
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState('')

  const load = useMemo(() => {
    const m = new Map<string, { open: number; done: number }>()
    for (const v of d.visits) {
      if (!v.technician_id) continue
      const e = m.get(v.technician_id) ?? { open: 0, done: 0 }
      if (v.status === 'COMPLETED') e.done++
      else e.open++
      m.set(v.technician_id, e)
    }
    return m
  }, [d.visits])

  const counts = useMemo(() => {
    const c: Record<string, number> = { ALL: d.technicians.length }
    for (const t of d.technicians) c[t.status] = (c[t.status] ?? 0) + 1
    return c
  }, [d.technicians])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return d.technicians
      .filter((t) => status === 'ALL' || t.status === status)
      .filter((t) => !needle || `${t.name} ${t.specialty} ${(t.skills ?? []).join(' ')} ${t.vehicle_id}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [d.technicians, q, status])

  const changeStatus = async (id: string, s: string) => {
    setBusyId(id)
    try {
      await d.actions.updateTechnicianStatus(id, s)
      toast({ tone: 'ok', title: `Estado actualizado a ${label(s)}` })
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo actualizar', detail: errorMessage(e) })
    } finally {
      setBusyId('')
    }
  }

  return (
    <>
      <PageHeader
        title="Técnicos de campo"
        subtitle={`${counts.AVAILABLE ?? 0} disponibles · ${counts.ON_DUTY ?? 0} en servicio · ${counts.ON_LEAVE ?? 0} de licencia`}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Nuevo técnico
          </Button>
        }
      />
      <div className="tabs" role="tablist">
        {['ALL', ...STATUSES].map((s) => (
          <button key={s} role="tab" aria-selected={status === s} className={`tab${status === s ? ' tab-on' : ''}`} onClick={() => setStatus(s)}>
            {s === 'ALL' ? 'Todos' : label(s)}
            <span className="tab-count">{fmtNum(counts[s] ?? 0)}</span>
          </button>
        ))}
      </div>
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, especialidad, habilidad o vehículo" />
        <span className="muted toolbar-count">{fmtNum(rows.length)} técnicos</span>
      </div>

      {!d.loaded ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon="technicians" title="No hay técnicos con estos filtros" />
      ) : (
        <div className="tech-grid">
          {rows.slice(0, 120).map((t) => {
            const l = load.get(t.id) ?? { open: 0, done: 0 }
            return (
              <article key={t.id} className="card tech-card">
                <header>
                  <Avatar name={t.name} size={42} />
                  <div className="tech-id">
                    <strong>{t.name}</strong>
                    <span>{t.specialty}</span>
                  </div>
                  <Badge value={t.status} />
                </header>
                <div className="chips">
                  {(t.skills ?? []).map((s) => (
                    <span key={s} className="chip chip-static">
                      {s}
                    </span>
                  ))}
                </div>
                <dl className="tech-stats">
                  <div>
                    <dt>Pendientes</dt>
                    <dd>{l.open}</dd>
                  </div>
                  <div>
                    <dt>Completadas</dt>
                    <dd>{l.done}</dd>
                  </div>
                  <div>
                    <dt>Nivel</dt>
                    <dd>{label(t.certification_level)}</dd>
                  </div>
                </dl>
                <footer>
                  <span className="muted small">
                    <Icon name="truck" size={14} /> {t.vehicle_id || 'Sin vehículo'}
                  </span>
                  <select
                    value={t.status}
                    disabled={busyId === t.id}
                    onChange={(e) => void changeStatus(t.id, e.target.value)}
                    aria-label={`Estado de ${t.name}`}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </footer>
              </article>
            )
          })}
        </div>
      )}

      {creating && <NewTechnicianModal onClose={() => setCreating(false)} />}
    </>
  )
}

function NewTechnicianModal({ onClose }: { onClose: () => void }) {
  const d = useData()
  const { session } = useAuthed()
  const toast = useToast()
  const specialties = tenantById(session.tenantId).specialties
  const [f, setF] = useState({ name: '', email: '', phone: '', specialty: specialties[0], skills: '', certification_level: 'LEVEL_1', vehicle_id: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const skills = [f.specialty, ...f.skills.split(',').map((s) => s.trim()).filter(Boolean)]
      await d.actions.createTechnician({ ...f, name: f.name.trim(), skills, status: 'AVAILABLE' })
      toast({ tone: 'ok', title: 'Técnico registrado' })
      onClose()
    } catch (err) {
      toast({ tone: 'danger', title: 'No se pudo registrar', detail: errorMessage(err) })
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Nuevo técnico"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="new-tech" disabled={busy || !f.name.trim()}>
            {busy ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="new-tech" className="form" onSubmit={(e) => void submit(e)}>
        <Field label="Nombre completo">
          <input value={f.name} onChange={set('name')} required />
        </Field>
        <div className="grid-2">
          <Field label="Correo">
            <input type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Teléfono">
            <input value={f.phone} onChange={set('phone')} />
          </Field>
          <Field label="Especialidad">
            <select value={f.specialty} onChange={set('specialty')}>
              {specialties.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Certificación">
            <select value={f.certification_level} onChange={set('certification_level')}>
              {['LEVEL_1', 'LEVEL_2', 'SENIOR', 'LEAD_ENGINEER'].map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Otras habilidades" hint="Separadas por comas">
          <input value={f.skills} onChange={set('skills')} placeholder="Working at Heights, PLC Basics" />
        </Field>
        <Field label="Vehículo">
          <input value={f.vehicle_id} onChange={set('vehicle_id')} placeholder="VEH-101" />
        </Field>
      </form>
    </Modal>
  )
}
