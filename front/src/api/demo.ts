// Modo demo: backend simulado en memoria para explorar la UI sin AWS.
// Imita los handlers de back/ (incluido el worker SQS que auto-agenda visitas).

import { tenantById } from '../lib/tenants'
import type {
  AppNotification,
  Customer,
  FsmApi,
  InventoryItem,
  LoginResult,
  Role,
  Technician,
  Visit,
  WorkOrder,
} from './types'
import { ApiError } from './http'

interface TenantData {
  customers: Customer[]
  technicians: Technician[]
  workorders: WorkOrder[]
  visits: Visit[]
  inventory: InventoryItem[]
  notifications: AppNotification[]
}

const DEMO_USERS: Record<string, { password: string; role: Role; id: string }> = {
  admin: { password: 'admin123', role: 'ADMIN', id: 'USR-001' },
  dispatcher: { password: 'disp123', role: 'DISPATCHER', id: 'USR-002' },
  tech1: { password: 'tech123', role: 'TECHNICIAN', id: 'USR-003' },
}

const FIRST = ['Carlos', 'Lucía', 'Jorge', 'Valeria', 'Miguel', 'Daniela', 'Andrés', 'Camila', 'Renzo', 'Sofía', 'Diego', 'Mariana', 'Luis', 'Paola', 'Héctor', 'Fiorella']
const LAST = ['Rodríguez', 'Quispe', 'Flores', 'Castillo', 'Mendoza', 'Vargas', 'Rojas', 'Huamán', 'Torres', 'Salazar', 'Chávez', 'Ramírez']
const COMPANIES = ['Corporación Logística Andina', 'Clínica San Gabriel', 'Data Center Lurín', 'Minera Los Andes', 'Hotel Costa Verde', 'Retail Plaza Norte', 'Planta Envasadora Ate', 'Universidad del Pacífico Sur', 'Banco Miraflores', 'Cineplanet Surco', 'Hospital Regional Callao', 'Fábrica Textil Gamarra', 'Torre Empresarial Begonias', 'Supermercados Del Sur', 'Puerto Seco Chancay', 'Agroexportadora Ica']
const STREETS = ['Av. Benavides', 'Av. Javier Prado', 'Av. Arequipa', 'Calle Las Begonias', 'Av. La Marina', 'Av. Primavera', 'Jr. de la Unión', 'Av. El Derby']
const CITIES = ['Lima', 'Lima', 'Lima', 'Callao', 'Arequipa', 'Trujillo']
const CERTS = ['LEVEL_1', 'LEVEL_2', 'SENIOR', 'LEAD_ENGINEER']

function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s += 0x6d2b79f5
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const pad = (n: number, w = 4) => String(n).padStart(w, '0')
const iso = (d: Date) => d.toISOString()
const uid = () => Math.random().toString(16).slice(2, 14)

function buildTenant(tenantId: string, seed: number): TenantData {
  const r = rng(seed)
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)]
  const t = tenantById(tenantId)
  const pref = tenantId.slice(7, 11)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())

  const customers: Customer[] = COMPANIES.map((name, i) => {
    const created = new Date(today.getTime() - (120 - i) * 86400000)
    return {
      tenant_id: tenantId,
      id: `CUST#${pref}-${pad(i + 1)}`,
      name,
      tax_id: `20${Math.floor(100000000 + r() * 899999999)}`,
      email: `contacto${i + 1}@${name.split(' ')[0].toLowerCase()}.pe`,
      phone: `+51 9${Math.floor(10000000 + r() * 89999999)}`,
      service_address: `${pick(STREETS)} ${Math.floor(100 + r() * 1800)}`,
      city: pick(CITIES),
      postal_code: `150${pad(Math.floor(r() * 99), 2)}`,
      contract_type: pick(['STANDARD', 'PREMIUM', 'ENTERPRISE']),
      status: r() < 0.88 ? 'ACTIVE' : 'INACTIVE',
      created_at: iso(created),
      updated_at: iso(created),
    }
  })

  const technicians: Technician[] = Array.from({ length: 12 }, (_, i) => {
    const specialty = t.specialties[i % t.specialties.length]
    const created = new Date(today.getTime() - (200 - i * 3) * 86400000)
    return {
      tenant_id: tenantId,
      id: `TECH#${pref}-${pad(i + 1)}`,
      name: `${FIRST[(i + seed) % FIRST.length]} ${LAST[(i * 5 + seed) % LAST.length]}`,
      email: `tecnico${i + 1}@${tenantId}.com`,
      phone: `+51 9${Math.floor(10000000 + r() * 89999999)}`,
      specialty,
      skills: [specialty, pick(['Safety Level 2', 'Working at Heights', 'Confined Spaces']), pick(['Diagnostic Tools', 'PLC Basics', 'Customer Care'])],
      certification_level: pick(CERTS),
      vehicle_id: `VEH-${pref.toUpperCase()}-${100 + i}`,
      status: i === 11 ? 'ON_LEAVE' : r() < 0.55 ? 'ON_DUTY' : 'AVAILABLE',
      current_latitude: (-12.04 - r() * 0.12).toFixed(6),
      current_longitude: (-77.03 - r() * 0.1).toFixed(6),
      created_at: iso(created),
      updated_at: iso(created),
    }
  })

  const inventory: InventoryItem[] = []
  let partN = 0
  for (const [sku, name, category, cost, price] of t.parts) {
    for (let v = 1; v <= 3; v++) {
      partN++
      const reorder = 10 + Math.floor(r() * 15)
      inventory.push({
        tenant_id: tenantId,
        id: `PART#${pref}-${pad(partN)}`,
        sku: `${sku}-${pad(v, 3)}`,
        name: `${name}${v > 1 ? ` · Mod. ${v}` : ''}`,
        category,
        unit_cost: cost,
        unit_price: price,
        stock_quantity: r() < 0.18 ? Math.floor(r() * reorder) : reorder + Math.floor(r() * 90),
        warehouse_location: `Almacén-${pick(['A', 'B', 'C'])}-Rack-${Math.floor(1 + r() * 20)}`,
        reorder_point: reorder,
        created_at: iso(new Date(today.getTime() - 90 * 86400000)),
      })
    }
  }

  // Órdenes y visitas: 10 días hacia atrás y 3 hacia adelante, sin traslapes por técnico.
  const workorders: WorkOrder[] = []
  const visits: Visit[] = []
  const slots = new Map<string, number>() // `${techId}|${day}` -> próxima hora libre
  let woN = 0
  let visitN = 0
  for (let day = -10; day <= 3; day++) {
    const perDay = day === 0 ? 26 : 13 + Math.floor(r() * 8)
    for (let k = 0; k < perDay; k++) {
      woN++
      const cust = customers[Math.floor(r() * customers.length)]
      const tech = technicians[Math.floor(r() * 11)]
      const problem = pick(t.problems)
      const priority = pick(['LOW', 'NORMAL', 'NORMAL', 'HIGH', 'HIGH', 'EMERGENCY'])
      const est = pick([1, 1.5, 2, 2, 3, 4])
      const created = new Date(today.getTime() + day * 86400000 + (6 + r() * 2) * 3600000)
      const sla = new Date(created.getTime() + pick([4, 12, 24, 48]) * 3600000)

      let status: string
      if (day < 0) status = r() < 0.86 ? 'COMPLETED' : pick(['IN_PROGRESS', 'SCHEDULED'])
      else if (day === 0) status = pick(['DISPATCHED', 'IN_PROGRESS', 'IN_PROGRESS', 'COMPLETED', 'SCHEDULED', 'CREATED'])
      else status = pick(['SCHEDULED', 'SCHEDULED', 'CREATED'])

      const wo: WorkOrder = {
        tenant_id: tenantId,
        id: `WO#${pref}-${pad(woN, 5)}`,
        customer_id: cust.id,
        assigned_technician_id: status === 'CREATED' ? '' : tech.id,
        title: `[${t.industry}] ${problem}`,
        description: `${problem}. Reportado en sede de ${cust.name}.`,
        priority,
        status,
        sla_due_date: iso(sla),
        estimated_hours: est,
        created_by: 'dispatcher',
        created_at: iso(created),
        updated_at: iso(created),
      }
      workorders.push(wo)
      if (status === 'CREATED') continue

      const key = `${tech.id}|${day}`
      const startHour = slots.get(key) ?? 8 + Math.floor(r() * 2)
      const dur = Math.max(1, Math.min(3, Math.round(est)))
      if (startHour + dur > 19) {
        wo.status = 'CREATED'
        wo.assigned_technician_id = ''
        continue
      }
      slots.set(key, startHour + dur + (r() < 0.5 ? 0.5 : 1))
      const start = new Date(today.getTime() + day * 86400000 + startHour * 3600000)
      const end = new Date(start.getTime() + dur * 3600000)
      const vStatus =
        status === 'COMPLETED' ? 'COMPLETED' : status === 'IN_PROGRESS' ? 'IN_PROGRESS' : status === 'DISPATCHED' ? 'EN_ROUTE' : 'SCHEDULED'
      visitN++
      const done = vStatus === 'COMPLETED'
      visits.push({
        tenant_id: tenantId,
        id: `VISIT#${pref}-${pad(visitN, 5)}`,
        workorder_id: wo.id,
        technician_id: tech.id,
        scheduled_start: iso(start),
        scheduled_end: iso(end),
        actual_start: vStatus === 'IN_PROGRESS' || done ? iso(new Date(start.getTime() + 5 * 60000)) : '',
        actual_end: done ? iso(new Date(end.getTime() - 10 * 60000)) : '',
        status: vStatus,
        notes: done ? 'Inspección realizada. Parámetros dentro de la tolerancia del fabricante.' : '',
        checklist: [
          { item: 'EPP verificado', passed: done || vStatus === 'IN_PROGRESS' },
          { item: 'Autodiagnóstico del sistema', passed: done },
          { item: 'Conformidad del cliente', passed: done },
        ],
        evidence_photos: done ? [`${tenantId}/visits/${wo.id}/before.jpg`, `${tenantId}/visits/${wo.id}/after.jpg`] : [],
        signature_key: done ? `${tenantId}/visits/${wo.id}/signature.png` : '',
        created_at: iso(created),
        updated_at: iso(done ? end : created),
      })
    }
  }

  const notifications: AppNotification[] = workorders
    .slice(-12)
    .reverse()
    .map((w, i) => ({
      tenant_id: tenantId,
      id: `NOTIF#seed-${i}`,
      event_type: 'WorkOrderCreated',
      severity: w.priority === 'EMERGENCY' ? 'CRITICAL' : w.priority === 'HIGH' ? 'WARNING' : 'INFO',
      title: `Nueva orden ${w.id.split('#')[1]}`,
      detail: w.title,
      entity_id: w.id,
      created_at: w.created_at,
    }))

  return { customers, technicians, workorders, visits, inventory, notifications }
}

const store = new Map<string, TenantData>()
function data(tenantId: string): TenantData {
  let d = store.get(tenantId)
  if (!d) {
    d = buildTenant(tenantId, tenantId.length * 97 + tenantId.charCodeAt(7) * 13)
    store.set(tenantId, d)
  }
  return d
}

const delay = <T,>(value: T, ms = 220): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(structuredClone(value)), ms))

const ES: Record<string, string> = {
  CREATED: 'Nueva',
  SCHEDULED: 'Agendada',
  DISPATCHED: 'Despachada',
  IN_PROGRESS: 'En curso',
  COMPLETED: 'Completada',
  AVAILABLE: 'Disponible',
  ON_DUTY: 'En servicio',
  ON_LEAVE: 'De licencia',
  OFFLINE: 'Fuera de turno',
}
const FLOW = ['CREATED', 'SCHEDULED', 'DISPATCHED', 'IN_PROGRESS', 'COMPLETED']
const VISIT_TO_WO: Record<string, string> = {
  SCHEDULED: 'SCHEDULED',
  EN_ROUTE: 'DISPATCHED',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
}

export function createDemoApi(getTenant: () => string): FsmApi {
  const d = () => data(getTenant())
  const now = () => new Date().toISOString()
  const short = (id?: string) => (id ?? '').split('#').pop()

  /** Simula el worker de Notifications (consume todos los eventos). */
  const notify = (
    tenant: string,
    eventType: string,
    severity: AppNotification['severity'],
    title: string,
    detail = '',
    entity = '',
  ) => {
    data(tenant).notifications.unshift({
      tenant_id: tenant,
      id: `NOTIF#${now()}#${uid()}`,
      event_type: eventType,
      severity,
      title,
      detail,
      entity_id: entity,
      created_at: now(),
    })
  }

  /** Simula el worker de Work Orders: la orden sigue a la visita (solo hacia adelante). */
  const advanceWorkOrder = (tenant: string, workorderId: string, visitStatus: string, technicianId?: string) => {
    setTimeout(() => {
      const wo = data(tenant).workorders.find((w) => w.id === workorderId)
      const target = VISIT_TO_WO[visitStatus]
      if (!wo || !target || FLOW.indexOf(target) <= FLOW.indexOf(wo.status)) return
      wo.status = target
      if (technicianId && visitStatus === 'SCHEDULED') wo.assigned_technician_id = technicianId
      wo.updated_at = now()
      notify(tenant, 'WorkOrderStatusChanged', target === 'COMPLETED' ? 'SUCCESS' : 'INFO', `Orden ${short(wo.id)} → ${ES[target] ?? target}`, wo.title, wo.id)
    }, 1200)
  }
  const find = <T extends { id: string }>(arr: T[], id: string, label: string): T => {
    const item = arr.find((x) => x.id === id)
    if (!item) throw new ApiError(`${label} ${id} no encontrado`, 404, 'NOT_FOUND')
    return item
  }

  return {
    async login(tenantId, username, password) {
      const u = DEMO_USERS[username]
      if (!u || u.password !== password) throw new ApiError('Credenciales inválidas', 401, 'UNAUTHORIZED')
      const res: LoginResult = { token: 'demo', tenant_id: tenantId, user_id: u.id, username, role: u.role }
      return delay(res, 350)
    },

    listCustomers: () => delay(d().customers),
    async createCustomer(body) {
      const c: Customer = {
        status: 'ACTIVE',
        contract_type: 'STANDARD',
        ...body,
        tenant_id: getTenant(),
        id: `CUST#${uid()}`,
        name: body.name ?? '',
        created_at: now(),
        updated_at: now(),
      }
      d().customers.unshift(c)
      return delay(c)
    },
    async deleteCustomer(id) {
      find(d().customers, id, 'Cliente')
      d().customers = d().customers.filter((c) => c.id !== id)
      await delay(null)
    },

    listTechnicians: () => delay(d().technicians),
    async createTechnician(body) {
      const t: Technician = {
        specialty: 'General',
        skills: ['Inspection', 'Maintenance'],
        certification_level: 'LEVEL_1',
        ...body,
        status: body.status ?? 'AVAILABLE',
        tenant_id: getTenant(),
        id: `TECH#${uid()}`,
        name: body.name ?? '',
        created_at: now(),
        updated_at: now(),
      }
      d().technicians.unshift(t)
      return delay(t)
    },
    async updateTechnicianStatus(id, status) {
      const t = find(d().technicians, id, 'Técnico')
      notify(getTenant(), 'TechnicianStatusChanged', 'INFO', `${t.name}: ${ES[status] ?? status}`, '', t.id)
      t.status = status
      t.updated_at = now()
      return delay(t)
    },

    listWorkOrders: () => delay(d().workorders),
    async createWorkOrder(body) {
      const tenant = getTenant()
      const wo: WorkOrder = {
        description: '',
        priority: 'NORMAL',
        status: 'CREATED',
        estimated_hours: 2,
        assigned_technician_id: '',
        ...body,
        tenant_id: tenant,
        id: `WO#${uid()}`,
        customer_id: body.customer_id ?? '',
        title: body.title ?? '',
        created_by: 'dispatcher',
        created_at: now(),
        updated_at: now(),
      }
      d().workorders.unshift(wo)
      notify(tenant, 'WorkOrderCreated', wo.priority === 'EMERGENCY' ? 'CRITICAL' : wo.priority === 'HIGH' ? 'WARNING' : 'INFO', `Nueva orden ${short(wo.id)}`, wo.title, wo.id)
      // Simula SNS -> SQS -> visitsWorker: solo auto-agenda si la orden trae técnico
      if (wo.assigned_technician_id) {
        setTimeout(() => {
          const start = new Date()
          start.setMinutes(0, 0, 0)
          start.setHours(start.getHours() + 1)
          const end = new Date(start.getTime() + (wo.estimated_hours ?? 1) * 3600000)
          data(tenant).visits.unshift({
            tenant_id: tenant,
            id: `VISIT#auto-${uid()}`,
            workorder_id: wo.id,
            technician_id: wo.assigned_technician_id ?? '',
            scheduled_start: start.toISOString(),
            scheduled_end: end.toISOString(),
            actual_start: '',
            actual_end: '',
            status: 'SCHEDULED',
            notes: `Auto-agendada por el evento WorkOrderCreated: ${wo.title}`,
            checklist: [
              { item: 'EPP verificado', passed: false },
              { item: 'Diagnóstico del equipo', passed: false },
              { item: 'Conformidad del cliente', passed: false },
            ],
            evidence_photos: [],
            signature_key: '',
            created_at: now(),
            updated_at: now(),
          })
          notify(tenant, 'VisitScheduled', 'INFO', `Visita agendada para ${short(wo.id)}`, '', wo.id)
          advanceWorkOrder(tenant, wo.id, 'SCHEDULED', wo.assigned_technician_id)
        }, 1200)
      }
      return delay(wo)
    },
    async updateWorkOrderStatus(id, status, assignedTechnicianId) {
      const wo = find(d().workorders, id, 'Orden')
      if (wo.status !== status) {
        notify(getTenant(), 'WorkOrderStatusChanged', status === 'COMPLETED' ? 'SUCCESS' : 'INFO', `Orden ${short(wo.id)} → ${ES[status] ?? status}`, wo.title, wo.id)
      }
      wo.status = status
      if (assignedTechnicianId !== undefined) wo.assigned_technician_id = assignedTechnicianId
      wo.updated_at = now()
      return delay(wo)
    },

    listVisits: () => delay(d().visits),
    async createVisit(body) {
      const v: Visit = {
        scheduled_end: '',
        actual_start: '',
        actual_end: '',
        status: 'SCHEDULED',
        notes: '',
        checklist: [
          { item: 'EPP verificado', passed: false },
          { item: 'Autodiagnóstico del sistema', passed: false },
          { item: 'Conformidad del cliente', passed: false },
        ],
        evidence_photos: [],
        signature_key: '',
        ...body,
        tenant_id: getTenant(),
        id: `VISIT#${uid()}`,
        workorder_id: body.workorder_id ?? '',
        technician_id: body.technician_id ?? '',
        scheduled_start: body.scheduled_start ?? now(),
        created_at: now(),
        updated_at: now(),
      }
      d().visits.unshift(v)
      notify(getTenant(), 'VisitScheduled', 'INFO', `Visita agendada para ${short(v.workorder_id)}`, '', v.workorder_id)
      advanceWorkOrder(getTenant(), v.workorder_id, 'SCHEDULED', v.technician_id)
      return delay(v)
    },
    async updateVisitStatus(id, status) {
      const v = find(d().visits, id, 'Visita')
      if (v.status === 'COMPLETED') throw new ApiError('La visita ya está completada', 409)
      v.status = status
      if (status === 'IN_PROGRESS' && !v.actual_start) v.actual_start = now()
      v.updated_at = now()
      notify(getTenant(), 'VisitStatusChanged', 'INFO', status === 'EN_ROUTE' ? 'Técnico en camino' : 'Técnico en curso', `Visita ${short(id)}`, v.workorder_id)
      advanceWorkOrder(getTenant(), v.workorder_id, status)
      return delay(v)
    },
    async completeVisit(id, body) {
      const v = find(d().visits, id, 'Visita')
      if (v.status === 'COMPLETED') throw new ApiError('La visita ya está completada', 409)
      const photos = new Set([...(v.evidence_photos ?? []), ...(body.evidence_photos ?? [])])
      Object.assign(v, body, { evidence_photos: [...photos], status: 'COMPLETED', actual_end: now(), updated_at: now() })
      if (!v.actual_start) v.actual_start = v.scheduled_start
      const passed = (v.checklist ?? []).filter((c) => c.passed).length
      notify(
        getTenant(),
        'VisitCompleted',
        'SUCCESS',
        `Visita ${short(id)} completada`,
        `Checklist ${passed}/${v.checklist?.length ?? 0} · ${v.evidence_photos?.length ?? 0} evidencias · ${v.signature_key ? 'con' : 'sin'} firma`,
        v.workorder_id,
      )
      advanceWorkOrder(getTenant(), v.workorder_id, 'COMPLETED')
      return delay(v)
    },
    async getEvidenceUploadUrl(visitId, fileName) {
      find(d().visits, visitId, 'Visita')
      const key = `${getTenant()}/visits/${visitId}/${Math.floor(Date.now() / 1000)}_${fileName}`
      return delay({ upload_url: `demo://s3/${key}`, object_key: key, bucket: 'openfsm-demo-evidence' })
    },
    async uploadToPresignedUrl(url) {
      // Simula el evento S3 ObjectCreated -> evidenceProcessor
      const key = url.replace('demo://s3/', '')
      const [tenant, , visitId, file] = key.split('/')
      setTimeout(() => {
        const v = data(tenant).visits.find((x) => x.id === visitId)
        if (!v) return
        const isSignature = file.split('_').slice(1).join('_').startsWith('signature')
        if (isSignature) v.signature_key = key
        else if (!v.evidence_photos?.includes(key)) v.evidence_photos = [...(v.evidence_photos ?? []), key]
        notify(tenant, 'EvidenceUploaded', 'INFO', `${isSignature ? 'Firma' : 'Foto'} subida a S3`, `Visita ${short(visitId)}`, v.workorder_id)
      }, 700)
      await delay(null, 500)
    },

    listInventory: () => delay(d().inventory),
    async createInventoryItem(body) {
      const p: InventoryItem = {
        category: 'General',
        unit_cost: 10,
        unit_price: 25,
        warehouse_location: 'Almacén principal',
        reorder_point: 10,
        ...body,
        stock_quantity: Number(body.stock_quantity ?? 100),
        tenant_id: getTenant(),
        id: `PART#${uid()}`,
        sku: body.sku ?? '',
        name: body.name ?? '',
        created_at: now(),
      }
      d().inventory.unshift(p)
      return delay(p)
    },
    async consumePart(partId, workorderId, quantity) {
      const p = find(d().inventory, partId, 'Repuesto')
      if (p.stock_quantity < quantity) {
        throw new ApiError(`Stock insuficiente: quedan ${p.stock_quantity}`, 400)
      }
      const before = p.stock_quantity
      p.stock_quantity -= quantity
      p.updated_at = now()
      notify(getTenant(), 'PartConsumed', 'INFO', `${quantity} × ${p.sku} usados`, `Orden ${short(workorderId)}`, workorderId)
      const reorder = p.reorder_point ?? 0
      if (p.stock_quantity <= reorder && before > reorder) {
        notify(getTenant(), 'InventoryLowStock', 'WARNING', `Stock bajo: ${p.sku}`, `Quedan ${p.stock_quantity} (reorden en ${reorder})`, p.id)
      }
      await delay(null)
    },

    listNotifications: () => delay(d().notifications.slice(0, 50)),
  }
}
