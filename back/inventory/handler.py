import os
import sys
import uuid
from datetime import datetime, timezone
from decimal import Decimal

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from botocore.exceptions import ClientError

from common.db_utils import get_item, get_table, put_item, query_by_tenant
from common.event_utils import INVENTORY_LOW_STOCK, PART_CONSUMED, safe_publish
from common.http_utils import (
    ApiError, api_handler, encode_next_token, optional_str, parse_body, parse_number, parse_pagination,
    path_id, require_context, require_str,
)
from common.response_utils import success_response

INVENTORY_TABLE = os.environ.get("INVENTORY_TABLE", "openfsm-inventory")


@api_handler
def list_inventory(event, context):
    """GET /inventory?limit=&next_token="""
    ctx = require_context(event)
    limit, start_key = parse_pagination(event, ctx["tenant_id"])
    items, last_key = query_by_tenant(INVENTORY_TABLE, ctx["tenant_id"], limit, start_key)
    return success_response({"items": items, "count": len(items), "next_token": encode_next_token(last_key)})


@api_handler
def create_inventory_item(event, context):
    """POST /inventory (ADMIN, DISPATCHER)"""
    ctx = require_context(event, roles=("ADMIN", "DISPATCHER"))
    body = parse_body(event)
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "tenant_id": ctx["tenant_id"],
        "id": f"PART#{uuid.uuid4().hex[:12]}",
        "sku": require_str(body, "sku", 64),
        "name": require_str(body, "name", 200),
        "category": optional_str(body, "category", "General", 80) or "General",
        "unit_cost": parse_number(body.get("unit_cost", 10), "unit_cost", 0, 1_000_000),
        "unit_price": parse_number(body.get("unit_price", 25), "unit_price", 0, 1_000_000),
        "stock_quantity": parse_number(body.get("stock_quantity", 0), "stock_quantity", 0, 1_000_000, integer=True),
        "warehouse_location": optional_str(body, "warehouse_location", "Almacén principal", 120) or "Almacén principal",
        "reorder_point": parse_number(body.get("reorder_point", 10), "reorder_point", 0, 1_000_000, integer=True),
        "created_at": now,
        "updated_at": now,
    }
    put_item(INVENTORY_TABLE, item, only_if_new=True)
    return success_response(item, 201, "Inventory item created")


@api_handler
def get_inventory_item_by_id(event, context):
    """GET /inventory/{id}"""
    ctx = require_context(event)
    part_id = path_id(event)
    item = get_item(INVENTORY_TABLE, ctx["tenant_id"], part_id)
    if not item:
        raise ApiError(f"Part {part_id} not found", 404, "NOT_FOUND")
    return success_response(item)


@api_handler
def consume_inventory_part(event, context):
    """
    POST /inventory/consume   Body: { part_id, workorder_id, quantity }
    Descuento ATÓMICO con condición stock >= cantidad (antes era leer-y-reescribir:
    dos técnicos simultáneos podían dejar stock negativo). Publica PartConsumed y,
    si cruza el punto de reorden, InventoryLowStock.
    """
    ctx = require_context(event)
    tenant_id = ctx["tenant_id"]
    body = parse_body(event)
    part_id = require_str(body, "part_id", 64)
    workorder_id = require_str(body, "workorder_id", 64)
    qty = parse_number(body.get("quantity", 1), "quantity", 1, 10_000, integer=True)

    now = datetime.now(timezone.utc).isoformat()
    try:
        resp = get_table(INVENTORY_TABLE).update_item(
            Key={"tenant_id": tenant_id, "id": part_id},
            UpdateExpression="SET stock_quantity = stock_quantity - :q, updated_at = :now",
            ConditionExpression="attribute_exists(id) AND stock_quantity >= :q",
            ExpressionAttributeValues={":q": Decimal(qty), ":now": now},
            ReturnValues="ALL_NEW",
        )
    except ClientError as exc:
        if exc.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        item = get_item(INVENTORY_TABLE, tenant_id, part_id)
        if not item:
            raise ApiError(f"Part {part_id} not found", 404, "NOT_FOUND")
        raise ApiError(
            f"Stock insuficiente para {item.get('sku')}: quedan {int(item.get('stock_quantity', 0))}",
            409, "INSUFFICIENT_STOCK",
        )

    item = resp["Attributes"]
    remaining = int(item.get("stock_quantity", 0))
    reorder_point = int(item.get("reorder_point", 0))

    safe_publish(PART_CONSUMED, tenant_id, {
        "part_id": part_id,
        "sku": item.get("sku"),
        "workorder_id": workorder_id,
        "quantity": qty,
        "remaining_stock": remaining,
        "consumed_by": ctx.get("user_id"),
    })
    if remaining <= reorder_point < remaining + qty:
        safe_publish(INVENTORY_LOW_STOCK, tenant_id, {
            "part_id": part_id,
            "sku": item.get("sku"),
            "name": item.get("name"),
            "remaining_stock": remaining,
            "reorder_point": reorder_point,
        })

    return success_response({
        "part_id": part_id,
        "workorder_id": workorder_id,
        "quantity_consumed": qty,
        "remaining_stock": remaining,
        "timestamp": now,
    }, 200, "Part consumed successfully")
