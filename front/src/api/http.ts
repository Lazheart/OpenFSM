import type {
  AppNotification,
  CompleteVisitBody,
  Customer,
  FsmApi,
  InventoryItem,
  LoginResult,
  PresignedUpload,
  Technician,
  Visit,
  WorkOrder,
} from './types'

/** El backend pagina con DynamoDB Query (máx. 500 por página) y devuelve next_token. */
export const PAGE_SIZE = 500
/** Tope por colección para no descargar las 30k filas del seed en el navegador. */
export const MAX_ITEMS = 1500

export class ApiError extends Error {
  status: number
  code?: string
  constructor(message: string, status: number, code?: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

interface Envelope<T> {
  success?: boolean
  message?: string
  data?: T
  error?: { code?: string; message?: string }
}

interface ListPage<T> {
  items?: T[]
  next_token?: string | null
}

export function createHttpApi(baseUrl: string, getToken: () => string): FsmApi {
  const root = baseUrl.trim().replace(/\/+$/, '')

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = `Bearer ${token}`

    let res: Response
    try {
      res = await fetch(root + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(
        `No se pudo conectar con ${root}. Revisa la URL de API Gateway, que el stage esté desplegado y CORS.`,
        0,
        'NETWORK',
      )
    }

    let payload: Envelope<T> | null = null
    try {
      payload = (await res.json()) as Envelope<T>
    } catch {
      payload = null
    }

    if (!res.ok || payload?.success === false) {
      if (res.status === 401 || res.status === 403) {
        throw new ApiError(payload?.error?.message || 'Sesión inválida o expirada', res.status, 'UNAUTHORIZED')
      }
      const message = payload?.error?.message || payload?.message || `Error HTTP ${res.status}`
      throw new ApiError(message, res.status, payload?.error?.code)
    }
    return payload?.data as T
  }

  const enc = (id: string) => encodeURIComponent(id)
  const list = async <T>(path: string, max = MAX_ITEMS): Promise<T[]> => {
    const out: T[] = []
    let token: string | null | undefined
    do {
      const size = Math.min(PAGE_SIZE, max - out.length)
      const qs = `limit=${size}${token ? `&next_token=${encodeURIComponent(token)}` : ''}`
      const page = await request<ListPage<T>>('GET', `${path}?${qs}`)
      out.push(...(page?.items ?? []))
      token = page?.next_token
    } while (token && out.length < max)
    return out
  }

  return {
    login: (tenantId, username, password) =>
      request<LoginResult>('POST', '/auth/login', { tenant_id: tenantId, username, password }),

    listCustomers: () => list<Customer>('/customers'),
    createCustomer: (body) => request<Customer>('POST', '/customers', body),
    deleteCustomer: async (id) => {
      await request('DELETE', `/customers/${enc(id)}`)
    },

    listTechnicians: () => list<Technician>('/technicians'),
    createTechnician: (body) => request<Technician>('POST', '/technicians', body),
    updateTechnicianStatus: (id, status) =>
      request<Technician>('PUT', `/technicians/${enc(id)}/status`, { status }),

    listWorkOrders: () => list<WorkOrder>('/workorders'),
    createWorkOrder: (body) => request<WorkOrder>('POST', '/workorders', body),
    updateWorkOrderStatus: (id, status, assignedTechnicianId) =>
      request<WorkOrder>(
        'PUT',
        `/workorders/${enc(id)}/status`,
        assignedTechnicianId === undefined ? { status } : { status, assigned_technician_id: assignedTechnicianId },
      ),

    listVisits: () => list<Visit>('/visits'),
    createVisit: (body) => request<Visit>('POST', '/visits', body),
    updateVisitStatus: (id, status) => request<Visit>('PUT', `/visits/${enc(id)}/status`, { status }),
    completeVisit: (id, body: CompleteVisitBody) => request<Visit>('PUT', `/visits/${enc(id)}/complete`, body),
    getEvidenceUploadUrl: (visitId, fileName, fileType) =>
      request<PresignedUpload>('POST', '/visits/evidence-url', {
        visit_id: visitId,
        file_name: fileName,
        file_type: fileType,
      }),
    uploadToPresignedUrl: async (url, file, contentType) => {
      let res: Response
      try {
        res = await fetch(url, { method: 'PUT', body: file, headers: { 'Content-Type': contentType } })
      } catch {
        throw new ApiError('No se pudo subir el archivo a S3 (revisa el CORS del bucket).', 0, 'NETWORK')
      }
      if (!res.ok) throw new ApiError(`S3 rechazó la subida (HTTP ${res.status})`, res.status)
    },

    listInventory: () => list<InventoryItem>('/inventory'),
    createInventoryItem: (body) => request<InventoryItem>('POST', '/inventory', body),
    consumePart: async (partId, workorderId, quantity) => {
      await request('POST', '/inventory/consume', { part_id: partId, workorder_id: workorderId, quantity })
    },

    listNotifications: () => list<AppNotification>('/notifications', 50),
  }
}
