import os
import sys
import json
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.auth_utils import extract_context
from common.response_utils import success_response, error_response
from common.db_utils import get_table, query_by_tenant, get_item
from common.event_utils import publish_event

WORKORDERS_TABLE = os.environ.get("WORKORDERS_TABLE", "openfsm-workorders")
EVENTS_TOPIC_ARN = os.environ.get("EVENTS_TOPIC_ARN", "")


def list_workorders(event, context):
    """
    GET /workorders
    Lists work orders for authenticated tenant.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    query_params = event.get("queryStringParameters") or {}
    limit = int(query_params.get("limit", 50))

    try:
        items, last_key = query_by_tenant(WORKORDERS_TABLE, tenant_id, limit=limit)
        return success_response({
            "items": items,
            "count": len(items),
            "next_token": last_key
        })
    except Exception as exc:
        return error_response(f"Failed to fetch work orders: {str(exc)}", 500)


def create_workorder(event, context):
    """
    POST /workorders
    Creates a new field service work order and emits WorkOrderCreated to SNS.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return error_response("Invalid JSON body", 400)

    title = body.get("title")
    customer_id = body.get("customer_id")
    if not title or not customer_id:
        return error_response("title and customer_id are required", 400)

    now = datetime.now(timezone.utc).isoformat()
    workorder_id = body.get("id") or f"WO#{uuid.uuid4().hex[:12]}"

    item = {
        "tenant_id": tenant_id,
        "id": workorder_id,
        "customer_id": customer_id,
        "assigned_technician_id": body.get("assigned_technician_id", ""),
        "title": title,
        "description": body.get("description", ""),
        "priority": body.get("priority", "NORMAL"),
        "status": body.get("status", "CREATED"),
        "sla_due_date": body.get("sla_due_date", ""),
        "estimated_hours": float(body.get("estimated_hours", 2.0)),
        "created_by": ctx.get("user_id", "dispatcher"),
        "created_at": now,
        "updated_at": now
    }

    try:
        table = get_table(WORKORDERS_TABLE)
        table.put_item(Item=item)

        # Publish Event to SNS
        publish_event(
            topic_arn=EVENTS_TOPIC_ARN,
            event_type="WorkOrderCreated",
            tenant_id=tenant_id,
            payload={
                "event_type": "WorkOrderCreated",
                "tenant_id": tenant_id,
                "workorder_id": workorder_id,
                "customer_id": customer_id,
                "assigned_technician_id": item["assigned_technician_id"],
                "title": title,
                "priority": item["priority"],
                "timestamp": now
            }
        )

        return success_response(item, 201, "Work order created and event dispatched")
    except Exception as exc:
        return error_response(f"Failed to create work order: {str(exc)}", 500)


def get_workorder_by_id(event, context):
    """
    GET /workorders/{id}
    Retrieves work order by ID.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    path_params = event.get("pathParameters") or {}
    workorder_id = path_params.get("id")
    if not workorder_id:
        return error_response("Work order id is required", 400)

    try:
        item = get_item(WORKORDERS_TABLE, tenant_id, workorder_id)
        if not item:
            return error_response(f"Work order {workorder_id} not found in tenant {tenant_id}", 404, "NOT_FOUND")
        return success_response(item)
    except Exception as exc:
        return error_response(f"Failed to fetch work order: {str(exc)}", 500)


def update_workorder_status(event, context):
    """
    PUT /workorders/{id}/status
    Updates work order status and publishes WorkOrderStatusChanged event to SNS.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    path_params = event.get("pathParameters") or {}
    workorder_id = path_params.get("id")
    if not workorder_id:
        return error_response("Work order id is required", 400)

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return error_response("Invalid JSON body", 400)

    new_status = body.get("status")
    if not new_status:
        return error_response("status is required", 400)

    try:
        existing = get_item(WORKORDERS_TABLE, tenant_id, workorder_id)
        if not existing:
            return error_response(f"Work order {workorder_id} not found", 404)

        now = datetime.now(timezone.utc).isoformat()
        old_status = existing.get("status")
        existing["status"] = new_status
        existing["updated_at"] = now
        if "assigned_technician_id" in body:
            existing["assigned_technician_id"] = body["assigned_technician_id"]

        table = get_table(WORKORDERS_TABLE)
        table.put_item(Item=existing)

        # Publish Event to SNS
        publish_event(
            topic_arn=EVENTS_TOPIC_ARN,
            event_type="WorkOrderStatusChanged",
            tenant_id=tenant_id,
            payload={
                "event_type": "WorkOrderStatusChanged",
                "tenant_id": tenant_id,
                "workorder_id": workorder_id,
                "old_status": old_status,
                "new_status": new_status,
                "timestamp": now
            }
        )

        return success_response(existing, 200, "Work order status updated and event published")
    except Exception as exc:
        return error_response(f"Failed to update work order: {str(exc)}", 500)

