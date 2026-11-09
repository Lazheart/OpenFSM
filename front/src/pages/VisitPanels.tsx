import { useEffect, useRef, useState, type PointerEvent } from 'react'
import type { ChecklistItem, Visit } from '../api/types'
import { Icon } from '../components/Icon'
import { Badge, Button, DetailList, Drawer, Field } from '../components/ui'
import { errorMessage, fmtDateTime, shortId } from '../lib/format'
import { useData } from '../state/data'
import { useToast } from '../state/toast'

export function VisitDrawer({ visit, onClose }: { visit: Visit; onClose: () => void }) {
  const d = useData()
  const toast = useToast()
  const wo = d.workorderById.get(visit.workorder_id)
  const tech = d.technicianById.get(visit.technician_id)
  const customer = wo ? d.customerById.get(wo.customer_id) : undefined
  const done = visit.status === 'COMPLETED'

  const [checklist, setChecklist] = useState<ChecklistItem[]>(visit.checklist ?? [])
  const [notes, setNotes] = useState(visit.notes ?? '')
  const [photos, setPhotos] = useState<string[]>(visit.evidence_photos ?? [])
  const [signatureKey, setSignatureKey] = useState(visit.signature_key ?? '')
  const [uploading, setUploading] = useState('')
  const [saving, setSaving] = useState(false)

  const upload = async (file: Blob, name: string, kind: 'photo' | 'signature') => {
    setUploading(kind)
    try {
      const key = await d.actions.uploadEvidence(visit.id, file, name)
      if (kind === 'photo') setPhotos((p) => [...p, key])
      else setSignatureKey(key)
      toast({ tone: 'ok', title: kind === 'photo' ? 'Foto subida a S3' : 'Firma subida a S3', detail: key })
    } catch (e) {
      toast({ tone: 'danger', title: 'Falló la subida', detail: errorMessage(e) })
    } finally {
      setUploading('')
    }
  }

  const complete = async () => {
    setSaving(true)
    try {
      await d.actions.completeVisit(visit.id, {
        notes,
        checklist,
        evidence_photos: photos,
        signature_key: signatureKey,
      })
      toast({ tone: 'ok', title: 'Visita completada' })
      onClose()
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo cerrar la visita', detail: errorMessage(e) })
      setSaving(false)
    }
  }

  const [moving, setMoving] = useState(false)
  const move = async (status: 'EN_ROUTE' | 'IN_PROGRESS') => {
    setMoving(true)
    try {
      await d.actions.updateVisitStatus(visit.id, status)
      toast({ tone: 'ok', title: status === 'EN_ROUTE' ? 'Técnico en camino' : 'Trabajo iniciado', detail: 'VisitStatusChanged publicado' })
    } catch (e) {
      toast({ tone: 'danger', title: 'No se pudo actualizar la visita', detail: errorMessage(e) })
    } finally {
      setMoving(false)
    }
  }

  const passed = checklist.filter((c) => c.passed).length

  return (
    <Drawer
      title={wo?.title ?? `Visita ${shortId(visit.id)}`}
      subtitle={
        <>
          <code>{visit.id}</code>
          <Badge value={visit.status} />
          {wo && <Badge value={wo.priority} />}
        </>
      }
      onClose={onClose}
      footer={
        !done && (
          <>
            <span className="muted small">
              Checklist {passed}/{checklist.length} · {photos.length} fotos · {signatureKey ? 'con firma' : 'sin firma'}
            </span>
            <Button variant="primary" icon="check" onClick={() => void complete()} disabled={saving || uploading !== ''}>
              {saving ? 'Guardando…' : 'Completar visita'}
            </Button>
          </>
        )
      }
    >
      <DetailList
        rows={[
          ['Cliente', customer ? `${customer.name} · ${customer.service_address ?? ''}` : '—'],
          ['Técnico', tech ? `${tech.name} (${tech.vehicle_id ?? 'sin vehículo'})` : 'Sin técnico asignado'],
          ['Programada', `${fmtDateTime(visit.scheduled_start)}${visit.scheduled_end ? ` → ${fmtDateTime(visit.scheduled_end)}` : ''}`],
          ['Inicio real', fmtDateTime(visit.actual_start)],
          ['Fin real', fmtDateTime(visit.actual_end)],
          ['Orden', wo ? shortId(wo.id) : shortId(visit.workorder_id)],
        ]}
      />

      {!done && (
        <section className="drawer-section">
          <h3>Trabajo en campo</h3>
          <div className="status-steps">
            <Button
              size="sm"
              icon="truck"
              disabled={visit.status !== 'SCHEDULED' || moving}
              onClick={() => void move('EN_ROUTE')}
            >
              En camino
            </Button>
            <Button
              size="sm"
              icon="clock"
              disabled={visit.status === 'IN_PROGRESS' || moving}
              onClick={() => void move('IN_PROGRESS')}
            >
              Iniciar trabajo
            </Button>
          </div>
          <p className="muted small">Cada cambio publica VisitStatusChanged y la orden se actualiza vía SQS.</p>
        </section>
      )}

      <section className="drawer-section">
        <h3>Checklist</h3>
        <ul className="checklist">
          {checklist.map((c, i) => (
            <li key={i}>
              <label>
                <input
                  type="checkbox"
                  checked={c.passed}
                  disabled={done}
                  onChange={(e) =>
                    setChecklist((prev) => prev.map((x, j) => (j === i ? { ...x, passed: e.target.checked } : x)))
                  }
                />
                <span>{c.item}</span>
              </label>
            </li>
          ))}
          {checklist.length === 0 && <li className="muted">Sin ítems.</li>}
        </ul>
      </section>

      <section className="drawer-section">
        <Field label="Notas del técnico">
          <textarea rows={3} value={notes} disabled={done} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </section>

      <section className="drawer-section">
        <h3>Evidencias en S3</h3>
        <ul className="files">
          {photos.map((p) => (
            <li key={p}>
              <Icon name="camera" size={15} />
              <code>{p.replace(/^s3:\/\/[^/]+\//, '')}</code>
            </li>
          ))}
          {photos.length === 0 && <li className="muted">Sin fotos.</li>}
        </ul>
        {!done && (
          <label className={`btn btn-secondary btn-sm upload${uploading === 'photo' ? ' disabled' : ''}`}>
            <Icon name="camera" size={15} />
            {uploading === 'photo' ? 'Subiendo…' : 'Subir foto'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              disabled={uploading !== ''}
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void upload(f, f.name.replace(/[^\w.-]/g, '_'), 'photo')
                e.target.value = ''
              }}
            />
          </label>
        )}
      </section>

      <section className="drawer-section">
        <h3>Firma del cliente</h3>
        {signatureKey ? (
          <p className="files">
            <Icon name="pen" size={15} /> <code>{signatureKey.replace(/^s3:\/\/[^/]+\//, '')}</code>
          </p>
        ) : done ? (
          <p className="muted">No se registró firma.</p>
        ) : (
          <SignaturePad busy={uploading === 'signature'} onSave={(blob) => void upload(blob, 'signature.png', 'signature')} />
        )}
      </section>
    </Drawer>
  )
}

function SignaturePad({ onSave, busy }: { onSave: (b: Blob) => void; busy: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    const c = ref.current
    if (!c) return
    const ratio = window.devicePixelRatio || 1
    c.width = c.clientWidth * ratio
    c.height = c.clientHeight * ratio
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#1b2333'
  }, [])

  const pos = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }

  return (
    <div className="sig">
      <canvas
        ref={ref}
        className="sig-canvas"
        aria-label="Área de firma"
        onPointerDown={(e) => {
          drawing.current = true
          e.currentTarget.setPointerCapture(e.pointerId)
          const ctx = e.currentTarget.getContext('2d')
          const p = pos(e)
          ctx?.beginPath()
          ctx?.moveTo(p.x, p.y)
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return
          const ctx = e.currentTarget.getContext('2d')
          const p = pos(e)
          ctx?.lineTo(p.x, p.y)
          ctx?.stroke()
          if (!dirty) setDirty(true)
        }}
        onPointerUp={() => {
          drawing.current = false
        }}
      />
      <div className="sig-actions">
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty}
          onClick={() => {
            const c = ref.current
            c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
            setDirty(false)
          }}
        >
          Limpiar
        </Button>
        <Button
          size="sm"
          icon="pen"
          disabled={!dirty || busy}
          onClick={() => ref.current?.toBlob((b) => b && onSave(b), 'image/png')}
        >
          {busy ? 'Subiendo…' : 'Guardar firma'}
        </Button>
      </div>
    </div>
  )
}
