#!/usr/bin/env python3
"""Små regressionstests for den fælles mail-sync-kode."""
import json
import os
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch

# ponytail: mail_sync_common.py bruger fcntl (Unix-only file-lock) til
# write_mail_audit; VPS'en (Linux) har den, denne udviklingsmaskine (Windows)
# ikke. Testene patcher write_mail_audit selv, men modulets `import fcntl`
# kører allerede ved import — så en no-op-stub her (kun lokalt, aldrig
# deployet) er nok til at gøre testene kørbare på Windows.
if "fcntl" not in sys.modules:
    try:
        import fcntl  # noqa: F401
    except ImportError:
        _fcntl_stub = types.ModuleType("fcntl")
        _fcntl_stub.LOCK_EX = 2
        _fcntl_stub.LOCK_UN = 8
        _fcntl_stub.flock = lambda *a, **k: 0
        sys.modules["fcntl"] = _fcntl_stub

import crm_agent_log
import crm_mail_sync_jev
import inbox_digest_jev
import mail_sync_common as common


def make_fake_kv():
    """In-memory erstatning for crm_mail_sync_jev.kv — dækker GET/SET/LRANGE/RPUSH."""
    store: dict[str, object] = {}

    def fake_kv(*args):
        cmd = args[0]
        if cmd == "GET":
            return store.get(args[1])
        if cmd == "SET":
            store[args[1]] = args[2]
            return "OK"
        if cmd == "LRANGE":
            return list(store.get(args[1], []))
        if cmd == "RPUSH":
            store.setdefault(args[1], []).append(args[2])
            return len(store[args[1]])
        raise AssertionError(f"uventet KV-kald: {args}")

    return fake_kv, store


class DeltaCacheTests(unittest.TestCase):
    def test_only_valid_and_changed_content_classifies(self):
        with tempfile.TemporaryDirectory() as td:
            state = common.DeltaCache(os.path.join(td, "state.json"))
            state.update_item("a", "hash-1", {"ok": True})
            state.update_item("a", "hash-1", {"ok": False})
            self.assertEqual(state.cached("a", "hash-1"), {"ok": True})
            state.update_item("a", "hash-2", {"ok": False})
            self.assertIsNone(state.cached("a", "hash-2"))

    def test_atomic_write_and_dedupe(self):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "state.json")
            first = common.DeltaCache(path)
            first.update_item("a", "h", {"ok": True, "answer": "kort"})
            first.update_item("a", "h", {"ok": True, "answer": "kort"})
            second = common.DeltaCache(path)
            self.assertEqual(second.cached("a", "h"), {"ok": True, "answer": "kort"})
            with open(path, encoding="utf-8") as fh:
                data = json.load(fh)
            self.assertEqual(list(data["items"]), ["a"])


class PaginationTests(unittest.TestCase):
    def test_reads_stored_composio_response_file(self):
        with tempfile.TemporaryDirectory() as td:
            stored = os.path.join(td, "response.json")
            with open(stored, "w", encoding="utf-8") as fh:
                json.dump({"successful": True, "data": {"messages": [{"id": "stored"}]}}, fh)
            response, messages = common.extract_payload({"storedInFile": True, "outputFilePath": stored})
        self.assertEqual(messages, [{"id": "stored"}])
        self.assertEqual(response["messages"], [{"id": "stored"}])

    @staticmethod
    def _proc(payload):
        return common.subprocess.CompletedProcess([], 0, stdout=json.dumps({"successful": True, "data": payload}), stderr="")

    def test_follows_tokens_until_page_51(self):
        pages = [
            self._proc({"messages": [{"id": str(i)} for i in range(1, 51)], "nextPageToken": "p2"}),
            self._proc({"messages": [{"id": "51"}]}),
        ]
        with patch.object(common.subprocess, "run", side_effect=pages) as run:
            messages, calls, pages_read = common.fetch_gmail_window("newer_than:5d", 5, 50)
        self.assertEqual(calls, 2)
        self.assertEqual(messages[-1]["id"], "51")
        self.assertEqual(pages_read, 51)
        self.assertIn("p2", run.call_args_list[1].args[-1][-1])

    def test_deduplicates_message_ids_across_pages(self):
        pages = [
            self._proc({"messages": [{"id": "1"}, {"id": "2"}], "nextPageToken": "p2"}),
            self._proc({"messages": [{"id": "2"}, {"id": "3"}]}),
        ]
        with patch.object(common.subprocess, "run", side_effect=pages):
            messages, _, _ = common.fetch_gmail_window("in:inbox newer_than:5d", 5, 50)
        self.assertEqual([m["id"] for m in messages], ["1", "2", "3"])

    def test_fails_closed_at_bounded_window(self):
        pages = [self._proc({"messages": [{"id": str(i)} for i in range(50)], "nextPageToken": "more"})] * 21
        with patch.object(common.subprocess, "run", side_effect=pages):
            with self.assertRaisesRegex(RuntimeError, "window"):
                common.fetch_gmail_window("newer_than:5d", 1, 50)


class JevQuestionShapeTests(unittest.TestCase):
    def test_mail_jobs_use_named_questions_and_accept_named_answers(self):
        raw = {
            "answers": {
                "type": {"type": "choice", "choice": "kunde"},
                "reply": {"type": "choice", "choice": "Ja"},
                "priority": {"type": "choice", "choice": "høj"},
            }
        }
        for module in (inbox_digest_jev, crm_mail_sync_jev):
            with self.subTest(module=module.__name__):
                self.assertIsInstance(module.QUESTIONS, dict)
                self.assertEqual(set(module.QUESTIONS), {"type", "reply", "priority"})
                for question in module.QUESTIONS.values():
                    self.assertEqual(question["type"], "choice")
                    self.assertIn("instructions", question)
                    self.assertIsInstance(question["criteria"], dict)
                self.assertTrue(module.classify(raw)["ok"])


class InboxRunTests(unittest.TestCase):
    def test_jev_failure_never_creates_fresh_digest(self):
        message = {
            "id": "m1",
            "snippet": "Hej Lucas",
            "payload": {"headers": [{"name": "From", "value": "test@example.dk"}, {"name": "Subject", "value": "Hej"}]},
        }
        with tempfile.TemporaryDirectory() as td:
            with patch.object(sys, "argv", ["inbox_digest_jev.py", "--dry-run"]), \
                 patch.object(inbox_digest_jev.jev_lib, "load_key", return_value="test-key"), \
                 patch.object(inbox_digest_jev, "STATE", os.path.join(td, "state.json")), \
                 patch.object(inbox_digest_jev, "fetch_gmail_window", return_value=([message], 1, 1)), \
                 patch.object(inbox_digest_jev.jev_lib, "ask", return_value=None), \
                 patch.object(inbox_digest_jev, "write_mail_audit") as audit:
                with self.assertRaisesRegex(RuntimeError, "classification"):
                    inbox_digest_jev.main()
            audit.assert_not_called()


CRM_CUSTOMERS = [{"name": "VIDA Skønhedsklinik", "emails": ["info@vida-klinik.dk"], "domains": ["vida-klinik.dk"]}]


class CrmGuardTests(unittest.TestCase):
    @staticmethod
    def _message(mid, sender, subject="Info om aftalen"):
        return {"id": mid, "threadId": f"t-{mid}", "snippet": "Hej med dig",
                "payload": {"headers": [{"name": "From", "value": sender},
                                         {"name": "Subject", "value": subject}]}}

    def test_missing_key_refuses_before_any_kv(self):
        with patch.object(crm_mail_sync_jev.jev_lib, "load_key", return_value=None), \
             patch.object(crm_mail_sync_jev, "kv") as kv:
            with self.assertRaisesRegex(RuntimeError, "TYPESAFE_API_KEY"):
                crm_mail_sync_jev.main()
        kv.assert_not_called()

    def test_classification_error_refuses_crm_writes(self):
        message = self._message("m1", "kunde@vida-klinik.dk")
        with tempfile.TemporaryDirectory() as td, \
             patch.object(crm_mail_sync_jev.jev_lib, "load_key", return_value="test-key"), \
             patch.object(crm_mail_sync_jev, "load_customers", return_value=CRM_CUSTOMERS), \
             patch.object(crm_mail_sync_jev, "our_addresses", return_value={"lucas@kinly.dk"}), \
             patch.object(crm_mail_sync_jev.jev_lib, "ask", return_value=None), \
             patch.object(crm_mail_sync_jev, "STATE", os.path.join(td, "crm.json")), \
             patch.object(crm_mail_sync_jev, "fetch_gmail_window", return_value=([message], 1, 1)), \
             patch.object(crm_mail_sync_jev, "kv") as kv:
            kv.return_value = "{}"
            with self.assertRaisesRegex(RuntimeError, "classification"):
                crm_mail_sync_jev.main()
        commands = [call.args[0] for call in kv.call_args_list if call.args]
        self.assertNotIn("RPUSH", commands)
        self.assertNotIn("SET", commands)


class CustomerIndexTests(unittest.TestCase):
    def test_build_index_maps_addresses_and_domains_excluding_freemail_domains(self):
        customers = [
            {"name": "VIDA Skønhedsklinik", "emails": ["info@vida-klinik.dk", "lene@gmail.com"], "domains": ["vida-klinik.dk", "gmail.com"]},
            {"name": "KT VVS", "emails": [], "domains": ["www.ktvvs.dk"]},
        ]
        by_address, by_domain = crm_mail_sync_jev.build_index(customers)
        self.assertEqual(by_address["info@vida-klinik.dk"], "VIDA Skønhedsklinik")
        self.assertEqual(by_address["lene@gmail.com"], "VIDA Skønhedsklinik")  # eksakt adresse er altid ok
        self.assertEqual(by_domain["vida-klinik.dk"], "VIDA Skønhedsklinik")
        self.assertEqual(by_domain["ktvvs.dk"], "KT VVS")  # www. strippes
        self.assertNotIn("gmail.com", by_domain)  # domænet alene tæller aldrig for en gratis-udbyder

    def test_build_query_uses_from_to_cc_and_excludes_freemail_domain(self):
        query = crm_mail_sync_jev.build_query([{"name": "VIDA", "emails": ["lene@gmail.com"], "domains": ["vida-klinik.dk", "gmail.com"]}])
        for op in ("from:", "to:", "cc:"):
            self.assertIn(f"{op}vida-klinik.dk", query)
            self.assertIn(f"{op}lene@gmail.com", query)
            self.assertNotIn(f"{op}gmail.com", query)
        self.assertTrue(query.endswith("newer_than:14d"))

    def test_build_query_refuses_empty_customer_list(self):
        with self.assertRaisesRegex(RuntimeError, "ingen kunde-adresser"):
            crm_mail_sync_jev.build_query([])


class ParticipantMatchTests(unittest.TestCase):
    def setUp(self):
        self.by_address, self.by_domain = crm_mail_sync_jev.build_index(CRM_CUSTOMERS)

    @staticmethod
    def _msg(frm, to="", cc="", subject="Hej", snippet="tekst"):
        headers = [{"name": "From", "value": frm}, {"name": "Subject", "value": subject}]
        if to:
            headers.append({"name": "To", "value": to})
        if cc:
            headers.append({"name": "Cc", "value": cc})
        return {"id": "m1", "snippet": snippet, "payload": {"headers": headers}}

    def test_matches_on_domain_participant(self):
        msg = self._msg("lene@vida-klinik.dk", to="lucas@kinly.dk")
        self.assertEqual(crm_mail_sync_jev.customer_for(msg, self.by_address, self.by_domain), "VIDA Skønhedsklinik")

    def test_cc_participant_matches_too(self):
        msg = self._msg("nogen@andet.dk", to="andre@andet.dk", cc="info@vida-klinik.dk")
        self.assertEqual(crm_mail_sync_jev.customer_for(msg, self.by_address, self.by_domain), "VIDA Skønhedsklinik")

    def test_does_not_match_on_body_text_mention(self):
        """Regression 26/9: en kold-mail der NÆVNER kundens navn i teksten må ikke logges på kunden."""
        msg = self._msg("lucas@kinly.dk", to="kontakt@mhudpleje.dk", subject="En idé til M Hudpleje",
                         snippet="Jeg lavede for nylig en side til VIDA Skønhedsklinik, som I måske kender...")
        self.assertEqual(crm_mail_sync_jev.customer_for(msg, self.by_address, self.by_domain), "")

    def test_unrelated_mail_does_not_match(self):
        msg = self._msg("nogen@andet.dk", to="andre@andet.dk")
        self.assertEqual(crm_mail_sync_jev.customer_for(msg, self.by_address, self.by_domain), "")


class NoiseFilterTests(unittest.TestCase):
    @staticmethod
    def _msg(subject, extra_headers=None):
        headers = [{"name": "Subject", "value": subject}]
        headers.extend(extra_headers or [])
        return {"payload": {"headers": headers}}

    def test_test_subject_is_noise(self):
        """Regression 26/9: Brevo-nyhedsbrevets 'TEST - ...'-udsendelser fra Ikast blev logget som kundemail."""
        self.assertTrue(crm_mail_sync_jev.is_campaign_noise(self._msg("TEST - Samme værksted i to byer?")))

    def test_brevo_headers_are_noise_even_with_ordinary_subject(self):
        msg = self._msg("Nyhedsbrev fra os", [{"name": "List-Unsubscribe", "value": "<mailto:unsub@sendinblue.com>"}])
        self.assertTrue(crm_mail_sync_jev.is_campaign_noise(msg))

    def test_ordinary_mail_is_not_noise(self):
        self.assertFalse(crm_mail_sync_jev.is_campaign_noise(self._msg("Spørgsmål om fakturaen")))


def _fake_ask(state, questions, model=crm_mail_sync_jev.MODEL, **_kw):
    if "waiting_on" in questions:
        return {"answers": {"waiting_on": {"type": "choice", "choice": "os"}}}
    return {"answers": {
        "type": {"type": "choice", "choice": "kunde"},
        "reply": {"type": "choice", "choice": "Ja"},
        "priority": {"type": "choice", "choice": "mellem"},
    }}


class DynamicCustomerFlowTests(unittest.TestCase):
    @staticmethod
    def _msg(mid, frm, to="", subject="Hej", snippet="Hej med dig"):
        headers = [{"name": "From", "value": frm}, {"name": "Subject", "value": subject}]
        if to:
            headers.append({"name": "To", "value": to})
        return {"id": mid, "threadId": f"t-{mid}", "snippet": snippet, "payload": {"headers": headers}}

    def test_end_to_end_participant_match_writes_dir_and_status(self):
        messages = [self._msg("m1", "lene@vida-klinik.dk", to="lucas@kinly.dk", subject="Spørgsmål om siden")]
        fake_kv, store = make_fake_kv()
        logged = []
        with tempfile.TemporaryDirectory() as td, \
             patch.object(crm_mail_sync_jev.jev_lib, "load_key", return_value="test-key"), \
             patch.object(crm_mail_sync_jev, "load_customers", return_value=CRM_CUSTOMERS), \
             patch.object(crm_mail_sync_jev, "our_addresses", return_value={"lucas@kinly.dk"}), \
             patch.object(crm_mail_sync_jev, "STATE", os.path.join(td, "state.json")), \
             patch.object(crm_mail_sync_jev, "fetch_gmail_window", return_value=(messages, 1, 1)), \
             patch.object(crm_mail_sync_jev.jev_lib, "ask", side_effect=_fake_ask), \
             patch.object(crm_mail_sync_jev, "kv", side_effect=fake_kv), \
             patch.object(crm_mail_sync_jev, "write_mail_audit"), \
             patch.object(crm_agent_log, "log_activity", side_effect=lambda **kw: logged.append(kw)):
            code = crm_mail_sync_jev.main()
        self.assertEqual(code, 0)
        activities = [json.loads(x) for x in store["log:crm-activity"]]
        self.assertEqual(len(activities), 1)
        self.assertEqual(activities[0]["clientName"], "VIDA Skønhedsklinik")
        self.assertEqual(activities[0]["dir"], "ind")  # afsender er kunden, ikke os
        self.assertEqual(len(logged), 1)
        self.assertEqual(logged[0]["payload"]["waitingOn"], "os")
        self.assertEqual(logged[0]["company"], "VIDA Skønhedsklinik")

    def test_our_own_outbound_mail_gets_dir_ud(self):
        messages = [self._msg("m2", "lucas@kinly.dk", to="lene@vida-klinik.dk", subject="Her er dit udkast")]
        fake_kv, store = make_fake_kv()
        with tempfile.TemporaryDirectory() as td, \
             patch.object(crm_mail_sync_jev.jev_lib, "load_key", return_value="test-key"), \
             patch.object(crm_mail_sync_jev, "load_customers", return_value=CRM_CUSTOMERS), \
             patch.object(crm_mail_sync_jev, "our_addresses", return_value={"lucas@kinly.dk"}), \
             patch.object(crm_mail_sync_jev, "STATE", os.path.join(td, "state.json")), \
             patch.object(crm_mail_sync_jev, "fetch_gmail_window", return_value=(messages, 1, 1)), \
             patch.object(crm_mail_sync_jev.jev_lib, "ask", side_effect=_fake_ask), \
             patch.object(crm_mail_sync_jev, "kv", side_effect=fake_kv), \
             patch.object(crm_mail_sync_jev, "write_mail_audit"), \
             patch.object(crm_agent_log, "log_activity"):
            code = crm_mail_sync_jev.main()
        self.assertEqual(code, 0)
        activities = [json.loads(x) for x in store["log:crm-activity"]]
        self.assertEqual(activities[0]["dir"], "ud")

    def test_cold_mail_mentioning_customer_name_is_never_logged_or_scored(self):
        messages = [self._msg("m3", "lucas@kinly.dk", to="kontakt@mhudpleje.dk", subject="En idé til M Hudpleje",
                               snippet="Jeg lavede for nylig en side til VIDA Skønhedsklinik...")]
        fake_kv, store = make_fake_kv()
        with tempfile.TemporaryDirectory() as td, \
             patch.object(crm_mail_sync_jev.jev_lib, "load_key", return_value="test-key"), \
             patch.object(crm_mail_sync_jev, "load_customers", return_value=CRM_CUSTOMERS), \
             patch.object(crm_mail_sync_jev, "our_addresses", return_value={"lucas@kinly.dk"}), \
             patch.object(crm_mail_sync_jev, "STATE", os.path.join(td, "state.json")), \
             patch.object(crm_mail_sync_jev, "fetch_gmail_window", return_value=(messages, 1, 1)), \
             patch.object(crm_mail_sync_jev.jev_lib, "ask") as ask, \
             patch.object(crm_mail_sync_jev, "kv", side_effect=fake_kv), \
             patch.object(crm_mail_sync_jev, "write_mail_audit"), \
             patch.object(crm_agent_log, "log_activity") as log_activity:
            code = crm_mail_sync_jev.main()
        self.assertEqual(code, 0)
        self.assertEqual(store.get("log:crm-activity", []), [])
        ask.assert_not_called()
        log_activity.assert_not_called()

    def test_brevo_test_mail_from_customer_domain_is_never_logged(self):
        """Regression 26/9: Ikasts 'TEST - ...'-nyhedsbrevmail blev logget som kundemail."""
        customers = [{"name": "Ikast AutoService", "emails": [], "domains": ["ikastautoservice.dk"]}]
        messages = [self._msg("m4", "ikast@ikastautoservice.dk", to="lucas@kinly.dk", subject="TEST - Samme værksted i to byer?")]
        fake_kv, store = make_fake_kv()
        with tempfile.TemporaryDirectory() as td, \
             patch.object(crm_mail_sync_jev.jev_lib, "load_key", return_value="test-key"), \
             patch.object(crm_mail_sync_jev, "load_customers", return_value=customers), \
             patch.object(crm_mail_sync_jev, "our_addresses", return_value={"lucas@kinly.dk"}), \
             patch.object(crm_mail_sync_jev, "STATE", os.path.join(td, "state.json")), \
             patch.object(crm_mail_sync_jev, "fetch_gmail_window", return_value=(messages, 1, 1)), \
             patch.object(crm_mail_sync_jev.jev_lib, "ask") as ask, \
             patch.object(crm_mail_sync_jev, "kv", side_effect=fake_kv), \
             patch.object(crm_mail_sync_jev, "write_mail_audit"), \
             patch.object(crm_agent_log, "log_activity") as log_activity:
            code = crm_mail_sync_jev.main()
        self.assertEqual(code, 0)
        self.assertEqual(store.get("log:crm-activity", []), [])
        ask.assert_not_called()
        log_activity.assert_not_called()

    def test_status_jev_failure_is_best_effort_and_never_blocks_core_sync(self):
        messages = [self._msg("m5", "lene@vida-klinik.dk", to="lucas@kinly.dk", subject="Spørgsmål")]
        fake_kv, store = make_fake_kv()

        def flaky_ask(state, questions, model=crm_mail_sync_jev.MODEL, **_kw):
            if "waiting_on" in questions:
                return None  # Jev-fejl på status-vurderingen
            return _fake_ask(state, questions, model)

        with tempfile.TemporaryDirectory() as td, \
             patch.object(crm_mail_sync_jev.jev_lib, "load_key", return_value="test-key"), \
             patch.object(crm_mail_sync_jev, "load_customers", return_value=CRM_CUSTOMERS), \
             patch.object(crm_mail_sync_jev, "our_addresses", return_value={"lucas@kinly.dk"}), \
             patch.object(crm_mail_sync_jev, "STATE", os.path.join(td, "state.json")), \
             patch.object(crm_mail_sync_jev, "fetch_gmail_window", return_value=(messages, 1, 1)), \
             patch.object(crm_mail_sync_jev.jev_lib, "ask", side_effect=flaky_ask), \
             patch.object(crm_mail_sync_jev, "kv", side_effect=fake_kv), \
             patch.object(crm_mail_sync_jev, "write_mail_audit"), \
             patch.object(crm_agent_log, "log_activity") as log_activity:
            code = crm_mail_sync_jev.main()
        self.assertEqual(code, 0)
        # Kernen (aktivitet + state) skal stå, selvom status-vurderingen fejlede.
        self.assertEqual(len(store["log:crm-activity"]), 1)
        log_activity.assert_not_called()


class InboxImageTests(unittest.TestCase):
    @staticmethod
    def _image_message():
        return {"id": "img1", "threadId": "thread-9", "snippet": "[image]",
                "payload": {"headers": [{"name": "From", "value": "billede@vida-klinik.dk"},
                                         {"name": "Subject", "value": "Foto"}]}}

    def test_image_mail_is_visible_and_never_calls_jev(self):
        stored = {}

        def fake_kv(*args):
            if args[0] == "SET":
                stored["digest"] = json.loads(args[2])
                return "OK"
            if args[0] == "GET":
                return json.dumps(stored["digest"])
            raise AssertionError(f"uventet KV-kald: {args}")

        with tempfile.TemporaryDirectory() as td, \
             patch.object(sys, "argv", ["inbox_digest_jev.py"]), \
             patch.object(inbox_digest_jev.jev_lib, "load_key", return_value="test-key"), \
             patch.object(inbox_digest_jev.jev_lib, "ask") as ask, \
             patch.object(inbox_digest_jev, "STATE", os.path.join(td, "state.json")), \
             patch.object(inbox_digest_jev, "fetch_gmail_window", return_value=([self._image_message()], 1, 1)), \
             patch.object(inbox_digest_jev, "write_mail_audit") as audit, \
             patch.object(inbox_digest_jev.inbox_digest_sync, "load_env"), \
             patch.object(inbox_digest_jev.inbox_digest_sync, "kv_cmd", side_effect=fake_kv):
            code = inbox_digest_jev.main()
        self.assertEqual(code, 0)
        ask.assert_not_called()
        audit.assert_called_once()
        items = stored["digest"]["items"]
        self.assertEqual(len(items), 1)
        self.assertTrue(items[0]["needsReply"])
        self.assertEqual(items[0]["threadId"], "thread-9")

    def test_set_noop_is_caught_by_readback(self):
        old = {"generatedAt": "2026-01-01T00:00:00Z",
               "items": [{"id": "img1", "from": "billede@vida-klinik.dk", "subject": "x", "snippet": "",
                          "date": "", "account": "lucas", "category": "other", "importance": 80,
                          "needsReply": True, "reason": "gammel"}]}

        def fake_kv(*args):
            if args[0] == "SET":
                return "OK"  # no-op: skriver ikke noget
            if args[0] == "GET":
                return json.dumps(old)
            raise AssertionError(f"uventet KV-kald: {args}")

        with tempfile.TemporaryDirectory() as td, \
             patch.object(sys, "argv", ["inbox_digest_jev.py"]), \
             patch.object(inbox_digest_jev.jev_lib, "load_key", return_value="test-key"), \
             patch.object(inbox_digest_jev.jev_lib, "ask"), \
             patch.object(inbox_digest_jev, "STATE", os.path.join(td, "state.json")), \
             patch.object(inbox_digest_jev, "fetch_gmail_window", return_value=([self._image_message()], 1, 1)), \
             patch.object(inbox_digest_jev, "write_mail_audit"), \
             patch.object(inbox_digest_jev.inbox_digest_sync, "load_env"), \
             patch.object(inbox_digest_jev.inbox_digest_sync, "kv_cmd", side_effect=fake_kv):
            with self.assertRaisesRegex(RuntimeError, "read-back"):
                inbox_digest_jev.main()


class NoSendRouteTests(unittest.TestCase):
    def test_mail_scripts_have_no_send_route(self):
        for module in (inbox_digest_jev, crm_mail_sync_jev):
            text = Path(module.__file__).read_text(encoding="utf-8")
            for token in ("GMAIL_SEND", "send_email", "smtplib", "sendmail"):
                with self.subTest(module=module.__name__, token=token):
                    self.assertNotIn(token, text)


class AuditTests(unittest.TestCase):
    def test_daily_budget_rejects_after_limit(self):
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "audit.jsonl")
            common.write_mail_audit(path, "job", 1, 1000, 1.5)
            with self.assertRaisesRegex(RuntimeError, "daily budget"):
                common.write_mail_audit(path, "job", 1, 1000, 1.5, max_kr=1)

    def test_budget_is_per_job_not_shared(self):
        """Budget-guarden tæller pr. job (runbook: 50 kald/dag pr. job). Før fixet delte de to
        mail-jobs ét loft, så kold start af begge i samme døgn spærrede job nr. 2."""
        with tempfile.TemporaryDirectory() as td:
            path = os.path.join(td, "audit.jsonl")
            now = common.datetime.now(common.timezone.utc).isoformat().replace("+00:00", "Z")
            Path(path).write_text(
                json.dumps({"ts": now, "mail_job": "inbox-digest-sync", "jev_calls": 45, "estimated_cost_kr": 0.5}) + "\n",
                encoding="utf-8")
            common.write_mail_audit(path, "crm-mail-sync", 45, 1000, 0.5)  # 45+45 på tværs må IKKE blokere
            with self.assertRaisesRegex(RuntimeError, "daily budget"):
                common.write_mail_audit(path, "crm-mail-sync", 6, 1000, 0.01)  # 45+6 > 50 for SAMME job


class CrmTransitionTests(unittest.TestCase):
    def test_day_of_and_iso_at_normalize_rfc(self):
        self.assertEqual(crm_mail_sync_jev.day_of("Mon, 21 Sep 2026 09:43:51 +0200"), "2026-09-21")
        self.assertEqual(crm_mail_sync_jev.day_of("2026-09-21T09:43:51+02:00"), "2026-09-21")
        self.assertEqual(crm_mail_sync_jev.day_of(""), "")
        self.assertEqual(crm_mail_sync_jev.iso_at("Mon, 21 Sep 2026 09:43:51 +0200"), "2026-09-21T09:43:51+02:00")

    def test_transition_filter_drops_legacy_covered_days(self):
        prior = [{"id": "act_mail_20260921_vida_svar", "clientName": "VIDA Skønhedsklinik",
                  "actor": "hermes (Gmail-scan)", "at": "2026-09-21T07:43:51Z"}]
        covered = {"id": "act_mail_20260921_vida_abc", "clientName": "VIDA Skønhedsklinik",
                   "actor": "hermes (mail-sync)", "at": "2026-09-21T09:43:51+02:00"}
        uncovered = {**covered, "id": "act_mail_20260922_vida_def", "at": "2026-09-22T09:43:51+02:00"}
        keep = crm_mail_sync_jev.fresh_activities([covered, uncovered], prior)
        self.assertEqual([i["id"] for i in keep], [uncovered["id"]])

    def test_own_entries_do_not_count_as_legacy(self):
        prior = [{"id": "act_mail_20260921_vida_x", "clientName": "VIDA Skønhedsklinik",
                  "actor": "hermes (mail-sync)", "at": "2026-09-21T10:00:00+02:00"}]
        mine = {"id": "act_mail_20260921_vida_y", "clientName": "VIDA Skønhedsklinik",
                "actor": "hermes (mail-sync)", "at": "2026-09-21T09:00:00+02:00"}
        self.assertEqual(len(crm_mail_sync_jev.fresh_activities([mine], prior)), 1)

    def test_common_iso_at_normalizes_rfc(self):
        self.assertEqual(common.iso_at("Thu, 24 Sep 2026 15:27:29 -0700"), "2026-09-24T15:27:29-07:00")
        self.assertEqual(common.iso_at("2026-09-24T15:27:29-07:00"), "2026-09-24T15:27:29-07:00")
        self.assertEqual(common.iso_at("ikke en dato"), "")


class StatusTextTests(unittest.TestCase):
    @staticmethod
    def _msg(sender: str, body: str, date: str) -> dict:
        import base64
        data = base64.urlsafe_b64encode(body.encode()).decode()
        return {"payload": {"mimeType": "text/plain", "body": {"data": data},
                            "headers": [{"name": "From", "value": sender}, {"name": "Date", "value": date}]}}

    def test_newest_mail_survives_budget(self):
        old = self._msg("Lene <info@vida-klinik.dk>", "gammel " * 600, "2026-09-24T08:00:00Z")
        new = self._msg("Lucas <lucas@kinly.dk>", "Hvad koster farve af vipper?", "2026-09-25T13:27:00Z")
        text = crm_mail_sync_jev.thread_text([old, new])
        self.assertIn("Hvad koster farve af vipper?", text)
        self.assertLessEqual(len(text), 2500 + 10)
        self.assertLess(text.index("gammel"), text.index("Hvad koster"))  # kronologisk

    def test_guard_question_from_us_means_customer(self):
        g = crm_mail_sync_jev.guard_status
        self.assertEqual(g("ingen", True, "Et par spørgsmål:\n1. Hvad koster det?\nHilsen Lucas"), "kunden")
        self.assertEqual(g("os", True, "Kan du sende billederne?"), "kunden")
        self.assertEqual(g("ingen", True, "Se https://kinly.dk/?ref=x tak"), "ingen")
        self.assertEqual(g("ingen", True, "Tak, god weekend\n\nDen 25. sep. skrev Lene:\n> Virker det?"), "ingen")
        self.assertEqual(g("os", False, "Hvad koster det?"), "os")


if __name__ == "__main__":
    unittest.main()
