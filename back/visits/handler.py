import os
import sys
import json
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.auth_utils import extract_context
from common.response_utils import success_response, error_response
from common.db_utils import get_table, query_by_tenant, get_item
from common.event_utils import generate_presigned_upload_url, generate_presigned_download_url

VISITS_TABLE = os.environ.get("VISITS_TABLE", "openfsm-visits")
EVIDENCE_BUCKET = os.environ.get("EVIDENCE_BUCKET", "openfsm-evidence")


def list_visits(event, context):
    """
    GET /visits
    Lists field visits for authenticated tenant.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    query_params = event.get("queryStringParameters") or {}
    limit = int(query_params.get("limit", 50))

    try:
        items, last_key = query_by_tenant(VISITS_TABLE, tenant_id, limit=limit)
        return success_response({
            "items": items,
            "count": len(items),
            "next_token": last_key
        })
    except Exception as exc:
        return error_response(f"Failed to fetch visits: {str(exc)}", 500)


def create_visit(event, context):
    """
    POST /visits
    Schedules a new technician field visit.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return error_response("Invalid JSON body", 400)

    workorder_id = body.get("workorder_id")
    technician_id = body.get("technician_id")
    if not workorder_id:
        return error_response("workorder_id is required", 400)

    now = datetime.now(timezone.utc).isoformat()
    visit_id = body.get("id") or f"VISIT#{uuid.uuid4().hex[:12]}"

    item = {
        "tenant_id": tenant_id,
        "id": visit_id,
        "workorder_id": workorder_id,
        "technician_id": technician_id or "",
        "scheduled_start": body.get("scheduled_start", now),
        "scheduled_end": body.get("scheduled_end", ""),
        "actual_start": body.get("actual_start", ""),
        "actual_end": body.get("actual_end", ""),
        "status": body.get("status", "SCHEDULED"),
        "notes": body.get("notes", ""),
        "checklist": body.get("checklist", [
            {"item": "Initial safety check", "passed": False},
            {"item": "Equipment inspection", "passed": False},
            {"item": "Customer verification", "passed": False}
        ]),
        "evidence_photos": body.get("evidence_photos", []),
        "signature_key": body.get("signature_key", ""),
        "created_at": now,
        "updated_at": now
    }

    try:
        table = get_table(VISITS_TABLE)
        table.put_item(Item=item)
        return success_response(item, 201, "Visit scheduled successfully")
    except Exception as exc:
        return error_response(f"Failed to schedule visit: {str(exc)}", 500)


def get_visit_by_id(event, context):
    """
    GET /visits/{id}
    Retrieves visit details by ID.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    path_params = event.get("pathParameters") or {}
    visit_id = path_params.get("id")
    if not visit_id:
        return error_response("Visit id is required", 400)

    try:
        item = get_item(VISITS_TABLE, tenant_id, visit_id)
        if not item:
            return error_response(f"Visit {visit_id} not found in tenant {tenant_id}", 404, "NOT_FOUND")
        return success_response(item)
    except Exception as exc:
        return error_response(f"Failed to fetch visit: {str(exc)}", 500)


def complete_visit(event, context):
    """
    PUT /visits/{id}/complete
    Marks visit as completed, records checklist, notes, and evidence references.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    path_params = event.get("pathParameters") or {}
    visit_id = path_params.get("id")
    if not visit_id:
        return error_response("Visit id is required", 400)

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        body = {}

    try:
        table = get_table(VISITS_TABLE)
        existing = get_item(VISITS_TABLE, tenant_id, visit_id)
        if not existing:
            return error_response(f"Visit {visit_id} not found", 404)

        now = datetime.now(timezone.utc).isoformat()
        existing["status"] = "COMPLETED"
        existing["actual_end"] = now
        existing["updated_at"] = now
        if "notes" in body:
            existing["notes"] = body["notes"]
        if "checklist" in body:
            existing["checklist"] = body["checklist"]
        if "signature_key" in body:
            existing["signature_key"] = body["signature_key"]
        if "evidence_photos" in body:
            existing["evidence_photos"] = body["evidence_photos"]

        table.put_item(Item=existing)
        return success_response(existing, 200, "Visit completed successfully")
    except Exception as exc:
        return error_response(f"Failed to complete visit: {str(exc)}", 500)


def get_evidence_upload_url(event, context):
    """
    POST /visits/evidence-url
    Generates an S3 presigned PUT URL for secure technician evidence/photo upload.
    Body: { "visit_id": "...", "file_name": "signature.png", "file_type": "image/png" }
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return error_response("Invalid JSON body", 400)

    visit_id = body.get("visit_id")
    file_name = body.get("file_name", "evidence.jpg")
    if not visit_id:
        return error_response("visit_id is required", 400)

    timestamp = int(datetime.now(timezone.utc).timestamp())
    object_key = f"{tenant_id}/visits/{visit_id}/{timestamp}_{file_name}"

    try:
        upload_url = generate_presigned_upload_url(
            bucket_name=EVIDENCE_BUCKET,
            object_key=object_key,
            expires_in=3600
        )
        return success_response({
            "upload_url": upload_url,
            "object_key": object_key,
            "bucket": EVIDENCE_BUCKET,
            "expires_in_seconds": 3600
        }, 200, "Presigned upload URL generated")
    except Exception as exc:
        return error_response(f"Failed to generate presigned URL: {str(exc)}", 500)

