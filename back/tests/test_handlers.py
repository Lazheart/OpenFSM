"""
Pruebas unitarias sin AWS: las funciones de DynamoDB/SNS se reemplazan con dobles en memoria.
Ejecutar desde back/:  python -m pytest -q   (o python -m unittest discover tests)
"""
import base64
import json
import os
import sys
import time
import unittest
from decimal import Decimal
from unittest import mock

os.environ["JWT_SECRET"] = "test-secret-0123456789abcdef"
os.environ["AWS_DEFAULT_REGION"] = "us-east-1"
os.environ["EVIDENCE_BUCKET"] = "test-bucket"
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from common import auth_utils, http_utils, sqs_utils  # noqa: E402
from common.auth_utils import create_token, hash_password, verify_password, verify_token  # noqa: E402
from common.db_utils import to_dynamo  # noqa: E402
from auth.authorizer import handler as authorizer_handler  # noqa: E402
from auth import handler as auth_handler  # noqa: E402
from workorders import handler as wo_handler, worker as wo_worker  # noqa: E402
from visits import handler as visits_handler, worker as visits_worker, evidence  # noqa: E402
from inventory import handler as inv_handler  # noqa: E402
from notifications import handler as notif_handler  # noqa: E402


def api_event(body=None, role="ADMIN", tenant="tenant-alpha", path_id=None, qs=None):
    ev = {
        "body": json.dumps(body) if body is not None else None,
        "requestContext": {"authorizer": {"tenantId": tenant, "userId": "USR-1", "role": role}},
        "queryStringParameters": qs,
    }
    if path_id:
        ev["pathParameters"] = {"id": path_id}
    return ev


def body_of(res):
    return json.loads(res["body"])


class TestAuth(unittest.TestCase):
    def test_token_roundtrip(self):
        token = create_token("tenant-alpha", "USR-1", "ADMIN", "admin")
        payload = verify_token(f"Bearer {token}")
        self.assertEqual(payload["tenant_id"], "tenant-alpha")
        self.assertEqual(payload["role"], "ADMIN")

    def test_tampered_payload_rejected(self):
        token = create_token("tenant-alpha", "USR-1", "TECHNICIAN", "tech")
        h, p, s = token.split(".")
        data = json.loads(base64.urlsafe_b64decode(p + "=="))
        data["role"] = "ADMIN"
        forged = base64.urlsafe_b64encode(json.dumps(data).encode()).rstrip(b"=").decode()
        with self.assertRaises(ValueError):
            verify_token(f"{h}.{forged}.{s}")

    def test_alg_none_rejected(self):
        h = base64.urlsafe_b64encode(b'{"alg":"none","typ":"JWT"}').rstrip(b"=").decode()
        p = base64.urlsafe_b64encode(json.dumps({
            "sub": "x", "tenant_id": "tenant-alpha", "role": "ADMIN", "exp": int(time.time()) + 60
        }).encode()).rstrip(b"=").decode()
        with self.assertRaises(ValueError):
            verify_token(f"{h}.{p}.")

    def test_expired_token_rejected(self):
        token = create_token("tenant-alpha", "USR-1", "ADMIN", "admin", expires_in=-10)
        with self.assertRaises(ValueError):
            verify_token(token)

    def test_missing_secret_fails_closed(self):
        with mock.patch.dict(os.environ, {"JWT_SECRET": ""}):
            with self.assertRaises(RuntimeError):
                create_token("tenant-alpha", "USR-1", "ADMIN", "admin")

    def test_password_hashing(self):
        hashed = hash_password("superSecret123")
        self.assertTrue(hashed.startswith("pbkdf2$"))
        self.assertTrue(verify_password("superSecret123", hashed))
        self.assertFalse(verify_password("wrong", hashed))

    def test_authorizer_allow_and_deny(self):
        token = create_token("tenant-beta", "USR-B-1", "DISPATCHER", "disp")
        arn = "arn:aws:execute-api:us-east-1:123456789012:abc/dev/GET/workorders"
        res = authorizer_handler({"authorizationToken": f"Bearer {token}", "methodArn": arn}, None)
        self.assertEqual(res["policyDocument"]["Statement"][0]["Effect"], "Allow")
        self.assertEqual(res["context"]["tenantId"], "tenant-beta")
        with self.assertRaises(Exception):
            authorizer_handler({"authorizationToken": "Bearer a.b.c", "methodArn": arn}, None)

    def test_tenant_header_ignored_in_production(self):
        ev = {"headers": {"X-Tenant-Id": "tenant-gamma"}}
        self.assertIsNone(auth_utils.extract_context(ev)["tenant_id"])

    @mock.patch.object(auth_handler, "get_item", side_effect=Exception("no table"))
    def test_login_demo_user(self, _):
        res = auth_handler.login({"body": json.dumps(
            {"tenant_id": "tenant-alpha", "username": "admin", "password": "admin123"})}, None)
        self.assertEqual(res["statusCode"], 200)
        self.assertEqual(verify_token(body_of(res)["data"]["token"])["role"], "ADMIN")

    @mock.patch.object(auth_handler, "get_item", return_value=None)
    def test_login_wrong_password_and_unknown_tenant(self, _):
        bad = auth_handler.login({"body": json.dumps(
            {"tenant_id": "tenant-alpha", "username": "admin", "password": "nope"})}, None)
        self.assertEqual(bad["statusCode"], 401)
        other = auth_handler.login({"body": json.dumps(
            {"tenant_id": "tenant-evil", "username": "admin", "password": "admin123"})}, None)
        self.assertEqual(other["statusCode"], 401)

    def test_register_requires_admin(self):
        res = auth_handler.register(api_event({"username": "x", "password": "12345678"}, role="TECHNICIAN"), None)
        self.assertEqual(res["statusCode"], 403)
        anon = auth_handler.register({"body": json.dumps({"tenant_id": "tenant-alpha", "username": "x",
                                                          "password": "12345678", "role": "ADMIN"})}, None)
        self.assertEqual(anon["statusCode"], 401)

    @mock.patch.object(auth_handler, "put_item")
    def test_register_uses_token_tenant(self, put):
        res = auth_handler.register(api_event(
            {"username": "nuevo", "password": "12345678", "role": "DISPATCHER", "tenant_id": "tenant-gamma"}), None)
        self.assertEqual(res["statusCode"], 201)
        self.assertEqual(put.call_args[0][1]["tenant_id"], "tenant-alpha")


class TestCommon(unittest.TestCase):
    def test_to_dynamo_converts_floats(self):
        out = to_dynamo({"a": 1.5, "b": [2.25, {"c": 0.1}], "d": True, "e": 3})
        self.assertEqual(out["a"], Decimal("1.5"))
        self.assertEqual(out["b"][1]["c"], Decimal("0.1"))
        self.assertIs(out["d"], True)

    def test_pagination_token_cannot_cross_tenant(self):
        token = http_utils.encode_next_token({"tenant_id": "tenant-beta", "id": "WO#1"})
        with self.assertRaises(http_utils.ApiError):
            http_utils.parse_pagination({"queryStringParameters": {"next_token": token}}, "tenant-alpha")
        limit, key = http_utils.parse_pagination(
            {"queryStringParameters": {"limit": "99999", "next_token": token}}, "tenant-beta")
        self.assertEqual(limit, http_utils.MAX_PAGE_SIZE)
        self.assertEqual(key["id"], "WO#1")

    def test_path_id_is_url_decoded(self):
        self.assertEqual(http_utils.path_id({"pathParameters": {"id": "WO%23abc"}}), "WO#abc")

    def test_internal_errors_are_not_leaked(self):
        @http_utils.api_handler
        def boom(event, context):
            raise RuntimeError("arn:aws:dynamodb:secret-table")
        res = boom({}, None)
        self.assertEqual(res["statusCode"], 500)
        self.assertNotIn("arn:aws", res["body"])

    def test_sqs_partial_batch_failure(self):
        def handle(msg):
            if msg.get("fail"):
                raise ValueError("boom")
        res = sqs_utils.process_batch({"Records": [
            {"messageId": "1", "body": json.dumps({"ok": True})},
            {"messageId": "2", "body": json.dumps({"fail": True})},
        ]}, handle)
        self.assertEqual(res, {"batchItemFailures": [{"itemIdentifier": "2"}]})


class TestWorkOrders(unittest.TestCase):
    @mock.patch.object(wo_handler, "safe_publish")
    @mock.patch.object(wo_handler, "put_item")
    def test_create_publishes_event_and_ignores_client_id(self, put, publish):
        res = wo_handler.create_workorder(api_event({
            "id": "WO#hijack", "customer_id": "CUST#1", "title": "Chiller",
            "priority": "EMERGENCY", "estimated_hours": 2.5, "assigned_technician_id": "TECH#1",
            "status": "COMPLETED",
        }, role="DISPATCHER"), None)
        self.assertEqual(res["statusCode"], 201)
        item = put.call_args[0][1]
        self.assertNotEqual(item["id"], "WO#hijack")
        self.assertEqual(item["status"], "CREATED")
        self.assertTrue(put.call_args[1]["only_if_new"])
        self.assertEqual(publish.call_args[0][0], "WorkOrderCreated")
        self.assertEqual(publish.call_args[0][2]["assigned_technician_id"], "TECH#1")

    def test_technician_cannot_create(self):
        res = wo_handler.create_workorder(api_event({"customer_id": "C", "title": "x"}, role="TECHNICIAN"), None)
        self.assertEqual(res["statusCode"], 403)

    def test_invalid_priority(self):
        res = wo_handler.create_workorder(api_event({"customer_id": "C", "title": "x", "priority": "URGENT"}), None)
        self.assertEqual(res["statusCode"], 400)

    @mock.patch.object(wo_worker, "safe_publish")
    @mock.patch.object(wo_worker, "update_fields")
    @mock.patch.object(wo_worker, "get_item")
    def test_worker_moves_forward_only(self, get_item, update, publish):
        get_item.return_value = {"id": "WO#1", "status": "CREATED", "title": "t"}
        update.return_value = {"id": "WO#1", "status": "SCHEDULED", "title": "t"}
        res = wo_worker.process_sqs_event({"Records": [{"messageId": "m1", "body": json.dumps({
            "event_type": "VisitScheduled", "tenant_id": "tenant-alpha", "workorder_id": "WO#1",
            "technician_id": "TECH#9", "visit_status": "SCHEDULED"})}]}, None)
        self.assertEqual(res["batchItemFailures"], [])
        fields = update.call_args[0][3]
        self.assertEqual(fields["status"], "SCHEDULED")
        self.assertEqual(fields["assigned_technician_id"], "TECH#9")
        self.assertEqual(update.call_args[1]["expect"], {"status": "CREATED"})
        self.assertEqual(publish.call_args[0][0], "WorkOrderStatusChanged")

        update.reset_mock()
        get_item.return_value = {"id": "WO#1", "status": "COMPLETED"}
        wo_worker.process_sqs_event({"Records": [{"messageId": "m2", "body": json.dumps({
            "event_type": "VisitScheduled", "tenant_id": "tenant-alpha", "workorder_id": "WO#1"})}]}, None)
        update.assert_not_called()


class TestVisits(unittest.TestCase):
    @mock.patch.object(visits_worker, "publish_scheduled")
    @mock.patch.object(visits_worker, "put_item")
    def test_worker_autoschedules_only_with_technician(self, put, publish):
        msg = {"event_type": "WorkOrderCreated", "event_id": "abcdef1234567890", "tenant_id": "tenant-alpha",
               "workorder_id": "WO#1", "assigned_technician_id": "", "estimated_hours": 2}
        visits_worker.process_sqs_event({"Records": [{"messageId": "1", "body": json.dumps(msg)}]}, None)
        put.assert_not_called()
        msg["assigned_technician_id"] = "TECH#1"
        visits_worker.process_sqs_event({"Records": [{"messageId": "2", "body": json.dumps(msg)}]}, None)
        visit = put.call_args[0][1]
        self.assertEqual(visit["id"], "VISIT#auto-abcdef123456")
        self.assertEqual(visit["technician_id"], "TECH#1")
        self.assertTrue(visit["scheduled_end"] > visit["scheduled_start"])
        publish.assert_called_once()

    @mock.patch.object(visits_handler, "get_item", return_value={"id": "VISIT#1", "status": "IN_PROGRESS"})
    def test_complete_rejects_foreign_s3_keys(self, _):
        res = visits_handler.complete_visit(api_event(
            {"evidence_photos": ["tenant-beta/visits/VISIT#1/x.jpg"]}, path_id="VISIT%231"), None)
        self.assertEqual(res["statusCode"], 400)

    @mock.patch.object(visits_handler, "safe_publish")
    @mock.patch.object(visits_handler, "update_fields")
    @mock.patch.object(visits_handler, "get_item")
    def test_complete_publishes_event(self, get_item, update, publish):
        get_item.return_value = {"id": "VISIT#1", "status": "IN_PROGRESS", "evidence_photos": [],
                                 "workorder_id": "WO#1"}
        update.return_value = {"id": "VISIT#1", "status": "COMPLETED", "workorder_id": "WO#1",
                               "checklist": [{"item": "a", "passed": True}], "evidence_photos": [],
                               "signature_key": "tenant-alpha/visits/VISIT#1/1_signature.png"}
        res = visits_handler.complete_visit(api_event({
            "checklist": [{"item": "a", "passed": True}],
            "signature_key": "tenant-alpha/visits/VISIT#1/1_signature.png"}, role="TECHNICIAN",
            path_id="VISIT%231"), None)
        self.assertEqual(res["statusCode"], 200)
        self.assertEqual(publish.call_args[0][0], "VisitCompleted")
        self.assertTrue(publish.call_args[0][2]["has_signature"])

    @mock.patch.object(visits_handler, "get_item", return_value={"id": "VISIT#1"})
    def test_evidence_url_rejects_bad_type(self, _):
        res = visits_handler.get_evidence_upload_url(api_event(
            {"visit_id": "VISIT#1", "file_type": "text/html"}), None)
        self.assertEqual(res["statusCode"], 400)

    @mock.patch.object(evidence, "safe_publish")
    @mock.patch.object(evidence, "update_fields")
    @mock.patch.object(evidence, "get_item", return_value={"id": "VISIT#1", "evidence_photos": [],
                                                           "workorder_id": "WO#1"})
    def test_s3_processor_registers_photo(self, _, update, publish):
        evidence.process_s3_event({"Records": [{"s3": {"object": {
            "key": "tenant-alpha/visits/VISIT%231/171_foto.jpg", "size": 10}}}]}, None)
        self.assertEqual(update.call_args[0][3]["evidence_photos"], ["tenant-alpha/visits/VISIT#1/171_foto.jpg"])
        self.assertEqual(publish.call_args[0][2]["kind"], "PHOTO")


class TestInventoryAndNotifications(unittest.TestCase):
    def test_consume_validates_quantity(self):
        res = inv_handler.consume_inventory_part(api_event(
            {"part_id": "PART#1", "workorder_id": "WO#1", "quantity": 0}), None)
        self.assertEqual(res["statusCode"], 400)

    def test_notification_messages(self):
        sev, title, _ = notif_handler.build_notification(
            {"event_type": "WorkOrderCreated", "priority": "EMERGENCY", "workorder_id": "WO#abc", "title": "x"})
        self.assertEqual(sev, "CRITICAL")
        self.assertIn("abc", title)
        self.assertEqual(notif_handler.build_notification({"event_type": "InventoryLowStock", "sku": "S",
                                                           "remaining_stock": 1, "reorder_point": 5})[0], "WARNING")
        self.assertIsNone(notif_handler.build_notification({"event_type": "Unknown"}))

    @mock.patch.object(notif_handler, "put_item")
    def test_notification_worker_is_idempotent_by_event(self, put):
        msg = {"event_type": "VisitCompleted", "event_id": "e" * 32, "tenant_id": "tenant-alpha",
               "occurred_at": "2026-11-08T10:00:00+00:00", "visit_id": "VISIT#1"}
        notif_handler.process_sqs_event({"Records": [{"messageId": "1", "body": json.dumps(msg)}]}, None)
        item = put.call_args[0][1]
        self.assertEqual(item["id"], "NOTIF#2026-11-08T10:00:00+00:00#eeeeeeeeeeee")
        self.assertTrue(put.call_args[1]["only_if_new"])


if __name__ == "__main__":
    unittest.main()
