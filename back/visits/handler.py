import os
import re
import sys
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.db_utils import get_item, put_item, query_by_tenant, update_fields
from common.event_utils import (
    VISIT_COMPLETED, VISIT_SCHEDULED, VISIT_STATUS_CHANGED, generate_presigned_upload_url, safe_publish,
)
from common.http_utils import (
    ApiError, api_handler, encode_next_token, optional_str, parse_body, parse_pagination, path_id,
    require_context, require_enum, require_str,
)
from common.response_utils import success_response

VISITS_TABLE = os.environ.get("VISITS_TABLE", "openfsm-visits")
EVIDENCE_BUCKET = os.environ.get("EVIDENCE_BUCKET", "")
FIELD_STATUSES = ("EN_ROUTE", "IN_PROGRESS")
ALLOWED_UPLOAD_TYPES = ("image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf")
DEFAULT_CHECKLIST = [
    {"item": "EPP verificado", "passed": False},
    {"item": "Diagnóstico del equipo", "passed": False},
    {"item": "Conformidad del cliente", "passed": False},
]


def _iso(value, field: str, required: bool = False) -> str:
    if not value:
        if required:
            raise ApiError(f"{field} is required", 400)
        return ""
    try:
        return datetime.fromisoformat(str(value).replace("Z", "+00:00")).isoformat()
    except Exception:
        raise ApiError(f"{field} must be an ISO-8601 datetime", 400)


def _validate_checklist(value) -> list:
    if not isinstance(value, list) or len(value) > 30:
        raise ApiError("checklist must be a list (max 30 items)", 400)
    out = []
    for entry in value:
        if not isinstance(entry, dict) or not isinstance(entry.get("item"), str):
            raise ApiError("checklist items must be {item: string, passed: bool}", 400)
        out.append({"item": entry["item"][:200], "passed": bool(entry.get("passed"))})
    return out


def _validate_keys(keys, tenant_id: str, visit_id: str, field: str) -> list:
    """Solo se aceptan objetos S3 dentro del prefijo del tenant y de la visita."""
    if not isinstance(keys, list) or len(keys) > 30:
        raise ApiError(f"{field} must be a list (max 30)", 400)
    prefix = f"{tenant_id}/visits/{visit_id}/"
    for k in keys:
        if not isinstance(k, str) or not k.startswith(prefix):
            raise ApiError(f"{field} contains a key outside {prefix}", 400)
    return keys


@api_handler
def list_visits(event, context):
    """GET /visits?limit=&next_token="""
    ctx = require_context(event)
    limit, start_key = parse_pagination(event, ctx["tenant_id"])
    items, last_key = query_by_tenant(VISITS_TABLE, ctx["tenant_id"], limit, start_key)
    return success_response({"items": items, "count": len(items), "next_token": encode_next_token(last_key)})


def build_visit(tenant_id: str, workorder_id: str, technician_id: str, start: str, end: str, notes: str = "") -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "tenant_id": tenant_id,
        "id": f"VISIT#{uuid.uuid4().hex[:12]}",
        "workorder_id": workorder_id,
        "technician_id": technician_id,
        "scheduled_start": start,
        "scheduled_end": end,
        "actual_start": "",
        "actual_end": "",
        "status": "SCHEDULED",
        "notes": notes,
        "checklist": [dict(c) for c in DEFAULT_CHECKLIST],
        "evidence_photos": [],
        "signature_key": "",
        "created_at": now,
        "updated_at": now,
    }


def publish_scheduled(visit: dict) -> None:
    safe_publish(VISIT_SCHEDULED, visit["tenant_id"], {
        "visit_id": visit["id"],
        "workorder_id": visit["workorder_id"],
        "technician_id": visit["technician_id"],
        "visit_status": "SCHEDULED",
        "scheduled_start": visit["scheduled_start"],
        "scheduled_end": visit["scheduled_end"],
    })


@api_handler
def create_visit(event, context):
    """
    POST /visits (ADMIN, DISPATCHER)
    Agenda una visita y publica VisitScheduled; el worker de Work Orders pasa
    la orden a SCHEDULED y le asigna el técnico.
    """
    ctx = require_context(event, roles=("ADMIN", "DISPATCHER"))
    body = parse_body(event)
    start = _iso(body.get("scheduled_start"), "scheduled_start", required=True)
    end = _iso(body.get("scheduled_end"), "scheduled_end")
    if end and end <= start:
        raise ApiError("scheduled_end must be after scheduled_start", 400)

    visit = build_visit(
        ctx["tenant_id"],
        require_str(body, "workorder_id", 64),
        require_str(body, "technician_id", 64),
        start,
        end,
        optional_str(body, "notes", max_len=2000),
    )
    put_item(VISITS_TABLE, visit, only_if_new=True)
    publish_scheduled(visit)
    return success_response(visit, 201, "Visit scheduled successfully")


@api_handler
def get_visit_by_id(event, context):
    """GET /visits/{id}"""
    ctx = require_context(event)
    visit_id = path_id(event)
    item = get_item(VISITS_TABLE, ctx["tenant_id"], visit_id)
    if not item:
        raise ApiError(f"Visit {visit_id} not found", 404, "NOT_FOUND")
    return success_response(item)


@api_handler
def update_visit_status(event, context):
    """
    PUT /visits/{id}/status   Body: { status: EN_ROUTE | IN_PROGRESS }
    Check-in del técnico. Publica VisitStatusChanged (la orden pasa a DISPATCHED / IN_PROGRESS).
    """
    ctx = require_context(event)
    tenant_id = ctx["tenant_id"]
    visit_id = path_id(event)
    status = require_enum(parse_body(event).get("status"), FIELD_STATUSES, "status")

    existing = get_item(VISITS_TABLE, tenant_id, visit_id)
    if not existing:
        raise ApiError(f"Visit {visit_id} not found", 404, "NOT_FOUND")
    if existing.get("status") == "COMPLETED":
        raise ApiError("La visita ya está completada", 409, "CONFLICT")

    now = datetime.now(timezone.utc).isoformat()
    fields = {"status": status, "updated_at": now}
    if status == "IN_PROGRESS" and not existing.get("actual_start"):
        fields["actual_start"] = now
    updated = update_fields(VISITS_TABLE, tenant_id, visit_id, fields)

    safe_publish(VISIT_STATUS_CHANGED, tenant_id, {
        "visit_id": visit_id,
        "workorder_id": existing.get("workorder_id"),
        "technician_id": existing.get("technician_id"),
        "visit_status": status,
    })
    return success_response(updated, 200, "Visit status updated")


@api_handler
def complete_visit(event, context):
    """
    PUT /visits/{id}/complete   Body: { notes?, checklist?, evidence_photos?, signature_key? }
    Cierra la visita y publica VisitCompleted (la orden pasa a COMPLETED de forma asíncrona).
    """
    ctx = require_context(event)
    tenant_id = ctx["tenant_id"]
    visit_id = path_id(event)
    body = parse_body(event)

    existing = get_item(VISITS_TABLE, tenant_id, visit_id)
    if not existing:
        raise ApiError(f"Visit {visit_id} not found", 404, "NOT_FOUND")
    if existing.get("status") == "COMPLETED":
        raise ApiError("La visita ya está completada", 409, "CONFLICT")

    now = datetime.now(timezone.utc).isoformat()
    fields = {"status": "COMPLETED", "actual_end": now, "updated_at": now}
    if not existing.get("actual_start"):
        fields["actual_start"] = existing.get("scheduled_start") or now
    if "notes" in body:
        fields["notes"] = optional_str(body, "notes", max_len=4000)
    if "checklist" in body:
        fields["checklist"] = _validate_checklist(body["checklist"])
    if "evidence_photos" in body:
        # Une lo que ya registró el procesador de S3 con lo que envía el cliente
        keys = _validate_keys(body["evidence_photos"], tenant_id, visit_id, "evidence_photos")
        fields["evidence_photos"] = sorted(set(existing.get("evidence_photos") or []) | set(keys))
    if body.get("signature_key"):
        _validate_keys([body["signature_key"]], tenant_id, visit_id, "signature_key")
        fields["signature_key"] = body["signature_key"]

    updated = update_fields(VISITS_TABLE, tenant_id, visit_id, fields, expect={"status": existing.get("status")})
    if not updated:
        raise ApiError("La visita cambió mientras se cerraba; intenta de nuevo", 409, "CONFLICT")

    checklist = updated.get("checklist") or []
    safe_publish(VISIT_COMPLETED, tenant_id, {
        "visit_id": visit_id,
        "workorder_id": updated.get("workorder_id"),
        "technician_id": updated.get("technician_id"),
        "visit_status": "COMPLETED",
        "checklist_passed": sum(1 for c in checklist if c.get("passed")),
        "checklist_total": len(checklist),
        "evidence_count": len(updated.get("evidence_photos") or []),
        "has_signature": bool(updated.get("signature_key")),
    })
    return success_response(updated, 200, "Visit completed successfully")


@api_handler
def get_evidence_upload_url(event, context):
    """
    POST /visits/evidence-url   Body: { visit_id, file_name, file_type }
    URL PUT prefirmada (15 min) bajo <tenant>/visits/<visit>/. La subida dispara
    el evento S3 ObjectCreated -> Lambda evidenceProcessor.
    """
    ctx = require_context(event)
    tenant_id = ctx["tenant_id"]
    body = parse_body(event)
    visit_id = require_str(body, "visit_id", 64)
    file_type = require_enum(body.get("file_type", "image/jpeg"), ALLOWED_UPLOAD_TYPES, "file_type")
    raw_name = optional_str(body, "file_name", "evidence.jpg", 120) or "evidence.jpg"
    file_name = re.sub(r"[^A-Za-z0-9._-]", "_", raw_name)[-80:]

    if not get_item(VISITS_TABLE, tenant_id, visit_id):
        raise ApiError(f"Visit {visit_id} not found", 404, "NOT_FOUND")
    if not EVIDENCE_BUCKET:
        raise ApiError("Evidence bucket not configured", 500, "CONFIG")

    object_key = f"{tenant_id}/visits/{visit_id}/{int(datetime.now(timezone.utc).timestamp())}_{file_name}"
    upload_url = generate_presigned_upload_url(EVIDENCE_BUCKET, object_key, file_type, expires_in=900)
    return success_response({
        "upload_url": upload_url,
        "object_key": object_key,
        "bucket": EVIDENCE_BUCKET,
        "content_type": file_type,
        "expires_in_seconds": 900,
    }, 200, "Presigned upload URL generated")
