#!/usr/bin/env python3
"""Offline tests for kundespoergsmaal.py — no network.

Run: python3 test_kundespoergsmaal.py
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import kundespoergsmaal as ks  # noqa: E402


class LooksDanishTests(unittest.TestCase):
    def test_latin_text_passes(self):
        self.assertTrue(ks._looks_danish("hvad koster en hjemmeside i herning"))

    def test_cjk_text_filtered(self):
        self.assertFalse(ks._looks_danish("网站 多少钱"))

    def test_empty_string_filtered(self):
        self.assertFalse(ks._looks_danish(""))


class GetQuestionsTests(unittest.TestCase):
    def _fake_suggestions(self, table):
        def fake(query, timeout=10):
            return table.get(query, [])
        return fake

    def test_calls_base_plus_six_prefixes_at_most_eight(self):
        calls = []

        def fake(query, timeout=10):
            calls.append(query)
            return []

        orig = ks._suggestions_for
        ks._suggestions_for = fake
        try:
            ks.get_questions("hjemmeside pris", pause=0)
        finally:
            ks._suggestions_for = orig
        self.assertLessEqual(len(calls), 8)
        self.assertIn("hjemmeside pris", calls)
        self.assertIn("hvad hjemmeside pris", calls)
        self.assertIn("skal man hjemmeside pris", calls)

    def test_dedupes_case_insensitively(self):
        table = {
            "seo": ["Hvad er SEO?", "hvad er seo?"],
            "hvad seo": ["Hvad er SEO?"],
        }
        orig = ks._suggestions_for
        ks._suggestions_for = self._fake_suggestions(table)
        try:
            result = ks.get_questions("seo", pause=0)
        finally:
            ks._suggestions_for = orig
        self.assertEqual(result["questions"].count("Hvad er SEO?"), 1)
        self.assertEqual(len(result["questions"]), 1)

    def test_filters_non_danish_suggestion(self):
        table = {"webbureau": ["hvad koster et webbureau", "网站建设"]}
        orig = ks._suggestions_for
        ks._suggestions_for = self._fake_suggestions(table)
        try:
            result = ks.get_questions("webbureau", pause=0)
        finally:
            ks._suggestions_for = orig
        self.assertNotIn("网站建设", result["questions"])

    def test_respects_max_n(self):
        table = {"x": [f"spørgsmål {i}" for i in range(20)]}
        orig = ks._suggestions_for
        ks._suggestions_for = self._fake_suggestions(table)
        try:
            result = ks.get_questions("x", max_n=3, pause=0)
        finally:
            ks._suggestions_for = orig
        self.assertEqual(len(result["questions"]), 3)

    def test_empty_keyword_returns_empty(self):
        result = ks.get_questions("   ", pause=0)
        self.assertEqual(result["questions"], [])
        self.assertEqual(result["keyword"], "")

    def test_output_shape(self):
        orig = ks._suggestions_for
        ks._suggestions_for = lambda q, timeout=10: []
        try:
            result = ks.get_questions("test", pause=0)
        finally:
            ks._suggestions_for = orig
        self.assertEqual(set(result.keys()), {"keyword", "questions", "fetched_at"})
        self.assertTrue(result["fetched_at"].endswith("Z"))


if __name__ == "__main__":
    unittest.main()
