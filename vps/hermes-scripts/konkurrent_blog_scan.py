#!/usr/bin/env python3
"""Ugentlig JEV-scan af konkurrenters webbureau-blogs. Ren script-cron: 0 LLM-tokens, kun Jev.

Læser vps/hermes-scripts/konkurrent_blogs.json (kuraterede kilder), henter seneste
15-30 opslag samlet via RSS/sitemap (cache på disk, ingen fuld crawl), udtrækker
deterministiske features (titel, H2'er, ordtal, FAQ, tal, billeder, CTA, dato) og
lader Jev (typesafe.ai) dømme format/emne/kvalitet/salg/Kinly-egnethed pr. opslag —
aldrig fri tekst, kun valg-spørgsmål (jf. crm_mail_sync_jev.py-mønsteret).

Output:
  (a) daterede mønster-sektioner i wiki/kinly/blog-konkurrent-scan.md (prod-sti på
      VPS'en, /root/KnowledgeOS/...). Med --dry-run skrives der ALDRIG til vaulten —
      kun til en lokal scratch-fil, og stien printes.
  (b) op til 3 idé-kort på Kinly HQ's blog-board via crm_posts.py (kun uden --dry-run
      og kun uden --no-create), og kun idéer der ikke allerede minder om et kort på
      boardet.

Kilde-kravene og processen står i KnowledgeOS/wiki/kinly/blog-plan-2026-09-24.md
under "Konkurrent-scan med JEV (løbende)".

Brug:
  konkurrent_blog_scan.py --dry-run [--limit 30] [--max-jev 10]
  konkurrent_blog_scan.py                 # rigtig kørsel (cron): skriver vault + opretter kort
  konkurrent_blog_scan.py --no-create     # rigtig kørsel, men opretter aldrig kort
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import subprocess
import sys
import time
import xml.etree.ElementTree as ET
from collections import Counter
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import jev_lib  # noqa: E402

UA = "Mozilla/5.0 (compatible; KinlyKonkurrentScan/0.1; +https://kinly.dk)"
MODEL = jev_lib.JEV_MODEL

DEFAULT_SOURCES = HERE / "konkurrent_blogs.json"
STATE_PATH = Path.home() / ".hermes/konkurrent-scan/state.json"
VAULT_NOTE = Path.home() / "KnowledgeOS/wiki/kinly/blog-konkurrent-scan.md"  # VPS-prod-sti
CRM_POSTS_CLI = HERE / "crm_posts.py"

DEFAULT_TOTAL_LIMIT = 30
DEFAULT_PER_SOURCE_CAP = 6
STATE_CACHE_DAYS = 120  # blogindlæg ændrer sig sjældent efter udgivelse

FORMATS = ["guide", "liste", "case", "undersoegelse", "nyhed", "andet"]
EMNER = ["pris", "seo", "geo_ai", "hjemmeside", "google_profil_anmeldelser", "cms_wordpress", "kundecase", "andet"]
KVALITET = ["hoej", "mellem", "lav"]

QUESTIONS = {
    "format": {
        "type": "choice",
        "instructions": "Hvilket format har blogindlægget `post`? Vælg det der passer bedst.",
        "criteria": {
            "guide": "Trin-for-trin guide eller how-to",
            "liste": "Liste-artikel (fx '7 ting...', '10 tips...')",
            "case": "Konkret kundecase eller eksempel med resultater",
            "undersoegelse": "Data, studie eller undersøgelse med tal",
            "nyhed": "Nyhed, produktopdatering eller virksomhedsnyt",
            "andet": "Passer ikke i de andre kategorier",
        },
    },
    "emne": {
        "type": "choice",
        "instructions": "Hvilket hovedemne handler `post` om?",
        "criteria": {
            "pris": "Pris/omkostninger for hjemmeside, SEO eller markedsføring",
            "seo": "Klassisk SEO/søgemaskineoptimering",
            "geo_ai": "AI-søgning, GEO, ChatGPT/AI Overviews-synlighed",
            "hjemmeside": "Hjemmesidedesign, UX eller webudvikling generelt",
            "google_profil_anmeldelser": "Google Business Profile, lokale anmeldelser eller lokal synlighed",
            "cms_wordpress": "CMS-valg, WordPress eller teknisk platform",
            "kundecase": "En navngivet kundes historie eller resultat",
            "andet": "Passer ikke i de andre kategorier",
        },
    },
    "kvalitet": {
        "type": "choice",
        "instructions": (
            "Ud fra titel, mellemrubrikker, ordtal, FAQ og tal/statistik i `post`: hvor "
            "stærkt er indlægget som fagligt content-marketing-stykke (dybde, konkrete "
            "svar, struktur) — uafhængigt af om du er enig i budskabet?"
        ),
        "criteria": {
            "hoej": "Dybt, konkret, velstruktureret, svarer direkte på et rigtigt spørgsmål",
            "mellem": "Okay struktur, men tyndt eller generisk et sted",
            "lav": "Tyndt, søgeords-fyldt eller uden reelt svar",
        },
    },
    "saelger_indirekte": {
        "type": "choice",
        "instructions": (
            "Sælger `post` bureauets egne ydelser indirekte (viser ekspertise/cases der "
            "peger mod at hyre dem), uden at være et rent salgsopslag?"
        ),
        "criteria": {"ja": "Ja", "nej": "Nej"},
    },
    "egnet_kinly": {
        "type": "choice",
        "instructions": (
            "Kinly er et dansk webbureau (Herning/Ikast) der sælger kodede hjemmesider + "
            "SEO/GEO til lokale SMV'er. Kunne vinklen i `post` genbruges til en original "
            "Kinly-artikel til danske lokale virksomheder (aldrig kopieret ordlyd)?"
        ),
        "criteria": {"ja": "Ja", "nej": "Nej"},
    },
}
_CHOICE_SETS = {
    "format": set(FORMATS), "emne": set(EMNER), "kvalitet": set(KVALITET),
    "saelger_indirekte": {"ja", "nej"}, "egnet_kinly": {"ja", "nej"},
}

CTA_PATTERNS = [
    ("book_moede", r"book (et )?møde|book a call|schedule a (call|demo)|book\w* en tid"),
    ("gratis_tjek", r"gratis (tjek|analyse|audit|gennemgang)|free audit|free (seo )?analysis|free consultation"),
    ("download_gated", r"download (vores|the) (guide|e-?bog|whitepaper|report)|få adgang til|hent (guiden|rapporten)"),
    ("pris_tilbud", r"få (et )?(gratis )?tilbud|get a (free )?quote|se priser|request a quote|se pris"),
    ("kontakt", r"kontakt os|get in touch|contact us|ring til os|skriv til os|contact our"),
]

IDEA_TITLE_BY_EMNE = {
    "pris": "Hvad koster en hjemmeside/SEO i 2026 – ærlige tal fra flere bureauer",
    "seo": "SEO der virker for lokale virksomheder – hvad data faktisk viser",
    "geo_ai": "Bliver din virksomhed nævnt af ChatGPT? Sådan tjekker du selv",
    "hjemmeside": "7 ting kunder tjekker på din hjemmeside, før de ringer",
    "google_profil_anmeldelser": "Flere Google-anmeldelser: sådan gør lokale virksomheder det",
    "cms_wordpress": "WordPress eller kodet hjemmeside – hvad koster det over 3 år?",
    "kundecase": "Fra usynlig til booket – en ærlig kundehistorie",
    "andet": "Konkurrent-inspireret idé (andet)",
}
CATEGORY_BY_EMNE = {
    "pris": "pris", "seo": "lokal-synlighed", "geo_ai": "ai-soegning",
    "hjemmeside": "hjemmeside", "google_profil_anmeldelser": "lokal-synlighed",
    "cms_wordpress": "hjemmeside", "kundecase": "kundecases", "andet": "hjemmeside",
}
KEYWORD_BY_EMNE = {
    "pris": "hvad koster en hjemmeside", "seo": "hvordan virker seo",
    "geo_ai": "bliver jeg nævnt af chatgpt", "hjemmeside": "mobilvenlig hjemmeside",
    "google_profil_anmeldelser": "flere google anmeldelser",
    "cms_wordpress": "wordpress eller kodet", "kundecase": "hjemmeside til håndværker",
    "andet": "webbureau",
}
_KVAL_RANK = {"hoej": 2, "mellem": 1, "lav": 0}


# ---------------------------------------------------------------- fetch/network

def fetch_html(url: str, timeout: int = 15) -> str | None:
    """Direkte fetch først; jina.ai-fallback ved WAF-blokering (samme mønster som jev_lib.fetch_page_text)."""
    try:
        return jev_lib._get_raw(url, timeout, headers={"User-Agent": UA})
    except Exception:
        try:
            raw = jev_lib._get_raw(jev_lib.JINA_URL + url, jev_lib.JINA_TIMEOUT,
                                    headers={"User-Agent": UA, "X-Return-Format": "html"})
        except Exception:
            return None
        return raw if raw and "<" in raw else None


_robots_cache: dict[str, str] = {}


def _robots_text_for(url: str) -> str:
    parsed = urlparse(url)
    base = f"{parsed.scheme}://{parsed.netloc}"
    if base not in _robots_cache:
        _robots_cache[base] = fetch_html(base + "/robots.txt", timeout=8) or ""
    return _robots_cache[base]


def robots_disallowed_paths(text: str) -> list[str]:
    """Kun '*'-gruppen. ponytail: ingen Allow-precedence/wildcards — nok til en kuratereret kildeliste."""
    paths: list[str] = []
    in_star = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if not line or ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip().lower()
        val = val.strip()
        if key == "user-agent":
            in_star = val == "*"
        elif key == "disallow" and in_star and val:
            paths.append(val)
    return paths


def allowed(url: str) -> bool:
    text = _robots_text_for(url)
    if not text:
        return True  # ponytail: robots.txt uhentelig -> tillad (lav risiko, kurateret kildeliste)
    path = urlparse(url).path or "/"
    for dis in robots_disallowed_paths(text):
        if dis == "/" or path.startswith(dis):
            return False
    return True


# ---------------------------------------------------------------- RSS/sitemap

def _local_tag(tag: str) -> str:
    return tag.split("}")[-1]


def parse_rss(xml_text: str) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return []
    items = []
    for node in root.iter():
        if _local_tag(node.tag) not in ("item", "entry"):
            continue
        link = title = pub = ""
        for child in node:
            ctag = _local_tag(child.tag)
            if ctag == "link":
                link = (child.text or child.get("href") or "").strip()
            elif ctag == "title":
                title = (child.text or "").strip()
            elif ctag in ("pubDate", "published", "updated"):
                pub = pub or (child.text or "").strip()
        if link:
            items.append({"url": link, "title": title, "date": pub})
    return items


def parse_sitemap(xml_text: str) -> tuple[list[dict], list[tuple[str, str]]]:
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError:
        return [], []
    urls: list[dict] = []
    subsitemaps: list[tuple[str, str]] = []
    for el in root:
        tag = _local_tag(el.tag)
        loc = lastmod = ""
        for c in el:
            ctag = _local_tag(c.tag)
            if ctag == "loc":
                loc = (c.text or "").strip()
            elif ctag == "lastmod":
                lastmod = (c.text or "").strip()
        if not loc:
            continue
        if tag == "sitemap":
            subsitemaps.append((loc, lastmod))
        elif tag == "url":
            urls.append({"url": loc, "date": lastmod})
    return urls, subsitemaps


def _parse_date(value: str):
    value = (value or "").strip()
    if not value:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)
    try:
        return parsedate_to_datetime(value)
    except (TypeError, ValueError):
        pass
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return datetime(1970, 1, 1, tzinfo=timezone.utc)


def collect_source_entries(source: dict, per_source_cap: int = DEFAULT_PER_SOURCE_CAP) -> list[dict]:
    entries: list[dict] = []
    feed_url = source.get("feed_url")
    if feed_url and allowed(feed_url):
        raw = fetch_html(feed_url)
        if raw:
            entries = parse_rss(raw)
    if not entries:
        sm_url = source.get("sitemap_url")
        if sm_url and allowed(sm_url):
            raw = fetch_html(sm_url)
            if raw:
                urls, subs = parse_sitemap(raw)
                if not urls and subs:
                    subs_sorted = sorted(subs, key=lambda t: t[1], reverse=True)[:4]
                    for loc, _ in subs_sorted:
                        if not allowed(loc):
                            continue
                        sub_raw = fetch_html(loc)
                        if sub_raw:
                            sub_urls, _ = parse_sitemap(sub_raw)
                            urls.extend(sub_urls)
                entries = urls
    hint = source.get("blog_url_path_hint") or ""
    if hint:
        filtered = [e for e in entries if hint in e["url"]]
        if filtered:
            entries = filtered
    entries.sort(key=lambda e: _parse_date(e.get("date", "")), reverse=True)
    for e in entries:
        e["source_id"] = source["id"]
        e["source_name"] = source["name"]
        e["country"] = source["country"]
    return entries[:per_source_cap]


# ---------------------------------------------------------------- feature extraction

def _strip_tags(raw_html: str) -> str:
    txt = re.sub(r"<(script|style|noscript|svg|header|footer|nav)[^>]*>.*?</\1>", " ", raw_html, flags=re.S | re.I)
    txt = re.sub(r"<[^>]+>", " ", txt)
    return html.unescape(re.sub(r"\s+", " ", txt)).strip()


def _extract_title(raw_html: str) -> str:
    m = re.search(r'<meta[^>]+property=["\']og:title["\'][^>]+content=["\']([^"\']+)', raw_html, re.I)
    if m:
        return html.unescape(m.group(1)).strip()
    m = re.search(r"<title[^>]*>(.*?)</title>", raw_html, re.I | re.S)
    if m:
        return html.unescape(re.sub(r"\s+", " ", m.group(1))).strip()
    return ""


def _extract_date(raw_html: str) -> str:
    for pat in (
        r'<meta[^>]+property=["\']article:published_time["\'][^>]+content=["\']([^"\']+)',
        r'"datePublished"\s*:\s*"([^"]+)"',
        r'<time[^>]+datetime=["\']([^"\']+)',
    ):
        m = re.search(pat, raw_html, re.I)
        if m:
            return m.group(1)
    return ""


def classify_cta(raw_html: str) -> str:
    for name, pat in CTA_PATTERNS:
        if re.search(pat, raw_html, re.I):
            return name
    return "ingen_tydelig"


def extract_features(url: str, raw_html: str) -> dict:
    text_only = _strip_tags(raw_html)
    h2s_raw = re.findall(r"<h2[^>]*>(.*?)</h2>", raw_html, re.I | re.S)
    h2s = [html.unescape(re.sub(r"<[^>]+>", "", h)).strip() for h in h2s_raw]
    h2s = [h for h in h2s if h][:12]
    has_faq = bool(re.search(r"FAQPage", raw_html)) or bool(
        re.search(r"\bFAQ\b|ofte stillede spørgsmål|frequently asked questions", raw_html, re.I)
    ) or sum(1 for h in h2s if "?" in h) >= 2
    has_stats = bool(re.search(r"\d+(?:[.,]\d+)?\s?%", text_only)) or bool(
        re.search(r"\b\d{2,3}(?:[.,]\d+)?\s?(kr\.?|dkk|kunder|x mere|gange)\b", text_only, re.I)
    )
    image_count = len(re.findall(r"<img\b", raw_html, re.I))
    return {
        "url": url,
        "title": _extract_title(raw_html),
        "h2": h2s,
        "word_count": len(text_only.split()),
        "has_faq": has_faq,
        "has_stats": has_stats,
        "image_count": image_count,
        "cta_type": classify_cta(raw_html),
        "date": _extract_date(raw_html),
        "excerpt": text_only[:1500],
    }


# ---------------------------------------------------------------- Jev

def jev_state_for(features: dict, entry: dict) -> dict:
    return {
        "post": {
            "title": features["title"] or entry.get("title", ""),
            "h2": features["h2"],
            "word_count": features["word_count"],
            "has_faq": features["has_faq"],
            "has_stats": features["has_stats"],
            "image_count": features["image_count"],
            "cta_type": features["cta_type"],
            "source_country": entry.get("country", ""),
            "excerpt": features["excerpt"],
        }
    }


def classify_jev(raw: dict | None) -> dict:
    try:
        answers = (raw or {}).get("answers", {})
        out = {}
        for key, allowed_set in _CHOICE_SETS.items():
            val = answers[key]
            if val.get("type") != "choice" or val.get("choice") not in allowed_set:
                raise ValueError("ugyldigt svar")
            out[key] = val["choice"]
        out["ok"] = True
        return out
    except (KeyError, TypeError, ValueError, AttributeError):
        return {"format": "andet", "emne": "andet", "kvalitet": "mellem",
                "saelger_indirekte": "nej", "egnet_kinly": "nej", "ok": False}


# ---------------------------------------------------------------- cache

def digest_of(*parts: object) -> str:
    return hashlib.sha256(json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str).encode()).hexdigest()


def load_cache(path: Path) -> dict:
    data = jev_lib.load_json(path, {"version": 1, "items": {}})
    if not isinstance(data, dict) or data.get("version") != 1 or not isinstance(data.get("items"), dict):
        return {"version": 1, "items": {}}
    return data


def prune_cache(cache: dict, days: int = STATE_CACHE_DAYS) -> None:
    cutoff = time.time() - days * 86400
    keep = {}
    for url, item in cache["items"].items():
        try:
            if float(item.get("seen_at", 0)) >= cutoff:
                keep[url] = item
        except (TypeError, ValueError):
            keep[url] = item
    cache["items"] = keep


# ---------------------------------------------------------------- patterns + ideas

def build_patterns(results: list[dict]) -> dict:
    judged = [r for r in results if r["jev"]["ok"]]
    n = len(judged)
    if n == 0:
        return {"n": 0}
    fmt = Counter(r["jev"]["format"] for r in judged)
    emne = Counter(r["jev"]["emne"] for r in judged)
    kval = Counter(r["jev"]["kvalitet"] for r in judged)
    sells_yes = sum(1 for r in judged if r["jev"]["saelger_indirekte"] == "ja")
    high = [r for r in judged if r["jev"]["kvalitet"] == "hoej"]
    low = [r for r in judged if r["jev"]["kvalitet"] == "lav"]

    def avg_words(rows):
        return round(sum(r["word_count"] for r in rows) / len(rows)) if rows else 0

    def faq_rate(rows):
        return round(100 * sum(1 for r in rows if r["has_faq"]) / len(rows)) if rows else 0

    cta_high = Counter(r["cta_type"] for r in high)
    return {
        "n": n,
        "format_dist": fmt,
        "emne_dist": emne,
        "kvalitet_dist": kval,
        "sells_indirectly_pct": round(100 * sells_yes / n),
        "avg_words_high": avg_words(high),
        "avg_words_low": avg_words(low),
        "faq_rate_high": faq_rate(high),
        "faq_rate_low": faq_rate(low),
        "top_cta_high": cta_high.most_common(1)[0][0] if cta_high else "ukendt",
        "n_high": len(high),
        "n_low": len(low),
    }


def pick_top_ideas(results: list[dict], existing_titles: list[str], limit: int = 3) -> list[dict]:
    fits = [r for r in results if r["jev"]["ok"] and r["jev"]["egnet_kinly"] == "ja" and r["jev"]["emne"] != "andet"]
    fits.sort(key=lambda r: _KVAL_RANK.get(r["jev"]["kvalitet"], 0), reverse=True)
    by_emne: dict[str, dict] = {}
    for r in fits:
        emne = r["jev"]["emne"]
        by_emne.setdefault(emne, r)  # første (bedste, pga. sortering) pr. emne vinder
    existing_norm = [re.sub(r"\s+", " ", t).strip().lower() for t in existing_titles]
    ideas = []
    for emne, r in by_emne.items():
        title = IDEA_TITLE_BY_EMNE.get(emne, IDEA_TITLE_BY_EMNE["andet"])
        if any(title.lower() in t or t in title.lower() for t in existing_norm):
            continue
        n_emne = sum(1 for x in fits if x["jev"]["emne"] == emne)
        note = (
            f"Signal: {n_emne} konkurrent-opslag i kategorien '{emne}' er egnet til Kinly-vinkel "
            f"({r['jev']['kvalitet']} kvalitet). Inspireret af: {r['url']} ({r['source_name']}). "
            f"Mål-søgeord: {KEYWORD_BY_EMNE.get(emne, emne)}."
        )
        ideas.append({"title": title, "category": CATEGORY_BY_EMNE.get(emne, "hjemmeside"), "note": note, "emne": emne})
        if len(ideas) >= limit:
            break
    return ideas


# ---------------------------------------------------------------- rendering

def render_section(now: datetime, sources: list[dict], scanned: int, cached: int, judged: int,
                    skipped_budget: int, patterns: dict, ideas: list[dict], errors: list[str]) -> str:
    lines = [f"## Scan {now.strftime('%Y-%m-%d')}", ""]
    lines.append(f"- Kilder: {len(sources)} ({sum(1 for s in sources if s['country']=='DK')} DK, "
                 f"{sum(1 for s in sources if s['country']!='DK')} udenlandske)")
    lines.append(f"- Opslag hentet: {scanned} (cache-genbrug: {cached}, nye Jev-domme: {judged}, "
                 f"sprunget over pga. Jev-loft: {skipped_budget})")
    if patterns.get("n"):
        n = patterns["n"]
        lines.append(f"- Format-fordeling ({n} dømt): " + ", ".join(f"{k} {v}" for k, v in patterns["format_dist"].most_common()))
        lines.append(f"- Emne-fordeling: " + ", ".join(f"{k} {v}" for k, v in patterns["emne_dist"].most_common()))
        lines.append(f"- Kvalitet: " + ", ".join(f"{k} {v}" for k, v in patterns["kvalitet_dist"].most_common()))
        lines.append(f"- Sælger indirekte: {patterns['sells_indirectly_pct']}%")
        lines.append(
            f"- **Hvad går godt** ({patterns['n_high']} høj-kvalitet opslag): gennemsnit "
            f"{patterns['avg_words_high']} ord, FAQ i {patterns['faq_rate_high']}%, "
            f"hyppigste CTA '{patterns['top_cta_high']}'."
        )
        lines.append(
            f"- **Hvad går dårligt** ({patterns['n_low']} lav-kvalitet opslag): gennemsnit "
            f"{patterns['avg_words_low']} ord, FAQ i kun {patterns['faq_rate_low']}%."
        )
    else:
        lines.append("- Ingen opslag kunne dømmes denne uge (netværk/Jev-fejl eller tomt loft).")
    if ideas:
        lines.append("- Idékort foreslået denne uge:")
        for idea in ideas:
            lines.append(f"  - {idea['title']} ({idea['category']}) — {idea['note']}")
    if errors:
        lines.append(f"- Fejl ({len(errors)}): " + "; ".join(errors[:8]))
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------- HQ integration

def existing_hq_titles() -> list[str]:
    try:
        proc = subprocess.run([sys.executable, str(CRM_POSTS_CLI), "list"], capture_output=True, text=True, timeout=30)
        if proc.returncode != 0:
            return []
        titles = []
        for line in proc.stdout.splitlines():
            m = re.match(r"^\S+\s+\[[^\]]+\]\s+(.*?)\s+\(mangler", line)
            if m:
                titles.append(m.group(1))
        return titles
    except Exception:
        return []


def create_hq_cards(ideas: list[dict]) -> list[str]:
    created = []
    for idea in ideas:
        try:
            proc = subprocess.run(
                [sys.executable, str(CRM_POSTS_CLI), "create", "--title", idea["title"],
                 "--category", idea["category"], "--note", idea["note"]],
                capture_output=True, text=True, timeout=30,
            )
            if proc.returncode == 0:
                created.append(idea["title"])
        except Exception:
            pass
    return created


# ---------------------------------------------------------------- main

def run(sources_path: Path, dry_run: bool, total_limit: int, max_jev: int, no_create: bool) -> int:
    data = jev_lib.load_json(sources_path, {"sources": []})
    sources = data.get("sources", [])
    if not sources:
        print(f"FEJL: ingen kilder i {sources_path}")
        return 1

    errors: list[str] = []
    all_entries: list[dict] = []
    for source in sources:
        try:
            entries = collect_source_entries(source)
            if not entries:
                errors.append(f"{source['id']}: ingen opslag fundet")
            all_entries.extend(entries)
        except Exception as exc:
            errors.append(f"{source['id']}: {exc.__class__.__name__}")

    seen_urls = set()
    deduped = []
    for e in sorted(all_entries, key=lambda e: _parse_date(e.get("date", "")), reverse=True):
        if e["url"] in seen_urls:
            continue
        seen_urls.add(e["url"])
        deduped.append(e)
    deduped = deduped[:total_limit]

    cache = load_cache(STATE_PATH)
    results: list[dict] = []
    cached_hits = judged_fresh = skipped_budget = 0

    for entry in deduped:
        url = entry["url"]
        cached_item = cache["items"].get(url)
        if cached_item and cached_item.get("ok"):
            results.append(cached_item["result"])
            cached_hits += 1
            continue

        if not allowed(url):
            errors.append(f"{url}: robots.txt disallow")
            continue
        raw = fetch_html(url)
        if not raw:
            errors.append(f"{url}: fetch fejlede")
            continue
        features = extract_features(url, raw)

        if judged_fresh >= max_jev:
            skipped_budget += 1
            continue

        jev_raw = jev_lib.ask(jev_state_for(features, entry), QUESTIONS)
        jev_result = classify_jev(jev_raw)
        judged_fresh += 1

        result = {
            "url": url, "source_id": entry["source_id"], "source_name": entry["source_name"],
            "word_count": features["word_count"], "has_faq": features["has_faq"],
            "has_stats": features["has_stats"], "image_count": features["image_count"],
            "cta_type": features["cta_type"], "jev": jev_result,
        }
        results.append(result)
        cache["items"][url] = {"ok": jev_result["ok"], "seen_at": time.time(), "result": result}

    prune_cache(cache)
    jev_lib.atomic_write_json(STATE_PATH, cache)

    patterns = build_patterns(results)
    existing_titles = [] if dry_run else existing_hq_titles()
    if dry_run:
        # best-effort til visning i tør-kørsel; ingen prod-skriv-adgang krævet
        try:
            existing_titles = existing_hq_titles()
        except Exception:
            existing_titles = []
    ideas = pick_top_ideas(results, existing_titles)

    now = datetime.now(timezone.utc)
    section = render_section(now, sources, len(deduped), cached_hits, judged_fresh, skipped_budget,
                              patterns, ideas, errors)

    if dry_run:
        scratch = Path(os.environ.get("TEMP") or os.environ.get("TMPDIR") or "/tmp") / "konkurrent-blog-scan-dryrun.md"
        scratch.write_text(section, encoding="utf-8")
        print(f"[DRY-RUN] intet skrevet til vaulten. Sektion gemt lokalt: {scratch}")
    else:
        VAULT_NOTE.parent.mkdir(parents=True, exist_ok=True)
        header = "---\ntitle: Blog-konkurrent-scan (JEV)\ntags: [marketing, blog, seo, jev]\nstatus: aktiv\nauthor: hermes\n---\n\n"
        if not VAULT_NOTE.exists():
            VAULT_NOTE.write_text(header, encoding="utf-8")
        with VAULT_NOTE.open("a", encoding="utf-8") as fh:
            fh.write(section)
        print(f"Skrevet til {VAULT_NOTE}")
        if not no_create and ideas:
            created = create_hq_cards(ideas)
            print(f"Oprettet {len(created)} HQ-kort: {', '.join(created) or '(ingen)'}")

    print(section)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="skriv aldrig til vaulten/HQ; kun lokal scratch-fil + stdout")
    ap.add_argument("--limit", type=int, default=DEFAULT_TOTAL_LIMIT, help="maks antal opslag samlet pr. kørsel")
    ap.add_argument("--max-jev", type=int, default=40, help="maks nye Jev-kald pr. kørsel (cache-hits tæller ikke med)")
    ap.add_argument("--sources", type=Path, default=DEFAULT_SOURCES)
    ap.add_argument("--no-create", action="store_true", help="opret aldrig HQ-kort, selv i en rigtig kørsel")
    args = ap.parse_args()
    return run(args.sources, args.dry_run, args.limit, args.max_jev, args.no_create)


if __name__ == "__main__":
    raise SystemExit(main())
