#!/usr/bin/env python3
"""Danske kundespørgsmål via Google-autofuldførelse. Gratis, ingen nøgle.

  kundespoergsmaal.py <søgeord> [--max 15]

Henter forslag for søgeordet selv + spørgeord-varianter ("hvad", "hvordan",
"hvorfor", "hvor meget", "kan man", "skal man" + søgeord) — højst 8 kald,
0,3s pause mellem hver. Dedupérer (case-insensitivt) og filtrerer forslag
med ikke-latinske tegn fra (ponytail: grov sprogfilter, ikke en rigtig
sprog-detektor — hl=da/gl=dk gør resten af arbejdet).

Output (også som Python-modul via get_questions()):
  {"keyword": ..., "questions": [...], "fetched_at": "<ISO-8601>"}

Brugt af blog-drafter-nat.prompt.txt (FAQ/H2-research) og blog_seo_geo_tjek.py
(kundespørgsmål-dækning).
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = "Mozilla/5.0 (X11; Linux x86_64) KinlyKundeSpoergsmaal/0.1"
SUGGEST_URL = "https://suggestqueries.google.com/complete/search"
QUESTION_PREFIXES = ("hvad", "hvordan", "hvorfor", "hvor meget", "kan man", "skal man")
PAUSE_SECONDS = 0.3

# ponytail: dropper forslag med tegn uden for latinsk skrift (kyrillisk, CJK,
# arabisk) — nok til at holde da/dk-autofuldførelsens sjældne udenlandske
# støj ude, uden en rigtig sprogdetektor.
_NON_LATIN_RE = re.compile(r"[Ѐ-ӿ؀-ۿ぀-ヿ一-鿿]")


def _looks_danish(text: str) -> bool:
    return bool(text) and not _NON_LATIN_RE.search(text)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _fetch_raw(query: str, timeout: int = 10) -> str:
    params = urllib.parse.urlencode({"client": "firefox", "hl": "da", "gl": "dk", "q": query})
    req = urllib.request.Request(f"{SUGGEST_URL}?{params}", headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return res.read().decode("utf-8", "ignore")


def _suggestions_for(query: str, timeout: int = 10) -> list[str]:
    try:
        data = json.loads(_fetch_raw(query, timeout))
        if isinstance(data, list) and len(data) >= 2 and isinstance(data[1], list):
            return [str(s).strip() for s in data[1] if str(s).strip()]
    except Exception:
        pass
    return []


def get_questions(keyword: str, max_n: int = 15, pause: float = PAUSE_SECONDS) -> dict:
    keyword = (keyword or "").strip()
    if not keyword:
        return {"keyword": "", "questions": [], "fetched_at": _now_iso()}
    queries = [keyword] + [f"{prefix} {keyword}" for prefix in QUESTION_PREFIXES]
    seen: dict[str, str] = {}
    for i, q in enumerate(queries):
        if i:
            time.sleep(pause)
        for s in _suggestions_for(q):
            if not _looks_danish(s):
                continue
            seen.setdefault(s.casefold(), s)
    return {"keyword": keyword, "questions": list(seen.values())[:max_n], "fetched_at": _now_iso()}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("keyword")
    ap.add_argument("--max", type=int, default=15, dest="max_n")
    args = ap.parse_args()
    print(json.dumps(get_questions(args.keyword, args.max_n), ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
