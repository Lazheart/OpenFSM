import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.db_utils import get_item, put_item, query_by_tenant, update_fields
from common.event_utils import WORK_ORDER_CREATED, WORK_ORDER_STATUS_CHANGED, safe_publish
from common.http_utils import (
    ApiError, api_handler, encode_next_token, optional_str, parse_body, parse_number, parse_pagination,
    path_id, require_context, require_enum, require_str,
)
from common.response_utils import success_response

WORKORDERS_TABLE = os.environ.get("WORKORDERS_TABLE", "openfsm-workorders")
PRIORITIES = ("LOW", "NORMAL", "HIGH", "EMERGENCY")
STATUSES = ("CREATED", "SCHEDULED", "DISPATCHED", "IN_PROGRESS", "COMPLETED", "CANCELLED")
DEFAULT_SLA_HOURS = {"EMERGENCY": 4, "HIGH": 12, "NORMAL": 24, "LOW": 48}


def _iso(value: str, field: str) -> str:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).isoformat()
    except Exception:
        raise ApiError(f"{field} must be an ISO-8601 datetime", 400)


@api_handler
def list_workorders(event, context):
    """GET /workorders?limit=&next_token="""
    ctx = require_context(event)
    limit, start_key = parse_pagination(event, ctx["tenant_id"])
    items, last_key = query_by_tenant(WORKORDERS_TABLE, ctx["tenant_id"], limit, start_key)
    return success_response({"items": items, "count": len(items), "next_token": encode_next_token(last_key)})


@api_handler
def create_workorder(event, context):
    """
    POST /workorders (ADMIN, DISPATCHER)
    Persiste la orden y publica WorkOrderCreated. Si trae técnico asignado, el
    worker de Visits la auto-agenda (SNS -> SQS -> visitsWorker).
    """
    ctx = require_context(event, roles=("ADMIN", "DISPATCHER"))
    tenant_id = ctx["tenant_id"]
    body = parse_body(event)

    priority = require_enum(body.get("priority", "NORMAL"), PRIORITIES, "priority")
    now_dt = datetime.now(timezone.utc)
    now = now_dt.isoformat()
    sla = body.get("sla_due_date")
    sla_due = _iso(sla, "sla_due_date") if sla else (now_dt + timedelta(hours=DEFAULT_SLA_HOURS[priority])).isoformat()
    technician_id = optional_str(body, "assigned_technician_id", max_len=64)

    item = {
        "tenant_id": tenant_id,
        "id": f"WO#{uuid.uuid4().hex[:12]}",
        "customer_id": require_str(body, "customer_id", 64),
        "assigned_technician_id": technician_id,
        "title": require_str(body, "title", 200),
        "description": optional_str(body, "description", max_len=2000),
        "priority": priority,
        "status": "CREATED",  # el estado inicial lo decide el servidor
        "sla_due_date": sla_due,
        "estimated_hours": parse_number(body.get("estimated_hours", 2), "estimated_hours", 0.25, 72),
        "created_by": ctx.get("user_id") or "unknown",
        "created_at": now,
        "updated_at": now,
    }
    put_item(WORKORDERS_TABLE, item, only_if_new=True)

    safe_publish(WORK_ORDER_CREATED, tenant_id, {
        "workorder_id": item["id"],
        "customer_id": item["customer_id"],
        "assigned_technician_id": technician_id,
        "title": item["title"],
        "priority": priority,
        "estimated_hours": item["estimated_hours"],
        "sla_due_date": sla_due,
    })
    return success_response(item, 201, "Work order created and event published")


@api_handler
def get_workorder_by_id(event, context):
    """GET /workorders/{id}"""
    ctx = require_context(event)
    workorder_id = path_id(event)
    item = get_item(WORKORDERS_TABLE, ctx["tenant_id"], workorder_id)
    if not item:
        raise ApiError(f"Work order {workorder_id} not found", 404, "NOT_FOUND")
    return success_response(item)


@api_handler
def update_workorder_status(event, context):
    """
    PUT /workorders/{id}/status   Body: { status, assigned_technician_id? }
    Cambiar el técnico asignado o cancelar requiere ADMIN o DISPATCHER.
    """
    ctx = require_context(event)
    tenant_id = ctx["tenant_id"]
    workorder_id = path_id(event)
    body = parse_body(event)
    new_status = require_enum(body.get("status"), STATUSES, "status")

    managers = ("ADMIN", "DISPATCHER")
    if ("assigned_technician_id" in body or new_status == "CANCELLED") and ctx.get("role") not in managers:
        raise ApiError("Solo ADMIN o DISPATCHER pueden reasignar o cancelar órdenes", 403, "FORBIDDEN")

    existing = get_item(WORKORDERS_TABLE, tenant_id, workorder_id)
    if not existing:
        raise ApiError(f"Work order {workorder_id} not found", 404, "NOT_FOUND")

    fields = {"status": new_status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if "assigned_technician_id" in body:
        fields["assigned_technician_id"] = optional_str(body, "assigned_technician_id", max_len=64)
    updated = update_fields(WORKORDERS_TABLE, tenant_id, workorder_id, fields)
    if not updated:
        raise ApiError(f"Work order {workorder_id} not found", 404, "NOT_FOUND")

    if existing.get("status") != new_status:
        safe_publish(WORK_ORDER_STATUS_CHANGED, tenant_id, {
            "workorder_id": workorder_id,
            "title": updated.get("title"),
            "old_status": existing.get("status"),
            "new_status": new_status,
            "changed_by": ctx.get("user_id"),
        })
    return success_response(updated, 200, "Work order status updated")
