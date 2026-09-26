#!/usr/bin/env python3
"""fb_og.py — Facebook page size for the day's leadgen candidates (26/9).

Runs between `rate` and `finalize` in vps-run.sh. For rated leads whose
website IS a Facebook page, or whose own site links one (c.fbLink), read only
the link-preview metadata (og:description: "8.799 følgere · 143 taler om dette
· 408 har været her") and store c.fb = {followers, talking, checkins}.
finalize drops leads with followers > 10.000 (too big for Kinly) (src/lib/leads/social-fit.ts).

Why curl_cffi: Facebook sends plain curl / Node fetch to /login; a Chrome TLS
fingerprint gets the public page — from a home IP 39/39, from the VPS only the
first ~3 before the datacenter IP is walled for hours (measured 26/9). Hence the
r.jina.ai fallback, the breaker and the small cap: expect PARTIAL coverage.
No login, no cookies, no personal data — only the counts Facebook shows when a
page is shared. Never fails the leadgen run: no data = neutral score.
"""
import html
import json
import os
import re
import sys
import time

WORKDIR = os.environ.get("LEADGEN_WORKDIR") or os.path.join(os.path.dirname(__file__), "..", "..", ".leadgen-work")
RATED = os.path.join(WORKDIR, "lg_v2_rated.json")
MAX_PAGES = 20      # per day — low volume on purpose
MIN_FIT = 65        # only leads that can be picked — the size check only matters there
PAUSE_S = 8.0
MAX_MISSES = 3      # breaker: 3 walls in a row = the IP is flagged, stop instead of burning it further
BUDGET_S = 480      # never delay the vault push before ingest-leadgen at 06:30 UTC


def fetch_desc(creq, url: str) -> str:
    """og:description via direct Chrome-TLS fetch, then r.jina.ai (already our
    fallback reader in src/lib/research.ts). The VPS's datacenter IP gets a
    login wall after ~3 pages (measured 26/9), so the fallback matters."""
    try:
        r = creq.get(url, impersonate="chrome", timeout=15, allow_redirects=True)
        if r.status_code == 200 and "/login" not in r.url:
            desc = og_description(r.text)
            if desc:
                return desc
    except Exception as e:  # network/TLS — neutral, never fatal
        print(f"[fb_og] direkte {type(e).__name__}", file=sys.stderr)
    try:
        r = creq.get(f"https://r.jina.ai/{url}", headers={"X-Return-Format": "html"}, timeout=30)
        return og_description(r.text) if r.status_code == 200 else ""
    except Exception as e:
        print(f"[fb_og] jina {type(e).__name__}", file=sys.stderr)
        return ""

NUM = r"([\d][\d.,]*\s*(?:mio\.?|t\.|[KkMm])?)"
PATTERNS = {
    "followers": [NUM + r"\s*(?:følgere|followers)", NUM + r"\s*(?:synes godt om|likes)"],
    "talking": [NUM + r"\s*(?:taler om dette|talking about this)"],
    "checkins": [NUM + r"\s*(?:har været her|were here)"],
}


def parse_count(s: str) -> int:
    s = s.strip().lower()
    for suffix, mult in (("mio.", 1_000_000), ("mio", 1_000_000), ("t.", 1_000), ("k", 1_000), ("m", 1_000_000)):
        if s.endswith(suffix):
            return int(float(s[: -len(suffix)].strip().replace(",", ".")) * mult)
    return int(re.sub(r"[.,\s]", "", s))


def parse_og(desc: str) -> dict:
    out = {}
    for key, pats in PATTERNS.items():
        for p in pats:
            m = re.search(p, desc, re.I)
            if m:
                out[key] = parse_count(m.group(1))
                break
    return out


def og_description(raw: str) -> str:
    # attribute order and quote style vary — find the tag first, then its content
    for tag in re.findall(r"<meta[^>]*>", raw, re.I):
        if re.search(r"property\s*=\s*[\"']og:description[\"']", tag, re.I):
            m = re.search(r"content\s*=\s*\"([^\"]*)\"|content\s*=\s*'([^']*)'", tag, re.I)
            if m:
                return html.unescape(m.group(1) or m.group(2) or "")
    return ""


def main() -> None:
    try:
        from curl_cffi import requests as creq
    except ImportError:
        print("[fb_og] curl_cffi mangler — springer over (neutral score)", file=sys.stderr)
        return
    with open(RATED, encoding="utf-8") as f:
        data = json.load(f)
    rated = data.get("rated", [])
    todo = [c for c in rated if "fb" not in c and c.get("fbLink") and c.get("fitScore", 0) >= MIN_FIT]
    # The size check exists to catch the big ones — they are the ones with many Google reviews.
    todo.sort(key=lambda c: -(c.get("reviews") or 0))
    todo = todo[:MAX_PAGES]
    got = misses = 0
    t0 = time.time()
    for i, c in enumerate(todo):
        if misses >= MAX_MISSES or time.time() - t0 > BUDGET_S:
            print(f"[fb_og] stopper efter {i} sider (login-mur i træk: {misses}) — resten neutral", file=sys.stderr)
            break
        if i:
            time.sleep(PAUSE_S)
        desc = fetch_desc(creq, c["fbLink"])
        fb = parse_og(desc)
        if fb.get("followers") is None:
            misses += 1
            continue  # no c["fb"]: tomorrow's run may try again; score stays neutral
        misses = 0
        c["fb"] = {"url": c["fbLink"], "followers": fb.get("followers"), "talking": fb.get("talking"), "checkins": fb.get("checkins")}
        got += 1
    tmp = RATED + ".tmp"  # atomic: a killed run must never leave a truncated rated file for finalize
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp, RATED)
    print(json.dumps({"fb_candidates": len(todo), "fb_with_followers": got}))


def selftest() -> None:
    assert parse_og("Æ Kalgo, Daler. 8.799 følgere · 143 taler om dette · 408 har været her") == {"followers": 8799, "talking": 143, "checkins": 408}
    assert parse_og("ZIN Frisør. 173 følgere · 2 taler om dette") == {"followers": 173, "talking": 2}
    assert parse_og("Café X. 12,345 likes · 7 talking about this · 1,002 were here") == {"followers": 12345, "talking": 7, "checkins": 1002}
    assert parse_og("1.2K Followers, 300 Following, 88 Posts") == {"followers": 1200}
    assert parse_og("Tjek telefonnummer, hjemmeside og åbningstider") == {}
    assert parse_og("Restaurant Y. 12 t. følgere · 40 taler om dette") == {"followers": 12000, "talking": 40}
    assert parse_og("Kæde Z. 1,2 mio. følgere") == {"followers": 1200000}
    assert og_description("<meta content=\"8.799 følgere\" property=\"og:description\" />") == "8.799 følgere"
    assert og_description("<meta property='og:description' content='173 følgere'>") == "173 følgere"
    class R:  # fake curl_cffi response
        def __init__(self, url, text, status=200):
            self.url, self.text, self.status_code = url, text, status
    og = '<meta property="og:description" content="1.710 følgere · 92 har været her">'
    wall = type("C", (), {"get": staticmethod(lambda u, **k: R("https://www.facebook.com/login/?next=x", "login") if "jina" not in u else R(u, og))})
    assert fetch_desc(wall, "https://www.facebook.com/x") == "1.710 følgere · 92 har været her", "login-mur -> jina-fallback"
    dead = type("C", (), {"get": staticmethod(lambda u, **k: R("https://www.facebook.com/login/", "login"))})
    assert fetch_desc(dead, "https://www.facebook.com/x") == "", "begge veje døde -> tom (neutral)"
    print("fb_og selftest ok")


if __name__ == "__main__":
    selftest() if sys.argv[1:] == ["--selftest"] else main()
