#!/usr/bin/env python3
"""Offline test for geo_citation_loop.load_extra_queries() — no network, no VPS.

This is a PROPOSED VPS-side change (see header of geo_citation_loop.py); this
test only exercises the pure function, not the live measure()/save() flow.
Run: python3 test_geo_citation_loop_extra_queries.py
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import geo_citation_loop as gcl  # noqa: E402


class LoadExtraQueriesTests(unittest.TestCase):
    def test_missing_file_returns_empty(self):
        self.assertEqual(gcl.load_extra_queries(Path(tempfile.mkdtemp()) / "missing.json"), [])

    def test_parses_queries_with_defaults(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "geo-blog-queries.json"
            path.write_text(json.dumps({"queries": [
                {"gruppe": "blog:hvad-koster-en-hjemmeside", "query": "hvad koster en hjemmeside i herning"},
            ]}), encoding="utf-8")
            out = gcl.load_extra_queries(path)
        self.assertEqual(out, [("blog:hvad-koster-en-hjemmeside", "hvad koster en hjemmeside i herning", "Kinly", gcl.KINLY_RE)])

    def test_blank_query_skipped(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "geo-blog-queries.json"
            path.write_text(json.dumps({"queries": [{"gruppe": "blog:x", "query": "   "}]}), encoding="utf-8")
            self.assertEqual(gcl.load_extra_queries(path), [])

    def test_malformed_json_returns_empty(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "geo-blog-queries.json"
            path.write_text("not json", encoding="utf-8")
            self.assertEqual(gcl.load_extra_queries(path), [])

    def test_custom_pattern_preserved(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "geo-blog-queries.json"
            path.write_text(json.dumps({"queries": [
                {"gruppe": "blog:y", "query": "q", "maal": "VIDA", "pattern": r"(?i)\bVIDA\b"},
            ]}), encoding="utf-8")
            out = gcl.load_extra_queries(path)
        self.assertEqual(out, [("blog:y", "q", "VIDA", r"(?i)\bVIDA\b")])


if __name__ == "__main__":
    unittest.main()
