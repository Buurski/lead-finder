#!/usr/bin/env python3
"""Offline tests for konkurrent_scan.py — no network, no Jev calls.

Run: python3 test_konkurrent_scan.py
"""
from __future__ import annotations

import json
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

def _ja(choice="ja", confidence=0.9):
    return {"type": "choice", "choice": choice, "confidence": confidence}


JEV_RAW_OK = {
    "answers": {
        "positionering": {"type": "choice", "choice": "lokal", "confidence": 0.8},
        "styrke_pris": _ja("ja"),
        "styrke_hurtig-levering": _ja("nej"),
        "styrke_lokalt-kendskab": _ja("ja"),
        "styrke_seo-fokus": _ja("nej"),
        "styrke_design": _ja("nej"),
        "styrke_kundeservice": _ja("nej"),
        "styrke_teknisk-dybde": _ja("nej"),
        "styrke_branche-specialist": _ja("nej"),
        "svaghed_dyrt": _ja("nej"),
        "svaghed_langsom-levering": _ja("nej"),
        "svaghed_utydelige-priser": _ja("ja"),
        "svaghed_generisk-design": _ja("nej"),
        "svaghed_begraenset-support": _ja("nej"),
        "svaghed_daarligt-vedligeholdt-blog": _ja("nej"),
        "svaghed_svag-mobilvisning": _ja("nej"),
        "svaghed_ingen-lokal-forankring": _ja("nej"),
        "ydelse_ikke_kinly": _ja("ja"),
        "seo_faq_synlig": _ja("ja"),
        "seo_anmeldelser_tekst": _ja("nej"),
        "geo_citerbare_svar": _ja("ja"),
        "budskab_pris": _ja("ja"),
        "budskab_hastighed": _ja("nej"),
        "budskab_ai": _ja("nej"),
        "budskab_lokal": _ja("ja"),
        "budskab_garanti": _ja("nej"),
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

    def test_low_confidence_positioning_falls_back_safely(self):
        bad = {"answers": {"positionering": {"type": "choice", "choice": "lokal", "confidence": 0.4}}}
        self.assertFalse(scan.classify_competitor_jev(bad)["ok"])

    def test_low_confidence_answer_is_hidden_not_counted_as_ja_or_nej(self):
        raw = json.loads(json.dumps(JEV_RAW_OK))  # deep copy
        raw["answers"]["styrke_pris"] = {"type": "choice", "choice": "ja", "confidence": 0.59}
        result = scan.classify_competitor_jev(raw)
        self.assertNotIn("pris", result["strengths"])

    def test_missing_confidence_treated_as_hidden(self):
        raw = json.loads(json.dumps(JEV_RAW_OK))
        del raw["answers"]["styrke_pris"]["confidence"]
        result = scan.classify_competitor_jev(raw)
        self.assertNotIn("pris", result["strengths"])

    def test_new_bundled_flags_parsed(self):
        result = scan.classify_competitor_jev(JEV_RAW_OK)
        self.assertEqual(result["ydelse_ikke_kinly"], True)
        self.assertEqual(result["seo_faq_synlig"], True)
        self.assertEqual(result["seo_anmeldelser_tekst"], False)
        self.assertEqual(result["geo_citerbare_svar"], True)
        self.assertEqual(set(result["messaging_angles"]), {"pris", "lokal"})

    def test_one_jev_call_bundles_all_new_questions(self):
        # spec: stadig ét Jev-HTTP-kald pr. konkurrent -- alle nye spørgsmål i samme dict.
        qs = scan._questions_for_competitor("Testbureau")
        for qid in ("ydelse_ikke_kinly", "seo_faq_synlig", "seo_anmeldelser_tekst", "geo_citerbare_svar",
                    "budskab_pris", "budskab_hastighed", "budskab_ai", "budskab_lokal", "budskab_garanti"):
            self.assertIn(qid, qs)


class ExtraServiceKeywordTests(unittest.TestCase):
    def test_detects_known_extra_service(self):
        self.assertEqual(scan.detect_extra_service("vi tilbyder branding og visuel identitet"), "branding")
        self.assertEqual(scan.detect_extra_service("book erhvervsfoto hos os"), "foto")

    def test_no_match_returns_none(self):
        self.assertIsNone(scan.detect_extra_service("vi laver hjemmesider og seo"))


class AiBuilderSignalTests(unittest.TestCase):
    def test_extracts_price_ai_danish_codeexport(self):
        html = "<html><body>Byg din hjemmeside med AI fra 79 kr/md. Du ejer din kode og kan altid eksportere koden.</body></html>"
        sig = scan.extract_ai_builder_signals(html)
        self.assertEqual(sig["priceFromText"], "79 kr")
        self.assertTrue(sig["aiFeatures"])
        self.assertTrue(sig["danish"])
        self.assertTrue(sig["codeExport"])

    def test_no_signals_present(self):
        html = "<html><body>Build your website today. No pricing shown here.</body></html>"
        sig = scan.extract_ai_builder_signals(html)
        self.assertIsNone(sig["priceFromText"])
        self.assertFalse(sig["aiFeatures"])
        self.assertFalse(sig["danish"])
        self.assertFalse(sig["codeExport"])

    def test_dollar_and_euro_prices_detected(self):
        self.assertEqual(scan.extract_ai_builder_signals("<p>Plans from $12/mo</p>")["priceFromText"], "$12")
        self.assertEqual(scan.extract_ai_builder_signals("<p>Ab 9€ im Monat</p>")["priceFromText"], "9€")


class RunAiBuildersTests(unittest.TestCase):
    def test_fetch_failure_is_skipped_not_crashed(self):
        original = scan.fetch_site
        scan.fetch_site = lambda url: None
        try:
            out = scan.run_ai_builders([{"name": "Ghost", "url": "https://ghost.example/"}])
        finally:
            scan.fetch_site = original
        self.assertEqual(out, [])

    def test_successful_fetch_produces_entry_with_kind_and_signals(self):
        original = scan.fetch_site
        scan.fetch_site = lambda url: "<html><body>AI hjemmeside fra 99 kr. Eksporter kode.</body></html>"
        try:
            out = scan.run_ai_builders([{"name": "Wix", "url": "https://www.wix.com/"}])
        finally:
            scan.fetch_site = original
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["kind"], "ai-bygger")
        self.assertEqual(out[0]["name"], "Wix")
        self.assertIn("aiBuilder", out[0])
        self.assertTrue(out[0]["aiBuilder"]["aiFeatures"])


class RatingFormulaTests(unittest.TestCase):
    def test_full_prevalence_gives_top_rating(self):
        self.assertEqual(scan._rating_from_prevalence(1.0), 5)

    def test_zero_prevalence_gives_floor_rating(self):
        self.assertEqual(scan._rating_from_prevalence(0.0), 1)

    def test_conf_rating_matches_spec_formula(self):
        # spec: rating = clamp(round(1 + 4*(conf-0.6)/0.4), 1, 5)
        self.assertEqual(scan._conf_rating(0.6), 1)
        self.assertEqual(scan._conf_rating(1.0), 5)
        self.assertEqual(scan._conf_rating(0.8), 3)


class FindingsTests(unittest.TestCase):
    def _bureau(self, name, has_prices=True, has_schema=True, faq=None, reviews_text=None,
                geo=None, angles=None, unique_services=None):
        c = {"name": name, "url": f"https://{name}.dk", "kind": "bureau",
             "site": {"hasPrices": has_prices, "schemaLocalBusiness": has_schema, "services": []}}
        seo_extra = {}
        if faq is not None:
            seo_extra["faqVisible"] = faq
        if reviews_text is not None:
            seo_extra["reviewsAsText"] = reviews_text
        if seo_extra:
            c["seoExtra"] = seo_extra
        if geo is not None:
            c["geoExtra"] = {"citableAnswers": geo}
        if angles is not None:
            c["messaging"] = {"angles": angles}
        if unique_services is not None:
            c["uniqueServices"] = unique_services
        return c

    def test_no_price_finding_reflects_kinly_profile(self):
        comps = [self._bureau(f"c{i}", has_prices=False) for i in range(3)]
        findings = scan.build_findings(comps, [])
        f = next(x for x in findings if x["category"] == "pris-budskab" and "skjuler prisen" in x["title"])
        self.assertIn("Så gør vi", f["detail"])
        self.assertEqual(f["rating"], 5)  # 3/3 = fuld prævalens

    def test_finding_shape_has_required_keys(self):
        comps = [self._bureau("a", has_prices=False)]
        findings = scan.build_findings(comps, [])
        f = findings[0]
        for key in ("id", "category", "title", "detail", "rating", "evidence", "suggest"):
            self.assertIn(key, f)
        self.assertLessEqual(len(f["id"]), 40)
        self.assertIn(f["category"], scan.FINDING_CATEGORIES)
        self.assertIn(f["suggest"], scan.SUGGEST_KINDS)
        self.assertLessEqual(len(f["title"]), 80)
        self.assertLessEqual(len(f["detail"]), 240)

    def test_findings_sorted_by_rating_desc(self):
        comps = [self._bureau(f"c{i}", has_prices=False, has_schema=False) for i in range(5)]
        findings = scan.build_findings(comps, [])
        ratings = [f["rating"] for f in findings]
        self.assertEqual(ratings, sorted(ratings, reverse=True))

    def test_capped_at_20(self):
        comps = [self._bureau(f"c{i}", has_prices=False) for i in range(3)]
        ideas = [{"title": f"idea{i}", "note": "n"} for i in range(30)]
        findings = scan.build_findings(comps, ideas)
        self.assertLessEqual(len(findings), 20)

    def test_ai_builder_alternativ_finding(self):
        comps = [
            {"name": "Wix", "kind": "ai-bygger", "aiBuilder": {"codeExport": True, "aiFeatures": True}},
            {"name": "Framer", "kind": "ai-bygger", "aiBuilder": {"codeExport": True, "aiFeatures": False}},
        ]
        findings = scan.build_findings(comps, [])
        alt = [f for f in findings if f["category"] == "alternativ"]
        self.assertTrue(alt)
        self.assertTrue(any("eje/eksportere koden" in f["title"] for f in alt))

    def test_unique_service_prevalence_produces_ydelse_finding(self):
        comps = [self._bureau(f"c{i}", unique_services=["annoncer"]) for i in range(4)]
        findings = scan.build_findings(comps, [])
        self.assertTrue(any(f["category"] == "ydelse" and "annoncer" in f["title"] for f in findings))

    def test_content_idea_becomes_forbedring_finding(self):
        comps = [self._bureau("a")]
        ideas = [{"title": "Hvad koster en hjemmeside", "note": "note her"}]
        findings = scan.build_findings(comps, ideas)
        self.assertTrue(any(f["category"] == "forbedring" and f["title"] == "Hvad koster en hjemmeside" for f in findings))


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
