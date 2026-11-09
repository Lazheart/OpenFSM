"""
Utilidades compartidas por los handlers HTTP: validación de entrada, roles,
paginación y manejo uniforme de errores.
"""
import base64
import functools
import json
import traceback
from urllib.parse import unquote

from common.auth_utils import extract_context
from common.response_utils import error_response

MAX_PAGE_SIZE = 500
DEFAULT_PAGE_SIZE = 50


class ApiError(Exception):
    def __init__(self, message: str, status: int = 400, code: str = "BAD_REQUEST"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def api_handler(fn):
    """
    Convierte ApiError en respuestas JSON y oculta detalles internos en los 500
    (antes se devolvía str(exc), que filtraba nombres de tablas y ARNs).
    """
    @functools.wraps(fn)
    def wrapper(event, context):
        try:
            return fn(event, context)
        except ApiError as exc:
            return error_response(exc.message, exc.status, exc.code)
        except Exception:
            print(f"Unhandled error in {fn.__name__}:\n{traceback.format_exc()}")
            return error_response("Error interno del servidor", 500, "INTERNAL_ERROR")
    return wrapper


def require_context(event: dict, roles: tuple = None) -> dict:
    ctx = extract_context(event)
    if not ctx.get("tenant_id"):
        raise ApiError("Unauthorized: missing tenant context", 401, "UNAUTHORIZED")
    if roles and ctx.get("role") not in roles:
        raise ApiError("Tu rol no tiene permiso para esta acción", 403, "FORBIDDEN")
    return ctx


def parse_body(event: dict) -> dict:
    raw = event.get("body") or "{}"
    if event.get("isBase64Encoded"):
        raw = base64.b64decode(raw).decode("utf-8")
    try:
        body = json.loads(raw)
    except Exception:
        raise ApiError("Invalid JSON body", 400)
    if not isinstance(body, dict):
        raise ApiError("JSON body must be an object", 400)
    return body


def path_id(event: dict) -> str:
    """Los IDs llevan '#' (WO#...), que el cliente envía como %23."""
    raw = (event.get("pathParameters") or {}).get("id") or ""
    value = unquote(raw).strip()
    if not value or len(value) > 128:
        raise ApiError("A valid id path parameter is required", 400)
    return value


def require_str(body: dict, key: str, max_len: int = 500) -> str:
    value = body.get(key)
    if not isinstance(value, str) or not value.strip():
        raise ApiError(f"{key} is required", 400)
    if len(value) > max_len:
        raise ApiError(f"{key} is too long (max {max_len})", 400)
    return value.strip()


def optional_str(body: dict, key: str, default: str = "", max_len: int = 2000) -> str:
    value = body.get(key, default)
    if value is None:
        return default
    if not isinstance(value, str):
        raise ApiError(f"{key} must be a string", 400)
    if len(value) > max_len:
        raise ApiError(f"{key} is too long (max {max_len})", 400)
    return value.strip()


def require_enum(value, allowed: tuple, field: str) -> str:
    if value not in allowed:
        raise ApiError(f"{field} must be one of {list(allowed)}", 400)
    return value


def parse_number(value, field: str, minimum: float = None, maximum: float = None, integer: bool = False):
    try:
        number = int(value) if integer else float(value)
    except (TypeError, ValueError):
        raise ApiError(f"{field} must be a number", 400)
    if minimum is not None and number < minimum:
        raise ApiError(f"{field} must be >= {minimum}", 400)
    if maximum is not None and number > maximum:
        raise ApiError(f"{field} must be <= {maximum}", 400)
    return number


def parse_pagination(event: dict, tenant_id: str) -> tuple:
    """Devuelve (limit, exclusive_start_key) desde ?limit=&next_token=."""
    qs = event.get("queryStringParameters") or {}
    try:
        limit = int(qs.get("limit", DEFAULT_PAGE_SIZE))
    except (TypeError, ValueError):
        limit = DEFAULT_PAGE_SIZE
    limit = max(1, min(limit, MAX_PAGE_SIZE))

    start_key = None
    token = qs.get("next_token")
    if token:
        try:
            start_key = json.loads(base64.urlsafe_b64decode(token.encode("utf-8")).decode("utf-8"))
        except Exception:
            raise ApiError("Invalid next_token", 400)
        # Evita que un token fabricado lea otra partición
        if not isinstance(start_key, dict) or start_key.get("tenant_id") != tenant_id:
            raise ApiError("Invalid next_token", 400)
    return limit, start_key


def encode_next_token(last_key: dict):
    if not last_key:
        return None
    return base64.urlsafe_b64encode(json.dumps(last_key, default=str).encode("utf-8")).decode("utf-8")
