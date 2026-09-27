#!/usr/bin/env python3
"""Offline test af geo_citation_loop's HQ-POST (action "geo") — intet netværk, crm_posts.call er faket."""
from __future__ import annotations

import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crm_posts  # noqa: E402
import geo_citation_loop as gcl  # noqa: E402

NOW = datetime(2026, 9, 28, 8, 20, 5, 123456, tzinfo=timezone.utc)
ROWS = [
    {"platform": "chatgpt", "gruppe": "lokal", "maal": "Kinly", "query": "webbureau herning", "status": "svar", "mentioned": True,
     "answer": "1. Kinly https://kinly.dk\n2. Webko (webko.dk)\n3. www.klartstudio.dk", "rank": "1", "sources": ""},
    {"platform": "chatgpt", "gruppe": "bred", "maal": "Kinly", "query": "webbureau aarhus", "status": "svar", "mentioned": False,
     "answer": "1. Apparat apparat.dk", "rank": "—", "sources": ""},
    {"platform": "chatgpt", "gruppe": "kunde:VIDA", "maal": "VIDA", "query": "skønhedsklinik aalborg", "status": "svar", "mentioned": True,
     "answer": "1. VIDA vida-klinik.dk", "rank": "1", "sources": ""},
    {"platform": "chatgpt", "gruppe": "lokal", "maal": "Kinly", "query": "nede", "status": "utilgængelig", "reason": "x", "mentioned": False, "rank": "—", "sources": "—"},
]


class HqPayloadTests(unittest.TestCase):
    def test_only_answered_kinly_rows_with_competitor_domains(self):
        p = gcl.hq_payload(ROWS, NOW)
        self.assertEqual(p["action"], "geo")
        self.assertEqual([r["query"] for r in p["results"]], ["webbureau herning", "webbureau aarhus"])
        first = p["results"][0]
        self.assertEqual(first, {"query": "webbureau herning", "group": "lokal", "engine": "chatgpt",
                                 "measuredAt": "2026-09-28T08:20:05+00:00", "mentionedKinly": True,
                                 "competitors": ["webko.dk", "klartstudio.dk"]})
        self.assertEqual(p["results"][1]["competitors"], ["apparat.dk"])

    def test_source_domains_unchanged(self):
        self.assertEqual(gcl.source_domains(ROWS[0]["answer"]), "kinly.dk, webko.dk, klartstudio.dk")
        self.assertEqual(gcl.source_domains("intet her"), "—")


class PostToHqTests(unittest.TestCase):
    def test_posts_to_seo_signals(self):
        with mock.patch.object(crm_posts, "call", return_value={"ok": True, "results": 2}) as call:
            gcl.post_to_hq(ROWS, NOW)
        payload, path = call.call_args.args
        self.assertEqual(path, "/api/agent/seo-signals")
        self.assertEqual(len(payload["results"]), 2)

    def test_network_error_never_raises(self):
        with mock.patch.object(crm_posts, "call", side_effect=OSError("nede")), mock.patch("builtins.print") as out:
            gcl.post_to_hq(ROWS, NOW)
        self.assertIn("fejlede", out.call_args.args[0])

    def test_rejection_is_logged(self):
        with mock.patch.object(crm_posts, "call", return_value={"ok": False, "error": "results[0].x kendes ikke"}), mock.patch("builtins.print") as out:
            gcl.post_to_hq(ROWS, NOW)
        self.assertIn("afvist", out.call_args.args[0])

    def test_nothing_to_send_skips_call(self):
        with mock.patch.object(crm_posts, "call") as call:
            gcl.post_to_hq([ROWS[2], ROWS[3]], NOW)
        call.assert_not_called()


if __name__ == "__main__":
    unittest.main()
