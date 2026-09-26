#!/usr/bin/env python3
"""Offline tests for konkurrent_scan.py — no network, no Jev calls.

Run: python3 test_konkurrent_scan.py
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import konkurrent_scan as scan  # noqa: E402
import crm_posts  # noqa: E402

HTML_WITH_PRICE_SCHEMA_WP = """<html><head>
<script type="application/ld+json">{"@type":"LocalBusiness","name":"Testbureau"}</script>
<link rel="stylesheet" href="/wp-content/themes/x/style.css">
</head><body>
<p>Vi laver hjemmesider fra 6.995 kr. Kontakt os for et tilbud.</p>
<p>Vi tilbygder SEO, Google Ads og hosting. Du kan altid selv redigere dit indhold i vores CMS.</p>
</body></html>
"""

HTML_PLAIN_SHOPIFY = """<html><body>
<script src="https://cdn.shopify.com/s/files/x.js"></script>
<p>Vi bygger webshops til lokale virksomheder. Ring for et uforpligtende møde.</p>
</body></html>
"""

GEO_LOG_FIXTURE = """---
title: x
---

# GEO citation-log

## 2026-09-01 15:40

| gruppe | query | mål | nævnt | vinder | plads | domæner |
|---|---|---|---|---|---|---|
| lokal | test gammel | Kinly | ja | ja | 1 | oldcompetitor.dk |

## 2026-09-24 07:36

| gruppe | query | mål | nævnt | vinder | plads | domæner |
|---|---|---|---|---|---|---|
| lokal | bedste webbureau i Herning | Kinly | ja | ja | 1 | kinly.dk, webko.dk, klartstudio.dk |
| bred | webbureau i Aarhus | Kinly | ja | nej | — | lundhjemmesider.dk, apparat.dk, klartstudio.dk |
"""

JEV_RAW_OK = {
    "answers": {
        "positionering": {"type": "choice", "choice": "lokal", "confidence": 0.8},
        "styrke_pris": {"type": "choice", "choice": "ja"},
        "styrke_hurtig-levering": {"type": "choice", "choice": "nej"},
        "styrke_lokalt-kendskab": {"type": "choice", "choice": "ja"},
        "styrke_seo-fokus": {"type": "choice", "choice": "nej"},
        "styrke_design": {"type": "choice", "choice": "nej"},
        "styrke_kundeservice": {"type": "choice", "choice": "nej"},
        "styrke_teknisk-dybde": {"type": "choice", "choice": "nej"},
        "styrke_branche-specialist": {"type": "choice", "choice": "nej"},
        "svaghed_dyrt": {"type": "choice", "choice": "nej"},
        "svaghed_langsom-levering": {"type": "choice", "choice": "nej"},
        "svaghed_utydelige-priser": {"type": "choice", "choice": "ja"},
        "svaghed_generisk-design": {"type": "choice", "choice": "nej"},
        "svaghed_begraenset-support": {"type": "choice", "choice": "nej"},
        "svaghed_daarligt-vedligeholdt-blog": {"type": "choice", "choice": "nej"},
        "svaghed_svag-mobilvisning": {"type": "choice", "choice": "nej"},
        "svaghed_ingen-lokal-forankring": {"type": "choice", "choice": "nej"},
    }
}


class SiteSignalTests(unittest.TestCase):
    def test_schema_price_cms_services_detected(self):
        sig = scan.extract_site_signals("https://x.dk/", HTML_WITH_PRICE_SCHEMA_WP)
        self.assertTrue(sig["schemaLocalBusiness"])
        self.assertTrue(sig["hasPrices"])
        self.assertIn("6.995", sig["priceFrom"])
        self.assertEqual(sig["cms"], "WordPress")
        self.assertIn("seo", sig["services"])
        self.assertIn("google-ads", sig["services"])
        self.assertIn("hosting", sig["services"])
        self.assertIn("kunde-cms", sig["services"])
        self.assertTrue(sig["https"])

    def test_no_schema_no_price_shopify(self):
        sig = scan.extract_site_signals("https://y.dk/", HTML_PLAIN_SHOPIFY)
        self.assertFalse(sig["schemaLocalBusiness"])
        self.assertFalse(sig["hasPrices"])
        self.assertIsNone(sig["priceFrom"])
        self.assertEqual(sig["cms"], "Shopify")
        self.assertNotIn("kunde-cms", sig["services"])

    def test_http_url_is_not_https(self):
        sig = scan.extract_site_signals("http://z.dk/", "<html></html>")
        self.assertFalse(sig["https"])


class GeoParsingTests(unittest.TestCase):
    def test_only_latest_dated_section_used(self):
        mentions = scan.parse_geo_mentions(GEO_LOG_FIXTURE)
        self.assertNotIn("oldcompetitor.dk", mentions)
        self.assertIn("webko.dk", mentions)
        self.assertIn("klartstudio.dk", mentions)

    def test_mention_groups_collected_and_deduped(self):
        mentions = scan.parse_geo_mentions(GEO_LOG_FIXTURE)
        self.assertEqual(mentions["klartstudio.dk"], ["bred", "lokal"])

    def test_geo_for_domain_strips_www_and_caps_five(self):
        mentions = {"webko.dk": ["lokal", "bred", "kontrol", "a", "b", "c"]}
        geo = scan.geo_for_domain(mentions, "https://www.webko.dk/")
        self.assertEqual(geo, {"mentionedBy": ["lokal", "bred", "kontrol", "a", "b"]})

    def test_no_mention_returns_none(self):
        mentions = scan.parse_geo_mentions(GEO_LOG_FIXTURE)
        self.assertIsNone(scan.geo_for_domain(mentions, "https://unknown-competitor.dk/"))


class ClassifyJevTests(unittest.TestCase):
    def test_valid_response_parsed_with_capped_lists(self):
        result = scan.classify_competitor_jev(JEV_RAW_OK)
        self.assertTrue(result["ok"])
        self.assertEqual(result["positioning"], "lokal")
        self.assertEqual(set(result["strengths"]), {"pris", "lokalt-kendskab"})
        self.assertEqual(result["weaknesses"], ["utydelige-priser"])
        self.assertLessEqual(len(result["strengths"]), 5)
        self.assertLessEqual(len(result["weaknesses"]), 5)

    def test_none_response_falls_back_safely(self):
        result = scan.classify_competitor_jev(None)
        self.assertFalse(result["ok"])
        self.assertEqual(result["strengths"], [])
        self.assertEqual(result["weaknesses"], [])

    def test_invalid_positioning_falls_back_safely(self):
        bad = {"answers": {"positionering": {"type": "choice", "choice": "gis-om-katte"}}}
        self.assertFalse(scan.classify_competitor_jev(bad)["ok"])


class PatternsAndGapsTests(unittest.TestCase):
    def _competitor(self, url, has_prices, has_schema, cms_service=False, pagespeed=None):
        services = ["seo"] + (["kunde-cms"] if cms_service else [])
        return {"name": url, "url": url, "country": "DK",
                "site": {"https": True, "schemaLocalBusiness": has_schema, "hasPrices": has_prices,
                         "priceFrom": None, "cms": "WordPress", "services": services,
                         "pagespeedMobile": pagespeed}}

    def test_no_price_pattern_and_gap(self):
        comps = [self._competitor(f"https://{i}.dk", False, True) for i in range(3)]
        patterns, gaps = scan.build_patterns_and_gaps(comps, [])
        self.assertTrue(any("priser" in p["title"] for p in patterns))
        self.assertTrue(any(g["kind"] == "pris" for g in gaps))

    def test_all_have_prices_no_pattern(self):
        comps = [self._competitor(f"https://{i}.dk", True, True) for i in range(3)]
        patterns, _ = scan.build_patterns_and_gaps(comps, [])
        self.assertFalse(any("priser" in p["title"] for p in patterns))

    def test_no_schema_pattern(self):
        comps = [self._competitor(f"https://{i}.dk", True, False) for i in range(3)]
        patterns, _ = scan.build_patterns_and_gaps(comps, [])
        self.assertTrue(any("LocalBusiness" in p["title"] for p in patterns))

    def test_median_pagespeed_pattern(self):
        comps = [self._competitor(f"https://{i}.dk", True, True, pagespeed=v) for i, v in enumerate([40, 60, 80])]
        patterns, _ = scan.build_patterns_and_gaps(comps, [])
        self.assertTrue(any("Median PageSpeed mobil 60" in p["title"] for p in patterns))

    def test_no_customer_cms_gap(self):
        comps = [self._competitor(f"https://{i}.dk", True, True, cms_service=False) for i in range(3)]
        _, gaps = scan.build_patterns_and_gaps(comps, [])
        self.assertTrue(any(g["kind"] == "ydelse" and "kunde-CMS" in g["title"] for g in gaps))

    def test_customer_cms_offered_suppresses_gap(self):
        comps = [self._competitor(f"https://{i}.dk", True, True, cms_service=True) for i in range(3)]
        _, gaps = scan.build_patterns_and_gaps(comps, [])
        self.assertFalse(any("kunde-CMS" in g["title"] for g in gaps))

    def test_content_ideas_become_indhold_gaps(self):
        ideas = [{"title": "Hvad koster en hjemmeside", "category": "pris", "note": "note her", "emne": "pris"}]
        comps = [self._competitor("https://x.dk", True, True)]
        _, gaps = scan.build_patterns_and_gaps(comps, ideas)
        self.assertTrue(any(g["kind"] == "indhold" and g["title"] == "Hvad koster en hjemmeside" for g in gaps))

    def test_empty_competitors_gives_no_patterns(self):
        self.assertEqual(scan.build_patterns_and_gaps([], []), ([], []))

    def test_caps_respected(self):
        many_patterns_comps = [self._competitor(f"https://{i}.dk", False, False, pagespeed=50) for i in range(30)]
        patterns, gaps = scan.build_patterns_and_gaps(many_patterns_comps, [{"title": f"i{i}", "note": "n", "category": "c", "emne": "e"} for i in range(20)])
        self.assertLessEqual(len(patterns), 12)
        self.assertLessEqual(len(gaps), 12)


class ThrottleTests(unittest.TestCase):
    def test_throttle_sleeps_for_same_domain(self):
        import time
        scan._last_req.clear()
        t0 = time.monotonic()
        scan.throttle("https://same-domain.dk/a", min_gap=0.2)
        scan.throttle("https://same-domain.dk/b", min_gap=0.2)
        self.assertGreaterEqual(time.monotonic() - t0, 0.2)

    def test_no_sleep_for_different_domains(self):
        import time
        scan._last_req.clear()
        t0 = time.monotonic()
        scan.throttle("https://a.dk/", min_gap=5.0)
        scan.throttle("https://b.dk/", min_gap=5.0)
        self.assertLess(time.monotonic() - t0, 1.0)


class WeeklyCacheTests(unittest.TestCase):
    def test_cache_set_get_roundtrip_and_prune(self):
        state = {"version": 1, "week": {}}
        scan.cache_set(state, "places", "acme", {"rating": 4.5})
        self.assertEqual(scan.cache_get(state, "places", "acme"), {"rating": 4.5})
        self.assertIsNone(scan.cache_get(state, "places", "missing"))

    def test_prune_keeps_only_recent_weeks(self):
        state = {"version": 1, "week": {f"2020-W{i:02d}": {} for i in range(1, 10)}}
        scan.prune_state(state, keep_weeks=3)
        self.assertEqual(len(state["week"]), 3)


class SigningPathTests(unittest.TestCase):
    def test_call_targets_competitors_path(self):
        built = crm_posts.ENDPOINT.replace(crm_posts.PATH, scan.POST_PATH)
        self.assertTrue(built.endswith("/api/agent/competitors"))
        self.assertNotIn("/api/agent/posts", built.replace(scan.POST_PATH, ""))


class FacebookSkipTests(unittest.TestCase):
    def test_no_url_skips_without_touching_venv(self):
        self.assertIsNone(scan.facebook_lookup({"name": "x"}))

    def test_no_venv_skips_even_with_url(self):
        original = scan.FB_VENV_PY

        class _FakePath:
            def exists(self) -> bool:
                return False

        scan.FB_VENV_PY = _FakePath()
        try:
            self.assertIsNone(scan.facebook_lookup({"name": "x", "facebook_url": "https://facebook.com/x"}))
        finally:
            scan.FB_VENV_PY = original


if __name__ == "__main__":
    unittest.main()
