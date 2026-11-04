import unittest
import json
import os
import sys

# Ensure backend root is in sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common.auth_utils import create_token, verify_token, hash_password, verify_password
from auth.authorizer import handler as authorizer_handler
from auth.handler import login, register, me


class TestAuthAndAuthorizer(unittest.TestCase):
    def test_jwt_create_and_verify(self):
        token = create_token(
            tenant_id="tenant-alpha",
            user_id="USR-123",
            role="ADMIN",
            username="admin"
        )
        self.assertIsInstance(token, str)
        self.assertTrue(len(token.split('.')) == 3)

        payload = verify_token(token)
        self.assertEqual(payload["tenant_id"], "tenant-alpha")
        self.assertEqual(payload["sub"], "USR-123")
        self.assertEqual(payload["role"], "ADMIN")
        self.assertEqual(payload["username"], "admin")

    def test_password_hashing(self):
        pwd = "superSecretPassword123"
        hashed = hash_password(pwd)
        self.assertTrue(verify_password(pwd, hashed))
        self.assertFalse(verify_password("wrongPassword", hashed))

    def test_authorizer_allow(self):
        token = create_token(
            tenant_id="tenant-beta",
            user_id="USR-B-001",
            role="DISPATCHER",
            username="disp_beta"
        )
        event = {
            "authorizationToken": f"Bearer {token}",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:abcdef123/dev/GET/workorders"
        }
        res = authorizer_handler(event, None)
        self.assertEqual(res["principalId"], "USR-B-001")
        self.assertEqual(res["policyDocument"]["Statement"][0]["Effect"], "Allow")
        self.assertEqual(res["context"]["tenantId"], "tenant-beta")
        self.assertEqual(res["context"]["role"], "DISPATCHER")

    def test_authorizer_invalid_token(self):
        event = {
            "authorizationToken": "Bearer invalid.token.payload",
            "methodArn": "arn:aws:execute-api:us-east-1:123456789012:abcdef123/dev/GET/workorders"
        }
        with self.assertRaises(Exception):
            authorizer_handler(event, None)

    def test_login_demo_credentials(self):
        event = {
            "body": json.dumps({
                "tenant_id": "tenant-alpha",
                "username": "admin",
                "password": "admin123"
            })
        }
        res = login(event, None)
        self.assertEqual(res["statusCode"], 200)
        body = json.loads(res["body"])
        self.assertTrue(body["success"])
        self.assertEqual(body["data"]["tenant_id"], "tenant-alpha")
        self.assertIn("token", body["data"])

    def test_login_invalid_password(self):
        event = {
            "body": json.dumps({
                "tenant_id": "tenant-alpha",
                "username": "admin",
                "password": "wrong_password"
            })
        }
        res = login(event, None)
        self.assertEqual(res["statusCode"], 401)


if __name__ == "__main__":
    unittest.main()

