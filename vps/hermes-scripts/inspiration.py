#!/usr/bin/env python3
"""Inspiration fra X, LinkedIn og Hacker News til konkurrent-scannet — script + Jev, 0 LLM her. Claude 27/9.

Lucas 27/9: "tjek branchen på X med folk der arbejder med AI/web og har gode idéer" + "LinkedIn og Hacker News med".

Kilder (verificeret 27/9):
- X: ScrapeCreators /v1/twitter/user-tweets — 1 credit pr. handle. Giver KUN profilens ~100 mest
  populære (ikke nyeste; X-begrænsning). Derfor: bevist gode opslag fra 2 år + set-liste, så intet
  vurderes/vises to gange.
- LinkedIn: ScrapeCreators /v1/linkedin/search/posts?date_posted=last-week — 1 credit pr. søgning.
  Virker også på dansk.
- Hacker News: Algolia search_by_date — gratis, nyeste 14 dage med >= MIN_HN_POINTS.
Nøgle: /root/.scrapecreators/key (VPS) / SCRAPECREATORS_API_KEY / ~/.config/last30days/.env (lokalt).
Mangler nøglen, springes X+LinkedIn over; HN kører stadig. Fejl vælter aldrig scannet.

Flow: kilder -> kandidater (kvote pr. kilde) -> Jev: relevant for Kinly? + type -> max 6 ud.
Den ENE DeepSeek-kørsel i konkurrent_analyse omskriver dem til danske idéer; ellers fallback_text.

  python3 inspiration.py --selftest
  python3 inspiration.py --live     # rigtige kald, skriver intet
"""
from __future__ import annotations

import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import jev_lib  # noqa: E402

CONFIG_PATH = HERE / "inspiration.json"
STATE_PATH = HERE / "inspiration_state.json"  # id'er Jev allerede har vurderet
KEY_PATH = Path("/root/.scrapecreators/key")
SC_API = "https://api.scrapecreators.com/v1"
HN_API = "https://hn.algolia.com/api/v1/search_by_date"
MAX_SEEN = 5000
X_MAX_AGE_DAYS = 730
X_MIN_LIKES = 50
X_PER_HANDLE = 4
MAX_HANDLES = 12
MAX_LI_QUERIES = 4
LI_MIN_LIKES = 10
HN_DAYS = 14
MIN_HN_POINTS = 20
QUOTA = {"x": 14, "linkedin": 10, "hn": 4}  # Jev-kald pr. kilde (i alt <= 28); HN er mest Show HN-støj
MAX_OUT = 6
CONF_THRESHOLD = 0.6

TYPES = {
    "blog": ("blog-idé", "blog"),
    "annonce": ("annonce/marketing", "annonce"),
    "proces": ("hvordan vi arbejder og sælger", "salg"),
    "vaerktoej": ("AI-værktøj vi kan bruge", "kinly-dk"),
    "irrelevant": ("ikke relevant", None),
}
SOURCE_LABEL = {"x": "X", "linkedin": "LinkedIn", "hn": "Hacker News"}


def load_key() -> str | None:
    key = os.environ.get("SCRAPECREATORS_API_KEY", "").strip()
    if key:
        return key
    if KEY_PATH.exists():
        return KEY_PATH.read_text(encoding="utf-8").strip() or None
    local = Path.home() / ".config" / "last30days" / ".env"
    if local.exists():
        for line in local.read_text(encoding="utf-8").splitlines():
            if line.startswith("SCRAPECREATORS_API_KEY="):
                return line.split("=", 1)[1].strip().strip('"') or None
    return None


def _get_json(url: str, headers: dict | None = None, timeout: int = 40) -> dict:
    req = Request(url, headers={"User-Agent": "kinly-hermes", **(headers or {})})
    with urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def credits_left(key: str) -> int | None:
    try:
        return int(_get_json(f"{SC_API}/credit-balance", {"x-api-key": key}, 20).get("creditCount"))
    except Exception:  # noqa: BLE001
        return None


def _iso(s) -> datetime | None:
    try:
        d = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- parsers (rene, testbare)

def parse_x(raw: dict, handle: str) -> list[dict]:
    """ScrapeCreators user-tweets. Tåler `legacy`-form og flade felter. Retweets og ugyldige id'er droppes."""
    out = []
    for t in (raw or {}).get("tweets") or []:
        if not isinstance(t, dict):
            continue
        leg = t.get("legacy") if isinstance(t.get("legacy"), dict) else t
        text = (leg.get("full_text") or leg.get("text") or "").strip()
        tid = str(t.get("rest_id") or leg.get("id_str") or "").strip()
        if not text or not tid.isdigit() or text.startswith("RT @"):
            continue
        try:
            created = parsedate_to_datetime(leg.get("created_at"))
        except (TypeError, ValueError):
            continue
        out.append({"source": "x", "id": f"x:{tid}", "author": "@" + handle, "text": text,
                    "likes": int(leg.get("favorite_count") or 0), "created": created,
                    "url": f"https://x.com/{handle}/status/{tid}"})
    return out


def parse_linkedin(raw: dict) -> list[dict]:
    out = []
    for p in (raw or {}).get("posts") or []:
        if not isinstance(p, dict):
            continue
        url = str(p.get("url") or "")
        text = (p.get("description") or "").strip()
        created = _iso(p.get("datePublished"))
        if not url.startswith("https://www.linkedin.com/") or not text or not created:
            continue
        author = (p.get("author") or {}).get("name") if isinstance(p.get("author"), dict) else None
        out.append({"source": "linkedin", "id": "li:" + url.split("?")[0].rstrip("/"), "author": author or "LinkedIn",
                    "text": text, "likes": int(p.get("likeCount") or 0), "created": created, "url": url.split("?")[0]})
    return out


def parse_hn(raw: dict) -> list[dict]:
    out = []
    for h in (raw or {}).get("hits") or []:
        oid = str(h.get("objectID") or "")
        title = (h.get("title") or "").strip()
        if not oid.isdigit() or not title:
            continue
        text = title + (" — " + h["story_text"][:600] if h.get("story_text") else "")
        out.append({"source": "hn", "id": f"hn:{oid}", "author": "Hacker News", "text": text,
                    "likes": int(h.get("points") or 0),
                    "created": datetime.fromtimestamp(int(h.get("created_at_i") or 0), timezone.utc),
                    "url": f"https://news.ycombinator.com/item?id={oid}"})
    return out


# ---------------------------------------------------------------- udvælgelse + Jev

def pick(items: list[dict], now: datetime, seen: set[str]) -> list[dict]:
    """Filtrér pr. kilde (alder, engagement, set), kvote pr. kilde efter engagement."""
    rules = {"x": (X_MAX_AGE_DAYS, X_MIN_LIKES), "linkedin": (14, LI_MIN_LIKES), "hn": (HN_DAYS, MIN_HN_POINTS)}
    by_src: dict[str, list[dict]] = {}
    per_author: dict[str, int] = {}
    for it in sorted(items, key=lambda x: x["likes"], reverse=True):
        days, min_likes = rules[it["source"]]
        if (it["id"] in seen or it["created"] < now - timedelta(days=days) or it["likes"] < min_likes
                or not on_topic(it["text"])):
            continue
        if it["source"] == "x":
            if per_author.get(it["author"], 0) >= X_PER_HANDLE:
                continue
            per_author[it["author"]] = per_author.get(it["author"], 0) + 1
        bucket = by_src.setdefault(it["source"], [])
        if len(bucket) < QUOTA[it["source"]] and all(b["id"] != it["id"] for b in bucket):
            bucket.append(it)
    return [it for src in ("x", "linkedin", "hn") for it in by_src.get(src, [])]


# Gratis forfilter før Jev: X giver profilens mest populære opslag (også solfarme og politik), HN giver
# tilfældige Show HN. Kun tekst med mindst ét emneord bliver vurderet. ponytail: ordliste, ikke semantik —
# udvid listen hvis gode opslag ryger fra.
TOPIC_WORDS = (
    "seo", "geo", "aeo", "ai search", "search engine", "google search", "chatgpt", "perplexity", "ai overviews?",
    "llms?", "rankings?", "serps?", "websites?", "landing pages?", "homepages?", "web ?design", "hjemmesider?",
    "webbureau", "wordpress", "webflow", "framer", "wix", "cms", "conversions?", "konvertering", "pricing",
    "pris(?:er)?", "clients?", "agency", "agencies", "bureau", "freelanc\\w*", "local seo", "local business(?:es)?",
    "lokal\\w*", "google reviews?", "anmeldelser?", "google business", "google maps", "google ads", "meta ads",
    "facebook ads", "annoncer?", "marketing", "headlines?", "cold emails?", "outreach", "leads", "lead gen",
    "henvendelser?", "sales", "salg", "vibe cod\\w*", "small business(?:es)?",
)
TOPIC_RE = re.compile(r"\b(?:" + "|".join(TOPIC_WORDS) + r")\b", re.I)


def on_topic(text: str) -> bool:
    """Hele ord (ikke 'cro' i 'across', 'lead' i 'leader')."""
    return bool(TOPIC_RE.search(text))

def questions() -> dict:
    return {
        "relevant": {
            "type": "choice",
            "instructions": ("Handler opslaget konkret om ét af disse emner: hjemmesider, SEO, AI-søgning/GEO, lokal "
                             "markedsføring, annoncer, salg eller prissætning for små bureauer/freelancere, eller "
                             "AI-værktøjer til at bygge hjemmesider? Personligt, politik, hardware, generel tech-nyhed = nej."),
            "criteria": {"ja": "Ja, et af emnerne med en konkret pointe", "nej": "Nej"},
        },
        "type": {
            "type": "choice",
            "instructions": "Hvad kan Kinly bedst bruge opslaget til?",
            "criteria": {
                "blog": "Emne eller vinkel til et blogindlæg",
                "annonce": "Marketing: annonce, budskab, hook eller kanal",
                "proces": "Hvordan man arbejder, sælger eller prissætter som lille bureau",
                "vaerktoej": "Et AI-værktøj eller workflow til at bygge sites hurtigere",
                "irrelevant": "Intet af ovenstående",
            },
        },
    }


def _choice(raw: dict | None, qid: str) -> tuple[str | None, float]:
    ans = ((raw or {}).get("answers") or {}).get(qid) or {}
    if ans.get("type") != "choice":
        return None, 0.0
    try:
        return ans.get("choice"), float(ans.get("confidence") or 0.0)
    except (TypeError, ValueError):
        return None, 0.0


def classify(raw: dict | None) -> dict | None:
    rel, rconf = _choice(raw, "relevant")
    typ, tconf = _choice(raw, "type")
    if rel != "ja" or rconf < CONF_THRESHOLD or typ not in TYPES or typ == "irrelevant" or tconf < CONF_THRESHOLD:
        return None
    return {"type": typ, "conf": min(rconf, tconf)}


def rating(conf: float) -> int:
    return max(1, min(5, round(1 + 4 * (conf - CONF_THRESHOLD) / (1 - CONF_THRESHOLD))))


# ---------------------------------------------------------------- hentning

def fetch_all(cfg: dict, key: str | None, now: datetime, errors: list[str]) -> tuple[list[dict], int]:
    items: list[dict] = []
    used = 0
    if key:
        for h in [h for h in cfg.get("x_handles", []) if h.get("handle")][:MAX_HANDLES]:
            handle = h["handle"].lstrip("@")
            try:
                items += parse_x(_get_json(f"{SC_API}/twitter/user-tweets?handle={quote(handle)}", {"x-api-key": key}), handle)
                used += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f"x @{handle}: {type(exc).__name__}")
        for q in cfg.get("linkedin_queries", [])[:MAX_LI_QUERIES]:
            try:
                qs = urlencode({"query": q, "date_posted": "last-week"})
                items += parse_linkedin(_get_json(f"{SC_API}/linkedin/search/posts?{qs}", {"x-api-key": key}, 60))
                used += 1
            except Exception as exc:  # noqa: BLE001
                errors.append(f"linkedin '{q}': {type(exc).__name__}")
    else:
        errors.append("inspiration: ingen ScrapeCreators-nøgle — X og LinkedIn sprunget over")
    since = int((now - timedelta(days=HN_DAYS)).timestamp())
    for q in cfg.get("hn_queries", []):
        try:
            qs = urlencode({"query": q, "tags": "story", "numericFilters": f"created_at_i>{since},points>={MIN_HN_POINTS}", "hitsPerPage": 10})
            items += parse_hn(_get_json(f"{HN_API}?{qs}", timeout=20))
            time.sleep(0.3)
        except Exception as exc:  # noqa: BLE001
            errors.append(f"hn '{q}': {type(exc).__name__}")
    return items, used


def collect(dry_run: bool = False, ask=None, fetch=None, now: datetime | None = None, state_path: Path | None = None) -> dict:
    """-> {"candidates": [...], "credits": {"used","left"} | None, "errors": [...]}. Kaster aldrig."""
    ask = ask or jev_lib.ask
    now = now or datetime.now(timezone.utc)
    state_path = state_path or STATE_PATH
    errors: list[str] = []
    try:
        cfg = jev_lib.load_json(CONFIG_PATH, {})
        if fetch:  # test: ingen rigtige kald
            items, used, key = fetch(cfg), 0, None
        else:
            key = load_key()
            items, used = fetch_all(cfg, key, now, errors)
        seen_list = [str(s) for s in jev_lib.load_json(state_path, {"seen": []}).get("seen", [])]
        seen = set(seen_list)
        out = []
        for it in pick(items, now, seen):
            res = classify(ask({"opslag": {"kilde": SOURCE_LABEL[it["source"]], "forfatter": it["author"],
                                           "tekst": it["text"][:1200]}}, questions()))
            seen_list.append(it["id"])  # vurderet (uanset udfald) -> aldrig betalt igen
            if res:
                label, suggest = TYPES[res["type"]]
                out.append({**{k: v for k, v in it.items() if k != "created"}, "type": res["type"],
                            "typeLabel": label, "suggest": suggest, "rating": rating(res["conf"])})
        out.sort(key=lambda x: (x["rating"], x["likes"]), reverse=True)
        if not dry_run:
            jev_lib.atomic_write_json(state_path, {"seen": seen_list[-MAX_SEEN:]})
        left = credits_left(key) if key else None
        return {"candidates": out[:MAX_OUT], "credits": {"used": used, "left": left} if left is not None else None,
                "errors": errors, "judged": len(seen_list) - len(seen)}
    except Exception as exc:  # noqa: BLE001
        return {"candidates": [], "credits": None, "errors": errors + [f"inspiration: {type(exc).__name__}: {exc}"]}


def evidence(c: dict) -> str:
    return c["author"] if c["source"] == "x" else f"{SOURCE_LABEL[c['source']]}: {c['author']}"[:40]


def fallback_text(c: dict) -> tuple[str, str]:
    """Deterministisk titel/detalje hvis DeepSeek-trinnet fejler. Kort uddrag, ikke hele opslaget."""
    title = f"{SOURCE_LABEL[c['source']]} · {c['typeLabel']} ({c['likes']} {'point' if c['source'] == 'hn' else 'likes'})"
    snippet = " ".join(c["text"].split())[:160]
    return title[:80], f"Uddrag: \"{snippet}…\" — vurdér om idéen kan bruges hos Kinly."[:240]


# ---------------------------------------------------------------- selftest

def _selftest() -> None:
    import tempfile
    now = datetime(2026, 9, 27, tzinfo=timezone.utc)
    x_raw = {"tweets": [
        {"rest_id": "1", "legacy": {"full_text": "how I price client sites", "favorite_count": 900, "created_at": "Fri Sep 25 10:00:00 +0000 2026"}},
        {"rest_id": "2", "legacy": {"full_text": "old viral", "favorite_count": 200000, "created_at": "Mon Aug 19 19:50:50 +0000 2023"}},
        {"rest_id": "3", "legacy": {"full_text": "few likes", "favorite_count": 3, "created_at": "Fri Sep 25 10:00:00 +0000 2026"}},
        {"rest_id": "4", "legacy": {"full_text": "RT @x: retweet", "favorite_count": 999, "created_at": "Fri Sep 25 10:00:00 +0000 2026"}},
        {"id_str": "5", "full_text": "flat form: our pricing page", "favorite_count": 60, "created_at": "Sat Sep 26 10:00:00 +0000 2025"},
        {"rest_id": "abc", "legacy": {"full_text": "bad id", "favorite_count": 999, "created_at": "Fri Sep 25 10:00:00 +0000 2026"}},
    ]}
    xs = parse_x(x_raw, "levelsio")
    assert [t["id"] for t in xs] == ["x:1", "x:2", "x:3", "x:5"]
    assert xs[0]["url"] == "https://x.com/levelsio/status/1" and xs[0]["author"] == "@levelsio"

    li_raw = {"posts": [
        {"url": "https://www.linkedin.com/posts/anne_hjemmeside-123?utm=x", "description": "Sådan fik vi 3x flere henvendelser",
         "datePublished": "2026-09-24T08:00:00.000Z", "likeCount": 40, "author": {"name": "Anne Jensen"}},
        {"url": "https://evil.example/x", "description": "nope", "datePublished": "2026-09-24T08:00:00Z", "likeCount": 99},
        {"url": "https://www.linkedin.com/posts/b", "description": "få likes", "datePublished": "2026-09-24T08:00:00Z", "likeCount": 2},
    ]}
    li = parse_linkedin(li_raw)
    assert [p["id"] for p in li] == ["li:https://www.linkedin.com/posts/anne_hjemmeside-123", "li:https://www.linkedin.com/posts/b"]
    assert li[0]["url"] == "https://www.linkedin.com/posts/anne_hjemmeside-123" and li[0]["author"] == "Anne Jensen"

    hn_raw = {"hits": [{"objectID": "777", "title": "Show HN: local SEO tool", "points": 120, "created_at_i": int(now.timestamp()) - 86400},
                       {"objectID": "x", "title": "bad"}, {"objectID": "8", "title": "gammel", "points": 500, "created_at_i": 1}]}
    hn = parse_hn(hn_raw)
    assert [h["id"] for h in hn] == ["hn:777", "hn:8"] and hn[0]["url"] == "https://news.ycombinator.com/item?id=777"

    picked = pick(xs + li + hn, now, set())
    assert [p["id"] for p in picked] == ["x:1", "x:5", "li:https://www.linkedin.com/posts/anne_hjemmeside-123", "hn:777"], picked
    assert [p["id"] for p in pick(xs, now, {"x:1"})] == ["x:5"]

    def j(rel, rc, typ, tc):
        return {"answers": {"relevant": {"type": "choice", "choice": rel, "confidence": rc},
                            "type": {"type": "choice", "choice": typ, "confidence": tc}}}
    assert classify(j("ja", 0.9, "blog", 0.8)) == {"type": "blog", "conf": 0.8}
    assert classify(j("ja", 0.5, "blog", 0.9)) is None and classify(j("nej", 0.95, "blog", 0.9)) is None
    assert classify(j("ja", 0.9, "irrelevant", 0.9)) is None and classify(None) is None
    assert rating(0.6) == 1 and rating(1.0) == 5 and rating(0.8) == 3

    def fake_ask(state, q):
        t = state["opslag"]["tekst"]
        if "price" in t:
            return j("ja", 1.0, "annonce", 1.0)
        if "henvendelser" in t:
            return j("ja", 0.8, "blog", 0.9)
        return j("nej", 0.9, "blog", 0.9)

    st = Path(tempfile.mkdtemp()) / "state.json"
    fetch = lambda cfg: parse_x(x_raw, "levelsio") + parse_linkedin(li_raw) + parse_hn(hn_raw)  # noqa: E731
    res = collect(ask=fake_ask, fetch=fetch, now=now, state_path=st)
    assert [c["source"] for c in res["candidates"]] == ["x", "linkedin"], res
    assert res["candidates"][0]["suggest"] == "annonce" and res["candidates"][0]["rating"] == 5
    assert "created" not in res["candidates"][0] and res["judged"] == 4
    assert evidence(res["candidates"][1]) == "LinkedIn: Anne Jensen"
    again = collect(ask=lambda s, q: (_ for _ in ()).throw(AssertionError("Jev kaldt igen")), fetch=fetch, now=now, state_path=st)
    assert again["candidates"] == [] and again["errors"] == []  # næste uge: intet betales to gange
    broken = collect(ask=fake_ask, fetch=lambda cfg: 1 / 0, now=now, state_path=st)
    assert broken["candidates"] == [] and "ZeroDivisionError" in broken["errors"][0]  # kaster aldrig
    for c in res["candidates"]:
        t, d = fallback_text(c)
        assert len(t) <= 80 and len(d) <= 240
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    elif "--live" in sys.argv:
        r = collect(dry_run=True)
        print(json.dumps({**r, "candidates": [{k: c[k] for k in ("source", "author", "likes", "typeLabel", "rating", "url")}
                                              for c in r["candidates"]]}, ensure_ascii=False, indent=1))
