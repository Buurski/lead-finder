#!/usr/bin/env python3
"""Ugentligt konkurrent-overblik for Kinly. Ren script-cron: 0 LLM-tokens, kun Jev +
gratis/billige API'er. Genbruger konkurrent_blog_scan.py som modul til blog-delen
(dens disk-cache, dens idé-dedup mod HQ-boardet) og crm_posts.py til CRM-skrivning.

Pr. dansk konkurrent (konkurrent_liste.json), cachet pr. ISO-uge på disk:
  - Google: rating + anmeldelser via Places API (Text Search -> id, Details -> rating).
    Kun --no-places=false; nøgle læses read-only fra samme sted som leadgen (aldrig
    skrevet/logget). Maks 1 Text Search + 1 Details pr. konkurrent pr. uge.
  - Site: PageSpeed Insights (mobil), https, LocalBusiness/Organization-schema,
    synlige priser, CMS-fingerprint, ydelser via nøgleordsliste.
  - Facebook: kun hvis /root/.venvs/fbog/bin/python findes (samme curl_cffi-mønster
    som leadgen/fb_og.py) OG konkurrenten har en kurateret facebook_url i listen.
    Ellers udelades social helt (ponytail: ingen kurateret FB-liste endnu — se rapportens
    åbne spørgsmål; koden er klar til at bruges den dag der er urls).
  - GEO: seneste daterede afsnit i wiki/kinly/geo-log.md (Hermes' ugentlige GEO-scan) —
    hvilke konkurrent-domæner nævnes i AI-svarene. Ingen gyldig måling -> udelades.
  - Blog: genbruger konkurrent_blog_scan.py's disk-cache (0 nye Jev-kald) + ét let
    RSS/sitemap-kald for posts30d.
  - Jev: ét kald pr. konkurrent (positionering + styrke/svaghed-labels ud fra forsiden).

Output: POST til Kinly HQ (crm_posts.call, path=/api/agent/competitors), dateret
sektion i wiki/kinly/konkurrent-overblik.md, og op til 3 idékort (genbruger
konkurrent_blog_scan.pick_top_ideas + create_hq_cards + existing_hq_titles — samme
dedup mod HQ-boardet). --dry-run: intet af det, kun stdout/lokal scratch-fil.

Brug:
  konkurrent_scan.py --dry-run [--no-places] [--max-jev 6]
  konkurrent_scan.py                 # rigtig kørsel (cron, søndag 02:00)
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import statistics
import sys
import time
from collections import Counter
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import jev_lib  # noqa: E402
import konkurrent_blog_scan as blogscan  # noqa: E402
import crm_posts  # noqa: E402
import inspiration  # noqa: E402

UA = blogscan.UA
DEFAULT_LISTE = HERE / "konkurrent_liste.json"
STATE_DIR = Path(os.path.expanduser("~/.hermes/konkurrent-scan"))
SITE_STATE_PATH = STATE_DIR / "site-scan-state.json"  # eget cache-navn — rører aldrig blogscan.STATE_PATH
VAULT_NOTE = Path(os.path.expanduser("~/KnowledgeOS/wiki/kinly/konkurrent-overblik.md"))  # VPS-prod-sti
GEO_LOG = Path(os.path.expanduser("~/KnowledgeOS/wiki/kinly/geo-log.md"))  # VPS-prod-sti
POST_PATH = "/api/agent/competitors"
FB_VENV_PY = Path("/root/.venvs/fbog/bin/python")

PAGESPEED_URL = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"
PLACES_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places/{id}"

CMS_SIGNATURES = [
    ("WordPress", r"wp-content|wp-includes|/wp-json/"),
    ("Wix", r"wixstatic\.com|wix\.com/api|_wixCssStates"),
    ("Webflow", r"webflow\.io|w-webflow-badge|data-wf-page"),
    ("Shopify", r"cdn\.shopify\.com|Shopify\.theme|shopify-analytics"),
    ("Squarespace", r"squarespace\.com|static1\.squarespace"),
    ("Umbraco", r"umbraco"),
]

# ponytail: fast nøgleordsliste, ikke NLP — nok til et deterministisk overblik.
SERVICE_KEYWORDS = [
    ("hjemmeside", r"hjemmesid\w*"),
    ("webshop", r"webshop|e-?commerce|netbutik"),
    ("seo", r"\bseo\b|søgemaskineoptimering"),
    ("google-ads", r"google\s?ads|adwords"),
    ("sociale-medier", r"sociale medier|social media|somemarketing|facebook-?annonc"),
    ("logo", r"logo(?:design)?"),
    ("hosting", r"\bhosting\b"),
    ("vedligehold", r"vedligehold|driftsaftale"),
    ("kunde-cms", r"\bcms\b|eget cms|selv redigere|selv rette|redigere selv"),
    ("apps", r"\bapps?\b(?!le)"),
]

STRENGTH_LABELS = ["pris", "hurtig-levering", "lokalt-kendskab", "seo-fokus", "design", "kundeservice", "teknisk-dybde", "branche-specialist"]
WEAKNESS_LABELS = ["dyrt", "langsom-levering", "utydelige-priser", "generisk-design", "begraenset-support", "daarligt-vedligeholdt-blog", "svag-mobilvisning", "ingen-lokal-forankring"]

POSITION_LABEL = {
    "billigst": "Billigst i markedet",
    "premium": "Premium/eksklusivt segment",
    "lokal": "Lokalt forankret bureau",
    "specialist": "Specialist (fx SEO/ads)",
    "fuldservice": "Fuldservice-bureau",
    "andet": "Uklar eller anden positionering",
}

KINLY_SERVICES = {"hjemmeside", "seo", "kunde-cms", "hosting", "vedligehold"}
GAP_CATEGORY = {"indhold": "hjemmeside", "ydelse": "hjemmeside", "pris": "pris", "synlighed": "lokal-synlighed"}

# ---------------------------------------------------------------- v2: budskab/seo/geo/ydelse-spørgsmål
CONF_THRESHOLD = 0.6  # fund under denne skjules (spec 26/9)
MESSAGE_ANGLES = ["pris", "hastighed", "ai", "lokal", "garanti"]

# ponytail: fast keyword-liste, ikke NLP — nok til at navngive den ydelse Jev allerede har sagt "ja" til.
EXTRA_SERVICE_KEYWORDS = [
    ("branding", r"branding|visuel identitet|brandstrateg"),
    ("foto", r"fotografering|erhvervsfoto|videoproduktion|foto-?shoot"),
    ("apps", r"app-udvikling|mobilapp|native app"),
    ("annoncer", r"annoncering|facebook-?annoncer|google-?annoncer|paid ads|mediek(?:ø|oe)b"),
    ("raadgivning", r"r[åa]dgivning|konsulentydelse|strategisk sparring"),
]

# Kinly-profilen: læst direkte på kinly.dk's forside 2026-09-27 (Sonnet 5) til brug for
# "det gør vi allerede / det gør vi ikke"-vurderinger i findings. Opdatér datoen hvis siden ændres.
KINLY_PROFILE = {
    "hasPricesVisible": True,      # sektion #priser + FAQ nævner 3.997/4.997/8.449 kr
    "schemaLocalBusiness": True,   # FAQPage-schema + LocalBusiness/Organization på forsiden
    "hasFaqOnFront": True,         # <section id="faq"> med 7 spørgsmål
    "reviewsAsText": True,         # kundecitat "Jeg kan varmt anbefale Lukas!" — Lene, VIDA Skønhedsklinik
    "geoCitableAnswers": True,     # FAQ-svarene er allerede korte, citerbare svar på kundespørgsmål
}

FINDING_CATEGORIES = ("ydelse", "pris-budskab", "seo", "geo", "alternativ", "forbedring")
SUGGEST_KINDS = ("blog", "annonce", "kinly-dk", "salg")

# ---------------------------------------------------------------- v2: AI-bygger-alternativer (regex, ingen Jev)
PRICE_ANY_RE = re.compile(r"(?:\$\s?\d[\d.,]*|€\s?\d[\d.,]*|\d[\d.,]*\s?(?:kr\.?|€))", re.I)
AI_FEATURE_RE = re.compile(r"\bAI\b|kunstig intelligens|artificial intelligence", re.I)
DANISH_TEXT_RE = re.compile(r"[æøåÆØÅ]|\bog\b|\bikke\b|\bhjemmeside\b", re.I)
CODE_EXPORT_RE = re.compile(r"eksporter\w*\s+kode|export\w*\s+code|own your code|ejer?\s+din\s+kode|download.{0,20}code", re.I)


def _questions_for_competitor(name: str) -> dict:
    q = {
        "positionering": {
            "type": "choice",
            "instructions": f"Ud fra forsideteksten (`site`): hvordan positionerer webbureauet '{name}' sig selv?",
            "criteria": {
                "billigst": "Fremhæver lav pris/billigst som hovedbudskab",
                "premium": "Fremhæver eksklusivitet, kvalitet i topsegment eller høj pris",
                "lokal": "Fremhæver lokal forankring/nærhed som hovedbudskab",
                "specialist": "Fremhæver ét snævert speciale (fx kun SEO, kun ads)",
                "fuldservice": "Fremhæver bredt udbud af ydelser under ét tag",
                "andet": "Passer ikke i de andre kategorier",
            },
        }
    }
    for label in STRENGTH_LABELS:
        q[f"styrke_{label}"] = {
            "type": "choice",
            "instructions": f"Fremhæver forsideteksten tydeligt '{label}' som en styrke ved '{name}'?",
            "criteria": {"ja": "Ja, tydeligt fremhævet", "nej": "Nej, eller for uklart til at afgøre"},
        }
    for label in WEAKNESS_LABELS:
        q[f"svaghed_{label}"] = {
            "type": "choice",
            "instructions": f"Tyder forsideteksten på risikoen '{label}' hos '{name}' (fravær af modsat signal er IKKE nok — kræv et konkret tegn)?",
            "criteria": {"ja": "Ja, konkret tegn i teksten", "nej": "Nej, intet konkret tegn"},
        }
    q["ydelse_ikke_kinly"] = {
        "type": "choice",
        "instructions": f"Tilbyder '{name}' (ifølge forsideteksten) en konkret ydelse ud over hjemmeside/webshop/SEO/hosting/drift — fx branding, foto, apps, annoncering eller rådgivning?",
        "criteria": {"ja": "Ja, en konkret ekstra ydelse er nævnt", "nej": "Nej, eller for uklart"},
    }
    q["seo_faq_synlig"] = {
        "type": "choice",
        "instructions": f"Har '{name}'s forside en synlig FAQ/Ofte stillede spørgsmål-sektion?",
        "criteria": {"ja": "Ja, en FAQ-sektion er synlig", "nej": "Nej, ingen FAQ set"},
    }
    q["seo_anmeldelser_tekst"] = {
        "type": "choice",
        "instructions": f"Viser '{name}'s forside kundecitater som skrevet tekst (ikke kun en stjernescore/tal)?",
        "criteria": {"ja": "Ja, et skrevet kundecitat er synligt", "nej": "Nej, kun evt. stjerner/tal"},
    }
    q["geo_citerbare_svar"] = {
        "type": "choice",
        "instructions": f"Er noget af '{name}'s tekst skrevet som korte, citerbare svar på konkrete kundespørgsmål (fx en FAQ med præcise svar)?",
        "criteria": {"ja": "Ja, korte citerbare svar findes", "nej": "Nej, teksten er ikke skrevet sådan"},
    }
    for angle in MESSAGE_ANGLES:
        q[f"budskab_{angle}"] = {
            "type": "choice",
            "instructions": f"Er '{angle}' hovedbudskabet/USP'en hos '{name}' ifølge forsideteksten?",
            "criteria": {"ja": "Ja, det er tydeligt et hovedbudskab", "nej": "Nej, eller for uklart"},
        }
    return q


def _conf_rating(conf: float) -> int:
    """confidence 0.6-1.0 -> rating 1-5 (spec 26/9)."""
    return max(1, min(5, round(1 + 4 * (conf - CONF_THRESHOLD) / (1 - CONF_THRESHOLD))))


def _choice(answers: dict, qid: str) -> tuple[str | None, float]:
    ans = answers.get(qid) or {}
    if ans.get("type") != "choice":
        return None, 0.0
    try:
        return ans.get("choice"), float(ans.get("confidence") or 0.0)
    except (TypeError, ValueError):
        return ans.get("choice"), 0.0


def _yes(answers: dict, qid: str) -> bool | None:
    """True/False kun ved gyldigt ja/nej OG confidence >= CONF_THRESHOLD, ellers None (skjult fund)."""
    choice, conf = _choice(answers, qid)
    if choice not in ("ja", "nej") or conf < CONF_THRESHOLD:
        return None
    return choice == "ja"


def classify_competitor_jev(raw: dict | None) -> dict:
    empty = {"ok": False, "positioning": None, "positioning_confidence": None,
              "strengths": [], "weaknesses": [], "messaging_angles": [],
              "ydelse_ikke_kinly": None, "seo_faq_synlig": None,
              "seo_anmeldelser_tekst": None, "geo_citerbare_svar": None}
    try:
        answers = (raw or {}).get("answers", {})
        pos_choice, pos_conf = _choice(answers, "positionering")
        if pos_choice not in POSITION_LABEL or pos_conf < CONF_THRESHOLD:
            raise ValueError("ugyldig eller usikker positionering")
        strengths = [l for l in STRENGTH_LABELS if _yes(answers, f"styrke_{l}")][:5]
        weaknesses = [l for l in WEAKNESS_LABELS if _yes(answers, f"svaghed_{l}")][:5]
        angles = [a for a in MESSAGE_ANGLES if _yes(answers, f"budskab_{a}")]
        return {
            "ok": True,
            "positioning": pos_choice,
            "positioning_confidence": round(pos_conf, 2),
            "strengths": strengths,
            "weaknesses": weaknesses,
            "messaging_angles": angles,
            "ydelse_ikke_kinly": _yes(answers, "ydelse_ikke_kinly"),
            "seo_faq_synlig": _yes(answers, "seo_faq_synlig"),
            "seo_anmeldelser_tekst": _yes(answers, "seo_anmeldelser_tekst"),
            "geo_citerbare_svar": _yes(answers, "geo_citerbare_svar"),
        }
    except (KeyError, TypeError, ValueError, AttributeError):
        return empty


def detect_extra_service(text_lower: str) -> str | None:
    """Deterministisk keyword-match for hvilken ekstra ydelse Jev sagde 'ja' til (ingen ekstra Jev-kald)."""
    for name, pat in EXTRA_SERVICE_KEYWORDS:
        if re.search(pat, text_lower, re.I):
            return name
    return None


def extract_ai_builder_signals(raw_html: str) -> dict:
    """Regex-only signaler for AI-bygger-alternativer — ingen Jev nødvendig."""
    text = blogscan._strip_tags(raw_html)
    price_m = PRICE_ANY_RE.search(text)
    return {
        "priceFromText": price_m.group(0).strip()[:40] if price_m else None,
        "aiFeatures": bool(AI_FEATURE_RE.search(text)),
        "danish": bool(DANISH_TEXT_RE.search(text)),
        "codeExport": bool(CODE_EXPORT_RE.search(text)),
    }


def run_ai_builders(alt_in: list[dict]) -> list[dict]:
    """Letvægtsspor for kind=='ai-bygger': kun fetch + regex, ingen Places/Jev/GEO/blog."""
    out: list[dict] = []
    for comp in alt_in:
        entry: dict = {"name": comp["name"], "url": comp["url"], "kind": "ai-bygger",
                       "country": "DK" if comp.get("country") == "DK" else "andet"}
        raw_html = fetch_site(comp["url"])
        if not raw_html:
            continue
        signals = extract_ai_builder_signals(raw_html)
        entry["aiBuilder"] = {k: v for k, v in signals.items() if v is not None}
        out.append(entry)
    return out


# ---------------------------------------------------------------- polite fetch (1 req/sek pr. domæne)

_last_req: dict[str, float] = {}


def throttle(url: str, min_gap: float = 1.0) -> None:
    domain = urlparse(url).netloc
    now = time.monotonic()
    wait = _last_req.get(domain, 0.0) + min_gap - now
    if wait > 0:
        time.sleep(wait)
    _last_req[domain] = time.monotonic()


def fetch_site(url: str) -> str | None:
    if not blogscan.allowed(url):
        return None
    throttle(url)
    return blogscan.fetch_html(url, timeout=15)


# ---------------------------------------------------------------- site signal extraction

def detect_cms(raw_html: str) -> str:
    for name, pat in CMS_SIGNATURES:
        if re.search(pat, raw_html, re.I):
            return name
    return "ukendt"


def detect_services(text_lower: str) -> list[str]:
    return [name for name, pat in SERVICE_KEYWORDS if re.search(pat, text_lower, re.I)]


PRICE_RE = re.compile(r"(fra\s+\d[\d.,]*\s*kr\.?[^.\n]{0,40}|\d[\d.,]*\s*kr\.?(?:,-)?)", re.I)


def extract_site_signals(url: str, raw_html: str) -> dict:
    text = blogscan._strip_tags(raw_html)
    has_schema = bool(re.search(r'"@type"\s*:\s*"(LocalBusiness|Organization|ProfessionalService|Store)"', raw_html)) or \
        bool(re.search(r"schema\.org/(LocalBusiness|Organization)", raw_html, re.I))
    price_match = PRICE_RE.search(text)
    return {
        "https": url.startswith("https://"),
        "schemaLocalBusiness": has_schema,
        "hasPrices": bool(price_match),
        "priceFrom": (price_match.group(1).strip()[:60] if price_match else None),
        "cms": detect_cms(raw_html)[:40],
        "services": detect_services(text)[:12],
    }


# ---------------------------------------------------------------- weekly disk cache

def iso_week() -> str:
    return datetime.now(timezone.utc).strftime("%G-W%V")


def load_state() -> dict:
    data = jev_lib.load_json(SITE_STATE_PATH, {"version": 1, "week": {}})
    if not isinstance(data, dict) or not isinstance(data.get("week"), dict):
        return {"version": 1, "week": {}}
    return data


def cache_get(state: dict, bucket: str, key: str):
    week = iso_week()
    return (state["week"].get(week, {}).get(bucket, {}) or {}).get(key)


def cache_set(state: dict, bucket: str, key: str, value) -> None:
    week = iso_week()
    state["week"].setdefault(week, {}).setdefault(bucket, {})[key] = value


def prune_state(state: dict, keep_weeks: int = 6) -> None:
    weeks = sorted(state["week"].keys())
    for w in weeks[:-keep_weeks]:
        del state["week"][w]


# ---------------------------------------------------------------- PageSpeed

def load_pagespeed_key() -> str | None:
    key = os.environ.get("PAGESPEED_API_KEY")
    if key:
        return key.strip()
    for env_path in (os.path.expanduser("~/.hermes/.env"), os.path.expanduser("~/.hermes/credentials.env")):
        try:
            with open(env_path, encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("PAGESPEED_API_KEY="):
                        return line.strip().split("=", 1)[1].strip().strip('"').strip("'") or None
        except OSError:
            pass
    return None


def pagespeed_mobile(url: str, state: dict) -> int | None:
    cached = cache_get(state, "pagespeed", url)
    if cached is not None:
        return cached
    key = load_pagespeed_key()
    qs = f"?url={url}&strategy=mobile&category=performance" + (f"&key={key}" if key else "")
    try:
        throttle(PAGESPEED_URL)
        with urlopen(PAGESPEED_URL + qs, timeout=30) as r:
            data = json.loads(r.read())
        score = round(100 * data["lighthouseResult"]["categories"]["performance"]["score"])
    except Exception:
        return None
    cache_set(state, "pagespeed", url, score)
    return score


# ---------------------------------------------------------------- Google Places

def load_places_key() -> str | None:
    """Read-only, samme fil som lead-systemets leadgen bruger (aldrig skrevet/logget her)."""
    key = os.environ.get("GOOGLE_PLACES_API_KEY")
    if key:
        return key.strip()
    for env_path in (os.path.expanduser("~/.hermes/credentials.env"), os.path.expanduser("~/.hermes/.env")):
        try:
            with open(env_path, encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("GOOGLE_PLACES_API_KEY="):
                        return line.strip().split("=", 1)[1].strip().strip('"').strip("'") or None
        except OSError:
            pass
    return None


def places_lookup(competitor: dict, state: dict, no_places: bool) -> dict | None:
    if no_places:
        return None
    cache_key = competitor["id"]
    cached = cache_get(state, "places", cache_key)
    if cached is not None:
        return clean_google(cached)
    key = load_places_key()
    if not key:
        return None
    try:
        throttle(PLACES_SEARCH_URL)
        body = json.dumps({"textQuery": f"{competitor['name']} {competitor.get('city', '')}", "languageCode": "da", "maxResultCount": 1})
        req = Request(PLACES_SEARCH_URL, data=body.encode(), method="POST", headers={
            "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "places.id,places.displayName",
        })
        with urlopen(req, timeout=15) as r:
            places = json.loads(r.read()).get("places", [])
        if not places:
            cache_set(state, "places", cache_key, {})
            return None
        place_id = places[0]["id"]
        throttle(PLACES_DETAILS_URL)
        req2 = Request(PLACES_DETAILS_URL.format(id=place_id), headers={"X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount"})
        with urlopen(req2, timeout=15) as r:
            details = json.loads(r.read())
        result = {"rating": details.get("rating"), "reviews": details.get("userRatingCount"), "source": "places"}
    except Exception:
        return None
    cache_set(state, "places", cache_key, result)
    return clean_google(result)


def clean_google(d: dict | None) -> dict | None:
    """HQ kræver rating (tal). Firma uden Google-rating -> intet google-felt (ikke rating: null, som vælter hele rapporten)."""
    if not d or not isinstance(d.get("rating"), (int, float)):
        return None
    return {"rating": d["rating"], "reviews": int(d.get("reviews") or 0), "source": d.get("source") or "places"}


# ---------------------------------------------------------------- Facebook (kun hvis helper + url findes)

def facebook_lookup(competitor: dict) -> dict | None:
    url = competitor.get("facebook_url")
    if not url or not FB_VENV_PY.exists():
        return None
    script = (
        "import sys, json, re\n"
        "from curl_cffi import requests as creq\n"
        "url = sys.argv[1]\n"
        "try:\n"
        "    r = creq.get(url, impersonate='chrome', timeout=15, allow_redirects=True)\n"
        "    desc = ''\n"
        "    if r.status_code == 200 and '/login' not in r.url:\n"
        "        for tag in re.findall(r'<meta[^>]*>', r.text, re.I):\n"
        "            if re.search(r'property\\s*=\\s*[\"\\']og:description[\"\\']', tag, re.I):\n"
        "                m = re.search(r'content\\s*=\\s*\"([^\"]*)\"|content\\s*=\\s*\\'([^\\']*)\\'', tag, re.I)\n"
        "                if m: desc = m.group(1) or m.group(2) or ''\n"
        "    m = re.search(r'([\\d.,]+)\\s*(?:følgere|followers)', desc, re.I)\n"
        "    print(json.dumps({'followers': int(re.sub(r'[.,]', '', m.group(1))) if m else None, 'active': bool(desc)}))\n"
        "except Exception:\n"
        "    print(json.dumps({}))\n"
    )
    try:
        import subprocess
        proc = subprocess.run([str(FB_VENV_PY), "-c", script, url], capture_output=True, text=True, timeout=20)
        data = json.loads(proc.stdout.strip() or "{}")
        if not data:
            return None
        return {"facebookFollowers": data.get("followers"), "facebookActive": data.get("active")}
    except Exception:
        return None


# ---------------------------------------------------------------- GEO (læs, aldrig skriv)

def latest_geo_section(text: str) -> str:
    sections = re.split(r"(?m)^## ", text)
    return sections[-1] if len(sections) > 1 else ""


def parse_geo_mentions(text: str) -> dict[str, list[str]]:
    """domæne -> liste af 'gruppe'-labels der nævnte det, i seneste daterede afsnit."""
    section = latest_geo_section(text)
    mentions: dict[str, set[str]] = {}
    for line in section.splitlines():
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 7 or cells[0] in ("gruppe", "---") or cells[0].startswith("-"):
            continue
        gruppe, domains_csv = cells[0], cells[-1]
        if not domains_csv or domains_csv == "—":
            continue
        for domain in (d.strip() for d in domains_csv.split(",")):
            if domain:
                mentions.setdefault(domain, set()).add(gruppe)
    return {d: sorted(g) for d, g in mentions.items()}


def geo_for_domain(mentions: dict[str, list[str]], url: str) -> dict | None:
    netloc = urlparse(url).netloc.removeprefix("www.")
    groups = mentions.get(netloc)
    if not groups:
        return None
    return {"mentionedBy": groups[:5]}


# ---------------------------------------------------------------- blog (genbrug konkurrent_blog_scan)

def blog_signal_for(source_id: str | None, sources_by_id: dict) -> dict | None:
    if not source_id or source_id not in sources_by_id:
        return None
    cache = blogscan.load_cache(blogscan.STATE_PATH)
    rows = [item["result"] for item in cache["items"].values()
            if item.get("ok") and item["result"].get("source_id") == source_id]
    judged = [r for r in rows if r["jev"]["ok"]]
    posts30d = None
    try:
        entries = blogscan.collect_source_entries(sources_by_id[source_id])
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        posts30d = sum(1 for e in entries if blogscan._parse_date(e.get("date", "")) >= cutoff)
    except Exception:
        pass
    if not judged and posts30d is None:
        return None
    topics = sorted({r["jev"]["emne"] for r in judged if r["jev"]["emne"] != "andet"})[:8]
    quality = None
    if judged:
        kvals = [r["jev"]["kvalitet"] for r in judged]
        mode = max(set(kvals), key=kvals.count)
        quality = {"hoej": "høj", "mellem": "mellem", "lav": "lav"}[mode]
    out: dict = {}
    if posts30d is not None:
        out["posts30d"] = posts30d
    if topics:
        out["topics"] = topics
    if quality:
        out["quality"] = quality
    return out or None


def all_blog_rows(competitors: list[dict]) -> list[dict]:
    wanted = {c["blog_source_id"] for c in competitors if c.get("blog_source_id")}
    if not wanted:
        return []
    cache = blogscan.load_cache(blogscan.STATE_PATH)
    return [item["result"] for item in cache["items"].values()
            if item.get("ok") and item["result"].get("source_id") in wanted and item["result"]["jev"]["ok"]]


# ---------------------------------------------------------------- patterns + gaps (deterministisk)

def pct(n: int, total: int) -> int:
    return round(100 * n / total) if total else 0


def build_patterns_and_gaps(competitors: list[dict], content_ideas: list[dict]) -> tuple[list[dict], list[dict]]:
    with_site = [c for c in competitors if c.get("site")]
    n = len(with_site)
    patterns: list[dict] = []
    gaps: list[dict] = []
    if n == 0:
        return patterns, gaps

    no_price = [c for c in with_site if not c["site"]["hasPrices"]]
    if no_price:
        patterns.append({
            "title": f"{len(no_price)}/{n} viser ikke tydelige priser",
            "detail": "De fleste konkurrenter skjuler priser bag 'kontakt os for tilbud'. Kinly kan vinde på prisgennemsigtighed.",
            "evidence": [c["url"] for c in no_price[:5]],
        })
        gaps.append({"title": "Vis priser åbent, hvor konkurrenterne gemmer dem",
                     "detail": f"{len(no_price)}/{n} konkurrenter viser ingen pris. Kinlys faste, synlige pris er en differentierende fordel.",
                     "kind": "pris"})

    no_schema = [c for c in with_site if not c["site"]["schemaLocalBusiness"]]
    if no_schema:
        patterns.append({
            "title": f"Kun {n - len(no_schema)}/{n} har LocalBusiness/Organization-schema",
            "detail": "Strukturerede data mangler hos de fleste — en nem teknisk fordel for lokal synlighed og AI-søgning.",
            "evidence": [c["url"] for c in no_schema[:5]],
        })

    speeds = [c["site"]["pagespeedMobile"] for c in with_site if c["site"].get("pagespeedMobile") is not None]
    if speeds:
        patterns.append({
            "title": f"Median PageSpeed mobil {round(statistics.median(speeds))}",
            "detail": f"Målt på {len(speeds)}/{n} sider. Lav mobilscore er en gentagen svaghed i markedet.",
            "evidence": [c["url"] for c in with_site if c["site"].get("pagespeedMobile") is not None][:5],
        })

    with_cms_service = [c for c in with_site if "kunde-cms" in c["site"]["services"]]
    if not with_cms_service:
        patterns.append({
            "title": f"Ingen af de {n} konkurrenter tilbyder synligt kunde-CMS",
            "detail": "Ingen nævner at kunden selv kan redigere sit indhold — Kinlys kunde-CMS er udifferentieret i markedet.",
            "evidence": [c["url"] for c in with_site[:5]],
        })
        gaps.append({"title": "Fremhæv kunde-CMS som ydelse konkurrenterne ikke nævner",
                     "detail": f"0/{n} konkurrenter nævner at kunden selv kan rette sit indhold.",
                     "kind": "ydelse"})

    for service in ("google-ads", "sociale-medier", "logo"):
        offering = [c for c in with_site if service in c["site"]["services"]]
        if len(offering) >= max(3, n // 3) and service.replace("-", "") not in {s.replace("-", "") for s in KINLY_SERVICES}:
            gaps.append({"title": f"Ydelsen '{service}' tilbydes af {len(offering)}/{n} konkurrenter",
                         "detail": "Kinly tilbyder det i dag ikke som fast ydelse — mulig udvidelse eller bevidst fravalg.",
                         "kind": "ydelse"})

    for idea in content_ideas:
        gaps.append({"title": idea["title"], "detail": idea["note"], "kind": "indhold"})

    return patterns[:12], gaps[:12]


# ---------------------------------------------------------------- v2: findings (ny, ved siden af patterns/gaps)

def _rating_from_prevalence(frac: float, conf: float = 1.0) -> int:
    """Prevalens (0-1) x gennemsnitlig confidence (0-1) -> rating 1-5, via samme clamp-formel som _conf_rating.
    ponytail: booleanske Jev-fund er allerede confidence-filtreret (>=0.6) inden de når hertil, så conf=1.0
    som standard er en rimelig proxy for 'gennemsnitlig confidence' — hæv til rigtig gennemsnit hvis et
    finding nogensinde skal skelne mellem fx 0.65 og 0.95 confidence."""
    combined = CONF_THRESHOLD + (1 - CONF_THRESHOLD) * max(0.0, min(1.0, frac * conf))
    return _conf_rating(combined)


def _finding_id(category: str, title: str) -> str:
    h = hashlib.sha1(f"{category}|{title}".encode("utf-8")).hexdigest()[:10]
    return f"{category[:3]}-{h}"[:40]


def _finding(category: str, title: str, detail: str, rating: int, evidence: list[str], suggest: str) -> dict:
    return {
        "id": _finding_id(category, title),
        "category": category,
        "title": title[:80],
        "detail": detail[:240],
        "rating": rating,
        "evidence": evidence[:6],
        "suggest": suggest,
    }


def _judged_flag(c: dict, group: str, key: str) -> bool | None:
    g = c.get(group)
    return g.get(key) if isinstance(g, dict) and key in g else None


def build_findings(competitors: list[dict], content_ideas: list[dict]) -> list[dict]:
    """Deterministisk, i build_patterns_and_gaps-stil: prevalens x confidence -> rating 1-5.
    'vi gør ikke' afgøres mod KINLY_PROFILE (læst på kinly.dk 2026-09-27, se konstant ovenfor)."""
    findings: list[dict] = []
    bureaus = [c for c in competitors if c.get("kind") != "ai-bygger"]
    with_site = [c for c in bureaus if c.get("site")]
    n_site = len(with_site)

    if n_site:
        no_price = [c for c in with_site if not c["site"].get("hasPrices")]
        if no_price:
            detail = ("Så gør vi: Kinly viser fast pris åbent — bliv ved med det i salg og annoncer." if KINLY_PROFILE["hasPricesVisible"]
                       else "Så gør vi ikke endnu: overvej at vise en fast pris, hvor konkurrenterne gemmer den.")
            findings.append(_finding("pris-budskab", f"{len(no_price)}/{n_site} konkurrenter skjuler prisen bag 'kontakt os'",
                                      detail, _rating_from_prevalence(len(no_price) / n_site),
                                      [c["name"] for c in no_price], "kinly-dk"))

        no_schema = [c for c in with_site if not c["site"].get("schemaLocalBusiness")]
        if no_schema:
            detail = ("Så gør vi: Kinly har allerede LocalBusiness-schema — en nem teknisk fordel til lokal synlighed." if KINLY_PROFILE["schemaLocalBusiness"]
                       else "Så gør vi ikke endnu: tilføj LocalBusiness-schema, det er billigt og hurtigt.")
            findings.append(_finding("seo", f"{len(no_schema)}/{n_site} konkurrenter mangler LocalBusiness/Organization-schema",
                                      detail, _rating_from_prevalence(len(no_schema) / n_site),
                                      [c["name"] for c in no_schema], "kinly-dk"))

    faq = [(c, _judged_flag(c, "seoExtra", "faqVisible")) for c in bureaus]
    faq = [(c, v) for c, v in faq if v is not None]
    if faq:
        yes = [c for c, v in faq if v]
        detail = ("Så gør vi: Kinlys forside har allerede en FAQ-sektion." if KINLY_PROFILE["hasFaqOnFront"]
                   else "Så gør vi ikke endnu: en synlig FAQ er en nem vinding for AI-søgning.")
        findings.append(_finding("seo", f"{len(yes)}/{len(faq)} konkurrenter har en synlig FAQ på forsiden",
                                  detail, _rating_from_prevalence(len(yes) / len(faq)),
                                  [c["name"] for c in yes], "kinly-dk"))

    rev = [(c, _judged_flag(c, "seoExtra", "reviewsAsText")) for c in bureaus]
    rev = [(c, v) for c, v in rev if v is not None]
    if rev:
        yes = [c for c, v in rev if v]
        detail = ("Så gør vi: Kinly har allerede et kundecitat med navn og virksomhed på forsiden." if KINLY_PROFILE["reviewsAsText"]
                   else "Så gør vi ikke endnu: tilføj et kundecitat som tekst, ikke kun en stjernescore.")
        findings.append(_finding("seo", f"{len(yes)}/{len(rev)} konkurrenter viser kundecitater som tekst, ikke kun stjerner",
                                  detail, _rating_from_prevalence(len(yes) / len(rev)),
                                  [c["name"] for c in yes], "kinly-dk"))

    geo = [(c, _judged_flag(c, "geoExtra", "citableAnswers")) for c in bureaus]
    geo = [(c, v) for c, v in geo if v is not None]
    if geo:
        yes = [c for c, v in geo if v]
        detail = ("Så gør vi: Kinlys FAQ-svar er allerede skrevet som korte, citerbare svar." if KINLY_PROFILE["geoCitableAnswers"]
                   else "Så gør vi ikke endnu: skriv korte, citerbare svar-afsnit på konkrete kundespørgsmål.")
        findings.append(_finding("geo", f"{len(yes)}/{len(geo)} konkurrenter skriver citerbare svar til AI-søgning",
                                  detail, _rating_from_prevalence(len(yes) / len(geo)),
                                  [c["name"] for c in yes], "blog"))

    msg_judged = [c for c in bureaus if c.get("messaging") is not None]
    if msg_judged:
        n_msg = len(msg_judged)
        for angle in MESSAGE_ANGLES:
            with_angle = [c for c in msg_judged if angle in c["messaging"]["angles"]]
            if len(with_angle) >= max(2, n_msg // 4):
                findings.append(_finding(
                    "pris-budskab", f"{len(with_angle)}/{n_msg} konkurrenter bruger '{angle}' som hovedbudskab",
                    f"Overvej om Kinlys egen tekst/annoncer skal møde eller bevidst undgå budskabet '{angle}'.",
                    _rating_from_prevalence(len(with_angle) / n_msg), [c["name"] for c in with_angle], "annonce"))

    with_services = [c for c in bureaus if c.get("uniqueServices") is not None]
    if with_services:
        n_svc = len(with_services)
        counts = Counter(s for c in with_services for s in c["uniqueServices"])
        for service, cnt in counts.most_common(5):
            if cnt >= max(2, n_svc // 4):
                evidence = [c["name"] for c in with_services if service in c["uniqueServices"]]
                findings.append(_finding(
                    "ydelse", f"{cnt}/{n_svc} konkurrenter tilbyder '{service}' — Kinly gør ikke i dag",
                    f"Vurdér om '{service}' er en ydelse Kinly bevidst skal tilbyde, eller bevidst fravælge i salgssamtaler.",
                    _rating_from_prevalence(cnt / n_svc), evidence, "salg"))

    ai_builders = [c for c in competitors if c.get("kind") == "ai-bygger" and c.get("aiBuilder")]
    if ai_builders:
        n_ab = len(ai_builders)
        with_export = [c for c in ai_builders if c["aiBuilder"].get("codeExport")]
        if with_export:
            findings.append(_finding(
                "alternativ", f"{len(with_export)}/{n_ab} AI-byggere reklamerer med at eje/eksportere koden",
                "Kinly bygger allerede håndkodet, og kunden ejer koden fra dag ét — brug det direkte mod AI-byggerne i salg.",
                _rating_from_prevalence(len(with_export) / n_ab), [c["name"] for c in with_export], "salg"))
        with_ai = [c for c in ai_builders if c["aiBuilder"].get("aiFeatures")]
        if with_ai:
            findings.append(_finding(
                "alternativ", f"{len(with_ai)}/{n_ab} AI-byggere sælger sig selv på AI-generering",
                "Overvej om Kinly skal svare på AI-bølgen i tekst/annoncer eller bevidst positionere sig som det menneskelige, lokale alternativ.",
                _rating_from_prevalence(len(with_ai) / n_ab), [c["name"] for c in with_ai], "annonce"))

    for idea in content_ideas:
        findings.append(_finding("forbedring", idea["title"], idea.get("note", ""), 3, [], "blog"))

    findings.sort(key=lambda f: f["rating"], reverse=True)
    return findings[:20]


def inspiration_findings(candidates: list[dict], rewrites: dict[str, tuple[str, str]]) -> list[dict]:
    """Jev-godkendte opslag -> findings (kategori 'inspiration', https-link til opslaget).
    Dansk tekst fra DeepSeek-omskrivningen, ellers deterministisk fallback."""
    out = []
    for c in candidates[:inspiration.MAX_OUT]:
        title, detail = rewrites.get(c["id"]) or inspiration.fallback_text(c)
        f = _finding("inspiration", title, detail, c["rating"], [inspiration.evidence(c)], c["suggest"])
        f["id"] = _finding_id("inspiration", c["id"])  # stabilt id pr. opslag, uafhængigt af omskrivning
        if str(c.get("url", "")).startswith("https://"):
            f["url"] = c["url"]
        out.append(f)
    return out


# ---------------------------------------------------------------- rendering

def render_section(now: datetime, competitors: list[dict], patterns: list[dict], gaps: list[dict], jev_calls: int, errors: list[str]) -> str:
    n_dk = sum(1 for c in competitors if c.get("kind") != "ai-bygger")
    n_alt = len(competitors) - n_dk
    lines = [f"## Scan {now.strftime('%Y-%m-%d')}", ""]
    extra = f" + {n_alt} AI-byggere" if n_alt else ""
    lines.append(f"- Konkurrenter: {n_dk} DK{extra}. Jev-kald denne kørsel: {jev_calls}.")
    for p in patterns:
        lines.append(f"- **Mønster:** {p['title']} — {p['detail']}")
    for g in gaps:
        lines.append(f"- **Hul ({g['kind']}):** {g['title']} — {g['detail']}")
    if errors:
        lines.append(f"- Fejl ({len(errors)}): " + "; ".join(errors[:8]))
    lines.append("")
    return "\n".join(lines)


# ---------------------------------------------------------------- main

def run(liste_path: Path, dry_run: bool, no_places: bool, max_jev: int) -> int:
    data = jev_lib.load_json(liste_path, {"competitors": []})
    competitors_in = [c for c in data.get("competitors", []) if c.get("country", "DK") == "DK"][:40]
    if not competitors_in:
        print(f"FEJL: ingen DK-konkurrenter i {liste_path}")
        return 1

    # Frisk Jev-dom over konkurrenternes blogopslag først (cachen genbruges; ingen HQ-kort herfra —
    # dette script laver selv idékortene bagefter). Blog-scannet har intet eget cron-job.
    try:
        blogscan.run(blogscan.DEFAULT_SOURCES, dry_run, blogscan.DEFAULT_TOTAL_LIMIT, 40, True)
    except Exception as exc:  # noqa: BLE001
        print(f"[blogscan] sprunget over: {exc}")

    blog_sources = jev_lib.load_json(blogscan.DEFAULT_SOURCES, {"sources": []}).get("sources", [])
    sources_by_id = {s["id"]: s for s in blog_sources}

    state = load_state()
    geo_mentions = {}
    try:
        geo_mentions = parse_geo_mentions(GEO_LOG.read_text(encoding="utf-8"))
    except OSError:
        pass

    errors: list[str] = []
    jev_calls = 0
    out_competitors: list[dict] = []

    for comp in competitors_in:
        entry: dict = {"name": comp["name"], "url": comp["url"], "country": "DK", "kind": comp.get("kind", "bureau")}
        if comp.get("city"):
            entry["city"] = comp["city"]

        google = places_lookup(comp, state, no_places)
        if google:
            entry["google"] = google

        raw_html = fetch_site(comp["url"])
        if raw_html:
            site = extract_site_signals(comp["url"], raw_html)
            site["pagespeedMobile"] = pagespeed_mobile(comp["url"], state)
            entry["site"] = site
        else:
            errors.append(f"{comp['id']}: site uhentelig")

        services = entry.get("site", {}).get("services")
        if services:
            entry["services"] = services

        blog = blog_signal_for(comp.get("blog_source_id"), sources_by_id)
        if blog:
            entry["blog"] = blog

        social = facebook_lookup(comp)
        if social:
            entry["social"] = social

        geo = geo_for_domain(geo_mentions, comp["url"])
        if geo:
            entry["geo"] = geo

        jev_extra_service = None
        if jev_calls < max_jev and entry.get("site"):
            excerpt = blogscan._strip_tags(raw_html)[:2000]
            raw = jev_lib.ask({"site": {"name": comp["name"], "excerpt": excerpt}}, _questions_for_competitor(comp["name"]))
            jev_calls += 1
            jr = classify_competitor_jev(raw)
            if jr["ok"]:
                entry["positioning"] = POSITION_LABEL[jr["positioning"]][:200]
                if jr["strengths"]:
                    entry["strengths"] = jr["strengths"]
                if jr["weaknesses"]:
                    entry["weaknesses"] = jr["weaknesses"]
                entry["messaging"] = {"angles": jr["messaging_angles"]}
                seo_extra = {}
                if jr["seo_faq_synlig"] is not None:
                    seo_extra["faqVisible"] = jr["seo_faq_synlig"]
                if jr["seo_anmeldelser_tekst"] is not None:
                    seo_extra["reviewsAsText"] = jr["seo_anmeldelser_tekst"]
                if seo_extra:
                    entry["seoExtra"] = seo_extra
                if jr["geo_citerbare_svar"] is not None:
                    entry["geoExtra"] = {"citableAnswers": jr["geo_citerbare_svar"]}
                if jr["ydelse_ikke_kinly"]:
                    jev_extra_service = detect_extra_service(excerpt.lower())

        if entry.get("site"):
            extra_services = [s for s in entry["site"].get("services") or [] if s not in KINLY_SERVICES]
            if jev_extra_service and jev_extra_service not in extra_services:
                extra_services.append(jev_extra_service)
            entry["uniqueServices"] = extra_services[:6]

        out_competitors.append(entry)

    # ryd tomme site-dicts og None-felter for pænt output
    for e in out_competitors:
        if "site" in e:
            e["site"] = {k: v for k, v in e["site"].items() if v is not None}
            if not e["site"]:
                del e["site"]

    # letvægtsspor: AI-bygger-alternativer (Wix/one.com/Framer/Lovable/Squarespace) — kun fetch+regex,
    # ingen Places/Jev/GEO/blog, tæller ikke mod jev_calls eller Places-budgettet.
    alt_in = [c for c in data.get("competitors", []) if c.get("kind") == "ai-bygger"]
    out_competitors.extend(run_ai_builders(alt_in))

    prune_state(state)
    jev_lib.atomic_write_json(SITE_STATE_PATH, state)

    rows = all_blog_rows(competitors_in)
    existing_titles = []
    try:
        existing_titles = blogscan.existing_hq_titles()
    except Exception:
        pass
    content_ideas = blogscan.pick_top_ideas(rows, existing_titles, limit=3) if rows else []

    patterns, gaps = build_patterns_and_gaps(out_competitors, content_ideas)
    findings = build_findings(out_competitors, content_ideas)[:20 - inspiration.MAX_OUT]

    # X/LinkedIn/HN: script + Jev (kaster aldrig). Fejl vælter ikke scannet.
    insp = inspiration.collect(dry_run)
    errors.extend(insp["errors"])
    jev_calls += insp.get("judged", 0)

    for e in out_competitors:  # site.services bruges internt (mønstre); HQ kender kun top-level "services"
        if isinstance(e.get("site"), dict):
            e["site"].pop("services", None)

    now = datetime.now(timezone.utc)
    report = {
        "generatedAt": now.isoformat(),
        "jevCalls": jev_calls,
        "competitors": out_competitors,
        "patterns": patterns,
        "gaps": gaps,
        "findings": findings,
    }
    if insp.get("credits"):
        report["credits"] = insp["credits"]

    # ÉT DeepSeek-kald før gemning: læser Jevs tal + omskriver inspiration til danske idéer.
    analysis, rewrites = None, {}
    if not dry_run:
        try:
            import konkurrent_analyse
            analysis, rewrites = konkurrent_analyse.analyse(report, insp["candidates"])
        except Exception as exc:  # noqa: BLE001
            print(f"[analyse] sprunget over: {exc}")
    report["findings"] = findings + inspiration_findings(insp["candidates"], rewrites)

    section = render_section(now, out_competitors, patterns, gaps, jev_calls, errors)

    if dry_run:
        scratch = Path(os.environ.get("TEMP") or os.environ.get("TMPDIR") or "/tmp") / "konkurrent-scan-dryrun.json"
        scratch.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"[DRY-RUN] ingen POST, intet vault-skriv, ingen kort. Rapport gemt lokalt: {scratch}")
    else:
        VAULT_NOTE.parent.mkdir(parents=True, exist_ok=True)
        header = "---\ntitle: Konkurrent-overblik (JEV)\ntags: [marketing, konkurrenter, seo, geo, jev]\nstatus: aktiv\nauthor: hermes\n---\n\n"
        if not VAULT_NOTE.exists():
            VAULT_NOTE.write_text(header, encoding="utf-8")
        with VAULT_NOTE.open("a", encoding="utf-8") as fh:
            fh.write(section)
        print(f"Skrevet til {VAULT_NOTE}")
        # Sidste rapport gemmes lokalt, så en HQ-afvisning kan eftervises (valideres mod src/lib/hq/competitors.ts).
        jev_lib.atomic_write_json(Path("/root/.hermes/state/konkurrent-last-report.json"), report)
        resp = crm_posts.call({"action": "save", "report": report}, POST_PATH)
        print(json.dumps(resp, ensure_ascii=False)[:500])
        if resp.get("ok") and analysis:
            try:
                ares = crm_posts.call({"action": "analysis", "analysis": analysis}, POST_PATH)
                print("[analyse]", json.dumps(ares, ensure_ascii=False)[:200])
            except Exception as exc:  # noqa: BLE001
                print(f"[analyse] ikke gemt: {exc}")
        if content_ideas:
            created = blogscan.create_hq_cards(content_ideas)
            print(f"Oprettet {len(created)} HQ-kort: {', '.join(created) or '(ingen)'}")

    print(section)
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-places", action="store_true", help="spring Google Places-opslag over")
    ap.add_argument("--max-jev", type=int, default=20, help="maks nye Jev-kald pr. kørsel")
    ap.add_argument("--liste", type=Path, default=DEFAULT_LISTE)
    args = ap.parse_args()
    return run(args.liste, args.dry_run, args.no_places, args.max_jev)


if __name__ == "__main__":
    raise SystemExit(main())
