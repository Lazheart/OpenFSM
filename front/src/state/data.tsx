import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ApiError } from '../api/http'
import type {
  AppNotification,
  CompleteVisitBody,
  Customer,
  InventoryItem,
  Technician,
  Visit,
  WorkOrder,
} from '../api/types'
import { emitEvent } from '../lib/events'
import { errorMessage, label, shortId } from '../lib/format'
import { useAuthed } from './session'

export type CollectionKey = 'customers' | 'technicians' | 'workorders' | 'visits' | 'inventory' | 'notifications'

interface Collections {
  customers: Customer[]
  technicians: Technician[]
  workorders: WorkOrder[]
  visits: Visit[]
  inventory: InventoryItem[]
  notifications: AppNotification[]
}

const ALL_KEYS: CollectionKey[] = ['customers', 'technicians', 'workorders', 'visits', 'inventory', 'notifications']
const EMPTY: Collections = { customers: [], technicians: [], workorders: [], visits: [], inventory: [], notifications: [] }

export const SERVICE_LABEL: Record<CollectionKey, string> = {
  customers: 'Customers',
  technicians: 'Technicians',
  workorders: 'Work Orders',
  visits: 'Visits',
  inventory: 'Inventory',
  notifications: 'Notifications',
}

interface Store extends Collections {
  loading: boolean
  loaded: boolean
  errors: Partial<Record<CollectionKey, string>>
  reload(keys?: CollectionKey[]): Promise<void>
  customerById: Map<string, Customer>
  technicianById: Map<string, Technician>
  workorderById: Map<string, WorkOrder>
  actions: {
    createCustomer(body: Partial<Customer>): Promise<Customer>
    deleteCustomer(id: string): Promise<void>
    createTechnician(body: Partial<Technician>): Promise<Technician>
    updateTechnicianStatus(id: string, status: string): Promise<void>
    createWorkOrder(body: Partial<WorkOrder>): Promise<WorkOrder>
    updateWorkOrderStatus(id: string, status: string, technicianId?: string): Promise<void>
    scheduleWorkOrder(wo: WorkOrder, technicianId: string, start: Date, end: Date): Promise<void>
    updateVisitStatus(id: string, status: 'EN_ROUTE' | 'IN_PROGRESS'): Promise<void>
    completeVisit(id: string, body: CompleteVisitBody): Promise<void>
    uploadEvidence(visitId: string, file: Blob, fileName: string): Promise<string>
    createInventoryItem(body: Partial<InventoryItem>): Promise<InventoryItem>
    consumePart(partId: string, workorderId: string, quantity: number): Promise<void>
  }
}

const Ctx = createContext<Store | null>(null)

const upsert = <T extends { id: string }>(arr: T[], item: T): T[] => {
  const i = arr.findIndex((x) => x.id === item.id)
  if (i === -1) return [item, ...arr]
  const copy = arr.slice()
  copy[i] = item
  return copy
}

const WO_FROM_VISIT: Record<string, string> = {
  SCHEDULED: 'SCHEDULED',
  EN_ROUTE: 'DISPATCHED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
}

export function DataProvider({ children }: { children: ReactNode }) {
  const { api, session, logout } = useAuthed()
  const [data, setData] = useState<Collections>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [loaded, setLoaded] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<CollectionKey, string>>>({})
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  /** Cierra sesión si el authorizer rechaza el token; si no, relanza el error. */
  const guard = useCallback(
    <T,>(p: Promise<T>): Promise<T> =>
      p.catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) {
          logout('Tu sesión expiró o el token fue rechazado por el authorizer. Inicia sesión de nuevo.')
        }
        throw e
      }),
    [logout],
  )

  const loaders = useMemo<Record<CollectionKey, () => Promise<unknown[]>>>(
    () => ({
      customers: api.listCustomers,
      technicians: api.listTechnicians,
      workorders: api.listWorkOrders,
      visits: api.listVisits,
      inventory: api.listInventory,
      notifications: api.listNotifications,
    }),
    [api],
  )

  const reload = useCallback(
    async (keys: CollectionKey[] = ALL_KEYS) => {
      setLoading(true)
      const results = await Promise.allSettled(keys.map((k) => guard(loaders[k]())))
      if (!mounted.current) return
      const next: Partial<Record<CollectionKey, unknown[]>> = {}
      const errs: Partial<Record<CollectionKey, string>> = {}
      results.forEach((r, i) => {
        const k = keys[i]
        if (r.status === 'fulfilled') next[k] = r.value
        else errs[k] = errorMessage(r.reason)
      })
      setData((prev) => ({ ...prev, ...(next as Partial<Collections>) }))
      setErrors((prev) => {
        const merged = { ...prev }
        keys.forEach((k) => delete merged[k])
        return { ...merged, ...errs }
      })
      setLoading(false)
      setLoaded(true)
    },
    [guard, loaders],
  )

  useEffect(() => {
    setData(EMPTY)
    setLoaded(false)
    void reload()
  }, [reload, session.tenantId])

  // Feed de notificaciones casi en vivo
  useEffect(() => {
    const t = setInterval(() => {
      api
        .listNotifications()
        .then((n) => mounted.current && setData((p) => ({ ...p, notifications: n })))
        .catch(() => {})
    }, 30000)
    return () => clearInterval(t)
  }, [api])

  /**
   * Los workers SQS actualizan los datos de forma asíncrona. Esto recarga `keys`
   * cada 2 s (hasta 6 intentos) hasta que `check` encuentre el efecto esperado,
   * y lo registra en el bus de eventos de la UI.
   */
  const watch = useCallback(
    (keys: CollectionKey[], check: (fresh: Partial<Collections>) => string | null, worker: string, timeoutMsg: string) => {
      let tries = 0
      const tick = async () => {
        tries++
        try {
          const fresh: Partial<Record<CollectionKey, unknown[]>> = {}
          for (const k of keys) fresh[k] = await loaders[k]()
          if (!mounted.current) return
          setData((p) => ({ ...p, ...(fresh as Partial<Collections>) }))
          const msg = check(fresh as Partial<Collections>)
          if (msg) {
            emitEvent({ channel: 'SQS', type: worker, detail: msg })
            api
              .listNotifications()
              .then((n) => mounted.current && setData((p) => ({ ...p, notifications: n })))
              .catch(() => {})
            return
          }
        } catch {
          /* se reintenta */
        }
        if (tries < 6) setTimeout(tick, 2000)
        else emitEvent({ channel: 'SQS', type: worker, detail: timeoutMsg })
      }
      setTimeout(tick, 1500)
    },
    [api, loaders],
  )

  const watchWorkOrder = useCallback(
    (workorderId: string, target: string) =>
      watch(
        ['workorders'],
        (fresh) => {
          const wo = fresh.workorders?.find((w) => w.id === workorderId)
          return wo && wo.status === target
            ? `workordersWorker: ${shortId(workorderId)} → ${label(target)} (desde evento de visita)`
            : null
        },
        'workordersWorker',
        `La orden ${shortId(workorderId)} aún no cambia de estado (mensaje en cola o en la DLQ)`,
      ),
    [watch],
  )

  const refreshNotificationsSoon = useCallback(() => {
    setTimeout(() => {
      api
        .listNotifications()
        .then((n) => mounted.current && setData((p) => ({ ...p, notifications: n })))
        .catch(() => {})
    }, 3000)
  }, [api])

  const actions = useMemo<Store['actions']>(
    () => ({
      async createCustomer(body) {
        const c = await guard(api.createCustomer(body))
        setData((p) => ({ ...p, customers: upsert(p.customers, c) }))
        emitEvent({ channel: 'API', type: 'POST /customers', detail: `Cliente ${c.name} registrado` })
        return c
      },
      async deleteCustomer(id) {
        await guard(api.deleteCustomer(id))
        setData((p) => ({ ...p, customers: p.customers.filter((c) => c.id !== id) }))
        emitEvent({ channel: 'API', type: 'DELETE /customers/{id}', detail: `Cliente ${shortId(id)} eliminado` })
      },
      async createTechnician(body) {
        const t = await guard(api.createTechnician(body))
        setData((p) => ({ ...p, technicians: upsert(p.technicians, t) }))
        emitEvent({ channel: 'API', type: 'POST /technicians', detail: `Técnico ${t.name} registrado` })
        return t
      },
      async updateTechnicianStatus(id, status) {
        const t = await guard(api.updateTechnicianStatus(id, status))
        setData((p) => ({ ...p, technicians: upsert(p.technicians, t) }))
        emitEvent({ channel: 'SNS', type: 'TechnicianStatusChanged', detail: `${t.name} → ${label(status)}` })
        refreshNotificationsSoon()
      },
      async createWorkOrder(body) {
        const wo = await guard(api.createWorkOrder(body))
        setData((p) => ({ ...p, workorders: upsert(p.workorders, wo) }))
        emitEvent({ channel: 'API', type: 'POST /workorders', detail: `Orden ${shortId(wo.id)} creada` })
        emitEvent({ channel: 'SNS', type: 'WorkOrderCreated', detail: `Publicado en FSMEventsTopic (tenantId=${wo.tenant_id})` })
        if (wo.assigned_technician_id) {
          watch(
            ['visits'],
            (fresh) => {
              const v = fresh.visits?.find((x) => x.workorder_id === wo.id)
              return v ? `visitsWorker: auto-agendó ${shortId(v.id)} para ${shortId(wo.id)}` : null
            },
            'visitsWorker',
            `Aún no aparece la visita automática de ${shortId(wo.id)} (mensaje en cola o en la DLQ)`,
          )
          watchWorkOrder(wo.id, 'SCHEDULED')
        } else {
          refreshNotificationsSoon()
        }
        return wo
      },
      async updateWorkOrderStatus(id, status, technicianId) {
        const wo = await guard(api.updateWorkOrderStatus(id, status, technicianId))
        setData((p) => ({ ...p, workorders: upsert(p.workorders, wo) }))
        emitEvent({ channel: 'SNS', type: 'WorkOrderStatusChanged', detail: `${shortId(id)} → ${status}` })
        refreshNotificationsSoon()
      },
      async scheduleWorkOrder(wo, technicianId, start, end) {
        // Solo se crea la visita: la orden la actualiza el workordersWorker al consumir VisitScheduled
        const v = await guard(
          api.createVisit({
            workorder_id: wo.id,
            technician_id: technicianId,
            scheduled_start: start.toISOString(),
            scheduled_end: end.toISOString(),
          }),
        )
        setData((p) => ({
          ...p,
          visits: upsert(p.visits, v),
          // Actualización optimista mientras llega el evento
          workorders:
            wo.status === 'CREATED'
              ? upsert(p.workorders, { ...wo, status: 'SCHEDULED', assigned_technician_id: technicianId })
              : p.workorders,
        }))
        emitEvent({ channel: 'API', type: 'POST /visits', detail: `Visita ${shortId(v.id)} agendada` })
        emitEvent({ channel: 'SNS', type: 'VisitScheduled', detail: `${shortId(v.id)} → FSMWorkOrdersQueue` })
        if (wo.status === 'CREATED') watchWorkOrder(wo.id, 'SCHEDULED')
        else refreshNotificationsSoon()
      },
      async updateVisitStatus(id, status) {
        const v = await guard(api.updateVisitStatus(id, status))
        setData((p) => ({ ...p, visits: upsert(p.visits, v) }))
        emitEvent({ channel: 'API', type: 'PUT /visits/{id}/status', detail: `${shortId(id)} → ${label(status)}` })
        emitEvent({ channel: 'SNS', type: 'VisitStatusChanged', detail: `${shortId(id)} → ${status}` })
        watchWorkOrder(v.workorder_id, WO_FROM_VISIT[status])
      },
      async completeVisit(id, body) {
        const v = await guard(api.completeVisit(id, body))
        setData((p) => ({ ...p, visits: upsert(p.visits, v) }))
        emitEvent({ channel: 'API', type: 'PUT /visits/{id}/complete', detail: `Visita ${shortId(id)} cerrada` })
        emitEvent({ channel: 'SNS', type: 'VisitCompleted', detail: `${shortId(id)} → FSMWorkOrdersQueue + FSMNotificationsQueue` })
        watchWorkOrder(v.workorder_id, 'COMPLETED')
      },
      async uploadEvidence(visitId, file, fileName) {
        const contentType = file.type || 'image/jpeg'
        const presigned = await guard(api.getEvidenceUploadUrl(visitId, fileName, contentType))
        emitEvent({ channel: 'API', type: 'POST /visits/evidence-url', detail: `URL prefirmada para ${fileName}` })
        await api.uploadToPresignedUrl(presigned.upload_url, file, contentType)
        emitEvent({ channel: 'S3', type: 'PutObject → evidenceProcessor', detail: presigned.object_key })
        refreshNotificationsSoon()
        return presigned.object_key
      },
      async createInventoryItem(body) {
        const item = await guard(api.createInventoryItem(body))
        setData((p) => ({ ...p, inventory: upsert(p.inventory, item) }))
        emitEvent({ channel: 'API', type: 'POST /inventory', detail: `Repuesto ${item.sku} registrado` })
        return item
      },
      async consumePart(partId, workorderId, quantity) {
        await guard(api.consumePart(partId, workorderId, quantity))
        setData((p) => ({
          ...p,
          inventory: p.inventory.map((x) =>
            x.id === partId ? { ...x, stock_quantity: x.stock_quantity - quantity } : x,
          ),
        }))
        emitEvent({ channel: 'API', type: 'POST /inventory/consume', detail: `${quantity} × ${shortId(partId)} en ${shortId(workorderId)}` })
        emitEvent({ channel: 'SNS', type: 'PartConsumed', detail: 'Publicado (y InventoryLowStock si cruza el punto de reorden)' })
        refreshNotificationsSoon()
      },
    }),
    [api, guard, watch, watchWorkOrder, refreshNotificationsSoon],
  )

  const customerById = useMemo(() => new Map(data.customers.map((c) => [c.id, c])), [data.customers])
  const technicianById = useMemo(() => new Map(data.technicians.map((t) => [t.id, t])), [data.technicians])
  const workorderById = useMemo(() => new Map(data.workorders.map((w) => [w.id, w])), [data.workorders])

  const value: Store = {
    ...data,
    loading,
    loaded,
    errors,
    reload,
    customerById,
    technicianById,
    workorderById,
    actions,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): Store {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useData fuera de DataProvider')
  return ctx
}
