import { useMemo, useState, type FormEvent } from 'react'
import { Avatar, Badge, Button, DetailList, Drawer, Empty, Field, Modal, PageHeader, SearchInput, Spinner } from '../components/ui'
import { errorMessage, fmtDateTime, fmtNum, label, shortId } from '../lib/format'
import { useData } from '../state/data'
import { useAuthed } from '../state/session'
import { useToast } from '../state/toast'

export function Customers() {
  const d = useData()
  const { session } = useAuthed()
  const toast = useToast()
  const [q, setQ] = useState('')
  const [contract, setContract] = useState('ALL')
  const [selected, setSelected] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const woCount = useMemo(() => {
    const m = new Map<string, { total: number; open: number }>()
    for (const w of d.workorders) {
      const e = m.get(w.customer_id) ?? { total: 0, open: 0 }
      e.total++
      if (w.status !== 'COMPLETED') e.open++
      m.set(w.customer_id, e)
    }
    return m
  }, [d.workorders])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return d.customers
      .filter((c) => contract === 'ALL' || c.contract_type === contract)
      .filter((c) => !needle || `${c.name} ${c.city} ${c.tax_id} ${c.email}`.toLowerCase().includes(needle))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [d.customers, q, contract])

  const customer = selected ? d.customerById.get(selected) : undefined
  const customerOrders = customer ? d.workorders.filter((w) => w.customer_id === customer.id) : []

  return (
    <>
      <PageHeader
        title="Clientes"
        subtitle={`${fmtNum(d.customers.length)} cuentas con sedes de servicio`}
        actions={
          <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
            Nuevo cliente
          </Button>
        }
      />
      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por nombre, ciudad, RUC o correo" />
        <select value={contract} onChange={(e) => setContract(e.target.value)} aria-label="Contrato">
          <option value="ALL">Todos los contratos</option>
          {['STANDARD', 'PREMIUM', 'ENTERPRISE'].map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
        <span className="muted toolbar-count">{fmtNum(rows.length)} resultados</span>
      </div>

      {!d.loaded ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon="customers" title="No hay clientes con estos filtros" />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table table-click">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Dirección de servicio</th>
                  <th>Contrato</th>
                  <th className="num">Órdenes abiertas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((c) => {
                  const wc = woCount.get(c.id)
                  return (
                    <tr key={c.id} onClick={() => setSelected(c.id)} tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setSelected(c.id)}>
                      <td>
                        <div className="who">
                          <Avatar name={c.name} size={30} />
                          <div>
                            <strong>{c.name}</strong>
                            <span>{c.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        {c.service_address}
                        <span className="muted"> · {c.city}</span>
                      </td>
                      <td>
                        <Badge value={c.contract_type} toneOverride={c.contract_type === 'ENTERPRISE' ? 'violet' : c.contract_type === 'PREMIUM' ? 'primary' : 'neutral'} />
                      </td>
                      <td className="num">{wc?.open ?? 0}</td>
                      <td>
                        <Badge value={c.status} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {customer && (
        <Drawer
          title={customer.name}
          subtitle={
            <>
              <code>{customer.id}</code>
              <Badge value={customer.status} />
            </>
          }
          onClose={() => {
            setSelected(null)
            setConfirmDelete(false)
          }}
          footer={
            session.role === 'ADMIN' && (
              <>
                {confirmDelete ? <span className="warn-text">¿Eliminar este cliente? No se puede deshacer.</span> : <span />}
                <Button
                  variant="danger"
                  icon="trash"
                  onClick={async () => {
                    if (!confirmDelete) return setConfirmDelete(true)
                    try {
                      await d.actions.deleteCustomer(customer.id)
                      toast({ tone: 'ok', title: 'Cliente eliminado' })
                      setSelected(null)
                      setConfirmDelete(false)
                    } catch (e) {
                      toast({ tone: 'danger', title: 'No se pudo eliminar', detail: errorMessage(e) })
                    }
                  }}
                >
                  {confirmDelete ? 'Sí, eliminar' : 'Eliminar'}
                </Button>
              </>
            )
          }
        >
          <DetailList
            rows={[
              ['RUC', customer.tax_id],
              ['Correo', customer.email],
              ['Teléfono', customer.phone],
              ['Dirección', `${customer.service_address ?? ''}, ${customer.city ?? ''} ${customer.postal_code ?? ''}`],
              ['Contrato', label(customer.contract_type)],
              ['Cliente desde', fmtDateTime(customer.created_at)],
            ]}
          />
          <section className="drawer-section">
            <h3>Órdenes de trabajo ({customerOrders.length})</h3>
            {customerOrders.length === 0 ? (
              <p className="muted">Sin órdenes registradas.</p>
            ) : (
              <ul className="mini-list">
                {customerOrders.slice(0, 15).map((w) => (
                  <li key={w.id}>
                    <code className="mini-time">{shortId(w.id)}</code>
                    <div>
                      <strong>{w.title}</strong>
                      <span>{fmtDateTime(w.created_at)}</span>
                    </div>
                    <Badge value={w.status} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </Drawer>
      )}

      {creating && <NewCustomerModal onClose={() => setCreating(false)} />}
    </>
  )
}

function NewCustomerModal({ onClose }: { onClose: () => void }) {
  const d = useData()
  const toast = useToast()
  const [f, setF] = useState({ name: '', tax_id: '', email: '', phone: '', service_address: '', city: 'Lima', postal_code: '', contract_type: 'STANDARD' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await d.actions.createCustomer({ ...f, name: f.name.trim() })
      toast({ tone: 'ok', title: 'Cliente registrado' })
      onClose()
    } catch (err) {
      toast({ tone: 'danger', title: 'No se pudo registrar', detail: errorMessage(err) })
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Nuevo cliente"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="new-cust" disabled={busy || !f.name.trim()}>
            {busy ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="new-cust" className="form" onSubmit={(e) => void submit(e)}>
        <Field label="Razón social">
          <input value={f.name} onChange={set('name')} required />
        </Field>
        <div className="grid-2">
          <Field label="RUC">
            <input value={f.tax_id} onChange={set('tax_id')} inputMode="numeric" />
          </Field>
          <Field label="Contrato">
            <select value={f.contract_type} onChange={set('contract_type')}>
              {['STANDARD', 'PREMIUM', 'ENTERPRISE'].map((c) => (
                <option key={c} value={c}>
                  {label(c)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Correo">
            <input type="email" value={f.email} onChange={set('email')} />
          </Field>
          <Field label="Teléfono">
            <input value={f.phone} onChange={set('phone')} />
          </Field>
        </div>
        <Field label="Dirección de servicio">
          <input value={f.service_address} onChange={set('service_address')} />
        </Field>
        <div className="grid-2">
          <Field label="Ciudad">
            <input value={f.city} onChange={set('city')} />
          </Field>
          <Field label="Código postal">
            <input value={f.postal_code} onChange={set('postal_code')} />
          </Field>
        </div>
      </form>
    </Modal>
  )
}
