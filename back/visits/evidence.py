"""
Procesador de evidencias (evento S3 ObjectCreated del bucket de evidencias).

Cuando el técnico sube una foto o la firma con la URL prefirmada, S3 invoca esta
Lambda: registra la clave en la visita (fuente de verdad del servidor, no del
cliente) y publica EvidenceUploaded en SNS.
Clave esperada: <tenant_id>/visits/<visit_id>/<timestamp>_<archivo>
"""
import os
import sys
from datetime import datetime, timezone
from urllib.parse import unquote_plus

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.db_utils import get_item, update_fields
from common.event_utils import EVIDENCE_UPLOADED, safe_publish

VISITS_TABLE = os.environ.get("VISITS_TABLE", "openfsm-visits")


def process_s3_event(event, context):
    processed = 0
    for record in event.get("Records", []):
        key = unquote_plus(record.get("s3", {}).get("object", {}).get("key", ""))
        size = record.get("s3", {}).get("object", {}).get("size", 0)
        parts = key.split("/")
        if len(parts) != 4 or parts[1] != "visits":
            print(f"Ignoring unexpected key: {key}")
            continue
        tenant_id, _, visit_id, file_name = parts

        visit = get_item(VISITS_TABLE, tenant_id, visit_id)
        if not visit:
            print(f"Visit {visit_id} not found for tenant {tenant_id}; key {key}")
            continue

        is_signature = file_name.split("_", 1)[-1].startswith("signature")
        now = datetime.now(timezone.utc).isoformat()
        if is_signature:
            fields = {"signature_key": key, "updated_at": now}
        else:
            photos = list(visit.get("evidence_photos") or [])
            if key in photos:
                continue  # entrega duplicada del evento
            fields = {"evidence_photos": photos + [key], "updated_at": now}
        update_fields(VISITS_TABLE, tenant_id, visit_id, fields)

        safe_publish(EVIDENCE_UPLOADED, tenant_id, {
            "visit_id": visit_id,
            "workorder_id": visit.get("workorder_id"),
            "object_key": key,
            "kind": "SIGNATURE" if is_signature else "PHOTO",
            "size_bytes": size,
        })
        processed += 1
    print(f"Processed {processed} evidence objects")
    return {"processed": processed}
