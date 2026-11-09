import os
import json
import hmac
import hashlib
import base64
import time


TOKEN_TTL_SECONDS = int(os.environ.get("JWT_EXPIRATION_SECONDS", "28800"))  # 8 horas
PBKDF2_ITERATIONS = int(os.environ.get("PBKDF2_ITERATIONS", "60000"))
VALID_ROLES = ("ADMIN", "DISPATCHER", "TECHNICIAN")


def _secret() -> bytes:
    """
    El secreto JWT es obligatorio: si falta, se falla en cerrado
    (antes existía un valor por defecto conocido públicamente en el repo).
    """
    secret = os.environ.get("JWT_SECRET", "")
    if len(secret) < 16:
        raise RuntimeError("JWT_SECRET no configurado o demasiado corto (mínimo 16 caracteres)")
    return secret.encode("utf-8")


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("utf-8")


def _b64url_decode(segment: str) -> bytes:
    rem = len(segment) % 4
    if rem > 0:
        segment += "=" * (4 - rem)
    return base64.urlsafe_b64decode(segment.encode("utf-8"))


def create_token(tenant_id: str, user_id: str, role: str, username: str, expires_in: int = None) -> str:
    """Crea un JWT HS256 con los claims del tenant."""
    ttl = expires_in if expires_in is not None else TOKEN_TTL_SECONDS
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + ttl,
    }
    header_b64 = _b64url_encode(json.dumps(header, separators=(",", ":")).encode("utf-8"))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    signature = hmac.new(_secret(), signing_input, hashlib.sha256).digest()
    return f"{header_b64}.{payload_b64}.{_b64url_encode(signature)}"


def verify_token(token: str) -> dict:
    """Verifica firma, algoritmo, expiración y claims obligatorios. Lanza ValueError si no es válido."""
    if not token:
        raise ValueError("Token is required")
    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")
    header_b64, payload_b64, signature_b64 = parts

    try:
        header = json.loads(_b64url_decode(header_b64).decode("utf-8"))
    except Exception:
        raise ValueError("Invalid JWT header")
    if header.get("alg") != "HS256":
        raise ValueError("Unsupported JWT algorithm")

    signing_input = f"{header_b64}.{payload_b64}".encode("utf-8")
    expected_sig = hmac.new(_secret(), signing_input, hashlib.sha256).digest()
    try:
        actual_sig = _b64url_decode(signature_b64)
    except Exception:
        raise ValueError("Invalid token signature")
    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid token signature")

    try:
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
    except Exception:
        raise ValueError("Invalid JWT payload")

    if not isinstance(payload.get("exp"), int) or int(time.time()) > payload["exp"]:
        raise ValueError("Token has expired")
    if not payload.get("tenant_id") or not payload.get("sub"):
        raise ValueError("Token missing required claims")
    if payload.get("role") not in VALID_ROLES:
        raise ValueError("Token has invalid role")
    return payload


def hash_password(password: str, salt: str = None) -> str:
    """PBKDF2-HMAC-SHA256. Formato: pbkdf2$<iteraciones>$<salt>$<hash>."""
    if not salt:
        salt = base64.b64encode(os.urandom(16)).decode("utf-8")
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), PBKDF2_ITERATIONS).hex()
    return f"pbkdf2${PBKDF2_ITERATIONS}${salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        parts = (stored_hash or "").split("$")
        if len(parts) == 4 and parts[0] == "pbkdf2":
            _, iterations, salt, expected = parts
            computed = hashlib.pbkdf2_hmac(
                "sha256", password.encode("utf-8"), salt.encode("utf-8"), int(iterations)
            ).hex()
            return hmac.compare_digest(computed, expected)
        if len(parts) == 2:
            # Formato antiguo salt$sha256 (usuarios registrados antes del cambio)
            salt, expected = parts
            computed = hashlib.sha256(f"{salt}:{password}".encode("utf-8")).hexdigest()
            return hmac.compare_digest(computed, expected)
    except Exception:
        return False
    return False


def extract_context(event: dict) -> dict:
    """
    Lee tenant, usuario y rol que inyecta el Lambda Authorizer en requestContext.
    El header X-Tenant-Id SOLO se acepta en pruebas locales (ALLOW_TENANT_HEADER=true);
    antes se aceptaba siempre y permitía suplantar a otro tenant.
    """
    authorizer = (event.get("requestContext") or {}).get("authorizer") or {}
    tenant_id = authorizer.get("tenantId")
    user_id = authorizer.get("userId")
    role = authorizer.get("role")
    username = authorizer.get("username")

    if not tenant_id and os.environ.get("ALLOW_TENANT_HEADER") == "true":
        headers = event.get("headers") or {}
        tenant_id = headers.get("X-Tenant-Id") or headers.get("x-tenant-id")
        role = role or headers.get("X-Role") or headers.get("x-role") or "ADMIN"
        user_id = user_id or "local-user"

    return {"tenant_id": tenant_id, "user_id": user_id, "role": role, "username": username}
