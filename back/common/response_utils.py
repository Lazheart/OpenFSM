import json
from decimal import Decimal


class DecimalEncoder(json.JSONEncoder):
    """Serializa Decimal (DynamoDB) como int o float."""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)


CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
}


def build_response(status_code: int, body: dict) -> dict:
    headers = {"Content-Type": "application/json", **CORS_HEADERS}
    return {"statusCode": status_code, "headers": headers, "body": json.dumps(body, cls=DecimalEncoder)}


def success_response(data, status_code: int = 200, message: str = "Success") -> dict:
    return build_response(status_code, {"success": True, "message": message, "data": data})


def error_response(message: str, status_code: int = 400, error_code: str = "BAD_REQUEST", details=None) -> dict:
    payload = {"success": False, "error": {"code": error_code, "message": message}}
    if details is not None:
        payload["error"]["details"] = details
    return build_response(status_code, payload)
