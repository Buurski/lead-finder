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
import json
import os
import re
import statistics
import sys
import time
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
    return q


def classify_competitor_jev(raw: dict | None) -> dict:
    try:
        answers = (raw or {}).get("answers", {})
        pos = answers["positionering"]
        if pos.get("type") != "choice" or pos.get("choice") not in POSITION_LABEL:
            raise ValueError("ugyldig positionering")
        strengths = [l for l in STRENGTH_LABELS if answers.get(f"styrke_{l}", {}).get("choice") == "ja"][:5]
        weaknesses = [l for l in WEAKNESS_LABELS if answers.get(f"svaghed_{l}", {}).get("choice") == "ja"][:5]
        return {"ok": True, "positioning": pos["choice"], "strengths": strengths, "weaknesses": weaknesses}
    except (KeyError, TypeError, ValueError, AttributeError):
        return {"ok": False, "positioning": None, "strengths": [], "weaknesses": []}


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
        return cached or None
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
    return result


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


# ---------------------------------------------------------------- rendering

def render_section(now: datetime, competitors: list[dict], patterns: list[dict], gaps: list[dict], jev_calls: int, errors: list[str]) -> str:
    lines = [f"## Scan {now.strftime('%Y-%m-%d')}", ""]
    lines.append(f"- Konkurrenter: {len(competitors)} DK. Jev-kald denne kørsel: {jev_calls}.")
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
        entry: dict = {"name": comp["name"], "url": comp["url"], "country": "DK"}
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

        out_competitors.append(entry)

    # ryd tomme site-dicts og None-felter for pænt output
    for e in out_competitors:
        if "site" in e:
            e["site"] = {k: v for k, v in e["site"].items() if v is not None}
            if not e["site"]:
                del e["site"]

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

    now = datetime.now(timezone.utc)
    report = {
        "generatedAt": now.isoformat(),
        "jevCalls": jev_calls,
        "competitors": out_competitors,
        "patterns": patterns,
        "gaps": gaps,
    }

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
        resp = crm_posts.call({"action": "save", "report": report}, POST_PATH)
        print(json.dumps(resp, ensure_ascii=False)[:500])
        if resp.get("ok"):
            # LLM læser kun Jevs komprimerede tal (ét billigt kald). Fejl her vælter aldrig scannet.
            try:
                import konkurrent_analyse
                ares = crm_posts.call({"action": "analysis", "analysis": konkurrent_analyse.analyse(report)}, POST_PATH)
                print("[analyse]", json.dumps(ares, ensure_ascii=False)[:200])
            except Exception as exc:  # noqa: BLE001
                print(f"[analyse] sprunget over: {exc}")
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
