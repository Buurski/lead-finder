#!/usr/bin/env python3
"""Tests (HQ: Pipeline → Tests) — dagligt no_agent-job. Skrevet af Claude 27/9.

Lucas sender en idé hertil med "→ Afprøv hos os" (Konkurrenter/SEO). Dette script:

  vurderes: ÉT Jev-kald pr. idé (council: relevans, effekt, indsats, risiko, belæg).
            SEO-idéer med et citeret søgeord får først en gratis efterspørgsels-måling
            (Google-autofuldførelse via kundespoergsmaal.py), som Jev ser.
            Tydeligt lav relevans/effekt → droppet med grund (stille, ingen opgave).
            Ellers → council-kø: Hermes-agenten (gpt-6-sol) tjekker idéen på Google med 5 råd og
  tester:   første kørsel efter start gemmer baseline; når de 14 dage (+ GSC's 3 dages
            forsinkelse) er gået, måles igen og tallene sammenlignes UDEN LLM →
            resultat + ÉN HQ-opgave "Test færdig: X — behold eller drop?".

Kun Lucas starter, beholder og dropper — HQ-ruten kan slet ikke andet for agenten.
Token-regel: Jev først (0 LLM-tokens); kun idéer Jev siger "test" til når den dyre council-agent.

  eksperimenter.py              # rigtig kørsel (cron, dagligt)
  eksperimenter.py --dry-run    # ingen skrivninger til HQ; Jev kaldes stadig, council-agenten startes ikke
  eksperimenter.py --selftest   # offline
Miljø: KINLY_HQ_URL (standard: prod), HERMES_API_SECRET, TYPESAFE_API_KEY, TESTS_COUNCIL_JOB_ID.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import jev_lib  # noqa: E402
import kundespoergsmaal  # noqa: E402
from crm_agent_log import load_secret, sign  # noqa: E402

HQ = os.environ.get("KINLY_HQ_URL", "https://lead-finder-three-beta.vercel.app").rstrip("/")
PATH = "/api/agent/experiments"
TASKS_PATH = "/api/agent/tasks"
TEST_DAYS = 14  # Lucas 27/9: 14 dage giver mere data end en uge
_JOB_FILE = Path.home() / ".hermes" / "tests-council-job-id"  # Hermes-agentjobbet der laver testplaner
COUNCIL_JOB_ID = os.environ.get("TESTS_COUNCIL_JOB_ID") or (_JOB_FILE.read_text().strip() if _JOB_FILE.exists() else "")
CONF_MIN = 0.6
GSC_LAG_DAYS = 3  # GSC-data er ~2-3 dage forsinket (samme regel som HQ's gsc.ts)
GEO_GRACE_DAYS = 8  # AI-målingen kører om mandagen; venter højst en uge ekstra på en ny

KINLY = ("Kinly: lille webbureau i Herning/Ikast. Håndkodede hjemmesider fra 3.997 kr. fast pris, kunde-CMS, "
         "kunden ejer koden, lokal SEO og AI-synlighed. Kunderne er små lokale virksomheder (frisører, klinikker, "
         "restauranter, håndværkere) i Herning, Ikast og Midtjylland. Kinly er 1-2 personer.")

# (id, navn i UI, spørgsmål, gode svar, dårlige svar)
COUNCIL = [
    ("relevans", "relevans", "Er idéen relevant for Kinlys kunder og købere?",
     ("høj", "Relevant for små lokale virksomheder i Herning/Ikast/Midtjylland — dem Kinly sælger til"),
     ("lav", "Handler om store virksomheder, andre markeder eller noget Kinlys købere er ligeglade med")),
    ("effekt", "effekt", "Vil idéen, lavet på kinly.dk, sandsynligvis give flere henvendelser eller bedre synlighed på Google/AI-søgning?",
     ("høj", "Ja, en mærkbar effekt på henvendelser, SEO eller GEO er sandsynlig"),
     ("lav", "Næppe en mærkbar effekt")),
    ("indsats", "indsats", "Kan idéen laves og sættes i gang på kinly.dk på under en dag?",
     ("lille", "Ja, under en dags arbejde for én person"),
     ("stor", "Nej, kræver mere end en dag, nye ydelser eller flere folk")),
    ("risiko", "risiko", "Er idéen fri for risiko for Kinlys brand og prisbillede?",
     ("lav", "Ja, ingen risiko for brand eller pris"),
     ("høj", "Nej, den kan give billig-image, løfter vi ikke kan holde eller prisforvirring")),
    ("belaeg", "belæg", "Hvor stærkt er belægget for idéen i data (`idé` og `efterspørgsel`)?",
     ("stærkt", "Konkrete tal, flere konkurrenter der gør det, eller målt efterspørgsel"),
     ("svagt", "Kun en enkelt påstand eller en fornemmelse")),
]

# ---------------------------------------------------------------- HQ

def call(payload: dict, path: str = PATH) -> dict:
    """Signeret POST (samme HMAC som crm_posts.call). Fejl → {"ok": False, "error": ...}."""
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    ts = str(int(time.time()))
    req = Request(HQ + path, data=body.encode("utf-8"), method="POST", headers={
        "Content-Type": "application/json", "X-Timestamp": ts,
        "Authorization": f"Bearer {sign(load_secret(), ts, body, path)}",
    })
    try:
        with urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode("utf-8"))
    except HTTPError as err:
        try:
            return json.loads(err.read().decode("utf-8"))
        except Exception:
            return {"ok": False, "error": f"HTTP {err.code}"}
    except Exception as err:  # netværk nede: kørslen fortsætter med næste idé
        return {"ok": False, "error": f"{err.__class__.__name__}: {err}"[:200]}


# ---------------------------------------------------------------- vurdering (Jev)

QUOTE_RE = re.compile(r"[\"“”„']([^\"“”„']{3,80})[\"“”„']")
SEO_KINDS = {"seo", "geo", "gsc", "blog"}


def seo_keyword(e: dict) -> str | None:
    """Et citeret søgeord fra en SEO-idé (fx 'Få klik på "webdesign herning"'), ellers None."""
    src = e.get("source") or {}
    text = f"{e.get('title', '')} {e.get('detail', '')}"
    if src.get("from") != "seo" and src.get("kind") not in SEO_KINDS and not re.search(r"\b(seo|google|søg\w*|title)\b", text, re.I):
        return None
    m = QUOTE_RE.search(text)
    return m.group(1).strip() if m else None


def jev_questions() -> dict:
    return {qid: {"type": "choice", "instructions": f"{q} Kinly er beskrevet i `kinly`, idéen i `idé`.",
                  "criteria": {good[0]: good[1], bad[0]: bad[1]}}
            for qid, _navn, q, good, bad in COUNCIL}


def jev_state(e: dict, demand: dict | None) -> dict:
    src = e.get("source") or {}
    state = {"kinly": KINLY, "idé": {"titel": e.get("title", ""), "detalje": e.get("detail", ""),
                                      "kilde": {k: src[k] for k in ("from", "kind", "competitor") if src.get(k)}}}
    if demand is not None:
        state["efterspørgsel"] = demand
    return state


def conf_rating(conf: float) -> int:
    """confidence 0.6-1.0 → 1-5 (samme formel som konkurrent_scan._conf_rating)."""
    return max(1, min(5, round(1 + 4 * (conf - CONF_MIN) / (1 - CONF_MIN))))


def review_from_jev(raw: dict | None, demand: dict | None) -> dict | None:
    """Jev-svar → review {scores, verdict, reason}. None = Jev svarede ikke brugbart (prøv igen i morgen)."""
    answers = (raw or {}).get("answers") or {}
    scores, got = [], {}
    for qid, navn, _q, good, bad in COUNCIL:
        ans = answers.get(qid) or {}
        choice = ans.get("choice")
        try:
            conf = float(ans.get("confidence") or 0.0)
        except (TypeError, ValueError):
            conf = 0.0
        if ans.get("type") != "choice" or choice not in (good[0], bad[0]):
            return None
        favorable = choice == good[0]
        got[qid] = (favorable, conf)
        # Prikkerne = hvor stærkt Jev bakker idéen op på aksen: godt svar → formlen (1-5),
        # dårligt eller usikkert svar (conf < 0.6) → 1. conf gemmes ved siden af.
        rating = conf_rating(conf) if favorable and conf >= CONF_MIN else 1
        scores.append({"navn": navn, "rating": rating, "conf": round(conf, 2)})

    pct = lambda qid: f"{round(got[qid][1] * 100)} %"  # noqa: E731
    sure_bad = lambda qid: not got[qid][0] and got[qid][1] >= CONF_MIN  # noqa: E731
    sure_good = lambda qid: got[qid][0] and got[qid][1] >= CONF_MIN  # noqa: E731
    demand_note = ""
    if demand is not None:
        n = demand.get("google_forslag", 0)
        demand_note = (f" Google kender ingen søgninger på “{demand['søgeord']}”." if n == 0
                       else f" {n} Google-forslag på “{demand['søgeord']}”.")
    if sure_bad("relevans"):
        return {"scores": scores, "verdict": "drop", "reason": f"Lav relevans for små lokale virksomheder ({pct('relevans')} sikker).{demand_note}"[:400]}
    if sure_bad("effekt"):
        return {"scores": scores, "verdict": "drop", "reason": f"Næppe mærkbar effekt på henvendelser eller synlighed ({pct('effekt')} sikker).{demand_note}"[:400]}
    unsure = [n for q, n in (("relevans", "relevans"), ("effekt", "effekt")) if not sure_good(q)]
    bits = [f"Jev er usikker på {' og '.join(unsure)} — en billig test afgør det." if unsure else "Relevant og med sandsynlig effekt."]
    if sure_good("indsats"):
        bits.append("Kan laves på under en dag.")
    elif sure_bad("indsats"):
        bits.append("Kræver mere end en dag — lav en mindre udgave.")
    if sure_bad("risiko"):
        bits.append("Pas på brand/pris.")
    if sure_bad("belaeg"):
        bits.append("Svagt belæg.")
    return {"scores": scores, "verdict": "test", "reason": (" ".join(bits) + demand_note)[:400]}


def measure_demand(keyword: str | None, get=kundespoergsmaal.get_questions) -> dict | None:
    if not keyword:
        return None
    qs = get(keyword, 10).get("questions", [])
    return {"søgeord": keyword, "google_forslag": len(qs), "eksempler": qs[:5]}


# ---------------------------------------------------------------- plan (council-agenten, gpt-6-sol)

def parse_plan(text: str, geo_queries: list[str], reachable=None) -> dict:
    """Agentens plan-JSON → plan. Ugyldig/uverificerbar metrik falder tilbage til manuel (planen overlever)."""
    m = re.search(r"\{.*\}", text or "", re.S)
    if not m:
        raise ValueError("intet JSON i svaret")
    p = json.loads(m.group(0))
    out = {k: str(p.get(k) or "").strip() for k in ("hypothesis", "change", "success")}
    if not all(out.values()):
        raise ValueError("hypothesis/change/success mangler")
    metric = p.get("metric") if isinstance(p.get("metric"), dict) else {}
    mtype, target = str(metric.get("type") or ""), str(metric.get("target") or "").strip()
    if mtype == "gsc_page":
        ok = re.match(r"^https://(www\.)?kinly\.dk(/\S*)?$", target, re.I) and (reachable is None or reachable(target) is None)
        if not ok:
            mtype = "manuel"
    elif mtype == "gsc_query":
        if not target:
            mtype = "manuel"
    elif mtype == "geo":
        match = next((q for q in geo_queries if q.strip().lower() == target.lower()), None)
        mtype, target = ("geo", match) if match else ("manuel", "")
    else:
        mtype = "manuel"
    if mtype == "manuel":
        target = ""
    plan = {"hypothesis": out["hypothesis"][:400], "change": out["change"][:600],
            "metric": {"type": mtype, "target": target[:300]}, "days": TEST_DAYS, "success": out["success"][:300]}
    council = p.get("council") if isinstance(p.get("council"), dict) else {}
    notes = [str(n).strip()[:240] for n in (council.get("notes") or []) if str(n).strip()][:6]
    if notes:
        plan["council"] = {"model": str(council.get("model") or "gpt-6-sol")[:40], "notes": notes}
    return plan


def council_queue(items: list[dict]) -> list[dict]:
    """Idéer Jev sagde "test" til, som endnu ingen plan har — dem skal council-agenten tage."""
    return [e for e in items if e.get("status") == "vurderes" and (e.get("review") or {}).get("verdict") == "test" and not e.get("plan")]


def trigger_council() -> None:
    """Start agent-jobbet i baggrunden (samme mønster som blog_trigger)."""
    if COUNCIL_JOB_ID:
        import subprocess
        subprocess.Popen(["hermes", "cron", "run", COUNCIL_JOB_ID], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)


# ---------------------------------------------------------------- måling (ingen LLM)

def parse_ts(s: str) -> datetime:
    """ISO med Z eller +02:00 → aware datetime (strenge med forskellige offsets kan ikke sammenlignes som tekst)."""
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def windows(started_at: str) -> tuple[tuple[str, str], tuple[str, str]]:
    """(baseline, resultat): TEST_DAYS dage der allerede er endelige i GSC før start, og TEST_DAYS dage fra start."""
    s = parse_ts(started_at).date()
    base = (s - timedelta(days=GSC_LAG_DAYS + TEST_DAYS), s - timedelta(days=GSC_LAG_DAYS + 1))
    res = (s, s + timedelta(days=TEST_DAYS - 1))
    return (base[0].isoformat(), base[1].isoformat()), (res[0].isoformat(), res[1].isoformat())


def fmt_pos(p) -> str:
    return "—" if p is None else f"{p:.1f}".replace(".", ",")


def compare_gsc(before: dict, after: dict) -> tuple[str, str]:
    """Ren tal-sammenligning → (behold|drop|uklart, dansk opsummering).
    ponytail: grov regel (klik ±20 % og mindst 1, visninger ±20 % og mindst 10, position ±1) — Kinlys
    ugevolumen er lille, så "uklart" er et ærligt og hyppigt svar; Lucas afgør alligevel."""
    if before.get("note") or after.get("note"):
        return "uklart", f"Kunne ikke måles: {after.get('note') or before.get('note')}"
    better = worse = 0
    c0, c1 = before.get("clicks", 0), after.get("clicks", 0)
    i0, i1 = before.get("impressions", 0), after.get("impressions", 0)
    p0, p1 = before.get("position"), after.get("position")
    if abs(c1 - c0) >= max(1, 0.2 * c0):
        better += c1 > c0
        worse += c1 < c0
    if abs(i1 - i0) >= max(10, 0.2 * i0):
        better += i1 > i0
        worse += i1 < i0
    if p0 is not None and p1 is not None and abs(p1 - p0) >= 1:
        better += p1 < p0
        worse += p1 > p0
    verdict = "behold" if better >= 2 and not worse else "drop" if worse >= 2 and not better else "uklart"
    summary = f"Klik {c0} → {c1}, visninger {i0} → {i1}, position {fmt_pos(p0)} → {fmt_pos(p1)} ({TEST_DAYS} dage mod de {TEST_DAYS} dage før)."
    tail = {"behold": " Tallene peger op.", "drop": " Tallene peger ned.", "uklart": " For lidt forskel til at sige noget sikkert."}
    return verdict, summary + tail[verdict]


def compare_geo(before: dict, after: dict, query: str) -> tuple[str, str]:
    if before.get("note") or after.get("note"):
        return "uklart", f"Kunne ikke måles: {after.get('note') or before.get('note')}"
    b, a = before.get("mentioned"), after.get("mentioned")
    if not b and a:
        return "behold", f"AI nævner nu Kinly på “{query}” (gjorde ikke før)."
    if b and not a:
        return "drop", f"AI nævnte Kinly på “{query}” før, men ikke længere."
    return "uklart", f"Uændret: AI {'nævner' if a else 'nævner ikke'} Kinly på “{query}”."


def copenhagen_today() -> str:
    try:
        from zoneinfo import ZoneInfo
        return datetime.now(ZoneInfo("Europe/Copenhagen")).date().isoformat()
    except Exception:
        return datetime.now(timezone.utc).date().isoformat()


def measure(metric: dict, window: tuple[str, str] | None, post=call) -> dict:
    payload = {"action": "measure", "metric": metric}
    if window and metric["type"] != "geo":
        payload.update(start=window[0], end=window[1])
    r = post(payload)
    if not r.get("ok"):
        raise RuntimeError(f"måling fejlede: {r.get('error')}")
    return r["measurement"]


# ---------------------------------------------------------------- kørsel

class Runner:
    """Al I/O er udskiftelig, så testene kører uden netværk."""

    def __init__(self, dry_run=False, post=call, jev=jev_lib.ask, demand_get=kundespoergsmaal.get_questions,
                 reachable=None, now=None, log=print):
        self.dry, self.post, self.jev, self.demand_get = dry_run, post, jev, demand_get
        self.reachable, self.log = reachable, log
        self.now = now or datetime.now(timezone.utc)
        self.stats = {"jev": 0, "council": 0, "droppet": 0, "klar": 0, "baseline": 0, "resultat": 0, "opgaver": 0}

    def write(self, payload: dict, path: str = PATH) -> dict:
        if self.dry:
            self.log(f"  [dry-run] {path} {json.dumps(payload, ensure_ascii=False)[:300]}")
            return {"ok": True, "experiment": {}}
        r = self.post(payload, path)
        if not r.get("ok"):
            self.log(f"  FEJL {payload.get('action')}: {r.get('error')}")
        return r

    def assess(self, e: dict, geo_queries: list[str]) -> None:
        review = e.get("review")
        demand = measure_demand(seo_keyword(e), self.demand_get)
        if not review:
            self.stats["jev"] += 1
            review = review_from_jev(self.jev(jev_state(e, demand), jev_questions()), demand)
            if review is None:
                self.log("  Jev svarede ikke brugbart — prøver igen i morgen")
                return
            if not self.write({"action": "review", "id": e["id"], "review": review}).get("ok"):
                return
            if review["verdict"] == "drop":
                self.stats["droppet"] += 1
                self.log(f"  droppet: {review['reason']}")
                return
        if review.get("verdict") == "test":
            self.log("  → council-kø (Hermes-agenten laver testplanen)")

    def follow(self, e: dict) -> None:
        test, plan = e.get("test") or {}, e.get("plan") or {}
        metric = plan.get("metric") or {"type": "manuel", "target": ""}
        base_w, res_w = windows(test["startedAt"])
        baseline = test.get("baseline")
        if not baseline:
            baseline = ({"at": self.now.isoformat(), "note": "manuel test — ingen automatisk måling"} if metric["type"] == "manuel"
                        else measure(metric, base_w, self.post))
            if not self.write({"action": "baseline", "id": e["id"], "baseline": baseline}).get("ok"):
                return
            self.stats["baseline"] += 1
            self.log("  baseline gemt")

        ends = parse_ts(test["endsAt"])
        lag = timedelta(days=GSC_LAG_DAYS if metric["type"].startswith("gsc") else 0)
        if self.now < ends + lag:
            return
        if metric["type"] == "manuel":
            result, (verdict, summary) = None, ("uklart", f"De {TEST_DAYS} dage er gået. Mål selv: {plan.get('success') or 'virkede det?'}")
        elif metric["type"] == "geo":
            result = measure(metric, None, self.post)
            fresh = not result.get("note") and parse_ts(result["at"]) >= parse_ts(test["startedAt"])
            if not fresh and self.now < ends + timedelta(days=GEO_GRACE_DAYS):
                return  # vent på næste mandags AI-måling
            if not fresh:
                result = {"at": self.now.isoformat(), "note": result.get("note") or "ingen ny AI-måling efter start"}
            verdict, summary = compare_geo(baseline, result, metric["target"])
        else:
            result = measure(metric, res_w, self.post)
            verdict, summary = compare_gsc(baseline, result)
        payload = {"action": "result", "id": e["id"], "outcome": {"verdict": verdict, "summary": summary[:500]}}
        if result:
            payload["result"] = result
        if not self.write(payload).get("ok"):
            return
        self.stats["resultat"] += 1
        self.log(f"  resultat: {verdict} — {summary}")
        task = {"actor": "lucas", "action": "create", "owner": "lucas", "due": copenhagen_today(),
                "title": f"Test færdig: {e['title']} — behold eller drop?"[:200]}
        if self.write(task, TASKS_PATH).get("ok"):
            self.stats["opgaver"] += 1

    def run(self, limit: int = 10) -> dict:
        r = self.post({"action": "list"}, PATH)
        if not r.get("ok"):
            raise SystemExit(f"HQ svarede ikke: {r.get('error')}")
        geo_queries = r.get("geoQueries") or []
        items = r.get("experiments") or []
        todo = [e for e in items if e.get("status") == "vurderes"][:limit]
        for e in todo:
            self.log(f"vurderer: {e['title']}")
            self.assess(e, geo_queries)
        if todo:  # hent igen: nye Jev-reviews er gemt i HQ
            items = (self.post({"action": "list"}, PATH).get("experiments") or items) if not self.dry else items
        queue = council_queue(items)
        if queue:
            self.stats["council"] = len(queue)
            self.log(f"council-kø: {len(queue)} idé(er) → starter Hermes-agenten")
            if not self.dry:
                trigger_council()
        for e in (e for e in items if e.get("status") == "tester"):
            self.log(f"tester: {e['title']}")
            try:
                self.follow(e)
            except Exception as err:  # én fejlende måling stopper ikke de andre
                self.log(f"  FEJL: {str(err)[:200]}")
        self.log(json.dumps(self.stats, ensure_ascii=False))
        return self.stats


def _selftest() -> None:
    assert conf_rating(0.6) == 1 and conf_rating(1.0) == 5 and conf_rating(0.8) == 3
    assert seo_keyword({"title": 'Få klik på "webdesign herning"', "source": {"from": "seo", "kind": "gsc"}}) == "webdesign herning"
    assert seo_keyword({"title": "Tilbyd logo-pakke", "detail": "3 bureauer gør det", "source": {"from": "konkurrent", "kind": "ydelse"}}) is None
    assert windows("2026-09-28T08:00:00Z") == (("2026-09-11", "2026-09-24"), ("2026-09-28", "2026-10-11"))
    assert compare_gsc({"clicks": 2, "impressions": 80, "position": 9.1}, {"clicks": 5, "impressions": 120, "position": 7.4})[0] == "behold"
    assert compare_gsc({"clicks": 5, "impressions": 120, "position": 7.0}, {"clicks": 1, "impressions": 60, "position": 7.2})[0] == "drop"
    assert compare_gsc({"clicks": 1, "impressions": 40, "position": 12}, {"clicks": 1, "impressions": 44, "position": 11.6})[0] == "uklart"
    assert compare_geo({"mentioned": False}, {"mentioned": True}, "q")[0] == "behold"
    p = parse_plan('{"hypothesis":"h","change":"c","metric":{"type":"geo","target":"WEBBUREAU HERNING"},"success":"s"}', ["webbureau herning"])
    assert p["metric"] == {"type": "geo", "target": "webbureau herning"} and p["days"] == TEST_DAYS
    assert parse_plan('{"hypothesis":"h","change":"c","metric":{"type":"gsc_page","target":"https://evil.dk"},"success":"s"}', [])["metric"]["type"] == "manuel"
    print("eksperimenter selftest ok")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--limit", type=int, default=10, help="maks idéer der vurderes pr. kørsel (Jev-loft)")
    ap.add_argument("--queue", action="store_true", help="council-agenten: print idéer der mangler testplan (JSON)")
    ap.add_argument("--plan", metavar="ID", help="council-agenten: gem testplan for ID (plan-JSON fra --file)")
    ap.add_argument("--drop", metavar="ID", help="council-agenten: afvis ID med --reason")
    ap.add_argument("--file", help="fil med plan-JSON")
    ap.add_argument("--reason", default="")
    a = ap.parse_args()
    if a.selftest:
        _selftest()
        return 0
    if a.queue:
        r = call({"action": "list"})
        if not r.get("ok"):
            raise SystemExit(f"HQ svarede ikke: {r.get('error')}")
        q = [{k: e.get(k) for k in ("id", "title", "detail", "source", "review")} for e in council_queue(r.get("experiments") or [])]
        print(json.dumps({"ideer": q, "geoQueries": r.get("geoQueries") or []}, ensure_ascii=False, indent=1))
        return 0
    if a.plan:
        from crm_posts import reachable
        geo = call({"action": "list"}).get("geoQueries") or []
        plan = parse_plan(Path(a.file).read_text(encoding="utf-8"), geo, reachable)
        r = call({"action": "plan", "id": a.plan, "plan": plan})
        print(json.dumps(r, ensure_ascii=False)[:400])
        return 0 if r.get("ok") else 1
    if a.drop:
        r = call({"action": "councilDrop", "id": a.drop, "reason": a.reason[:400]})
        print(json.dumps(r, ensure_ascii=False)[:400])
        return 0 if r.get("ok") else 1
    from crm_posts import reachable
    Runner(dry_run=a.dry_run, reachable=reachable).run(a.limit)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
