#!/usr/bin/env python3
"""
ekstern_radar.py — ugentlig ekstern radar uden agent (erstatter to FULL-AGENT-crons 27/9).

  --topic marked   weekly-market-content-signals (CMS/LEAD/SALG/SEO for Kinly)
  --topic skill    weekly-skill-ecosystem-signals (AGENTIC_OS/... for Hermes)

Flow: gratis kilder (HN Algolia, Reddit-RSS, GitHub search, RSS/Atom) sidste 7 dage
-> dedupe mod state (60 dage) -> Jev scorer (maks 40 kald) -> top ≤5 over tærskel
-> ÉT DeepSeek-kald (thinking slået fra) -> ≤3 [EXTERNAL_SIGNAL]-blokke valideret i kode.
Intet over tærsklen / ugyldigt svar / fejl -> præcis `[SILENT]` på stdout, note på stderr.
Stdout er KUN blokke eller [SILENT] (agentic-os-self-improvement-gate læser den via context_from).

  --dry-run   rigtig fetch + Jev + LLM, printer, skriver ikke state
  --selftest  offline asserts
"""
from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
import urllib.error
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jev_lib  # noqa: E402
import konkurrent_analyse as ka  # noqa: E402  (DeepSeek: MODEL, URL, NO_THINKING, load_key)

SILENT = "[SILENT]"
UA = "Mozilla/5.0 (X11; Linux x86_64) KinlyRadar/0.1"
DAYS = 7
SEEN_DAYS = 60
MAX_JEV = 40
TOP_N = 5
MAX_SIGNALS = 3
THRESHOLD = 0.35  # relevant×handlingsbar. Dry-run 27/9: spam-update/GBP-politik 0.34-0.41, støj <0.33. DeepSeek er 2. filter.
STATE = "/root/.hermes/state/ekstern-radar-{topic}.json"

KINLY = ("Kinly: lille webbureau i Herning/Ikast (1-2 personer). Håndkodede hjemmesider fra 3.997 kr. fast pris "
         "(Next.js på Vercel), eget kunde-CMS, kunden ejer koden, lokal SEO og AI-synlighed (GEO/AEO). Kunderne er små "
         "lokale virksomheder (frisører, klinikker, restauranter, håndværkere) i Midtjylland. Eget lead-system "
         "(Google Places-scrape, mail-kladder, CRM) og salg via tilbud. Driften kører på Hermes: en agent-platform "
         "med cron-jobs, skills, DeepSeek/Claude/Codex-modeller, Jev (typed judgments) og Telegram-levering.")

TOPICS = {
    "marked": {
        "domains": ("CMS", "LEAD", "SALG", "SEO"),
        "fokus": "CMS til små kunder, lead-generering, salg/tilbud, SEO/GEO/AEO (Google, AI-søgning), lokale småvirksomheders behov",
        "hn": ["local seo", "google business profile", "ai overviews", "generative engine optimization",
               "google search update", "headless cms", "small business website", "cold email", "lead generation"],
        "reddit": ["SEO", "localseo", "bigseo", "smallbusiness", "web_design"],
        "github": [],
        "rss": ["https://developers.google.com/search/blog/feed.xml",
                "https://status.search.google.com/en/feed.atom",
                "https://www.seroundtable.com/index.rdf",
                "https://vercel.com/atom"],
    },
    "skill": {
        "domains": ("AGENTIC_OS", "CMS", "LEAD", "SALG", "SEO"),
        "fokus": "skills, agent-workflows, model-routing, cron-hygiejne, memory, delegation og evals — kun hvis det konkret "
                 "kan forbedre kinly.dk, Kinly CMS, lead-systemet, salg/SEO/GEO eller Hermes",
        "hn": ["claude code", "agent skills", "mcp server", "llm evals", "agent memory", "model routing",
               "deepseek", "ai agent cron"],
        "reddit": ["ClaudeAI", "ClaudeCode", "AI_Agents"],
        "github": ["topic:claude-code-skills", "topic:agent-skills", "topic:mcp-server"],
        "rss": ["https://github.com/anthropics/claude-code/releases.atom",
                "https://github.com/NousResearch/hermes-agent/releases.atom",
                "https://openai.com/news/rss.xml",
                "https://simonwillison.net/atom/everything/"],
    },
}


def log(msg: str) -> None:
    print(f"[ekstern_radar] {msg}", file=sys.stderr)


# ---------------------------------------------------------------- fetch

def _get(url: str, timeout: int = 30, cap: int = 10_000_000) -> bytes:  # vercel.com/atom er ~3,7 MB
    req = Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urlopen(req, timeout=timeout, context=jev_lib._SSL_CTX) as r:
        return r.read(cap)


def _clean(s: str | None, cap: int = 400) -> str:
    s = re.sub(r"<[^>]+>", " ", html.unescape(s or ""))
    return re.sub(r"\s+", " ", html.unescape(s)).strip()[:cap]


def _date(s: str | None) -> datetime | None:
    if not s:
        return None
    s = s.strip()
    try:
        d = parsedate_to_datetime(s)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _item(url, title, source, date, summary="", omfang=""):
    return {"url": url, "title": _clean(title, 200), "source": source,
            "date": date.strftime("%Y-%m-%d"), "summary": _clean(summary), "omfang": omfang}


def hn(query: str, since: datetime) -> list[dict]:
    q = urllib.parse.urlencode({"query": query, "tags": "story", "hitsPerPage": 8,
                                "numericFilters": f"created_at_i>{int(since.timestamp())},points>5"})
    hits = json.loads(_get(f"https://hn.algolia.com/api/v1/search?{q}"))["hits"]
    out = []
    for h in sorted(hits, key=lambda h: -(h.get("points") or 0)):
        disc = f"https://news.ycombinator.com/item?id={h['objectID']}"
        out.append(_item(h.get("url") or disc, h.get("title"), "Hacker News",
                         datetime.fromtimestamp(h["created_at_i"], timezone.utc), h.get("story_text") or "",
                         f"{h.get('points', 0)} point, {h.get('num_comments', 0)} kommentarer ({disc})"))
    return out


def github(query: str, since: datetime) -> list[dict]:
    q = urllib.parse.quote(f"{query} created:>{since:%Y-%m-%d}")
    items = json.loads(_get(f"https://api.github.com/search/repositories?q={q}&sort=stars&per_page=8"))["items"]
    return [_item(r["html_url"], r["full_name"], "GitHub", _date(r["created_at"]), r.get("description") or "",
                  f"{r.get('stargazers_count', 0)} stjerner") for r in items if r.get("stargazers_count", 0) >= 5]


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def parse_feed(raw: bytes, source: str, since: datetime) -> list[dict]:
    out = []
    for el in ET.fromstring(raw).iter():
        if _local(el.tag) not in ("item", "entry"):
            continue
        f = {}
        for c in el:
            name = _local(c.tag)
            if name == "link":
                f.setdefault("link", c.get("href") or (c.text or "").strip())
            elif name in ("pubdate", "published", "updated", "date"):
                f.setdefault("date", c.text)
            elif name in ("description", "summary", "content", "encoded"):
                f.setdefault("summary", c.text)
            elif name == "title":
                f["title"] = c.text
        d = _date(f.get("date"))
        if f.get("link") and d and d >= since:
            out.append(_item(f["link"], f.get("title"), source, d, f.get("summary") or ""))
    return out


def rss(url: str, since: datetime) -> list[dict]:
    return parse_feed(_get(url), urllib.parse.urlparse(url).netloc.removeprefix("www."), since)


def reddit(sub: str, since: datetime) -> list[dict]:
    # ponytail: uautentificeret Reddit-RSS giver 429 ved hurtige kald; pause + ét retry. OAuth-app hvis det ikke rækker.
    url = f"https://www.reddit.com/r/{sub}/top/.rss?t=week&limit=15"
    for wait in (8, 30):
        time.sleep(wait)
        try:
            return parse_feed(_get(url), f"reddit r/{sub}", since)
        except urllib.error.HTTPError as e:
            if e.code != 429 or wait == 30:
                raise
    return []


def fetch_all(cfg: dict, now: datetime) -> list[list[dict]]:
    """Én liste pr. kilde, hver sorteret efter kildens egen popularitet/aktualitet."""
    since = now - timedelta(days=DAYS)
    jobs = ([(hn, q) for q in cfg["hn"]] + [(reddit, s) for s in cfg["reddit"]]
            + [(github, q) for q in cfg["github"]] + [(rss, u) for u in cfg["rss"]])
    lists = []
    for fn, arg in jobs:
        try:
            lists.append(fn(arg, since))
        except Exception as e:  # én død kilde må ikke vælte radaren
            log(f"kilde fejlede: {fn.__name__}({arg}): {type(e).__name__} {getattr(e, 'code', '')}")
    return lists


# ---------------------------------------------------------------- dedupe

def norm(url: str) -> str:
    return url.split("#")[0].rstrip("/")


def prune(seen: dict, now: datetime) -> dict:
    cut = (now - timedelta(days=SEEN_DAYS)).strftime("%Y-%m-%d")
    return {u: d for u, d in seen.items() if d >= cut}


def pick_candidates(lists: list[list[dict]], seen: dict, cap: int = MAX_JEV) -> list[dict]:
    """Round-robin over kilderne (så én kilde ikke æder hele Jev-budgettet), uden sete/dubletter."""
    out, taken, i = [], set(), 0
    while len(out) < cap and any(i < len(l) for l in lists):
        for l in lists:
            if i < len(l):
                u = norm(l[i]["url"])
                if u not in seen and u not in taken:
                    taken.add(u)
                    out.append(l[i])
                    if len(out) >= cap:
                        break
        i += 1
    return out


# ---------------------------------------------------------------- Jev

def jev_questions() -> dict:
    return {
        "relevant": {"type": "noul", "instructions":
                     "Handler `fund` om noget der direkte berører `os` inden for `fokus`? Generelle tech-nyheder, "
                     "hobbyprojekter og emner uden forbindelse til `os` er nej."},
        "handlingsbar": {"type": "noul", "instructions":
                         "Kan `os` gøre én konkret ting inden for en uge på grund af `fund` (ændre kode, cron, SEO-tiltag, "
                         "salgsproces, kundetilbud)? Meninger, selvpromovering, spørgsmål uden svar og løse rygter er nej."},
    }


def jev_score(res: dict | None) -> float | None:
    r, h = jev_lib.a(res, "relevant"), jev_lib.a(res, "handlingsbar")
    return round(r * h, 3) if isinstance(r, float) and isinstance(h, float) else None


def score(cands: list[dict], cfg: dict, jev=jev_lib.ask) -> list[dict]:
    qs = jev_questions()
    states = [{"os": KINLY, "fokus": cfg["fokus"],
               "fund": {k: c[k] for k in ("title", "source", "date", "summary", "omfang")}} for c in cands]
    import concurrent.futures as cf
    with cf.ThreadPoolExecutor(5) as ex:
        results = list(ex.map(lambda s: jev(s, qs), states))
    return [dict(c, score=jev_score(r)) for c, r in zip(cands, results)]


# ---------------------------------------------------------------- LLM (ét kald)

PROMPT = """Du er ekstern radar for Kinly. Kontekst: {kinly}
Fokus: {fokus}
Nedenfor er op til 5 fund fra de sidste 7 dage (allerede filtreret af Jev). Brug KUN disse data — opfind ingen tal, datoer, navne eller kilder.
Vælg højst {maks} fund der er reelt handlingsbare for os. Er intet handlingsbart, returnér {{"signals": []}}.
Svar som JSON: {{"signals": [{{"item": <nummer>, "domain": "{domains}", "finding": "hvad er sket (1 sætning)",
"omfang": "omfang og dækningsforbehold (fx 'én Reddit-tråd, anekdotisk')", "impact": "hvad ændrer det konkret hos os (1-2 sætninger)",
"next_action": "én mulig handling eller SKIP", "confidence": "high|medium|low"}}]}}
Alt på dansk, jordnært, ingen buzzwords. Én linje pr. felt."""


def deepseek(system: str, user: str) -> str:
    body = json.dumps({
        "model": ka.MODEL,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
        "max_tokens": 1200, "temperature": 0.2, "response_format": {"type": "json_object"},
        **ka.NO_THINKING,
    }).encode("utf-8")
    req = Request(ka.URL, data=body, method="POST",
                  headers={"Content-Type": "application/json", "Authorization": f"Bearer {ka.load_key()}"})
    with urlopen(req, timeout=120) as res:
        data = json.loads(res.read().decode("utf-8"))
    u = data.get("usage") or {}
    log(f"deepseek tokens ind={u.get('prompt_tokens')} ud={u.get('completion_tokens')}")
    return data["choices"][0]["message"]["content"]


def _line(s) -> str:
    return re.sub(r"\s+", " ", str(s or "")).strip()


def render(raw: str, top: list[dict], domains: tuple) -> str:
    """LLM-JSON -> blokke. Evidence bygges af kode fra fundets rigtige URL + dato, aldrig af LLM'en."""
    blocks = []
    signals = (json.loads(raw).get("signals") or [])[:MAX_SIGNALS]
    for s in signals:
        try:
            it = top[int(s["item"]) - 1]
            assert int(s["item"]) >= 1
        except (KeyError, ValueError, TypeError, IndexError, AssertionError):
            log(f"signal droppet: ugyldigt item {s.get('item')!r}")
            continue
        f = {k: _line(s.get(k)) for k in ("domain", "finding", "omfang", "impact", "next_action", "confidence")}
        if f["domain"] not in domains or f["confidence"] not in ("high", "medium", "low") or not all(f.values()):
            log(f"signal droppet: ugyldige felter {f}")
            continue
        omfang = "; ".join(x for x in (it["omfang"], f["omfang"]) if x)
        blocks.append("\n".join([
            "[EXTERNAL_SIGNAL]",
            f"domain: {f['domain']}",
            f"finding: {f['finding']}",
            f"evidence: {it['source']}, {it['date']}, {it['url']} — {omfang}",
            f"impact: {f['impact']}",
            f"next_action: {f['next_action']}",
            f"confidence: {f['confidence']}",
            "[/EXTERNAL_SIGNAL]",
        ]))
    if signals and not blocks:
        raise ValueError("alle signaler ugyldige")
    return "\n\n".join(blocks)


def valid(text: str, domains: tuple) -> bool:
    """Præcis [SILENT], eller 1-3 blokke i det faste format og intet andet."""
    if text == SILENT:
        return True
    if not text or SILENT in text:
        return False
    parts = text.split("\n\n")
    if not 1 <= len(parts) <= MAX_SIGNALS:
        return False
    keys = ["domain", "finding", "evidence", "impact", "next_action", "confidence"]
    for p in parts:
        lines = p.split("\n")
        if len(lines) != 8 or lines[0] != "[EXTERNAL_SIGNAL]" or lines[-1] != "[/EXTERNAL_SIGNAL]":
            return False
        kv = [l.split(": ", 1) for l in lines[1:-1]]
        if [k[0] for k in kv] != keys or any(len(k) != 2 or not k[1].strip() for k in kv):
            return False
        d = dict(kv)
        if d["domain"] not in domains or d["confidence"] not in ("high", "medium", "low"):
            return False
        if not re.search(r"https?://\S+", d["evidence"]) or not re.search(r"\d{4}-\d\d-\d\d", d["evidence"]):
            return False
    return True


# ---------------------------------------------------------------- run

def run(topic: str, dry_run: bool, fetch=fetch_all, jev=jev_lib.ask, llm=deepseek,
        state_path: str | None = None, now: datetime | None = None) -> str:
    cfg = TOPICS[topic]
    now = now or datetime.now(timezone.utc)
    state_path = state_path or STATE.format(topic=topic)
    seen = prune(jev_lib.load_json(state_path, {}), now)

    lists = fetch(cfg, now)
    cands = pick_candidates(lists, seen)
    log(f"{topic}: {sum(map(len, lists))} fund hentet, {len(cands)} nye til Jev")
    if not cands:
        return SILENT

    scored = score(cands, cfg, jev)
    ok = [c for c in scored if c["score"] is not None]
    log(f"jev: {len(scored)} kald, {len(ok)} svar")
    if not ok:
        log("jev gav ingen svar (nøgle/API?) — state urørt")
        return SILENT
    for c in sorted(ok, key=lambda c: -c["score"])[:10]:
        log(f"  {c['score']:.2f}  {c['source']}: {c['title'][:80]}")

    def save():
        if not dry_run:
            for c in ok:
                seen[norm(c["url"])] = now.strftime("%Y-%m-%d")
            jev_lib.atomic_write_json(state_path, seen)

    top = sorted((c for c in ok if c["score"] >= THRESHOLD), key=lambda c: -c["score"])[:TOP_N]
    if not top:
        save()
        return SILENT

    user = "\n".join(f"{i}. [{c['source']}, {c['date']}] {c['title']} — {c['summary']} ({c['omfang'] or 'intet omfangstal'}) "
                     f"url={c['url']} jev={c['score']}" for i, c in enumerate(top, 1))
    system = PROMPT.format(kinly=KINLY, fokus=cfg["fokus"], maks=MAX_SIGNALS, domains="|".join(cfg["domains"]))
    try:
        out = render(llm(system, user), top, cfg["domains"])
    except Exception as e:
        log(f"LLM/parse fejlede: {type(e).__name__}: {str(e)[:200]} — [SILENT], state urørt")
        return SILENT
    if not out:
        save()
        return SILENT
    if not valid(out, cfg["domains"]):
        log("formatvalidering fejlede — sender [SILENT] i stedet for skrald")
        return SILENT
    save()
    return out


# ---------------------------------------------------------------- selftest

def _selftest() -> None:
    import tempfile
    doms = TOPICS["skill"]["domains"]
    good = ("[EXTERNAL_SIGNAL]\ndomain: SEO\nfinding: x\nevidence: HN, 2026-09-20, https://a.b/c — 1 tråd\n"
            "impact: y\nnext_action: SKIP\nconfidence: low\n[/EXTERNAL_SIGNAL]")
    assert valid(SILENT, doms) and valid(good, doms) and valid(good + "\n\n" + good, doms)
    assert not valid(good + "\n\n" + SILENT, doms), "aldrig både fund og SILENT"
    assert not valid("\n\n".join([good] * 4), doms), "max 3"
    assert not valid(good.replace("SEO", "FOO"), doms)
    assert not valid(good.replace("https://a.b/c", "kilde"), doms), "evidence kræver URL"
    assert not valid(good.replace("confidence: low", "confidence: sure"), doms)
    assert not valid("", doms) and not valid("Her er fund:\n" + good, doms)
    assert not valid(good.replace("SEO", "AGENTIC_OS"), TOPICS["marked"]["domains"]), "AGENTIC_OS kun i skill"

    now = datetime(2026, 9, 27, tzinfo=timezone.utc)
    assert prune({"a": "2026-07-01", "b": "2026-09-01"}, now) == {"b": "2026-09-01"}
    it = lambda u: {"url": u, "title": u, "source": "s", "date": "2026-09-25", "summary": "", "omfang": ""}
    c = pick_candidates([[it("https://x/1"), it("https://x/2/")], [it("https://x/2"), it("https://x/3")]],
                        {"https://x/1": "2026-09-20"}, cap=10)
    assert [norm(x["url"]) for x in c] == ["https://x/2", "https://x/3"], c
    assert len(pick_candidates([[it(f"https://y/{i}") for i in range(50)]], {}, cap=40)) == 40

    feed = (b'<?xml version="1.0"?><rss><channel><item><title>Ny &amp; bedre</title><link>https://g.co/p</link>'
            b'<pubDate>Thu, 25 Sep 2026 10:00:00 GMT</pubDate><description>&lt;p&gt;Hej&lt;/p&gt;</description></item>'
            b'<item><title>Gammel</title><link>https://g.co/old</link><pubDate>Mon, 01 Sep 2026 10:00:00 GMT</pubDate></item>'
            b'</channel></rss>')
    got = parse_feed(feed, "g.co", now - timedelta(days=7))
    assert [(g["title"], g["summary"], g["date"]) for g in got] == [("Ny & bedre", "Hej", "2026-09-25")], got

    fetch = lambda cfg, now: [[it("https://n/1"), it("https://n/2")]]
    calls = []
    low = lambda s, q: {"answers": {"relevant": {"type": "noul", "noul": 0.2}, "handlingsbar": {"type": "noul", "noul": 0.2}}}
    high = lambda s, q: {"answers": {"relevant": {"type": "noul", "noul": 0.9}, "handlingsbar": {"type": "noul", "noul": 0.9}}}

    def llm_ok(system, user):
        calls.append(user)
        return json.dumps({"signals": [{"item": 1, "domain": "AGENTIC_OS", "finding": "f", "omfang": "o", "impact": "i",
                                        "next_action": "SKIP", "confidence": "medium"},
                                       {"item": 9, "domain": "SEO", "finding": "f", "omfang": "o", "impact": "i",
                                        "next_action": "a", "confidence": "high"}]})

    with tempfile.TemporaryDirectory() as d:
        sp = str(Path(d) / "s.json")
        # silent path: 0 LLM-kald, state skrevet så samme fund ikke scores igen
        assert run("skill", False, fetch, low, lambda *a: calls.append("x"), sp, now) == SILENT and not calls
        assert set(json.load(open(sp))) == {"https://n/1", "https://n/2"}
        # dedupe: alt set -> SILENT uden Jev
        assert run("skill", False, fetch, lambda *a: 1 / 0, llm_ok, sp, now) == SILENT and not calls
        # signal path: ét kald, opfundet item 9 droppes, evidence = rigtig URL+dato
        sp2 = str(Path(d) / "s2.json")
        out = run("skill", True, fetch, high, llm_ok, sp2, now)
        assert len(calls) == 1 and valid(out, doms) and out.count("[EXTERNAL_SIGNAL]") == 1, out
        assert "https://n/1" in out and "2026-09-25" in out
        assert not Path(sp2).exists(), "dry-run skriver ikke state"
        # ugyldigt LLM-svar -> SILENT, state urørt
        assert run("skill", False, fetch, high, lambda *a: "ikke json", sp2, now) == SILENT and not Path(sp2).exists()
        assert run("skill", False, fetch, high, lambda *a: '{"signals":[{"item":1,"domain":"FOO"}]}', sp2, now) == SILENT
        assert not Path(sp2).exists()
        # Jev nede -> SILENT, state urørt
        assert run("skill", False, fetch, lambda *a: None, llm_ok, sp2, now) == SILENT and len(calls) == 1
    print("ekstern_radar selftest: OK", file=sys.stderr)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--topic", choices=sorted(TOPICS))
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args(argv)
    if a.selftest:
        _selftest()
        return 0
    if not a.topic:
        ap.error("--topic kræves")
    print(run(a.topic, a.dry_run))
    return 0


if __name__ == "__main__":
    sys.exit(main())
