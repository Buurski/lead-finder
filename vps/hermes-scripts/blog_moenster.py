#!/usr/bin/env python3
"""Månedlig mønster-analyse af Kinlys udgivne blogindlæg. no_agent-job, 1. mandag i måneden. Skrevet af Claude 27/9.

"Hvad virker på bloggen": hvilke træk har de indlæg der får trafik, som de andre mangler?

1. Udgivne indlæg via crm_posts.py (signeret list/get) + deres Google-trafik fra HQ
   (signeret læse-handling "blogtraffic" på /api/agent/seo-signals — mandags-cronen henter den).
2. Gate: færre end 3 indlæg med ≥14 dages data ⇒ "for-tidligt" postes. 0 Jev, 0 LLM.
3. Træk pr. indlæg: tælbare ting deterministisk (FAQ, ordtal, titelmønster, kategori) +
   ÉT Jev-kald pr. indlæg (rigtige tal, graf/tabel, svarer på kundespørgsmål, leder til Kinly).
4. ÉT DeepSeek-kald (samme vej som konkurrent_analyse.py, NO_THINKING) på KUN de komprimerede
   tal + trafik ⇒ 2-4 "hvad virker"-punkter + max 3 forslag ("indlæg X: tilføj Y fra indlæg Z").
5. POST til HQ (action "blogreview") ⇒ SEO-fanen, sektion "Hvad virker på bloggen".

  blog_moenster.py --selftest   # offline, ingen net
  blog_moenster.py --dry-run    # læser HQ, viser gate + hvad der ville blive bedømt; 0 Jev/LLM, poster intet
  blog_moenster.py              # rigtig kørsel (cron)
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import crm_posts  # noqa: E402
import jev_lib  # noqa: E402
import konkurrent_analyse as ka  # noqa: E402  (DeepSeek: MODEL, URL, NO_THINKING, load_key — samme verificerede vej)

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

HQ_PATH = "/api/agent/seo-signals"
MIN_POSTS = 3
MIN_DAYS = 14
MAX_POSTS = 20  # ponytail: Jev-loft pr. kørsel; ved flere udgivne tages de 20 nyeste med ≥14 dage
MAX_INPUT_CHARS = 8000

CITIES = ("herning", "ikast", "aarhus", "silkeborg", "viborg", "holstebro", "brande", "vejle", "horsens",
          "randers", "odense", "københavn", "aalborg", "esbjerg", "kolding", "jylland", "midtjylland")
QUESTION_WORDS = ("hvad", "hvordan", "hvorfor", "hvor", "hvornår", "hvem", "kan", "skal", "er", "bør")

JEV_QUESTIONS = {
    "rigtige_tal": {"type": "noul", "instructions": "Indeholder `tekst` konkrete, rigtige tal (priser, målinger, antal, datoer) frem for vage påstande?"},
    "graf": {"type": "noul", "instructions": "Har indlægget en graf, et diagram eller en tabel med tal? Se `billeder` (alt-tekster) og markdown-tabeller i `tekst`."},
    "kundesvar": {"type": "noul", "instructions": "Svarer `tekst` direkte på spørgsmål en lille dansk virksomhedsejer faktisk stiller (pris, tid, hvad får jeg, hvad skal jeg gøre)?"},
    "leder_til_kinly": {"type": "noul", "instructions": "Leder `tekst` naturligt læseren videre til Kinly (konkret tilbud, case, link til gratis SEO-tjek) uden at være en reklame?"},
}

PROMPT = """Du analyserer Kinlys blog (lille webbureau i Herning/Ikast). Nedenfor: hvert udgivet indlæg med træk og Google-trafik for de sidste 28 dage.
Træk: ord=ordtal, faq=antal FAQ, titelform=titelmønster, tal/graf/kundesvar/kinly = Jev-sandsynlighed 0-1 (tal=rigtige tal i teksten, graf=graf/tabel, kundesvar=svarer på kundespørgsmål, kinly=leder til Kinly).
Trafik: klik, visn (visninger), ctr (%), pos (gns. position, lavere er bedre), klik_foer (forrige 28 dage), dage (siden udgivelse).
Brug KUN disse data — opfind ingen tal. Find mønstre: hvilke træk har de indlæg der klarer sig bedst, som de svage mangler?
Skriv 2-4 punkter "hvad virker" (hvert med tallene der viser det, max 2 sætninger) og max 3 konkrete forslag: hvilket svagt indlæg skal have hvilket træk fra hvilket stærkt indlæg.
Er data for tynde til et klart mønster, så sig det ærligt i ét punkt og giv færre forslag. Dansk, jordnært.
Svar KUN med JSON: {"points":[{"title":"max 70 tegn","detail":"max 300 tegn"}],"suggestions":[{"post":"præcis titel","change":"hvad der skal tilføjes/ændres, max 200 tegn","from":"præcis titel på indlægget det lånes fra"}]}"""


# ---------------------------------------------------------------- træk (deterministisk)

def title_pattern(title: str) -> list[str]:
    t = title.strip().lower()
    out = []
    if t.endswith("?") or (t.split() or [""])[0] in QUESTION_WORDS:
        out.append("spørgsmål")
    if re.search(r"\d", t):
        out.append("tal")
    if any(re.search(rf"\b{c}\b", t) for c in CITIES):
        out.append("by")
    return out or ["andet"]


def image_alts(post: dict) -> list[str]:
    images = post.get("images") or {}
    return [str((images.get(s) or {}).get("alt") or "")[:120] for s in ("a", "b", "c") if isinstance(images.get(s), dict)]


def base_traits(post: dict) -> dict:
    body = str(post.get("body") or "")
    return {
        "ord": len(body.split()),
        "faq": len((post.get("proofs") or {}).get("faq") or []),
        "titelform": title_pattern(str(post.get("title") or "")),
        "kat": str(post.get("category") or ""),
    }


def jev_traits(raw: dict | None) -> dict:
    out = {}
    for q, key in (("rigtige_tal", "tal"), ("graf", "graf"), ("kundesvar", "kundesvar"), ("leder_til_kinly", "kinly")):
        v = jev_lib.a(raw, q)
        out[key] = round(v, 1) if isinstance(v, float) else None
    return out


# ---------------------------------------------------------------- trafik

def _days_since(iso: str | None, now: datetime) -> int | None:
    if not iso:
        return None
    try:
        return (now - datetime.fromisoformat(iso.replace("Z", "+00:00"))).days
    except ValueError:
        return None


def page_for(slug: str, pages: list[dict]) -> dict | None:
    want = f"/blog/{slug}".rstrip("/")
    return next((p for p in pages if str(p.get("path", "")).rstrip("/") == want), None)


def traffic(page: dict | None) -> dict:
    if not page:
        return {"klik": 0, "visn": 0, "ctr": 0.0, "pos": None, "klik_foer": None}
    impr = page.get("impressions") or 0
    return {
        "klik": page.get("clicks", 0),
        "visn": impr,
        "ctr": round(100 * page.get("clicks", 0) / impr, 1) if impr else 0.0,
        "pos": page.get("position"),
        "klik_foer": (page.get("prev") or {}).get("clicks"),
        "top_soegeord": (page.get("topQueries") or [{}])[0].get("query") if page.get("topQueries") else None,
    }


def eligible(cards: list[dict], now: datetime) -> list[dict]:
    """Udgivne indlæg med mindst 14 dage bag sig, nyeste først, maks MAX_POSTS."""
    old = [c for c in cards if (d := _days_since(c.get("publishedAt"), now)) is not None and d >= MIN_DAYS]
    return sorted(old, key=lambda c: c.get("publishedAt") or "", reverse=True)[:MAX_POSTS]


# ---------------------------------------------------------------- LLM (ét kald)

def compact(rows: list[dict]) -> str:
    return json.dumps(rows, ensure_ascii=False, separators=(",", ":"))[:MAX_INPUT_CHARS]


def deepseek(user: str) -> str:
    body = json.dumps({
        "model": ka.MODEL,
        "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": user}],
        "max_tokens": 900, "temperature": 0.3, "response_format": {"type": "json_object"},
        **ka.NO_THINKING,
    }).encode("utf-8")
    req = Request(ka.URL, data=body, method="POST",
                  headers={"Content-Type": "application/json", "Authorization": f"Bearer {ka.load_key()}"})
    with urlopen(req, timeout=90) as res:
        data = json.loads(res.read().decode("utf-8"))
    usage = data.get("usage") or {}
    print(f"[moenster] tokens ind={usage.get('prompt_tokens')} ud={usage.get('completion_tokens')}")
    return data["choices"][0]["message"]["content"]


def parse(text: str, titles: set[str]) -> tuple[list[dict], list[dict]]:
    """Punkter (1-4) + forslag (max 3) hvis indlæg-titler findes i data — opdigtede titler droppes."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("intet JSON i svaret")
    data = json.loads(m.group(0))
    points = [{"title": str(p["title"]).strip()[:100], "detail": str(p["detail"]).strip()[:400]}
              for p in data.get("points") or [] if isinstance(p, dict) and p.get("title") and p.get("detail")][:4]
    if not points:
        raise ValueError("ingen gyldige punkter")
    sugg = []
    for s in data.get("suggestions") or []:
        if not (isinstance(s, dict) and s.get("post") in titles and s.get("change")):
            continue
        item = {"post": s["post"][:200], "change": str(s["change"]).strip()[:400]}
        if s.get("from") in titles and s.get("from") != s["post"]:
            item["from"] = s["from"][:200]
        sugg.append(item)
    return points, sugg[:3]


# ---------------------------------------------------------------- kørsel

def _now_iso(now: datetime) -> str:
    return now.isoformat(timespec="seconds").replace("+00:00", "Z")


def run(dry_run: bool, hq=crm_posts.call, jev=jev_lib.ask, llm=deepseek, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    stats = {"jev_calls": 0, "llm_calls": 0, "posted": False, "status": None}
    listed = hq({"action": "list", "stage": "udgivet"})
    if not listed.get("ok"):
        raise RuntimeError(f"HQ list fejlede: {listed.get('error')}")
    ready = eligible(listed.get("cards") or [], now)
    print(f"udgivet: {len(listed.get('cards') or [])}, med ≥{MIN_DAYS} dage: {len(ready)}")

    if len(ready) < MIN_POSTS:
        stats["status"] = "for-tidligt"
        doc = {"action": "blogreview", "reviewedAt": _now_iso(now), "status": "for-tidligt", "measured": len(ready)}
    else:
        tr = hq({"action": "blogtraffic"}, HQ_PATH)
        gsc = tr.get("gsc") if tr.get("ok") else None
        if not gsc:
            raise RuntimeError(f"ingen Google-trafik i HQ ({tr.get('error') or 'kinly.dk-GSC ikke hentet'}) — stopper uden LLM")
        if dry_run:
            print("dry-run: ville bedømme", [c.get("title") for c in ready])
            return {**stats, "status": "ok (dry-run)"}
        rows = []
        for card in ready:
            got = hq({"action": "get", "id": card["id"]})
            post = got.get("post") if got.get("ok") else None
            if not post:
                continue
            state = {"titel": post.get("title"), "tekst": str(post.get("body") or "")[:6000], "billeder": image_alts(post)}
            raw = jev(state, JEV_QUESTIONS)
            stats["jev_calls"] += 1
            rows.append({"titel": str(post.get("title"))[:90], **base_traits(post), **jev_traits(raw),
                         **traffic(page_for(str(post.get("slug") or ""), gsc.get("pages") or [])),
                         "dage": _days_since(card.get("publishedAt"), now)})
        if len(rows) < MIN_POSTS:
            raise RuntimeError("for få indlæg kunne hentes — stopper uden LLM")
        points, sugg = parse(llm(compact(rows)), {r["titel"] for r in rows})
        stats["llm_calls"] += 1
        stats["status"] = "ok"
        doc = {"action": "blogreview", "reviewedAt": _now_iso(now), "status": "ok", "measured": len(rows), "points": points, "suggestions": sugg}

    if dry_run:
        print(json.dumps(doc, ensure_ascii=False, indent=1))
        return stats
    resp = hq(doc, HQ_PATH)
    stats["posted"] = bool(resp.get("ok"))
    if not resp.get("ok"):
        raise RuntimeError(f"HQ afviste blogreview: {resp.get('error')}")
    return stats


# ---------------------------------------------------------------- selftest

def _selftest() -> None:
    assert title_pattern("Hvad koster en hjemmeside i Herning?") == ["spørgsmål", "by"]
    assert title_pattern("5 fejl på lokale sider") == ["tal"]
    assert title_pattern("Google-anmeldelser: sådan får du flere") == ["andet"]
    assert base_traits({"body": "a b c", "proofs": {"faq": [1, 2]}, "title": "x", "category": "pris"}) == {"ord": 3, "faq": 2, "titelform": ["andet"], "kat": "pris"}
    assert jev_traits(None) == {"tal": None, "graf": None, "kundesvar": None, "kinly": None}
    assert jev_traits({"answers": {"graf": {"type": "noul", "noul": 0.87}}})["graf"] == 0.9
    assert page_for("pris", [{"path": "/blog/pris/"}]) == {"path": "/blog/pris/"} and page_for("x", []) is None
    assert traffic({"clicks": 2, "impressions": 40, "position": 8.1, "prev": {"clicks": 1}, "topQueries": [{"query": "q"}]})["ctr"] == 5.0
    assert traffic(None)["klik"] == 0

    now = datetime(2026, 11, 2, 8, tzinfo=timezone.utc)
    iso = lambda d: _now_iso(now - timedelta(days=d))  # noqa: E731
    cards = [{"id": f"id{i}", "title": f"T{i}", "publishedAt": iso(d)} for i, d in enumerate((30, 20, 13, 40))]
    assert [c["id"] for c in eligible(cards, now)] == ["id1", "id0", "id3"]

    # parse: opdigtede titler droppes, "from" = samme indlæg droppes
    pts, sug = parse('x {"points":[{"title":"Tal virker","detail":"d"},{"title":""}],"suggestions":['
                     '{"post":"A","change":"tilføj graf","from":"B"},{"post":"Opdigtet","change":"x"},{"post":"B","change":"y","from":"B"}]}', {"A", "B"})
    assert pts == [{"title": "Tal virker", "detail": "d"}]
    assert sug == [{"post": "A", "change": "tilføj graf", "from": "B"}, {"post": "B", "change": "y"}]
    for bad in ("ingen json", '{"points":[]}'):
        try:
            parse(bad, set())
            raise AssertionError(bad)
        except ValueError:
            pass

    # for tidligt: 0 Jev, 0 LLM, "for-tidligt" postes
    sent = []

    def fake_hq(payload, path=crm_posts.PATH):
        sent.append((payload.get("action"), path))
        if payload["action"] == "list":
            return {"ok": True, "cards": cards[:3]}
        if payload["action"] == "blogtraffic":
            return {"ok": True, "gsc": {"pages": [{"path": "/blog/s0/", "clicks": 9, "impressions": 90, "position": 4.2, "prev": {"clicks": 3}, "topQueries": []}]}}
        if payload["action"] == "get":
            i = payload["id"][2:]
            return {"ok": True, "post": {"id": payload["id"], "title": f"T{i}", "slug": f"s{i}", "body": "ord " * 700, "proofs": {"faq": []}, "category": "pris"}}
        return {"ok": True}

    def no_jev(*_):
        raise AssertionError("Jev må ikke kaldes")

    def no_llm(*_):
        raise AssertionError("LLM må ikke kaldes")

    s = run(False, hq=fake_hq, jev=no_jev, llm=no_llm, now=now)
    assert s == {"jev_calls": 0, "llm_calls": 0, "posted": True, "status": "for-tidligt"}, s
    assert sent[-1] == ("blogreview", HQ_PATH)

    # nok data: ét Jev-kald pr. indlæg, ét LLM-kald, kun komprimerede tal til LLM
    cards.append({"id": "id4", "title": "T4", "publishedAt": iso(15)})
    sent.clear()
    seen = {}

    def fake_llm(user):
        seen["user"] = user
        return '{"points":[{"title":"Tal virker","detail":"T0 har 9 klik"}],"suggestions":[{"post":"T1","change":"tilføj tal","from":"T0"}]}'

    fake_hq_all = lambda p, path=crm_posts.PATH: {"ok": True, "cards": cards} if p["action"] == "list" else fake_hq(p, path)  # noqa: E731
    s = run(False, hq=fake_hq_all, jev=lambda st, q: {"answers": {"rigtige_tal": {"type": "noul", "noul": 0.8}}}, llm=fake_llm, now=now)
    assert s == {"jev_calls": 4, "llm_calls": 1, "posted": True, "status": "ok"}, s
    rows = json.loads(seen["user"])
    assert "ord " not in seen["user"] and rows[0]["tal"] == 0.8 and {r["titel"] for r in rows} == {"T0", "T1", "T3", "T4"}
    assert next(r for r in rows if r["titel"] == "T0")["klik"] == 9
    print("selftest ok")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        _selftest()
        return 0
    print(json.dumps(run(a.dry_run), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
