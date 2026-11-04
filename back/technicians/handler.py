import os
import sys
import json
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.auth_utils import extract_context
from common.response_utils import success_response, error_response
from common.db_utils import get_table, query_by_tenant, get_item, delete_item

TECHNICIANS_TABLE = os.environ.get("TECHNICIANS_TABLE", "openfsm-technicians")


def list_technicians(event, context):
    """
    GET /technicians
    Lists technicians for authenticated tenant.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    query_params = event.get("queryStringParameters") or {}
    limit = int(query_params.get("limit", 50))

    try:
        items, last_key = query_by_tenant(TECHNICIANS_TABLE, tenant_id, limit=limit)
        return success_response({
            "items": items,
            "count": len(items),
            "next_token": last_key
        })
    except Exception as exc:
        return error_response(f"Failed to fetch technicians: {str(exc)}", 500)


def create_technician(event, context):
    """
    POST /technicians
    Registers a new field technician for the tenant.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return error_response("Invalid JSON body", 400)

    name = body.get("name")
    if not name:
        return error_response("name is required", 400)

    now = datetime.now(timezone.utc).isoformat()
    tech_id = body.get("id") or f"TECH#{uuid.uuid4().hex[:12]}"

    item = {
        "tenant_id": tenant_id,
        "id": tech_id,
        "name": name,
        "email": body.get("email", ""),
        "phone": body.get("phone", ""),
        "specialty": body.get("specialty", "General"),
        "skills": body.get("skills", ["Inspection", "Maintenance"]),
        "certification_level": body.get("certification_level", "LEVEL_1"),
        "vehicle_id": body.get("vehicle_id", ""),
        "status": body.get("status", "AVAILABLE"),
        "current_latitude": str(body.get("current_latitude", "0.0")),
        "current_longitude": str(body.get("current_longitude", "0.0")),
        "created_at": now,
        "updated_at": now
    }

    try:
        table = get_table(TECHNICIANS_TABLE)
        table.put_item(Item=item)
        return success_response(item, 201, "Technician created successfully")
    except Exception as exc:
        return error_response(f"Failed to create technician: {str(exc)}", 500)


def get_technician_by_id(event, context):
    """
    GET /technicians/{id}
    Retrieves technician profile by ID.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    path_params = event.get("pathParameters") or {}
    tech_id = path_params.get("id")
    if not tech_id:
        return error_response("Technician id is required", 400)

    try:
        item = get_item(TECHNICIANS_TABLE, tenant_id, tech_id)
        if not item:
            return error_response(f"Technician {tech_id} not found in tenant {tenant_id}", 404, "NOT_FOUND")
        return success_response(item)
    except Exception as exc:
        return error_response(f"Failed to fetch technician: {str(exc)}", 500)


def update_technician_status(event, context):
    """
    PUT /technicians/{id}/status
    Updates technician operational status and coordinates.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    path_params = event.get("pathParameters") or {}
    tech_id = path_params.get("id")
    if not tech_id:
        return error_response("Technician id is required", 400)

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return error_response("Invalid JSON body", 400)

    status = body.get("status")
    if not status:
        return error_response("status is required", 400)

    try:
        table = get_table(TECHNICIANS_TABLE)
        existing = get_item(TECHNICIANS_TABLE, tenant_id, tech_id)
        if not existing:
            return error_response(f"Technician {tech_id} not found", 404)

        now = datetime.now(timezone.utc).isoformat()
        existing["status"] = status
        existing["updated_at"] = now
        if "current_latitude" in body:
            existing["current_latitude"] = str(body["current_latitude"])
        if "current_longitude" in body:
            existing["current_longitude"] = str(body["current_longitude"])

        table.put_item(Item=existing)
        return success_response(existing, 200, "Technician status updated")
    except Exception as exc:
        return error_response(f"Failed to update technician: {str(exc)}", 500)

