"""
Helpers para workers SQS con respuesta parcial de lote (ReportBatchItemFailures).

Antes los workers capturaban todas las excepciones y devolvían OK, así que los
mensajes fallidos se borraban y la DLQ nunca recibía nada. Ahora solo los
mensajes que fallan vuelven a la cola y, tras maxReceiveCount, van a la DLQ.
"""
import json
import traceback


def parse_message(record: dict) -> dict:
    """Soporta entrega SNS->SQS con RawMessageDelivery (cuerpo directo) o envuelta."""
    body = json.loads(record.get("body") or "{}")
    if isinstance(body, dict) and body.get("Type") == "Notification" and "Message" in body:
        return json.loads(body["Message"])
    return body


def process_batch(event: dict, handle_message) -> dict:
    failures = []
    records = event.get("Records", [])
    for record in records:
        message_id = record.get("messageId")
        try:
            handle_message(parse_message(record))
        except Exception:
            print(f"Failed message {message_id}:\n{traceback.format_exc()}")
            failures.append({"itemIdentifier": message_id})
    print(f"Processed {len(records) - len(failures)}/{len(records)} messages")
    return {"batchItemFailures": failures}
