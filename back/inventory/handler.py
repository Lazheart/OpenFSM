import os
import sys
import json
import uuid
from datetime import datetime, timezone
from decimal import Decimal

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.auth_utils import extract_context
from common.response_utils import success_response, error_response
from common.db_utils import get_table, query_by_tenant, get_item, delete_item

INVENTORY_TABLE = os.environ.get("INVENTORY_TABLE", "openfsm-inventory")


def list_inventory(event, context):
    """
    GET /inventory
    Lists spare parts and equipment inventory for authenticated tenant.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    query_params = event.get("queryStringParameters") or {}
    limit = int(query_params.get("limit", 50))

    try:
        items, last_key = query_by_tenant(INVENTORY_TABLE, tenant_id, limit=limit)
        return success_response({
            "items": items,
            "count": len(items),
            "next_token": last_key
        })
    except Exception as exc:
        return error_response(f"Failed to fetch inventory: {str(exc)}", 500)


def create_inventory_item(event, context):
    """
    POST /inventory
    Creates a new spare part in the tenant inventory.
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
    sku = body.get("sku")
    if not name or not sku:
        return error_response("name and sku are required", 400)

    now = datetime.now(timezone.utc).isoformat()
    part_id = body.get("id") or f"PART#{uuid.uuid4().hex[:12]}"

    item = {
        "tenant_id": tenant_id,
        "id": part_id,
        "sku": sku,
        "name": name,
        "category": body.get("category", "General"),
        "unit_cost": Decimal(str(body.get("unit_cost", 10.0))),
        "unit_price": Decimal(str(body.get("unit_price", 25.0))),
        "stock_quantity": int(body.get("stock_quantity", 100)),
        "warehouse_location": body.get("warehouse_location", "Main Warehouse"),
        "reorder_point": int(body.get("reorder_point", 10)),
        "created_at": now,
        "updated_at": now
    }

    try:
        table = get_table(INVENTORY_TABLE)
        table.put_item(Item=item)
        return success_response(item, 201, "Inventory item created")
    except Exception as exc:
        return error_response(f"Failed to create inventory item: {str(exc)}", 500)


def get_inventory_item_by_id(event, context):
    """
    GET /inventory/{id}
    Retrieves item details by ID.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    path_params = event.get("pathParameters") or {}
    part_id = path_params.get("id")
    if not part_id:
        return error_response("Inventory item id is required", 400)

    try:
        item = get_item(INVENTORY_TABLE, tenant_id, part_id)
        if not item:
            return error_response(f"Item {part_id} not found in tenant {tenant_id}", 404, "NOT_FOUND")
        return success_response(item)
    except Exception as exc:
        return error_response(f"Failed to fetch item: {str(exc)}", 500)


def consume_inventory_part(event, context):
    """
    POST /inventory/consume
    Records part consumption on a work order and decrements stock quantity.
    Body: { "part_id": "...", "workorder_id": "...", "quantity": 1 }
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return error_response("Invalid JSON body", 400)

    part_id = body.get("part_id")
    workorder_id = body.get("workorder_id")
    qty_to_consume = int(body.get("quantity", 1))

    if not part_id or not workorder_id:
        return error_response("part_id and workorder_id are required", 400)

    if qty_to_consume <= 0:
        return error_response("quantity must be greater than zero", 400)

    try:
        table = get_table(INVENTORY_TABLE)
        item = get_item(INVENTORY_TABLE, tenant_id, part_id)
        if not item:
            return error_response(f"Part {part_id} not found", 404)

        current_stock = int(item.get("stock_quantity", 0))
        if current_stock < qty_to_consume:
            return error_response(
                f"Insufficient stock for part {part_id}. Available: {current_stock}, Requested: {qty_to_consume}",
                400,
                "INSUFFICIENT_STOCK"
            )

        now = datetime.now(timezone.utc).isoformat()
        new_stock = current_stock - qty_to_consume
        item["stock_quantity"] = new_stock
        item["updated_at"] = now
        table.put_item(Item=item)

        consumption_record = {
            "part_id": part_id,
            "workorder_id": workorder_id,
            "quantity_consumed": qty_to_consume,
            "remaining_stock": new_stock,
            "timestamp": now
        }

        return success_response(consumption_record, 200, "Part consumed successfully")
    except Exception as exc:
        return error_response(f"Failed to consume part: {str(exc)}", 500)

