import os
import sys
import json
import uuid
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.auth_utils import create_token, hash_password, verify_password, extract_context
from common.response_utils import success_response, error_response
from common.db_utils import get_table

USERS_TABLE = os.environ.get("USERS_TABLE", "openfsm-users")

# Built-in demo accounts for initial tenant access
DEFAULT_CREDENTIALS = {
    "tenant-alpha": {
        "admin": {"password_hash": hash_password("admin123", "alpha_salt"), "role": "ADMIN", "id": "USR-A-001"},
        "dispatcher": {"password_hash": hash_password("disp123", "alpha_salt"), "role": "DISPATCHER", "id": "USR-A-002"},
        "tech1": {"password_hash": hash_password("tech123", "alpha_salt"), "role": "TECHNICIAN", "id": "USR-A-003"}
    },
    "tenant-beta": {
        "admin": {"password_hash": hash_password("admin123", "beta_salt"), "role": "ADMIN", "id": "USR-B-001"},
        "dispatcher": {"password_hash": hash_password("disp123", "beta_salt"), "role": "DISPATCHER", "id": "USR-B-002"},
        "tech1": {"password_hash": hash_password("tech123", "beta_salt"), "role": "TECHNICIAN", "id": "USR-B-003"}
    },
    "tenant-gamma": {
        "admin": {"password_hash": hash_password("admin123", "gamma_salt"), "role": "ADMIN", "id": "USR-G-001"},
        "dispatcher": {"password_hash": hash_password("disp123", "gamma_salt"), "role": "DISPATCHER", "id": "USR-G-002"},
        "tech1": {"password_hash": hash_password("tech123", "gamma_salt"), "role": "TECHNICIAN", "id": "USR-G-003"}
    }
}


def login(event, context):
    """
    POST /auth/login
    Authenticates user within a tenant and issues a JWT token.
    Body: { "tenant_id": "...", "username": "...", "password": "..." }
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return error_response("Invalid JSON body in request", 400)

    tenant_id = body.get("tenant_id")
    username = body.get("username")
    password = body.get("password")

    if not tenant_id or not username or not password:
        return error_response("tenant_id, username, and password are required", 400)

    # 1. Check DynamoDB users table first
    user_record = None
    try:
        table = get_table(USERS_TABLE)
        response = table.get_item(Key={"tenant_id": tenant_id, "id": f"USER#{username}"})
        user_record = response.get("Item")
    except Exception as exc:
        print(f"DynamoDB lookup failed (table may not exist yet or local mode): {exc}")

    if user_record:
        if not verify_password(password, user_record.get("password_hash", "")):
            return error_response("Invalid credentials", 401, "UNAUTHORIZED")
        user_id = user_record.get("id")
        role = user_record.get("role", "TECHNICIAN")
    else:
        # 2. Check built-in demo credentials
        tenant_creds = DEFAULT_CREDENTIALS.get(tenant_id)
        if not tenant_creds or username not in tenant_creds:
            return error_response("User not found or invalid tenant", 401, "UNAUTHORIZED")
        creds = tenant_creds[username]
        if not verify_password(password, creds["password_hash"]):
            return error_response("Invalid credentials", 401, "UNAUTHORIZED")
        user_id = creds["id"]
        role = creds["role"]

    token = create_token(
        tenant_id=tenant_id,
        user_id=user_id,
        role=role,
        username=username
    )

    return success_response({
        "token": token,
        "token_type": "Bearer",
        "tenant_id": tenant_id,
        "user_id": user_id,
        "username": username,
        "role": role
    }, 200, "Authentication successful")


def register(event, context):
    """
    POST /auth/register
    Registers a new tenant user into USERS_TABLE.
    Body: { "tenant_id": "...", "username": "...", "password": "...", "role": "ADMIN|DISPATCHER|TECHNICIAN", "full_name": "..." }
    """
    try:
        body = json.loads(event.get("body") or "{}")
    except Exception:
        return error_response("Invalid JSON body", 400)

    tenant_id = body.get("tenant_id")
    username = body.get("username")
    password = body.get("password")
    role = body.get("role", "TECHNICIAN").upper()
    full_name = body.get("full_name", username)

    if not tenant_id or not username or not password:
        return error_response("tenant_id, username, and password are required", 400)

    valid_roles = ["ADMIN", "DISPATCHER", "TECHNICIAN"]
    if role not in valid_roles:
        return error_response(f"role must be one of {valid_roles}", 400)

    user_id = f"USER#{username}"
    password_hash = hash_password(password)
    now = datetime.now(timezone.utc).isoformat()

    item = {
        "tenant_id": tenant_id,
        "id": user_id,
        "username": username,
        "full_name": full_name,
        "role": role,
        "password_hash": password_hash,
        "created_at": now
    }

    try:
        table = get_table(USERS_TABLE)
        table.put_item(Item=item)
    except Exception as exc:
        return error_response(f"Failed to persist user in database: {str(exc)}", 500)

    return success_response({
        "tenant_id": tenant_id,
        "user_id": user_id,
        "username": username,
        "role": role,
        "full_name": full_name
    }, 201, "User registered successfully")


def me(event, context):
    """
    GET /auth/me
    Returns current authenticated user and tenant information.
    """
    ctx = extract_context(event)
    if not ctx.get("tenant_id"):
        return error_response("Unauthorized: Missing tenant context", 401)

    return success_response({
        "tenant_id": ctx.get("tenant_id"),
        "user_id": ctx.get("user_id"),
        "role": ctx.get("role")
    }, 200, "Session valid")

