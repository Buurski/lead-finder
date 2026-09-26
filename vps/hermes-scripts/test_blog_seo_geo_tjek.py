#!/usr/bin/env python3
"""Offline tests for blog_seo_geo_tjek.py — no network, no Jev/HQ calls, no VPS paths touched.

Run: python3 test_blog_seo_geo_tjek.py
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blog_seo_geo_tjek as bst  # noqa: E402

GOOD_BODY = (
    "Vi ser tit at kunder i Herning spørger hvad en hjemmeside koster, og svaret svinger meget.\n\n"
    "## Hvad koster en hjemmeside i Herning?\n\nHer er tallene fra vores egne kunder i 2026, "
    "helt uden bindingsperiode eller skjulte gebyrer nogen steder overhovedet i aftalen.\n\n"
    "## Hvordan vælger jeg det rigtige bureau?\n\nSe på cases og spørg om du selv ejer koden "
    "bagefter, det er den vigtigste forskel mellem os og de fleste andre bureauer i Danmark.\n\n"
    "[Tjek din egen side gratis](https://kinly.dk/seo-tjek/?ref=blog-hvad-koster) og se "
    "[et eksempel her](https://kinly.dk/webbureau-herning/) og [et andet](https://kinly.dk/cases/).\n\n"
) * 8

GEO_LOG_FIXTURE = """---
title: GEO citation-log
---

## 2026-09-20 08:20

**Resultat:** ChatGPT 3/5

| Gruppe | Fast prompt | Mål | Svar | Nævnt | Placering | Kilder/status |
|---|---|---|---:|---:|---:|---|
| lokal | hvad koster en hjemmeside til en lille virksomhed | Kinly | ja | ja | 1 | kinly.dk, webko.dk |
| bred | webbureau i Aarhus til en lille virksomhed | Kinly | ja | nej | — | apparat.dk |

## 2026-09-24 07:36

**Resultat:** ChatGPT 6/12

| Gruppe | Fast prompt | Mål | Svar | Nævnt | Placering | Kilder/status |
|---|---|---|---:|---:|---:|---|
| lokal | webbureau til restaurant og café i Herning | Kinly | ja | ja | 1 | kinly.dk |
| bred | webdesigner til håndværkere i Jylland | Kinly | ja | nej | — | siteplan.dk |
"""


class KeywordForTests(unittest.TestCase):
    def test_note_soegeord_wins(self):
        post = {"title": "Titel", "note": "Brief: wiki/x.md — søgeord: hvad koster en hjemmeside"}
        self.assertEqual(bst._keyword_for(post), "hvad koster en hjemmeside")

    def test_field_fallback(self):
        post = {"title": "Titel", "mainKeyword": "seo tjek herning"}
        self.assertEqual(bst._keyword_for(post), "seo tjek herning")

    def test_title_fallback(self):
        post = {"title": "Hvad koster en hjemmeside"}
        self.assertEqual(bst._keyword_for(post), "Hvad koster en hjemmeside")


class SeoChecksTests(unittest.TestCase):
    def test_all_pass_on_good_post(self):
        post = {
            "title": "Hvad koster en hjemmeside i Herning?",
            "excerpt": "Vi gennemgår hvad en hjemmeside faktisk koster i Herning, med rigtige tal fra egne kunder.",
            "body": GOOD_BODY,
            "proofs": {"faq": [{"q": "a"}, {"q": "b"}, {"q": "c"}]},
        }
        result = bst.seo_checks(post)
        failed = [k for k, ok in result["checks"].items() if not ok]
        self.assertEqual(failed, [], f"uventede fejl: {failed}")

    def test_title_too_short_fails(self):
        post = {"title": "Kort", "excerpt": "x" * 100, "body": "", "proofs": {"faq": []}}
        self.assertFalse(bst.seo_checks(post)["checks"]["titel_30_60"])

    def test_faq_count_out_of_range_fails(self):
        post = {"title": "x" * 40, "excerpt": "x" * 100, "body": "",
                "proofs": {"faq": [{"q": "1"}, {"q": "2"}]}}
        self.assertFalse(bst.seo_checks(post)["checks"]["faq_3_til_5"])

    def test_cta_link_detected(self):
        post = {"title": "x" * 40, "excerpt": "x" * 100,
                "body": "tekst med [cta](https://kinly.dk/seo-tjek/?ref=blog-x) i sig", "proofs": {}}
        self.assertTrue(bst.seo_checks(post)["checks"]["cta_link"])

    def test_word_count_out_of_range_fails(self):
        post = {"title": "x" * 40, "excerpt": "x" * 100, "body": "kort tekst", "proofs": {}}
        self.assertFalse(bst.seo_checks(post)["checks"]["ordtal_600_900"])


class ClassifyFaqAnswerTests(unittest.TestCase):
    def test_valid_choice(self):
        raw = {"answers": {"besvaret": {"type": "choice", "choice": "delvist"}}}
        self.assertEqual(bst.classify_faq_answer(raw), "delvist")

    def test_none_falls_back(self):
        self.assertEqual(bst.classify_faq_answer(None), "ukendt")

    def test_invalid_choice_falls_back(self):
        raw = {"answers": {"besvaret": {"type": "choice", "choice": "måske"}}}
        self.assertEqual(bst.classify_faq_answer(raw), "ukendt")


class QuestionCoverageTests(unittest.TestCase):
    def test_respects_jev_budget(self):
        orig_get_q, orig_ask = bst.kundespoergsmaal.get_questions, bst.jev_lib.ask
        bst.kundespoergsmaal.get_questions = lambda kw, max_n=5: {"questions": ["q1", "q2", "q3"]}
        calls = {"n": 0}

        def fake_ask(state, questions):
            calls["n"] += 1
            return {"answers": {"besvaret": {"type": "choice", "choice": "ja"}}}

        bst.jev_lib.ask = fake_ask
        try:
            coverage = bst.question_coverage("tekst", "kw", jev_budget=[2])
        finally:
            bst.kundespoergsmaal.get_questions, bst.jev_lib.ask = orig_get_q, orig_ask
        self.assertEqual(calls["n"], 2)
        answers = [c["answer"] for c in coverage]
        self.assertEqual(answers.count("ja"), 2)
        self.assertIn("sprunget over (Jev-loft nået)", answers)


class GeoParsingTests(unittest.TestCase):
    def test_latest_section_is_last_date(self):
        section = bst.latest_geo_section(GEO_LOG_FIXTURE)
        self.assertEqual(section["date"], "2026-09-24")
        self.assertEqual(len(section["rows"]), 2)

    def test_no_sections_returns_none(self):
        self.assertIsNone(bst.latest_geo_section("intet her"))


class GeoStatusForTests(unittest.TestCase):
    def test_missing_file_reports_status(self):
        result = bst.geo_status_for({"title": "x", "slug": "x"}, geo_log_path=Path("/does/not/exist.md"))
        self.assertIn("ikke fundet", result["status"])

    def test_matching_topic_found(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "geo-log.md"
            path.write_text(GEO_LOG_FIXTURE, encoding="utf-8")
            post = {"title": "Webbureau til restaurant og café i Herning", "slug": "webbureau-restaurant-cafe"}
            result = bst.geo_status_for(post, geo_log_path=path)
        self.assertEqual(result["date"], "2026-09-24")
        self.assertGreaterEqual(result["rows_matched"], 1)

    def test_no_matching_topic(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "geo-log.md"
            path.write_text(GEO_LOG_FIXTURE, encoding="utf-8")
            post = {"title": "Zzyxxpq unrelated topic qwerty", "slug": "zzyxxpq"}
            result = bst.geo_status_for(post, geo_log_path=path)
        self.assertIn("ingen af de faste", result["status"])


class WriteGeoBlogQueriesTests(unittest.TestCase):
    def test_writes_expected_shape(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "geo-blog-queries.json"
            bst.write_geo_blog_queries(
                [{"slug": "hvad-koster", "keyword": "hvad koster en hjemmeside"}, {"slug": "", "keyword": "x"}],
                path=path,
            )
            data = json.loads(path.read_text(encoding="utf-8"))
        self.assertEqual(len(data["queries"]), 1)
        self.assertEqual(data["queries"][0]["gruppe"], "blog:hvad-koster")
        self.assertEqual(data["queries"][0]["query"], "hvad koster en hjemmeside")


class RettelserForTests(unittest.TestCase):
    def test_caps_at_three(self):
        checks = {k: False for k in bst.SUGGESTIONS}
        fixes = bst.rettelser_for(checks, [])
        self.assertEqual(len(fixes), 3)

    def test_no_fixes_when_all_pass(self):
        checks = {k: True for k in bst.SUGGESTIONS}
        self.assertEqual(bst.rettelser_for(checks, []), [])

    def test_unanswered_question_adds_fix(self):
        checks = {k: True for k in bst.SUGGESTIONS}
        fixes = bst.rettelser_for(checks, [{"question": "hvad koster det", "answer": "nej"}])
        self.assertEqual(len(fixes), 1)
        self.assertIn("hvad koster det", fixes[0])


class RunTests(unittest.TestCase):
    def test_dry_run_counts_cards_and_errors(self):
        orig_list, orig_get = bst.list_cards, bst.get_card

        def fake_list(stage):
            return [{"id": "ok-1"}, {"id": "bad-1"}] if stage == "klar" else []

        def fake_get(card_id):
            if card_id == "bad-1":
                raise RuntimeError("boom")
            return {"id": "ok-1", "title": "x" * 40, "excerpt": "x" * 100, "body": GOOD_BODY,
                    "proofs": {"faq": [{"q": "1"}, {"q": "2"}, {"q": "3"}]}, "slug": "x"}

        bst.list_cards, bst.get_card = fake_list, fake_get
        orig_get_q, orig_ask = bst.kundespoergsmaal.get_questions, bst.jev_lib.ask
        bst.kundespoergsmaal.get_questions = lambda kw, max_n=5: {"questions": []}
        bst.jev_lib.ask = lambda state, questions: {"answers": {"besvaret": {"type": "choice", "choice": "ja"}}}
        try:
            summary = bst.run(dry_run=True)
        finally:
            bst.list_cards, bst.get_card = orig_list, orig_get
            bst.kundespoergsmaal.get_questions, bst.jev_lib.ask = orig_get_q, orig_ask
        self.assertEqual(summary["cards_checked"], 2)
        self.assertEqual(summary["errors"], 1)
        self.assertTrue(summary["dry_run"])
        self.assertIsNone(summary["push_ok"])

    def test_no_cards_does_not_crash(self):
        orig_list = bst.list_cards
        bst.list_cards = lambda stage: []
        try:
            summary = bst.run(dry_run=True)
        finally:
            bst.list_cards = orig_list
        self.assertEqual(summary["cards_checked"], 0)
        self.assertEqual(summary["errors"], 0)


if __name__ == "__main__":
    unittest.main()
