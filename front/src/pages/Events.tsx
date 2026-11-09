import { Icon, type IconName } from '../components/Icon'
import { Badge, Button, Card, Empty, PageHeader } from '../components/ui'
import { clearEvents, useEvents, type Channel } from '../lib/events'
import { fmtDateTime, fmtTime, type Tone } from '../lib/format'
import { useData } from '../state/data'

const CH: Record<Channel, { icon: IconName; text: string }> = {
  AUTH: { icon: 'user', text: 'Auth' },
  API: { icon: 'bolt', text: 'API Gateway' },
  SNS: { icon: 'events', text: 'SNS' },
  SQS: { icon: 'inventory', text: 'SQS' },
  S3: { icon: 'camera', text: 'S3' },
}

interface Step {
  ch: Channel
  title: string
  text: string
}

const FLOWS: { title: string; steps: Step[] }[] = [
  {
    title: 'Crear orden con técnico → visita automática',
    steps: [
      { ch: 'API', title: 'POST /workorders', text: 'workordersCreate guarda en DynamoDB' },
      { ch: 'SNS', title: 'WorkOrderCreated', text: 'FSMEventsTopic (atributos eventType, tenantId)' },
      { ch: 'SQS', title: 'visitsWorker', text: 'FilterPolicy: WorkOrderCreated → crea la visita' },
      { ch: 'SQS', title: 'workordersWorker', text: 'Consume VisitScheduled → orden Agendada' },
    ],
  },
  {
    title: 'Técnico en campo → cierre de la orden',
    steps: [
      { ch: 'API', title: 'PUT /visits/{id}/status', text: 'En camino / En curso (check-in)' },
      { ch: 'S3', title: 'PutObject (URL prefirmada)', text: 'Evento S3 → evidenceProcessor registra la foto' },
      { ch: 'SNS', title: 'VisitCompleted', text: 'Al completar la visita con checklist y firma' },
      { ch: 'SQS', title: 'workordersWorker', text: 'La orden pasa a Completada sin acoplar servicios' },
    ],
  },
  {
    title: 'Fan-out a Notifications',
    steps: [
      { ch: 'SNS', title: 'Todos los eventos', text: 'Incluye PartConsumed e InventoryLowStock' },
      { ch: 'SQS', title: 'FSMNotificationsQueue', text: 'Sin filtro: recibe el catálogo completo' },
      { ch: 'SQS', title: 'notificationsWorker', text: 'Escribe en su tabla DynamoDB (TTL 30 días)' },
      { ch: 'API', title: 'GET /notifications', text: 'Feed de la campana en la barra superior' },
    ],
  },
]

const SEVERITY: Record<string, Tone> = { CRITICAL: 'danger', WARNING: 'warn', SUCCESS: 'ok', INFO: 'primary' }

export function Events() {
  const events = useEvents()
  const { notifications } = useData()
  return (
    <>
      <PageHeader
        title="Bus de eventos"
        subtitle="Arquitectura orientada a eventos: 1 tópico SNS, 3 colas SQS con DLQ y un evento S3."
        actions={
          events.length > 0 && (
            <Button variant="ghost" onClick={clearEvents}>
              Limpiar
            </Button>
          )
        }
      />

      {FLOWS.map((f) => (
        <Card key={f.title} title={f.title} className="mb">
          <ol className="flow">
            {f.steps.map((s, i) => (
              <li key={i} className={`flow-step ch-${s.ch.toLowerCase()}`}>
                <span className="flow-icon">
                  <Icon name={CH[s.ch].icon} size={16} />
                </span>
                <strong>{s.title}</strong>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </Card>
      ))}

      <div className="grid-dash">
        <Card title={`Eventos de esta sesión (${events.length})`} pad={false}>
          {events.length === 0 ? (
            <Empty icon="events" title="Todavía no hay eventos">
              Crea una orden con técnico asignado para ver el recorrido completo.
            </Empty>
          ) : (
            <ul className="timeline">
              {events.map((e) => (
                <li key={e.id}>
                  <span className="mini-time">{fmtTime(e.at)}</span>
                  <span className={`ch ch-${e.channel.toLowerCase()}`}>
                    <Icon name={CH[e.channel].icon} size={13} />
                    {CH[e.channel].text}
                  </span>
                  <div>
                    <strong>{e.type}</strong>
                    <span>{e.detail}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Guardado por notificationsWorker" pad={false}>
          {notifications.length === 0 ? (
            <Empty icon="bell" title="Sin notificaciones" />
          ) : (
            <ul className="mini-list">
              {notifications.slice(0, 15).map((n) => (
                <li key={n.id}>
                  <div>
                    <strong>{n.title}</strong>
                    <span>
                      {n.event_type} · {fmtDateTime(n.created_at)}
                    </span>
                  </div>
                  <Badge toneOverride={SEVERITY[n.severity] ?? 'neutral'}>{n.severity}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
