// Tipos que reflejan exactamente lo que devuelven las Lambdas de back/

export type Role = 'ADMIN' | 'DISPATCHER' | 'TECHNICIAN'

export interface Customer {
  tenant_id: string
  id: string
  name: string
  tax_id?: string
  email?: string
  phone?: string
  service_address?: string
  city?: string
  postal_code?: string
  contract_type?: string
  status?: string
  created_at?: string
  updated_at?: string
}

export interface Technician {
  tenant_id: string
  id: string
  name: string
  email?: string
  phone?: string
  specialty?: string
  skills?: string[]
  certification_level?: string
  vehicle_id?: string
  status: string
  current_latitude?: string
  current_longitude?: string
  created_at?: string
  updated_at?: string
}

export interface WorkOrder {
  tenant_id: string
  id: string
  customer_id: string
  assigned_technician_id?: string
  title: string
  description?: string
  priority: string
  status: string
  sla_due_date?: string
  estimated_hours?: number
  created_by?: string
  created_at: string
  updated_at?: string
}

export interface ChecklistItem {
  item: string
  passed: boolean
}

export interface Visit {
  tenant_id: string
  id: string
  workorder_id: string
  technician_id: string
  scheduled_start: string
  scheduled_end?: string
  actual_start?: string
  actual_end?: string
  status: string
  notes?: string
  checklist?: ChecklistItem[]
  evidence_photos?: string[]
  signature_key?: string
  created_at?: string
  updated_at?: string
}

export interface InventoryItem {
  tenant_id: string
  id: string
  sku: string
  name: string
  category?: string
  unit_cost?: number
  unit_price?: number
  stock_quantity: number
  warehouse_location?: string
  reorder_point?: number
  created_at?: string
  updated_at?: string
}

export interface AppNotification {
  tenant_id: string
  id: string
  event_type: string
  severity: 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL'
  title: string
  detail?: string
  entity_id?: string
  created_at: string
}

export interface LoginResult {
  token: string
  tenant_id: string
  user_id: string
  username: string
  role: Role
}

export interface PresignedUpload {
  upload_url: string
  object_key: string
  bucket: string
}

export interface CompleteVisitBody {
  notes?: string
  checklist?: ChecklistItem[]
  evidence_photos?: string[]
  signature_key?: string
}

/** Contrato común para el backend real (HTTP) y el modo demo (en memoria). */
export interface FsmApi {
  login(tenantId: string, username: string, password: string): Promise<LoginResult>

  listCustomers(): Promise<Customer[]>
  createCustomer(body: Partial<Customer>): Promise<Customer>
  deleteCustomer(id: string): Promise<void>

  listTechnicians(): Promise<Technician[]>
  createTechnician(body: Partial<Technician>): Promise<Technician>
  updateTechnicianStatus(id: string, status: string): Promise<Technician>

  listWorkOrders(): Promise<WorkOrder[]>
  createWorkOrder(body: Partial<WorkOrder>): Promise<WorkOrder>
  updateWorkOrderStatus(id: string, status: string, assignedTechnicianId?: string): Promise<WorkOrder>

  listVisits(): Promise<Visit[]>
  createVisit(body: Partial<Visit>): Promise<Visit>
  updateVisitStatus(id: string, status: 'EN_ROUTE' | 'IN_PROGRESS'): Promise<Visit>
  completeVisit(id: string, body: CompleteVisitBody): Promise<Visit>
  getEvidenceUploadUrl(visitId: string, fileName: string, fileType: string): Promise<PresignedUpload>
  uploadToPresignedUrl(url: string, file: Blob, contentType: string): Promise<void>

  listInventory(): Promise<InventoryItem[]>
  createInventoryItem(body: Partial<InventoryItem>): Promise<InventoryItem>
  consumePart(partId: string, workorderId: string, quantity: number): Promise<void>

  listNotifications(): Promise<AppNotification[]>
}
