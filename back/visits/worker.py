import os
import sys
import json
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.db_utils import get_table

VISITS_TABLE = os.environ.get("VISITS_TABLE", "openfsm-visits")


def process_sqs_event(event, context):
    """
    SQS Event Consumer Lambda:
    Processes messages forwarded by SNS Topic -> SQS Queue.
    When a WorkOrderCreated event is received, it automatically provisions an initial scheduled visit.
    """
    records = event.get("Records", [])
    processed_count = 0
    errors = []

    print(f"Visits SQS Worker triggered with {len(records)} records")

    for record in records:
        try:
            body_str = record.get("body", "{}")
            body_json = json.loads(body_str)

            # SNS message wrapper if delivered via SNS-SQS subscription
            if "Message" in body_json and "Type" in body_json:
                message_payload = json.loads(body_json["Message"])
            else:
                message_payload = body_json

            event_type = message_payload.get("event_type")
            tenant_id = message_payload.get("tenant_id")
            workorder_id = message_payload.get("workorder_id")

            print(f"Processing event {event_type} for tenant {tenant_id}, work order {workorder_id}")

            if event_type == "WorkOrderCreated" and tenant_id and workorder_id:
                # Auto-schedule visit for work order
                now = datetime.now(timezone.utc).isoformat()
                visit_id = f"VISIT#{uuid.uuid4().hex[:12]}"
                visit_item = {
                    "tenant_id": tenant_id,
                    "id": visit_id,
                    "workorder_id": workorder_id,
                    "technician_id": message_payload.get("assigned_technician_id", ""),
                    "scheduled_start": now,
                    "scheduled_end": "",
                    "actual_start": "",
                    "actual_end": "",
                    "status": "SCHEDULED",
                    "notes": f"Auto-generated from EDA event WorkOrderCreated: {message_payload.get('title', '')}",
                    "checklist": [
                        {"item": "Initial safety check", "passed": False},
                        {"item": "Equipment inspection", "passed": False},
                        {"item": "Customer verification", "passed": False}
                    ],
                    "evidence_photos": [],
                    "signature_key": "",
                    "created_at": now,
                    "updated_at": now
                }

                table = get_table(VISITS_TABLE)
                table.put_item(Item=visit_item)
                print(f"Successfully auto-created visit {visit_id} for work order {workorder_id}")
                processed_count += 1
            else:
                print(f"Skipping event type: {event_type}")

        except Exception as exc:
            print(f"Error processing SQS record: {str(exc)}")
            errors.append(str(exc))

    return {
        "status": "completed",
        "processed_count": processed_count,
        "errors_count": len(errors)
    }

