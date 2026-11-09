import os
import sys
from datetime import datetime, timezone

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.auth_utils import VALID_ROLES, create_token, hash_password, verify_password
from common.db_utils import get_item, put_item, is_conditional_failure
from common.http_utils import ApiError, api_handler, parse_body, require_context, require_enum, require_str
from common.response_utils import success_response

USERS_TABLE = os.environ.get("USERS_TABLE", "openfsm-users")
VALID_TENANTS = tuple(t.strip() for t in os.environ.get(
    "VALID_TENANTS", "tenant-alpha,tenant-beta,tenant-gamma").split(",") if t.strip())

# Cuentas demo para la exposición. Se pueden desactivar con DEMO_USERS_ENABLED=false
# y crear usuarios reales con POST /auth/register (solo ADMIN).
DEMO_USERS = {
    "admin": {"password": "admin123", "role": "ADMIN"},
    "dispatcher": {"password": "disp123", "role": "DISPATCHER"},
    "tech1": {"password": "tech123", "role": "TECHNICIAN"},
}
_DEMO_HASHES = {}


def _demo_user(tenant_id: str, username: str):
    if os.environ.get("DEMO_USERS_ENABLED", "true") != "true":
        return None
    user = DEMO_USERS.get(username)
    if not user:
        return None
    if username not in _DEMO_HASHES:
        _DEMO_HASHES[username] = hash_password(user["password"])
    prefix = tenant_id.split("-")[-1][:1].upper()
    index = list(DEMO_USERS).index(username) + 1
    return {"password_hash": _DEMO_HASHES[username], "role": user["role"], "id": f"USR-{prefix}-{index:03d}"}


@api_handler
def login(event, context):
    """
    POST /auth/login  (público)
    Body: { "tenant_id": "...", "username": "...", "password": "..." }
    """
    body = parse_body(event)
    tenant_id = require_str(body, "tenant_id", 64)
    username = require_str(body, "username", 64)
    password = require_str(body, "password", 128)
    if tenant_id not in VALID_TENANTS:
        raise ApiError("Credenciales inválidas", 401, "UNAUTHORIZED")

    record = None
    try:
        record = get_item(USERS_TABLE, tenant_id, f"USER#{username}")
    except Exception as exc:
        print(f"Users table lookup failed: {exc}")

    if record:
        user_id, role, stored = record.get("id"), record.get("role", "TECHNICIAN"), record.get("password_hash", "")
    else:
        demo = _demo_user(tenant_id, username)
        if not demo:
            raise ApiError("Credenciales inválidas", 401, "UNAUTHORIZED")
        user_id, role, stored = demo["id"], demo["role"], demo["password_hash"]

    # Mismo mensaje para usuario inexistente o contraseña errónea (no revela qué usuarios existen)
    if not verify_password(password, stored):
        raise ApiError("Credenciales inválidas", 401, "UNAUTHORIZED")

    token = create_token(tenant_id=tenant_id, user_id=user_id, role=role, username=username)
    return success_response({
        "token": token,
        "token_type": "Bearer",
        "tenant_id": tenant_id,
        "user_id": user_id,
        "username": username,
        "role": role,
    }, 200, "Authentication successful")


@api_handler
def register(event, context):
    """
    POST /auth/register  (protegido, solo ADMIN)
    Crea un usuario en el tenant DEL TOKEN. Antes era público y aceptaba
    tenant_id y role en el body: cualquiera podía crearse ADMIN de cualquier tenant.
    """
    ctx = require_context(event, roles=("ADMIN",))
    body = parse_body(event)
    username = require_str(body, "username", 64)
    password = require_str(body, "password", 128)
    if len(password) < 8:
        raise ApiError("password must have at least 8 characters", 400)
    role = require_enum(str(body.get("role", "TECHNICIAN")).upper(), VALID_ROLES, "role")
    full_name = str(body.get("full_name") or username)[:120]

    item = {
        "tenant_id": ctx["tenant_id"],
        "id": f"USER#{username}",
        "username": username,
        "full_name": full_name,
        "role": role,
        "password_hash": hash_password(password),
        "created_by": ctx.get("user_id"),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    try:
        put_item(USERS_TABLE, item, only_if_new=True)
    except Exception as exc:
        if is_conditional_failure(exc):
            raise ApiError("El usuario ya existe en este tenant", 409, "CONFLICT")
        raise

    return success_response({
        "tenant_id": item["tenant_id"],
        "user_id": item["id"],
        "username": username,
        "role": role,
        "full_name": full_name,
    }, 201, "User registered successfully")


@api_handler
def me(event, context):
    """GET /auth/me (protegido)"""
    ctx = require_context(event)
    return success_response({
        "tenant_id": ctx["tenant_id"],
        "user_id": ctx.get("user_id"),
        "username": ctx.get("username"),
        "role": ctx.get("role"),
    }, 200, "Session valid")
