import { useState, type FormEvent } from 'react'
import { Icon } from '../components/Icon'
import { errorMessage } from '../lib/format'
import { storage } from '../lib/router'
import { TENANTS } from '../lib/tenants'
import { DEFAULT_API_BASE, useSession, type Mode } from '../state/session'

const QUICK = [
  { username: 'admin', password: 'admin123', text: 'Administrador' },
  { username: 'dispatcher', password: 'disp123', text: 'Despachador' },
  { username: 'tech1', password: 'tech123', text: 'Técnico' },
]

export function Login() {
  const { login, logoutReason } = useSession()
  const [tenantId, setTenantId] = useState(import.meta.env.VITE_DEFAULT_TENANT || TENANTS[0].id)
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('admin123')
  const [apiBase, setApiBase] = useState(() => storage.get('openfsm.apiBase') || DEFAULT_API_BASE)
  const [showApi, setShowApi] = useState(!DEFAULT_API_BASE)
  const [busy, setBusy] = useState<Mode | null>(null)
  const [error, setError] = useState('')

  const submit = async (mode: Mode, e?: FormEvent) => {
    e?.preventDefault()
    setError('')
    if (mode === 'live' && !/^https?:\/\//.test(apiBase.trim())) {
      setShowApi(true)
      setError('Ingresa la URL de API Gateway (la imprime `serverless deploy`).')
      return
    }
    setBusy(mode)
    try {
      if (mode === 'live') storage.set('openfsm.apiBase', apiBase.trim())
      await login(mode, apiBase.trim(), tenantId, username.trim(), password)
    } catch (err) {
      setError(errorMessage(err))
      setBusy(null)
    }
  }

  return (
    <div className="login">
      <section className="login-hero">
        <div className="brand brand-lg">
          <span className="brand-mark" aria-hidden="true">
            <Icon name="bolt" size={22} />
          </span>
          <span className="brand-name">
            Open<b>FSM</b>
          </span>
        </div>
        <h1>Coordina técnicos, visitas y órdenes de trabajo en campo.</h1>
        <p>SaaS multi-tenant, serverless y orientado a eventos sobre AWS.</p>
        <ul className="hero-points">
          <li>
            <Icon name="dispatch" /> Tablero de despacho por técnico
          </li>
          <li>
            <Icon name="events" /> Eventos SNS → SQS en tiempo real
          </li>
          <li>
            <Icon name="camera" /> Evidencias y firma directo a S3
          </li>
        </ul>
        <div className="hero-stack">
          {['API Gateway', 'Lambda', 'DynamoDB', 'SNS', 'SQS', 'S3', 'Amplify'].map((s) => (
            <span key={s}>{s}</span>
          ))}
        </div>
      </section>

      <section className="login-panel">
        <form className="login-card" onSubmit={(e) => void submit('live', e)}>
          <h2>Iniciar sesión</h2>
          <p className="muted">Elige la empresa (tenant) con la que vas a trabajar.</p>

          {logoutReason && <div className="banner banner-warn">{logoutReason}</div>}

          <div className="tenant-pick" role="radiogroup" aria-label="Tenant">
            {TENANTS.map((t) => (
              <button
                type="button"
                key={t.id}
                role="radio"
                aria-checked={tenantId === t.id}
                className={`tenant-opt${tenantId === t.id ? ' selected' : ''}`}
                style={{ ['--tenant' as string]: t.color }}
                onClick={() => setTenantId(t.id)}
              >
                <span className="tenant-dot" />
                <span>
                  <strong>{t.name}</strong>
                  <small>{t.tagline}</small>
                </span>
                <code>{t.id}</code>
              </button>
            ))}
          </div>

          <div className="grid-2">
            <label className="field">
              <span className="field-label">Usuario</span>
              <input value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" required />
            </label>
            <label className="field">
              <span className="field-label">Contraseña</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>
          </div>

          <div className="quick">
            <span>Cuentas demo:</span>
            {QUICK.map((q) => (
              <button
                type="button"
                key={q.username}
                className={`chip${username === q.username ? ' chip-on' : ''}`}
                onClick={() => {
                  setUsername(q.username)
                  setPassword(q.password)
                }}
              >
                {q.text}
              </button>
            ))}
          </div>

          <button type="button" className="link-btn" onClick={() => setShowApi(!showApi)}>
            {showApi ? 'Ocultar' : 'Configurar'} endpoint de API Gateway
          </button>
          {showApi && (
            <label className="field">
              <span className="field-label">URL base de la API</span>
              <input
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                placeholder="https://xxxx.execute-api.us-east-1.amazonaws.com/dev"
              />
            </label>
          )}

          {error && (
            <div className="banner banner-danger" role="alert">
              <Icon name="alert" />
              <span>{error}</span>
            </div>
          )}

          <button className="btn btn-primary btn-block" type="submit" disabled={busy !== null}>
            {busy === 'live' ? 'Conectando…' : 'Entrar'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-block"
            disabled={busy !== null}
            onClick={() => void submit('demo')}
          >
            {busy === 'demo' ? 'Preparando demo…' : 'Explorar en modo demo (sin AWS)'}
          </button>
        </form>
      </section>
    </div>
  )
}
