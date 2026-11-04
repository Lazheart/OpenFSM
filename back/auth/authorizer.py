import os
import sys

# Ensure backend root is on sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.auth_utils import verify_token


def generate_policy(principal_id: str, effect: str, resource: str, context: dict = None) -> dict:
    """Generates standard AWS IAM policy for API Gateway custom authorizer."""
    policy = {
        "principalId": principal_id,
        "policyDocument": {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Action": "execute-api:Invoke",
                    "Effect": effect,
                    "Resource": resource
                }
            ]
        }
    }
    if context:
        policy["context"] = context
    return policy


def handler(event, context):
    """
    API Gateway Lambda Custom Token Authorizer.
    Validates JWT token and injects tenant context.
    """
    token = event.get("authorizationToken") or ""
    method_arn = event.get("methodArn", "*")

    if not token:
        print("Unauthorized: No authorization token found in event")
        raise Exception("Unauthorized")

    try:
        payload = verify_token(token)
        principal_id = payload.get("sub", "anonymous")
        tenant_id = payload.get("tenant_id", "")
        role = payload.get("role", "TECHNICIAN")
        username = payload.get("username", "")

        # Context keys must be strings, numbers, or booleans for API Gateway
        authorizer_context = {
            "tenantId": str(tenant_id),
            "userId": str(principal_id),
            "role": str(role),
            "username": str(username)
        }

        # Authorize all methods under the same API to enable caching
        resource = method_arn
        if ":" in method_arn:
            arn_parts = method_arn.split(":")
            api_gateway_arn_parts = arn_parts[5].split("/")
            api_id = api_gateway_arn_parts[0]
            stage = api_gateway_arn_parts[1]
            resource = f"arn:aws:execute-api:{arn_parts[3]}:{arn_parts[4]}:{api_id}/{stage}/*/*"

        return generate_policy(principal_id, "Allow", resource, authorizer_context)

    except Exception as exc:
        print(f"Token verification failed: {str(exc)}")
        raise Exception("Unauthorized")

