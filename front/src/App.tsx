import { useEffect } from 'react'
import { Layout, navFor } from './components/Layout'
import { navigate, useRoute } from './lib/router'
import { Customers } from './pages/Customers'
import { Dashboard } from './pages/Dashboard'
import { Dispatch } from './pages/Dispatch'
import { Events } from './pages/Events'
import { Inventory } from './pages/Inventory'
import { Login } from './pages/Login'
import { Technicians } from './pages/Technicians'
import { Visits } from './pages/Visits'
import { WorkOrders } from './pages/WorkOrders'
import { DataProvider } from './state/data'
import { SessionProvider, useSession } from './state/session'
import { ToastProvider } from './state/toast'

function Shell() {
  const { session } = useSession()
  const route = useRoute()

  const allowed = session ? navFor(session.role).map((n) => n.path) : []
  const path = allowed.includes(route.path) ? route.path : allowed[0]

  useEffect(() => {
    if (session && path && path !== route.path) navigate(path)
  }, [session, path, route.path])

  if (!session) return <Login />

  let page
  switch (path) {
    case 'dashboard':
      page = <Dashboard />
      break
    case 'dispatch':
      page = <Dispatch />
      break
    case 'workorders':
      page = <WorkOrders route={route} />
      break
    case 'visits':
      page = <Visits />
      break
    case 'customers':
      page = <Customers />
      break
    case 'technicians':
      page = <Technicians />
      break
    case 'inventory':
      page = <Inventory route={route} key={route.params.toString()} />
      break
    case 'events':
      page = <Events />
      break
    default:
      page = null
  }

  return (
    <DataProvider key={`${session.mode}:${session.tenantId}:${session.username}`}>
      <Layout current={path}>{page}</Layout>
    </DataProvider>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </ToastProvider>
  )
}
