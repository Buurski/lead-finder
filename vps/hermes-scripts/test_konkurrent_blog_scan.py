#!/usr/bin/env python3
"""Offline tests for konkurrent_blog_scan.py — no network, no Jev calls.

Run: python3 test_konkurrent_blog_scan.py
"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import konkurrent_blog_scan as scan  # noqa: E402

RSS_FIXTURE = """<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Testbureau Blog</title>
<item>
  <title>Hvad koster en hjemmeside i 2026?</title>
  <link>https://example.dk/blog/hvad-koster-en-hjemmeside/</link>
  <pubDate>Wed, 24 Sep 2026 08:00:00 +0200</pubDate>
</item>
<item>
  <title>7 SEO-tips til lokale virksomheder</title>
  <link>https://example.dk/blog/7-seo-tips/</link>
  <pubDate>Mon, 15 Sep 2026 08:00:00 +0200</pubDate>
</item>
</channel></rss>
"""

SITEMAP_URLSET_FIXTURE = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://example.dk/blog/post-a/</loc><lastmod>2026-09-20</lastmod></url>
<url><loc>https://example.dk/om-os/</loc><lastmod>2026-09-21</lastmod></url>
<url><loc>https://example.dk/blog/post-b/</loc><lastmod>2026-09-22</lastmod></url>
</urlset>
"""

SITEMAP_INDEX_FIXTURE = """<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<sitemap><loc>https://example.dk/sitemap-posts.xml</loc><lastmod>2026-09-25</lastmod></sitemap>
<sitemap><loc>https://example.dk/sitemap-pages.xml</loc><lastmod>2026-09-10</lastmod></sitemap>
</sitemapindex>
"""

POST_HTML_FIXTURE = """<html><head>
<meta property="og:title" content="Hvad koster en hjemmeside i 2026?">
<meta property="article:published_time" content="2026-09-24T08:00:00+02:00">
<title>Hvad koster en hjemmeside i 2026? | Testbureau</title>
</head><body>
<nav>Menu her skal ikke tælles med i ordtal</nav>
<h1>Hvad koster en hjemmeside i 2026?</h1>
<p>Vi har spurgt 40 kunder om deres priser, og svaret svinger med op til 300%.</p>
<h2>Hvad påvirker prisen?</h2>
<p>Nogle faktorer betyder mere end andre for den endelige pris på jeres projekt her.</p>
<h2>Ofte stillede spørgsmål</h2>
<p>Hvor lang tid tager det?</p>
<img src="a.jpg"><img src="b.jpg">
<a href="/kontakt">Book et møde med os i dag</a>
</body></html>
"""

ROBOTS_FIXTURE_BLOCK_ADMIN = """User-agent: *
Disallow: /wp-admin/
Disallow: /blog/search
"""

JEV_RAW_OK = {
    "answers": {
        "format": {"type": "choice", "choice": "undersoegelse", "confidence": 0.9},
        "emne": {"type": "choice", "choice": "pris", "confidence": 0.9},
        "kvalitet": {"type": "choice", "choice": "hoej", "confidence": 0.8},
        "saelger_indirekte": {"type": "choice", "choice": "ja", "confidence": 0.7},
        "egnet_kinly": {"type": "choice", "choice": "ja", "confidence": 0.8},
    }
}


class ParseRssTests(unittest.TestCase):
    def test_parses_items_with_link_title_date(self):
        items = scan.parse_rss(RSS_FIXTURE)
        self.assertEqual(len(items), 2)
        self.assertEqual(items[0]["url"], "https://example.dk/blog/hvad-koster-en-hjemmeside/")
        self.assertEqual(items[0]["title"], "Hvad koster en hjemmeside i 2026?")
        self.assertTrue(items[0]["date"])

    def test_malformed_xml_returns_empty(self):
        self.assertEqual(scan.parse_rss("<rss><channel><item><link>oops"), [])


class ParseSitemapTests(unittest.TestCase):
    def test_urlset_returns_urls_no_subsitemaps(self):
        urls, subs = scan.parse_sitemap(SITEMAP_URLSET_FIXTURE)
        self.assertEqual(len(urls), 3)
        self.assertEqual(subs, [])
        self.assertEqual(urls[0]["url"], "https://example.dk/blog/post-a/")

    def test_sitemapindex_returns_subsitemaps_no_urls(self):
        urls, subs = scan.parse_sitemap(SITEMAP_INDEX_FIXTURE)
        self.assertEqual(urls, [])
        self.assertEqual(len(subs), 2)
        self.assertEqual(subs[0], ("https://example.dk/sitemap-posts.xml", "2026-09-25"))


class CollectSourceEntriesTests(unittest.TestCase):
    def test_blog_path_hint_filters_non_blog_urls(self):
        source = {
            "id": "test", "name": "Test", "country": "DK",
            "feed_url": None, "sitemap_url": "https://example.dk/sitemap.xml",
            "blog_url_path_hint": "/blog/",
        }
        calls = {"n": 0}

        def fake_fetch(url, timeout=15):
            calls["n"] += 1
            self.assertEqual(url, "https://example.dk/sitemap.xml")
            return SITEMAP_URLSET_FIXTURE

        orig_fetch, orig_allowed = scan.fetch_html, scan.allowed
        scan.fetch_html = fake_fetch
        scan.allowed = lambda url: True
        try:
            entries = scan.collect_source_entries(source)
        finally:
            scan.fetch_html, scan.allowed = orig_fetch, orig_allowed

        self.assertEqual(calls["n"], 1)
        urls = [e["url"] for e in entries]
        self.assertIn("https://example.dk/blog/post-a/", urls)
        self.assertIn("https://example.dk/blog/post-b/", urls)
        self.assertNotIn("https://example.dk/om-os/", urls)
        # newest (post-b, 2026-09-22) sorts before post-a (2026-09-20)
        self.assertEqual(urls[0], "https://example.dk/blog/post-b/")

    def test_disallowed_feed_falls_back_to_nothing_when_sitemap_also_blocked(self):
        source = {"id": "t", "name": "T", "country": "DK", "feed_url": "https://x.dk/feed",
                   "sitemap_url": "https://x.dk/sitemap.xml", "blog_url_path_hint": ""}
        orig_allowed = scan.allowed
        scan.allowed = lambda url: False
        try:
            entries = scan.collect_source_entries(source)
        finally:
            scan.allowed = orig_allowed
        self.assertEqual(entries, [])


class RobotsTests(unittest.TestCase):
    def test_disallowed_path_blocked(self):
        paths = scan.robots_disallowed_paths(ROBOTS_FIXTURE_BLOCK_ADMIN)
        self.assertIn("/wp-admin/", paths)

    def test_allowed_respects_star_group_only(self):
        text = "User-agent: GPTBot\nDisallow: /\nUser-agent: *\nDisallow: /private/\n"
        scan._robots_cache["https://x.dk"] = text
        try:
            self.assertFalse(scan.allowed("https://x.dk/private/page"))
            self.assertTrue(scan.allowed("https://x.dk/blog/post"))
        finally:
            scan._robots_cache.pop("https://x.dk", None)

    def test_unreadable_robots_defaults_allowed(self):
        scan._robots_cache["https://y.dk"] = ""
        try:
            self.assertTrue(scan.allowed("https://y.dk/anything"))
        finally:
            scan._robots_cache.pop("https://y.dk", None)


class ExtractFeaturesTests(unittest.TestCase):
    def setUp(self):
        self.features = scan.extract_features("https://example.dk/blog/hvad-koster/", POST_HTML_FIXTURE)

    def test_title_from_og_meta(self):
        self.assertEqual(self.features["title"], "Hvad koster en hjemmeside i 2026?")

    def test_h2_extracted_in_order(self):
        self.assertEqual(self.features["h2"], ["Hvad påvirker prisen?", "Ofte stillede spørgsmål"])

    def test_word_count_excludes_nav(self):
        self.assertGreater(self.features["word_count"], 10)
        self.assertNotIn("Menu her", scan._strip_tags(POST_HTML_FIXTURE))

    def test_faq_detected_via_heading_question_and_keyword(self):
        self.assertTrue(self.features["has_faq"])

    def test_stats_detected_via_percent(self):
        self.assertTrue(self.features["has_stats"])

    def test_image_count(self):
        self.assertEqual(self.features["image_count"], 2)

    def test_cta_type_book_moede(self):
        self.assertEqual(self.features["cta_type"], "book_moede")

    def test_date_from_article_meta(self):
        self.assertTrue(self.features["date"].startswith("2026-09-24"))

    def test_no_faq_no_stats_on_plain_post(self):
        plain = "<html><body><h2>Om os</h2><p>Vi laver hjemmesider til virksomheder i Herning.</p></body></html>"
        f = scan.extract_features("https://x.dk/blog/om-os/", plain)
        self.assertFalse(f["has_faq"])
        self.assertFalse(f["has_stats"])
        self.assertEqual(f["cta_type"], "ingen_tydelig")


class ClassifyJevTests(unittest.TestCase):
    def test_valid_response_parsed(self):
        result = scan.classify_jev(JEV_RAW_OK)
        self.assertTrue(result["ok"])
        self.assertEqual(result["format"], "undersoegelse")
        self.assertEqual(result["emne"], "pris")
        self.assertEqual(result["kvalitet"], "hoej")

    def test_none_response_falls_back_safely(self):
        result = scan.classify_jev(None)
        self.assertFalse(result["ok"])
        self.assertEqual(result["emne"], "andet")
        self.assertEqual(result["saelger_indirekte"], "nej")

    def test_invalid_choice_falls_back_safely(self):
        bad = {"answers": {"format": {"type": "choice", "choice": "digte-om-katte"}}}
        result = scan.classify_jev(bad)
        self.assertFalse(result["ok"])


class BuildPatternsTests(unittest.TestCase):
    def _row(self, kvalitet, emne="pris", has_faq=True, words=800, cta="gratis_tjek", sell="ja"):
        return {
            "url": f"https://x.dk/{kvalitet}-{emne}-{words}", "source_id": "x", "source_name": "X",
            "word_count": words, "has_faq": has_faq, "has_stats": True, "image_count": 2, "cta_type": cta,
            "jev": {"ok": True, "format": "guide", "emne": emne, "kvalitet": kvalitet,
                    "saelger_indirekte": sell, "egnet_kinly": "ja"},
        }

    def test_empty_results_gives_n_zero(self):
        self.assertEqual(scan.build_patterns([]), {"n": 0})

    def test_unjudged_rows_excluded_from_n(self):
        rows = [self._row("hoej"), {"jev": {"ok": False}}]
        patterns = scan.build_patterns(rows)
        self.assertEqual(patterns["n"], 1)

    def test_high_vs_low_word_averages(self):
        rows = [self._row("hoej", words=900), self._row("hoej", words=700), self._row("lav", words=150, has_faq=False)]
        patterns = scan.build_patterns(rows)
        self.assertEqual(patterns["avg_words_high"], 800)
        self.assertEqual(patterns["avg_words_low"], 150)
        self.assertEqual(patterns["faq_rate_high"], 100)
        self.assertEqual(patterns["faq_rate_low"], 0)

    def test_sells_indirectly_percentage(self):
        rows = [self._row("hoej", sell="ja"), self._row("mellem", sell="nej")]
        patterns = scan.build_patterns(rows)
        self.assertEqual(patterns["sells_indirectly_pct"], 50)


class PickTopIdeasTests(unittest.TestCase):
    def _row(self, emne, kvalitet, fits="ja"):
        return {
            "url": f"https://x.dk/{emne}", "source_id": "x", "source_name": "X",
            "word_count": 800, "has_faq": True, "has_stats": True, "image_count": 1, "cta_type": "kontakt",
            "jev": {"ok": True, "format": "guide", "emne": emne, "kvalitet": kvalitet,
                    "saelger_indirekte": "ja", "egnet_kinly": fits},
        }

    def test_dedupes_by_emne_keeps_best_quality(self):
        rows = [self._row("pris", "mellem"), self._row("pris", "hoej"), self._row("seo", "lav")]
        ideas = scan.pick_top_ideas(rows, existing_titles=[])
        pris_ideas = [i for i in ideas if i["emne"] == "pris"]
        self.assertEqual(len(pris_ideas), 1)

    def test_excludes_ideas_matching_existing_hq_titles(self):
        rows = [self._row("pris", "hoej")]
        existing = [scan.IDEA_TITLE_BY_EMNE["pris"]]
        ideas = scan.pick_top_ideas(rows, existing_titles=existing)
        self.assertEqual(ideas, [])

    def test_only_egnet_kinly_ja_considered(self):
        rows = [self._row("pris", "hoej", fits="nej")]
        ideas = scan.pick_top_ideas(rows, existing_titles=[])
        self.assertEqual(ideas, [])

    def test_andet_emne_never_becomes_an_idea(self):
        rows = [self._row("andet", "hoej")]
        ideas = scan.pick_top_ideas(rows, existing_titles=[])
        self.assertEqual(ideas, [])

    def test_limit_respected(self):
        rows = [self._row(e, "hoej") for e in ("pris", "seo", "geo_ai", "hjemmeside")]
        ideas = scan.pick_top_ideas(rows, existing_titles=[], limit=3)
        self.assertEqual(len(ideas), 3)

    def test_note_contains_source_url_and_keyword(self):
        rows = [self._row("geo_ai", "hoej")]
        ideas = scan.pick_top_ideas(rows, existing_titles=[])
        self.assertIn("https://x.dk/geo_ai", ideas[0]["note"])
        self.assertIn(scan.KEYWORD_BY_EMNE["geo_ai"], ideas[0]["note"])


class CacheRoundtripTests(unittest.TestCase):
    def test_atomic_write_and_load_via_jev_lib(self):
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "sub" / "state.json"
            cache = scan.load_cache(path)
            self.assertEqual(cache, {"version": 1, "items": {}})
            cache["items"]["https://x.dk/post"] = {"ok": True, "seen_at": 1000.0, "result": {"a": 1}}
            import jev_lib
            jev_lib.atomic_write_json(path, cache)
            reloaded = scan.load_cache(path)
            self.assertEqual(reloaded["items"]["https://x.dk/post"]["result"], {"a": 1})

    def test_prune_removes_old_items(self):
        cache = {"version": 1, "items": {
            "old": {"ok": True, "seen_at": 0.0},
            "new": {"ok": True, "seen_at": __import__("time").time()},
        }}
        scan.prune_cache(cache, days=1)
        self.assertNotIn("old", cache["items"])
        self.assertIn("new", cache["items"])


class RenderSectionTests(unittest.TestCase):
    def test_section_has_date_header_and_counts(self):
        from datetime import datetime, timezone
        now = datetime(2026, 9, 26, tzinfo=timezone.utc)
        sources = [{"country": "DK"}, {"country": "US"}]
        section = scan.render_section(now, sources, scanned=10, cached=2, judged=8, skipped_budget=0,
                                       patterns={"n": 0}, ideas=[], errors=[])
        self.assertIn("## Scan 2026-09-26", section)
        self.assertIn("1 DK", section)
        self.assertIn("1 udenlandske", section)


if __name__ == "__main__":
    unittest.main()
