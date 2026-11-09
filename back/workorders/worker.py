"""
Worker SQS de Work Orders: mantiene el estado de la orden sincronizado con
lo que ocurre en campo, sin que Visits escriba en la tabla de Work Orders.

Consume (FilterPolicy): VisitScheduled, VisitStatusChanged, VisitCompleted
"""
import os
import sys
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.db_utils import get_item, update_fields
from common.event_utils import (
    VISIT_COMPLETED, VISIT_SCHEDULED, VISIT_STATUS_CHANGED, WORK_ORDER_STATUS_CHANGED, safe_publish,
)
from common.sqs_utils import process_batch

WORKORDERS_TABLE = os.environ.get("WORKORDERS_TABLE", "openfsm-workorders")

# Estado de visita -> estado de la orden
VISIT_TO_WO = {"SCHEDULED": "SCHEDULED", "EN_ROUTE": "DISPATCHED", "IN_PROGRESS": "IN_PROGRESS", "COMPLETED": "COMPLETED"}
ORDER = ["CREATED", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED"]


def _handle(message: dict) -> None:
    event_type = message.get("event_type")
    tenant_id = message.get("tenant_id")
    workorder_id = message.get("workorder_id")
    if not tenant_id or not workorder_id:
        print(f"Skipping malformed event: {message}")
        return

    if event_type == VISIT_COMPLETED:
        target = "COMPLETED"
    elif event_type in (VISIT_SCHEDULED, VISIT_STATUS_CHANGED):
        target = VISIT_TO_WO.get(message.get("visit_status") or "SCHEDULED")
    else:
        print(f"Ignoring event {event_type}")
        return
    if not target:
        return

    wo = get_item(WORKORDERS_TABLE, tenant_id, workorder_id)
    if not wo:
        print(f"Work order {workorder_id} not found for tenant {tenant_id}; ignoring")
        return
    current = wo.get("status", "CREATED")
    # Idempotente y solo hacia adelante: no retrocede una orden ya avanzada ni toca canceladas
    if current == "CANCELLED" or (current in ORDER and ORDER.index(target) <= ORDER.index(current)):
        print(f"{workorder_id}: {current} -> {target} not applied")
        return

    fields = {"status": target, "updated_at": datetime.now(timezone.utc).isoformat()}
    technician_id = message.get("technician_id")
    if technician_id and event_type == VISIT_SCHEDULED:
        fields["assigned_technician_id"] = technician_id

    # Control optimista: si otro proceso cambió el estado entretanto, se reintenta el mensaje
    updated = update_fields(WORKORDERS_TABLE, tenant_id, workorder_id, fields, expect={"status": current})
    if not updated:
        raise RuntimeError(f"{workorder_id} changed concurrently; retrying via SQS")

    safe_publish(WORK_ORDER_STATUS_CHANGED, tenant_id, {
        "workorder_id": workorder_id,
        "title": updated.get("title"),
        "old_status": current,
        "new_status": target,
        "changed_by": f"event:{event_type}",
    })


def process_sqs_event(event, context):
    return process_batch(event, _handle)
