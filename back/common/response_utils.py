import json
from decimal import Decimal


class DecimalEncoder(json.JSONEncoder):
    """Encodes Decimal objects to int or float for JSON serialization."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)


def build_response(status_code: int, body: dict, custom_headers: dict = None) -> dict:
    """Builds standard API Gateway HTTP response with CORS headers."""
    headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Tenant-Id",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE,PATCH"
    }
    if custom_headers:
        headers.update(custom_headers)

    return {
        "statusCode": status_code,
        "headers": headers,
        "body": json.dumps(body, cls=DecimalEncoder)
    }


def success_response(data: any, status_code: int = 200, message: str = "Success") -> dict:
    """Returns standard successful response payload."""
    payload = {
        "success": True,
        "message": message,
        "data": data
    }
    return build_response(status_code, payload)


def error_response(message: str, status_code: int = 400, error_code: str = "BAD_REQUEST", details: any = None) -> dict:
    """Returns standard error response payload."""
    payload = {
        "success": False,
        "error": {
            "code": error_code,
            "message": message
        }
    }
    if details is not None:
        payload["error"]["details"] = details
    return build_response(status_code, payload)

