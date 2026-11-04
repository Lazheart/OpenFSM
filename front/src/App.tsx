import { useState } from 'react'
import './App.css'

interface WorkOrder {
  id: string
  title: string
  customer_id: string
  assigned_technician_id: string
  priority: string
  status: string
}

function App() {
  const [selectedTenant, setSelectedTenant] = useState('tenant-alpha')
  const [token, setToken] = useState('')
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([
    {
      id: 'WO#tena-000001',
      title: 'AC unit blowing lukewarm air in server room',
      customer_id: 'CUST#tena-000001',
      assigned_technician_id: 'TECH#tena-000001',
      priority: 'HIGH',
      status: 'IN_PROGRESS'
    },
    {
      id: 'WO#tena-000002',
      title: 'Chiller compressor loud grinding noise',
      customer_id: 'CUST#tena-000002',
      assigned_technician_id: 'TECH#tena-000002',
      priority: 'EMERGENCY',
      status: 'SCHEDULED'
    }
  ])
  const [apiEndpoint, setApiEndpoint] = useState(
    import.meta.env.VITE_API_BASE_URL || 'https://xxxxxxxxxx.execute-api.us-east-1.amazonaws.com/dev'
  )
  const [statusMessage, setStatusMessage] = useState('System ready. Multi-tenant mode active.')
  const [newTitle, setNewTitle] = useState('')
  const [newPriority, setNewPriority] = useState('NORMAL')

  const tenants = [
    { id: 'tenant-alpha', name: 'Tenant A: Apex HVAC Solutions' },
    { id: 'tenant-beta', name: 'Tenant B: BlueSky Telecom Services' },
    { id: 'tenant-gamma', name: 'Tenant C: GreenField Electrical & Power' }
  ]

  const handleTenantChange = (tenantId: string) => {
    setSelectedTenant(tenantId)
    setToken('')
    setStatusMessage(`Switched context to ${tenantId}. Data isolated per tenant.`)
    if (tenantId === 'tenant-beta') {
      setWorkOrders([
        {
          id: 'WO#tenb-000001',
          title: 'Fiber trunk cut along highway construction sector',
          customer_id: 'CUST#tenb-000001',
          assigned_technician_id: 'TECH#tenb-000001',
          priority: 'EMERGENCY',
          status: 'DISPATCHED'
        },
        {
          id: 'WO#tenb-000002',
          title: 'High packet loss on cell tower base station',
          customer_id: 'CUST#tenb-000002',
          assigned_technician_id: 'TECH#tenb-000002',
          priority: 'NORMAL',
          status: 'SCHEDULED'
        }
      ])
    } else if (tenantId === 'tenant-gamma') {
      setWorkOrders([
        {
          id: 'WO#teng-000001',
          title: 'Medium voltage breaker trip on thermal overload',
          customer_id: 'CUST#teng-000001',
          assigned_technician_id: 'TECH#teng-000001',
          priority: 'HIGH',
          status: 'IN_PROGRESS'
        }
      ])
    } else {
      setWorkOrders([
        {
          id: 'WO#tena-000001',
          title: 'AC unit blowing lukewarm air in server room',
          customer_id: 'CUST#tena-000001',
          assigned_technician_id: 'TECH#tena-000001',
          priority: 'HIGH',
          status: 'IN_PROGRESS'
        },
        {
          id: 'WO#tena-000002',
          title: 'Chiller compressor loud grinding noise',
          customer_id: 'CUST#tena-000002',
          assigned_technician_id: 'TECH#tena-000002',
          priority: 'EMERGENCY',
          status: 'SCHEDULED'
        }
      ])
    }
  }

  const handleSimulateLogin = async () => {
    setStatusMessage(`Authenticating with ${selectedTenant}...`)
    try {
      const res = await fetch(`${apiEndpoint}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: selectedTenant,
          username: 'admin',
          password: 'admin123'
        })
      })
      const data = await res.json()
      if (data.success && data.data?.token) {
        setToken(data.data.token)
        setStatusMessage(`Authenticated successfully as admin for ${selectedTenant}. JWT token acquired.`)
      } else {
        setStatusMessage(`Offline / Mock token generated for ${selectedTenant}.`)
        setToken(`mock-jwt-token-for-${selectedTenant}`)
      }
    } catch {
      setStatusMessage(`Offline mode: generated token for ${selectedTenant}.`)
      setToken(`mock-jwt-token-for-${selectedTenant}`)
    }
  }

  const handleCreateWorkOrder = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTitle.trim()) return

    const newWo: WorkOrder = {
      id: `WO#${selectedTenant.slice(7, 11)}-${Date.now().toString().slice(-6)}`,
      title: newTitle,
      customer_id: `CUST#${selectedTenant.slice(7, 11)}-0001`,
      assigned_technician_id: `TECH#${selectedTenant.slice(7, 11)}-0001`,
      priority: newPriority,
      status: 'CREATED'
    }

    setWorkOrders([newWo, ...workOrders])
    setNewTitle('')
    setStatusMessage(`Work order ${newWo.id} created for ${selectedTenant}. Event WorkOrderCreated published to SNS.`)
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '24px', fontFamily: 'system-ui, sans-serif' }}>
      <header style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '16px', marginBottom: '24px' }}>
        <h1 style={{ margin: '0 0 8px 0', color: '#1e293b' }}>OpenFSM: Field Service Management</h1>
        <p style={{ margin: 0, color: '#64748b' }}>
          Serverless Multi-Tenant Event-Driven Architecture (AWS Lambda, DynamoDB, SNS, SQS, S3)
        </p>
      </header>

      {/* Tenant Selector */}
      <section style={{ backgroundColor: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '24px' }}>
        <label style={{ display: 'block', fontWeight: 600, marginBottom: '8px', color: '#334155' }}>
          Active Tenant Context:
        </label>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {tenants.map((t) => (
            <button
              key={t.id}
              onClick={() => handleTenantChange(t.id)}
              style={{
                padding: '10px 16px',
                borderRadius: '6px',
                border: '1px solid',
                borderColor: selectedTenant === t.id ? '#2563eb' : '#cbd5e1',
                backgroundColor: selectedTenant === t.id ? '#2563eb' : '#ffffff',
                color: selectedTenant === t.id ? '#ffffff' : '#334155',
                fontWeight: selectedTenant === t.id ? 600 : 400,
                cursor: 'pointer'
              }}
            >
              {t.name}
            </button>
          ))}
        </div>
      </section>

      {/* Auth & API Gateway Config */}
      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
        <div style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>API Gateway Endpoint</h3>
          <input
            type="text"
            value={apiEndpoint}
            onChange={(e) => setApiEndpoint(e.target.value)}
            style={{ width: '100%', padding: '8px', boxSizing: 'border-box', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          />
        </div>
        <div style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px' }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Tenant Authentication</h3>
          <button
            onClick={handleSimulateLogin}
            style={{ padding: '8px 16px', backgroundColor: '#0f172a', color: '#ffffff', borderRadius: '4px', cursor: 'pointer', border: 'none' }}
          >
            Authenticate {selectedTenant}
          </button>
          <div style={{ marginTop: '8px', fontSize: '12px', color: token ? '#15803d' : '#94a3b8', wordBreak: 'break-all' }}>
            {token ? `JWT Active: ${token.slice(0, 32)}...` : 'Not authenticated'}
          </div>
        </div>
      </section>

      {/* Status banner */}
      <div style={{ backgroundColor: '#eff6ff', color: '#1e40af', padding: '12px 16px', borderRadius: '6px', marginBottom: '24px', fontSize: '14px' }}>
        {statusMessage}
      </div>

      {/* Create Work Order Form */}
      <section style={{ padding: '16px', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>Create Work Order ({selectedTenant})</h3>
        <form onSubmit={handleCreateWorkOrder} style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Issue description (e.g. Compressor valve leakage)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            style={{ flex: 1, minWidth: '280px', padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
          >
            <option value="LOW">LOW</option>
            <option value="NORMAL">NORMAL</option>
            <option value="HIGH">HIGH</option>
            <option value="EMERGENCY">EMERGENCY</option>
          </select>
          <button
            type="submit"
            style={{ padding: '8px 20px', backgroundColor: '#2563eb', color: '#ffffff', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            Dispatch Work Order
          </button>
        </form>
      </section>

      {/* Work Orders List */}
      <section>
        <h3 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>
          Work Orders for {selectedTenant} ({workOrders.length} records)
        </h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
              <th style={{ padding: '10px' }}>ID</th>
              <th style={{ padding: '10px' }}>Title</th>
              <th style={{ padding: '10px' }}>Customer</th>
              <th style={{ padding: '10px' }}>Technician</th>
              <th style={{ padding: '10px' }}>Priority</th>
              <th style={{ padding: '10px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {workOrders.map((wo) => (
              <tr key={wo.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                <td style={{ padding: '10px', fontFamily: 'monospace', fontWeight: 600 }}>{wo.id}</td>
                <td style={{ padding: '10px' }}>{wo.title}</td>
                <td style={{ padding: '10px' }}>{wo.customer_id}</td>
                <td style={{ padding: '10px' }}>{wo.assigned_technician_id}</td>
                <td style={{ padding: '10px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: wo.priority === 'EMERGENCY' ? '#fee2e2' : wo.priority === 'HIGH' ? '#ffedd5' : '#e0e7ff',
                    color: wo.priority === 'EMERGENCY' ? '#b91c1c' : wo.priority === 'HIGH' ? '#c2410c' : '#3730a3'
                  }}>
                    {wo.priority}
                  </span>
                </td>
                <td style={{ padding: '10px' }}>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    fontWeight: 600,
                    backgroundColor: wo.status === 'COMPLETED' ? '#dcfce7' : '#fef9c3',
                    color: wo.status === 'COMPLETED' ? '#15803d' : '#854d0e'
                  }}>
                    {wo.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

export default App
