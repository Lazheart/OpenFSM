import os
import json
import hmac
import hashlib
import base64
import time


DEFAULT_JWT_SECRET = os.environ.get("JWT_SECRET", "openfsm-insecure-default-secret-key-change-in-prod-2026")
TOKEN_TTL_SECONDS = int(os.environ.get("JWT_EXPIRATION_SECONDS", "86400"))  # 24 hours default


def _b64url_encode(data: bytes) -> str:
    """Encodes bytes to base64url string without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('utf-8')


def _b64url_decode(segment: str) -> bytes:
    """Decodes base64url string with proper padding."""
    rem = len(segment) % 4
    if rem > 0:
        segment += '=' * (4 - rem)
    return base64.urlsafe_b64decode(segment.encode('utf-8'))


def create_token(tenant_id: str, user_id: str, role: str, username: str, expires_in: int = None) -> str:
    """
    Creates a signed HMAC-SHA256 JWT token with tenant claims.
    """
    secret = os.environ.get("JWT_SECRET", DEFAULT_JWT_SECRET).encode('utf-8')
    ttl = expires_in if expires_in is not None else TOKEN_TTL_SECONDS
    now = int(time.time())

    header = {
        "alg": "HS256",
        "typ": "JWT"
    }

    payload = {
        "sub": user_id,
        "tenant_id": tenant_id,
        "username": username,
        "role": role,
        "iat": now,
        "exp": now + ttl
    }

    header_b64 = _b64url_encode(json.dumps(header, separators=(',', ':')).encode('utf-8'))
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(',', ':')).encode('utf-8'))

    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    signature = hmac.new(secret, signing_input, hashlib.sha256).digest()
    signature_b64 = _b64url_encode(signature)

    return f"{header_b64}.{payload_b64}.{signature_b64}"


def verify_token(token: str) -> dict:
    """
    Verifies token signature and expiration, returns decoded payload.
    Raises ValueError on invalid token or expiration.
    """
    if not token:
        raise ValueError("Token is required")

    # Strip Bearer prefix if provided
    if token.lower().startswith("bearer "):
        token = token[7:].strip()

    parts = token.split('.')
    if len(parts) != 3:
        raise ValueError("Invalid JWT format: expected 3 parts")

    header_b64, payload_b64, signature_b64 = parts
    secret = os.environ.get("JWT_SECRET", DEFAULT_JWT_SECRET).encode('utf-8')

    signing_input = f"{header_b64}.{payload_b64}".encode('utf-8')
    expected_sig = hmac.new(secret, signing_input, hashlib.sha256).digest()
    actual_sig = _b64url_decode(signature_b64)

    if not hmac.compare_digest(expected_sig, actual_sig):
        raise ValueError("Invalid token signature")

    payload_json = _b64url_decode(payload_b64)
    payload = json.loads(payload_json.decode('utf-8'))

    now = int(time.time())
    if "exp" in payload and now > payload["exp"]:
        raise ValueError("Token has expired")

    return payload


def hash_password(password: str, salt: str = None) -> str:
    """Hashes password with SHA256 and salt."""
    if not salt:
        salt = base64.b64encode(os.urandom(16)).decode('utf-8')
    digest = hashlib.sha256(f"{salt}:{password}".encode('utf-8')).hexdigest()
    return f"{salt}${digest}"


def verify_password(password: str, stored_hash: str) -> bool:
    """Verifies cleartext password against salt$digest format."""
    try:
        parts = stored_hash.split('$')
        if len(parts) != 2:
            return False
        salt, expected_digest = parts
        computed = hashlib.sha256(f"{salt}:{password}".encode('utf-8')).hexdigest()
        return hmac.compare_digest(computed, expected_digest)
    except Exception:
        return False


def extract_context(event: dict) -> dict:
    """
    Extracts tenant_id, user_id, and role from API Gateway request context (populated by custom authorizer)
    or headers for local testing.
    """
    context = event.get("requestContext", {})
    authorizer = context.get("authorizer", {})

    tenant_id = authorizer.get("tenantId")
    user_id = authorizer.get("userId")
    role = authorizer.get("role")

    headers = event.get("headers") or {}
    if not tenant_id:
        # Fallback to header if running offline or in test mode
        tenant_id = headers.get("X-Tenant-Id") or headers.get("x-tenant-id")

    return {
        "tenant_id": tenant_id,
        "user_id": user_id,
        "role": role
    }

