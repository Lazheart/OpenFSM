import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.db_utils import get_item, put_item, query_by_tenant, update_fields
from common.event_utils import TECHNICIAN_STATUS_CHANGED, safe_publish
from common.http_utils import (
    ApiError, api_handler, encode_next_token, optional_str, parse_body, parse_number, parse_pagination,
    path_id, require_context, require_enum, require_str,
)
from common.response_utils import success_response

TECHNICIANS_TABLE = os.environ.get("TECHNICIANS_TABLE", "openfsm-technicians")
TECH_STATUSES = ("AVAILABLE", "ON_DUTY", "ON_LEAVE", "OFFLINE")
CERT_LEVELS = ("LEVEL_1", "LEVEL_2", "SENIOR", "LEAD_ENGINEER")


@api_handler
def list_technicians(event, context):
    """GET /technicians?limit=&next_token="""
    ctx = require_context(event)
    limit, start_key = parse_pagination(event, ctx["tenant_id"])
    items, last_key = query_by_tenant(TECHNICIANS_TABLE, ctx["tenant_id"], limit, start_key)
    return success_response({"items": items, "count": len(items), "next_token": encode_next_token(last_key)})


@api_handler
def create_technician(event, context):
    """POST /technicians (ADMIN, DISPATCHER)"""
    ctx = require_context(event, roles=("ADMIN", "DISPATCHER"))
    body = parse_body(event)
    skills = body.get("skills") or ["Inspection", "Maintenance"]
    if not isinstance(skills, list) or not all(isinstance(s, str) for s in skills) or len(skills) > 20:
        raise ApiError("skills must be a list of strings (max 20)", 400)

    now = datetime.now(timezone.utc).isoformat()
    item = {
        "tenant_id": ctx["tenant_id"],
        "id": f"TECH#{uuid.uuid4().hex[:12]}",
        "name": require_str(body, "name", 120),
        "email": optional_str(body, "email", max_len=200),
        "phone": optional_str(body, "phone", max_len=40),
        "specialty": optional_str(body, "specialty", "General", 100) or "General",
        "skills": [s.strip()[:60] for s in skills if s.strip()],
        "certification_level": require_enum(body.get("certification_level", "LEVEL_1"), CERT_LEVELS, "certification_level"),
        "vehicle_id": optional_str(body, "vehicle_id", max_len=40),
        "status": require_enum(body.get("status", "AVAILABLE"), TECH_STATUSES, "status"),
        "current_latitude": str(parse_number(body.get("current_latitude", 0), "current_latitude", -90, 90)),
        "current_longitude": str(parse_number(body.get("current_longitude", 0), "current_longitude", -180, 180)),
        "created_at": now,
        "updated_at": now,
    }
    put_item(TECHNICIANS_TABLE, item, only_if_new=True)
    return success_response(item, 201, "Technician created successfully")


@api_handler
def get_technician_by_id(event, context):
    """GET /technicians/{id}"""
    ctx = require_context(event)
    tech_id = path_id(event)
    item = get_item(TECHNICIANS_TABLE, ctx["tenant_id"], tech_id)
    if not item:
        raise ApiError(f"Technician {tech_id} not found", 404, "NOT_FOUND")
    return success_response(item)


@api_handler
def update_technician_status(event, context):
    """PUT /technicians/{id}/status  Body: { status, current_latitude?, current_longitude? }"""
    ctx = require_context(event)
    tech_id = path_id(event)
    body = parse_body(event)
    status = require_enum(body.get("status"), TECH_STATUSES, "status")

    fields = {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}
    if "current_latitude" in body:
        fields["current_latitude"] = str(parse_number(body["current_latitude"], "current_latitude", -90, 90))
    if "current_longitude" in body:
        fields["current_longitude"] = str(parse_number(body["current_longitude"], "current_longitude", -180, 180))

    updated = update_fields(TECHNICIANS_TABLE, ctx["tenant_id"], tech_id, fields)
    if not updated:
        raise ApiError(f"Technician {tech_id} not found", 404, "NOT_FOUND")

    safe_publish(TECHNICIAN_STATUS_CHANGED, ctx["tenant_id"], {
        "technician_id": tech_id,
        "technician_name": updated.get("name"),
        "new_status": status,
    })
    return success_response(updated, 200, "Technician status updated")
