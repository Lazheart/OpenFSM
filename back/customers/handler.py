import os
import sys
import json
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.auth_utils import extract_context
from common.response_utils import success_response, error_response
from common.db_utils import get_table, query_by_tenant, get_item, delete_item

CUSTOMERS_TABLE = os.environ.get("CUSTOMERS_TABLE", "openfsm-customers")


def list_customers(event, context):
    """
    GET /customers
    Lists customers for the authenticated tenant.
    Query parameters: limit, next_token
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    query_params = event.get("queryStringParameters") or {}
    limit = int(query_params.get("limit", 50))

    try:
        items, last_key = query_by_tenant(CUSTOMERS_TABLE, tenant_id, limit=limit)
        return success_response({
            "items": items,
            "count": len(items),
            "next_token": last_key
        })
    except Exception as exc:
        return error_response(f"Failed to fetch customers: {str(exc)}", 500)


def create_customer(event, context):
    """
    POST /customers
    Creates a new customer for the authenticated tenant.
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
    if not name:
        return error_response("name is required", 400)

    now = datetime.now(timezone.utc).isoformat()
    customer_id = body.get("id") or f"CUST#{uuid.uuid4().hex[:12]}"

    item = {
        "tenant_id": tenant_id,
        "id": customer_id,
        "name": name,
        "tax_id": body.get("tax_id", ""),
        "email": body.get("email", ""),
        "phone": body.get("phone", ""),
        "service_address": body.get("service_address", ""),
        "city": body.get("city", ""),
        "postal_code": body.get("postal_code", ""),
        "contract_type": body.get("contract_type", "STANDARD"),
        "status": body.get("status", "ACTIVE"),
        "created_at": now,
        "updated_at": now
    }

    try:
        table = get_table(CUSTOMERS_TABLE)
        table.put_item(Item=item)
        return success_response(item, 201, "Customer created successfully")
    except Exception as exc:
        return error_response(f"Failed to create customer: {str(exc)}", 500)


def get_customer_by_id(event, context):
    """
    GET /customers/{id}
    Retrieves customer by ID with tenant isolation.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    path_params = event.get("pathParameters") or {}
    customer_id = path_params.get("id")
    if not customer_id:
        return error_response("Customer id is required in path", 400)

    try:
        item = get_item(CUSTOMERS_TABLE, tenant_id, customer_id)
        if not item:
            return error_response(f"Customer {customer_id} not found in tenant {tenant_id}", 404, "NOT_FOUND")
        return success_response(item)
    except Exception as exc:
        return error_response(f"Failed to get customer: {str(exc)}", 500)


def delete_customer_by_id(event, context):
    """
    DELETE /customers/{id}
    Removes customer within tenant scope.
    """
    ctx = extract_context(event)
    tenant_id = ctx.get("tenant_id")
    if not tenant_id:
        return error_response("Unauthorized: Missing tenant context", 401)

    path_params = event.get("pathParameters") or {}
    customer_id = path_params.get("id")
    if not customer_id:
        return error_response("Customer id is required in path", 400)

    try:
        delete_item(CUSTOMERS_TABLE, tenant_id, customer_id)
        return success_response({"id": customer_id}, 200, "Customer deleted")
    except Exception as exc:
        return error_response(f"Failed to delete customer: {str(exc)}", 500)

