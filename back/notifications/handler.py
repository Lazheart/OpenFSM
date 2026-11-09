"""
Microservicio Notifications (6.º microservicio, tabla DynamoDB propia).

- worker: consume TODOS los eventos de dominio desde FSMNotificationsQueue
  (fan-out SNS -> SQS) y los convierte en notificaciones legibles por tenant.
- GET /notifications: feed de notificaciones del tenant (más recientes primero).
"""
import os
import sys
import time
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.db_utils import is_conditional_failure, put_item, query_by_tenant
from common.http_utils import api_handler, encode_next_token, parse_pagination, require_context
from common.response_utils import success_response
from common.sqs_utils import process_batch

NOTIFICATIONS_TABLE = os.environ.get("NOTIFICATIONS_TABLE", "openfsm-notifications")
RETENTION_DAYS = 30

STATUS_ES = {
    "CREATED": "Nueva", "SCHEDULED": "Agendada", "DISPATCHED": "Despachada", "IN_PROGRESS": "En curso",
    "COMPLETED": "Completada", "CANCELLED": "Cancelada", "EN_ROUTE": "En camino", "AVAILABLE": "Disponible",
    "ON_DUTY": "En servicio", "ON_LEAVE": "De licencia", "OFFLINE": "Fuera de turno",
}


def _short(entity_id) -> str:
    return str(entity_id or "").split("#")[-1]


def build_notification(m: dict):
    """Devuelve (severity, title, detail) o None si el evento no genera notificación."""
    t = m.get("event_type")
    if t == "WorkOrderCreated":
        severity = "CRITICAL" if m.get("priority") == "EMERGENCY" else "WARNING" if m.get("priority") == "HIGH" else "INFO"
        return severity, f"Nueva orden {_short(m.get('workorder_id'))}", m.get("title", "")
    if t == "WorkOrderStatusChanged":
        new = m.get("new_status")
        return ("SUCCESS" if new == "COMPLETED" else "INFO",
                f"Orden {_short(m.get('workorder_id'))} → {STATUS_ES.get(new, new)}", m.get("title", ""))
    if t == "VisitScheduled":
        return "INFO", f"Visita agendada para {_short(m.get('workorder_id'))}", f"Inicio {m.get('scheduled_start', '')[:16].replace('T', ' ')} UTC"
    if t == "VisitStatusChanged":
        status = m.get("visit_status")
        return "INFO", f"Técnico {STATUS_ES.get(status, status).lower()}", f"Visita {_short(m.get('visit_id'))}"
    if t == "VisitCompleted":
        return ("SUCCESS", f"Visita {_short(m.get('visit_id'))} completada",
                f"Checklist {m.get('checklist_passed', 0)}/{m.get('checklist_total', 0)} · "
                f"{m.get('evidence_count', 0)} evidencias · {'con' if m.get('has_signature') else 'sin'} firma")
    if t == "EvidenceUploaded":
        kind = "Firma" if m.get("kind") == "SIGNATURE" else "Foto"
        return "INFO", f"{kind} subida a S3", f"Visita {_short(m.get('visit_id'))}"
    if t == "InventoryLowStock":
        return ("WARNING", f"Stock bajo: {m.get('sku')}",
                f"Quedan {m.get('remaining_stock')} (reorden en {m.get('reorder_point')})")
    if t == "PartConsumed":
        return "INFO", f"{m.get('quantity')} × {m.get('sku')} usados", f"Orden {_short(m.get('workorder_id'))}"
    if t == "TechnicianStatusChanged":
        return "INFO", f"{m.get('technician_name') or 'Técnico'}: {STATUS_ES.get(m.get('new_status'), m.get('new_status'))}", ""
    return None


def _handle(message: dict) -> None:
    tenant_id = message.get("tenant_id")
    event_id = message.get("event_id")
    built = build_notification(message)
    if not tenant_id or not event_id or not built:
        print(f"Skipping event {message.get('event_type')}")
        return
    severity, title, detail = built
    occurred = message.get("occurred_at") or datetime.now(timezone.utc).isoformat()
    item = {
        "tenant_id": tenant_id,
        # Ordenable por fecha y único por evento (idempotente ante reentregas de SQS)
        "id": f"NOTIF#{occurred}#{event_id[:12]}",
        "event_type": message.get("event_type"),
        "severity": severity,
        "title": title[:200],
        "detail": str(detail)[:400],
        "entity_id": message.get("workorder_id") or message.get("visit_id") or message.get("part_id")
        or message.get("technician_id") or "",
        "created_at": occurred,
        "expires_at": int(time.time()) + RETENTION_DAYS * 86400,  # TTL de DynamoDB
    }
    try:
        put_item(NOTIFICATIONS_TABLE, item, only_if_new=True)
    except Exception as exc:
        if not is_conditional_failure(exc):
            raise


def process_sqs_event(event, context):
    return process_batch(event, _handle)


@api_handler
def list_notifications(event, context):
    """GET /notifications?limit=&next_token="""
    ctx = require_context(event)
    limit, start_key = parse_pagination(event, ctx["tenant_id"])
    items, last_key = query_by_tenant(NOTIFICATIONS_TABLE, ctx["tenant_id"], limit, start_key, newest_first=True)
    for it in items:
        it.pop("expires_at", None)
    return success_response({"items": items, "count": len(items), "next_token": encode_next_token(last_key)})
