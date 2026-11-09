import os
import sys
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.db_utils import delete_item, get_item, put_item, query_by_tenant
from common.http_utils import (
    ApiError, api_handler, encode_next_token, optional_str, parse_body, parse_pagination,
    path_id, require_context, require_enum, require_str,
)
from common.response_utils import success_response

CUSTOMERS_TABLE = os.environ.get("CUSTOMERS_TABLE", "openfsm-customers")
CONTRACT_TYPES = ("STANDARD", "PREMIUM", "ENTERPRISE")
CUSTOMER_STATUSES = ("ACTIVE", "INACTIVE")


@api_handler
def list_customers(event, context):
    """GET /customers?limit=&next_token="""
    ctx = require_context(event)
    limit, start_key = parse_pagination(event, ctx["tenant_id"])
    items, last_key = query_by_tenant(CUSTOMERS_TABLE, ctx["tenant_id"], limit, start_key)
    return success_response({"items": items, "count": len(items), "next_token": encode_next_token(last_key)})


@api_handler
def create_customer(event, context):
    """POST /customers (ADMIN, DISPATCHER)"""
    ctx = require_context(event, roles=("ADMIN", "DISPATCHER"))
    body = parse_body(event)
    now = datetime.now(timezone.utc).isoformat()
    item = {
        "tenant_id": ctx["tenant_id"],
        "id": f"CUST#{uuid.uuid4().hex[:12]}",  # el id lo genera el servidor
        "name": require_str(body, "name", 200),
        "tax_id": optional_str(body, "tax_id", max_len=32),
        "email": optional_str(body, "email", max_len=200),
        "phone": optional_str(body, "phone", max_len=40),
        "service_address": optional_str(body, "service_address", max_len=300),
        "city": optional_str(body, "city", max_len=100),
        "postal_code": optional_str(body, "postal_code", max_len=20),
        "contract_type": require_enum(body.get("contract_type", "STANDARD"), CONTRACT_TYPES, "contract_type"),
        "status": require_enum(body.get("status", "ACTIVE"), CUSTOMER_STATUSES, "status"),
        "created_at": now,
        "updated_at": now,
    }
    put_item(CUSTOMERS_TABLE, item, only_if_new=True)
    return success_response(item, 201, "Customer created successfully")


@api_handler
def get_customer_by_id(event, context):
    """GET /customers/{id}"""
    ctx = require_context(event)
    customer_id = path_id(event)
    item = get_item(CUSTOMERS_TABLE, ctx["tenant_id"], customer_id)
    if not item:
        raise ApiError(f"Customer {customer_id} not found", 404, "NOT_FOUND")
    return success_response(item)


@api_handler
def delete_customer_by_id(event, context):
    """DELETE /customers/{id} (solo ADMIN; antes cualquier rol podía borrar)"""
    ctx = require_context(event, roles=("ADMIN",))
    customer_id = path_id(event)
    if not delete_item(CUSTOMERS_TABLE, ctx["tenant_id"], customer_id):
        raise ApiError(f"Customer {customer_id} not found", 404, "NOT_FOUND")
    return success_response({"id": customer_id}, 200, "Customer deleted")
