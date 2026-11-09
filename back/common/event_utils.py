"""
Bus de eventos de OpenFSM (EDA).

Productores publican en un único tópico SNS (FSMEventsTopic) con los atributos
eventType y tenantId. Cada cola SQS se suscribe con una FilterPolicy por eventType,
así cada consumidor solo recibe lo que le interesa (fan-out + filtrado).
"""
import json
import os
import uuid
from datetime import datetime, timezone

import boto3
from botocore.config import Config

from common.response_utils import DecimalEncoder

# Catálogo de eventos (ver docs/ARCHITECTURE.md)
WORK_ORDER_CREATED = "WorkOrderCreated"
WORK_ORDER_STATUS_CHANGED = "WorkOrderStatusChanged"
VISIT_SCHEDULED = "VisitScheduled"
VISIT_STATUS_CHANGED = "VisitStatusChanged"
VISIT_COMPLETED = "VisitCompleted"
EVIDENCE_UPLOADED = "EvidenceUploaded"
PART_CONSUMED = "PartConsumed"
INVENTORY_LOW_STOCK = "InventoryLowStock"
TECHNICIAN_STATUS_CHANGED = "TechnicianStatusChanged"

_sns = None
_s3 = None


def _region():
    return os.environ.get("AWS_REGION", "us-east-1")


def get_sns_client():
    global _sns
    if _sns is None:
        _sns = boto3.client("sns", region_name=_region())
    return _sns


def get_s3_client():
    global _s3
    if _s3 is None:
        # Endpoint regional + SigV4: evita URLs prefirmadas que fallan con redirect en buckets nuevos
        _s3 = boto3.client(
            "s3",
            region_name=_region(),
            endpoint_url=f"https://s3.{_region()}.amazonaws.com",
            config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
        )
    return _s3


def publish_event(event_type: str, tenant_id: str, payload: dict, topic_arn: str = None) -> dict:
    """
    Publica un evento de dominio. El cuerpo siempre incluye event_id, event_type,
    tenant_id y occurred_at para que los consumidores sean idempotentes y trazables.
    """
    topic_arn = topic_arn or os.environ.get("EVENTS_TOPIC_ARN", "")
    message = {
        "event_id": uuid.uuid4().hex,
        "event_type": event_type,
        "tenant_id": tenant_id,
        "occurred_at": datetime.now(timezone.utc).isoformat(),
        **payload,
    }
    if not topic_arn:
        print(f"[event skipped: no topic] {event_type} {tenant_id}")
        return {"status": "skipped"}

    return get_sns_client().publish(
        TopicArn=topic_arn,
        Message=json.dumps(message, cls=DecimalEncoder),
        MessageAttributes={
            "eventType": {"DataType": "String", "StringValue": event_type},
            "tenantId": {"DataType": "String", "StringValue": tenant_id},
        },
    )


def safe_publish(event_type: str, tenant_id: str, payload: dict) -> None:
    """
    Publica sin romper la respuesta HTTP si SNS falla: el registro ya se guardó
    en DynamoDB y el error queda en CloudWatch.
    """
    try:
        publish_event(event_type, tenant_id, payload)
    except Exception as exc:
        print(f"[event publish failed] {event_type} tenant={tenant_id}: {exc}")


def generate_presigned_upload_url(bucket_name: str, object_key: str, content_type: str, expires_in: int = 900) -> str:
    """URL PUT prefirmada. El Content-Type queda firmado: el cliente debe enviar el mismo."""
    return get_s3_client().generate_presigned_url(
        ClientMethod="put_object",
        Params={"Bucket": bucket_name, "Key": object_key, "ContentType": content_type},
        ExpiresIn=expires_in,
    )


def generate_presigned_download_url(bucket_name: str, object_key: str, expires_in: int = 900) -> str:
    return get_s3_client().generate_presigned_url(
        ClientMethod="get_object",
        Params={"Bucket": bucket_name, "Key": object_key},
        ExpiresIn=expires_in,
    )
