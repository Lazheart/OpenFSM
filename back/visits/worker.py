"""
Worker SQS de Visits.

Consume (FilterPolicy): WorkOrderCreated
Si la orden llega con técnico asignado, agenda automáticamente la primera visita
en la siguiente hora en punto, con la duración estimada de la orden, y publica
VisitScheduled. Las órdenes sin técnico quedan en el tablero de despacho.
"""
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.db_utils import is_conditional_failure, put_item
from common.event_utils import WORK_ORDER_CREATED
from common.sqs_utils import process_batch
from visits.handler import VISITS_TABLE, build_visit, publish_scheduled


def _handle(message: dict) -> None:
    if message.get("event_type") != WORK_ORDER_CREATED:
        print(f"Ignoring event {message.get('event_type')}")
        return
    tenant_id = message.get("tenant_id")
    workorder_id = message.get("workorder_id")
    technician_id = message.get("assigned_technician_id")
    if not tenant_id or not workorder_id:
        print(f"Malformed event: {message}")
        return
    if not technician_id:
        print(f"{workorder_id} has no technician; left for dispatch board")
        return
    start = (datetime.now(timezone.utc) + timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    hours = float(message.get("estimated_hours") or 1)
    end = start + timedelta(hours=max(0.5, min(hours, 12)))

    visit = build_visit(
        tenant_id, workorder_id, technician_id, start.isoformat(), end.isoformat(),
        notes=f"Auto-agendada por el evento WorkOrderCreated: {message.get('title', '')}"[:500],
    )
    # Id determinístico por evento: si SQS reentrega el mensaje, el put condicional
    # falla y no se duplica la visita (idempotencia).
    event_id = message.get("event_id")
    if event_id:
        visit["id"] = f"VISIT#auto-{event_id[:12]}"
    try:
        put_item(VISITS_TABLE, visit, only_if_new=True)
    except Exception as exc:
        if is_conditional_failure(exc):
            print(f"Duplicate delivery for {workorder_id}; skipping")
            return
        raise
    publish_scheduled(visit)
    print(f"Auto-scheduled {visit['id']} for {workorder_id}")


def process_sqs_event(event, context):
    return process_batch(event, _handle)
