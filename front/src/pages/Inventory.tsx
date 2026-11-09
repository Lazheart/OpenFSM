import { useMemo, useState, type FormEvent } from 'react'
import { Badge, Button, Empty, Field, Kpi, Meter, Modal, PageHeader, SearchInput, Spinner } from '../components/ui'
import { errorMessage, fmtMoney, fmtNum } from '../lib/format'
import type { Route } from '../lib/router'
import { useData } from '../state/data'
import { useAuthed } from '../state/session'
import { useToast } from '../state/toast'

export function Inventory({ route }: { route: Route }) {
  const d = useData()
  const { session } = useAuthed()
  const [q, setQ] = useState('')
  const [category, setCategory] = useState('ALL')
  const [lowOnly, setLowOnly] = useState(route.params.get('low') === '1')
  const [creating, setCreating] = useState(false)

  const isLow = (i: { stock_quantity: number; reorder_point?: number }) => i.stock_quantity <= (i.reorder_point ?? 0)
  const categories = useMemo(() => [...new Set(d.inventory.map((i) => i.category ?? 'General'))].sort(), [d.inventory])

  const stats = useMemo(() => {
    let value = 0
    let units = 0
    let low = 0
    for (const i of d.inventory) {
      value += (i.unit_cost ?? 0) * i.stock_quantity
      units += i.stock_quantity
      if (isLow(i)) low++
    }
    return { value, units, low }
  }, [d.inventory])

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return d.inventory
      .filter((i) => category === 'ALL' || i.category === category)
      .filter((i) => !lowOnly || isLow(i))
      .filter((i) => !needle || `${i.sku} ${i.name} ${i.warehouse_location}`.toLowerCase().includes(needle))
      .sort((a, b) => Number(isLow(b)) - Number(isLow(a)) || a.name.localeCompare(b.name))
  }, [d.inventory, q, category, lowOnly])

  return (
    <>
      <PageHeader
        title="Inventario de repuestos"
        subtitle="El stock se descuenta desde cada orden de trabajo (POST /inventory/consume)."
        actions={
          session.role !== 'TECHNICIAN' && (
            <Button variant="primary" icon="plus" onClick={() => setCreating(true)}>
              Nuevo repuesto
            </Button>
          )
        }
      />
      <div className="kpis kpis-3">
        <Kpi icon="inventory" label="Valor del inventario" value={fmtMoney(stats.value)} hint="a costo unitario" />
        <Kpi icon="box" t="info" label="Unidades en stock" value={fmtNum(stats.units)} hint={`${fmtNum(d.inventory.length)} SKUs`} />
        <Kpi icon="alert" t="danger" label="Bajo punto de reorden" value={fmtNum(stats.low)} hint="requieren reposición" onClick={() => setLowOnly(true)} />
      </div>

      <div className="toolbar">
        <SearchInput value={q} onChange={setQ} placeholder="Buscar por SKU, nombre o ubicación" />
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoría">
          <option value="ALL">Todas las categorías</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="toggle">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Solo stock bajo
        </label>
        <span className="muted toolbar-count">{fmtNum(rows.length)} resultados</span>
      </div>

      {!d.loaded ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Empty icon="inventory" title="No hay repuestos con estos filtros" />
      ) : (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Repuesto</th>
                  <th>Categoría</th>
                  <th>Ubicación</th>
                  <th>Stock</th>
                  <th className="num">Costo</th>
                  <th className="num">Precio</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 250).map((i) => {
                  const low = isLow(i)
                  const reorder = i.reorder_point ?? 0
                  return (
                    <tr key={i.id}>
                      <td>
                        <div className="cell-title">
                          <strong>{i.name}</strong>
                          <code>{i.sku}</code>
                        </div>
                      </td>
                      <td>{i.category}</td>
                      <td className="muted">{i.warehouse_location}</td>
                      <td>
                        <div className="stock">
                          <Meter value={i.stock_quantity} max={Math.max(reorder * 4, i.stock_quantity, 1)} t={low ? 'danger' : 'ok'} />
                          <span className="stock-num">{fmtNum(i.stock_quantity)}</span>
                          {low && <Badge toneOverride="danger">Reordenar</Badge>}
                        </div>
                        <span className="muted small">Reorden en {reorder}</span>
                      </td>
                      <td className="num">{fmtMoney(i.unit_cost ?? 0)}</td>
                      <td className="num">{fmtMoney(i.unit_price ?? 0)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {creating && <NewPartModal onClose={() => setCreating(false)} />}
    </>
  )
}

function NewPartModal({ onClose }: { onClose: () => void }) {
  const d = useData()
  const toast = useToast()
  const [f, setF] = useState({ sku: '', name: '', category: '', unit_cost: '10', unit_price: '25', stock_quantity: '100', reorder_point: '10', warehouse_location: '' })
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      await d.actions.createInventoryItem({
        sku: f.sku.trim(),
        name: f.name.trim(),
        category: f.category.trim() || 'General',
        unit_cost: Number(f.unit_cost),
        unit_price: Number(f.unit_price),
        stock_quantity: Number(f.stock_quantity),
        reorder_point: Number(f.reorder_point),
        warehouse_location: f.warehouse_location.trim() || 'Almacén principal',
      })
      toast({ tone: 'ok', title: 'Repuesto registrado' })
      onClose()
    } catch (err) {
      toast({ tone: 'danger', title: 'No se pudo registrar', detail: errorMessage(err) })
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Nuevo repuesto"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="primary" type="submit" form="new-part" disabled={busy || !f.sku.trim() || !f.name.trim()}>
            {busy ? 'Guardando…' : 'Registrar'}
          </Button>
        </>
      }
    >
      <form id="new-part" className="form" onSubmit={(e) => void submit(e)}>
        <div className="grid-2">
          <Field label="SKU">
            <input value={f.sku} onChange={set('sku')} required />
          </Field>
          <Field label="Categoría">
            <input value={f.category} onChange={set('category')} list="cats" />
            <datalist id="cats">
              {[...new Set(d.inventory.map((i) => i.category))].map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
        </div>
        <Field label="Nombre">
          <input value={f.name} onChange={set('name')} required />
        </Field>
        <div className="grid-2">
          <Field label="Costo unitario (USD)">
            <input type="number" min="0" step="0.01" value={f.unit_cost} onChange={set('unit_cost')} />
          </Field>
          <Field label="Precio unitario (USD)">
            <input type="number" min="0" step="0.01" value={f.unit_price} onChange={set('unit_price')} />
          </Field>
          <Field label="Stock inicial">
            <input type="number" min="0" value={f.stock_quantity} onChange={set('stock_quantity')} />
          </Field>
          <Field label="Punto de reorden">
            <input type="number" min="0" value={f.reorder_point} onChange={set('reorder_point')} />
          </Field>
        </div>
        <Field label="Ubicación en almacén">
          <input value={f.warehouse_location} onChange={set('warehouse_location')} placeholder="Almacén-A-Rack-4" />
        </Field>
      </form>
    </Modal>
  )
}
