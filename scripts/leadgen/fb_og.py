#!/usr/bin/env python3
"""fb_og.py — Facebook page size for the day's leadgen candidates (26/9).

Runs between `rate` and `finalize` in vps-run.sh. For rated leads whose
website IS a Facebook page, or whose own site links one (c.fbLink), read only
the link-preview metadata (og:description: "8.799 følgere · 143 taler om dette
· 408 har været her") and store c.fb = {followers, talking, checkins}.
finalize drops leads with followers > 10.000 (too big for Kinly) (src/lib/leads/social-fit.ts).

Why curl_cffi: Facebook sends plain curl / Node fetch to /login; a Chrome TLS
fingerprint gets the public page (verified from the VPS 26/9). No login, no
cookies, no personal data — only the counts Facebook shows when a page is shared.
Never fails the leadgen run: any error leaves c.fb unset (= neutral score).
"""
import html
import json
import os
import re
import sys
import time

WORKDIR = os.environ.get("LEADGEN_WORKDIR") or os.path.join(os.path.dirname(__file__), "..", "..", ".leadgen-work")
RATED = os.path.join(WORKDIR, "lg_v2_rated.json")
MAX_PAGES = 60      # per day — low volume on purpose
MIN_FIT = 65        # only leads that can be picked — the size check only matters there
PAUSE_S = 2.0

NUM = r"([\d][\d.,]*\s*[KkMm]?)"
PATTERNS = {
    "followers": [NUM + r"\s*(?:følgere|followers)", NUM + r"\s*(?:synes godt om|likes)"],
    "talking": [NUM + r"\s*(?:taler om dette|talking about this)"],
    "checkins": [NUM + r"\s*(?:har været her|were here)"],
}


def parse_count(s: str) -> int:
    s = s.strip()
    mult = {"k": 1_000, "m": 1_000_000}.get(s[-1:].lower())
    if mult:
        return int(float(s[:-1].strip().replace(",", ".")) * mult)
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
    m = re.search(r'<meta[^>]+property="og:description"[^>]+content="([^"]*)"', raw)
    return html.unescape(m.group(1)) if m else ""


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
    todo.sort(key=lambda c: -c.get("fitScore", 0))
    todo = todo[:MAX_PAGES]
    got = 0
    for i, c in enumerate(todo):
        if i:
            time.sleep(PAUSE_S)
        try:
            r = creq.get(c["fbLink"], impersonate="chrome", timeout=15, allow_redirects=True)
            desc = og_description(r.text) if r.status_code == 200 and "/login" not in r.url else ""
        except Exception as e:  # network/TLS — neutral, never fatal
            print(f"[fb_og] {type(e).__name__} {c['fbLink'][:60]}", file=sys.stderr)
            continue
        fb = parse_og(desc)
        c["fb"] = {"url": c["fbLink"], "followers": fb.get("followers"), "talking": fb.get("talking"), "checkins": fb.get("checkins")}
        got += fb.get("followers") is not None
    with open(RATED, "w", encoding="utf-8") as f:
        json.dump(data, f)
    print(json.dumps({"fb_candidates": len(todo), "fb_with_followers": got}))


def selftest() -> None:
    assert parse_og("Æ Kalgo, Daler. 8.799 følgere · 143 taler om dette · 408 har været her") == {"followers": 8799, "talking": 143, "checkins": 408}
    assert parse_og("ZIN Frisør. 173 følgere · 2 taler om dette") == {"followers": 173, "talking": 2}
    assert parse_og("Café X. 12,345 likes · 7 talking about this · 1,002 were here") == {"followers": 12345, "talking": 7, "checkins": 1002}
    assert parse_og("1.2K Followers, 300 Following, 88 Posts") == {"followers": 1200}
    assert parse_og("Tjek telefonnummer, hjemmeside og åbningstider") == {}
    print("fb_og selftest ok")


if __name__ == "__main__":
    selftest() if sys.argv[1:] == ["--selftest"] else main()
