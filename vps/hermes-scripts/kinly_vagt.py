#!/usr/bin/env python3
"""kinly_vagt.py — timelig vagt over alle Hermes-jobs. Skrevet af Claude 26/9.

Token-trappe (Lucas 26/9: "hvis der ikke er noget væsentligt, bruger vi ikke tokens"):
  1. Gratis: læs cron/jobs.json. Ingen NYE fejl eller forsinkede jobs → stop (0 Jev, 0 LLM).
  2. Jev (billig, 0 LLM-tokens): er den nye hændelse væsentlig for et menneske?
  3. Kun hvis Jev siger ja: ét kort DeepSeek-kald skriver diagnose + næste skridt,
     og der oprettes en opgave til Lucas i HQ (lander også i hans kalender).

Kør: python3 kinly_vagt.py [--dry-run] | --selftest
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

HERMES = Path("/root/.hermes")
JOBS = HERMES / "cron" / "jobs.json"
OUTPUT = HERMES / "cron" / "output"
STATE = HERMES / "state" / "kinly-vagt.json"
SELF_NAME = "kinly-vagt"
MAX_EVENTS = 5          # pr. time — flere nye fejl på én gang = samme rodårsag; resten tages næste time
FRESH = timedelta(hours=48)
OVERDUE = timedelta(hours=2)
SEEN_KEEP = 500

QUESTIONS = {
    "vaesentlig": {
        "type": "choice",
        "instructions": "Et automatisk job hos Kinly (lille webbureau) er fejlet eller forsinket, se `haendelse`. Kræver det at et menneske handler?",
        "criteria": {
            "ja": "Ja: data eller leads går tabt, kunder/mails/fakturaer/udgivelser påvirkes, eller jobbet giver ingen værdi før nogen retter det",
            "nej": "Nej: midlertidig netværks- eller API-fejl der typisk løser sig ved næste kørsel, forventet adfærd, eller ubetydeligt",
        },
    },
}

DIAG_PROMPT = ("Et Hermes-cron-job hos Kinly fejler. Ud fra fejlen og output-halen: skriv på dansk ÉN linje (max 150 tegn) "
               "med sandsynlig årsag og næste skridt. Gæt ikke ud over dataene. Kun linjen, ingen indledning.")


def _dt(v):
    try:
        return datetime.fromisoformat(v) if v else None
    except (TypeError, ValueError):
        return None


def find_events(jobs: list[dict], now: datetime, seen: set[str]) -> list[dict]:
    """Nye fejl (inden for 48 t) og jobs der er >2 t forsinkede. Gratis — ingen netværk."""
    out = []
    for j in jobs:
        if not j.get("enabled", True) or j.get("paused_at") or j.get("name") == SELF_NAME:
            continue
        sched = j.get("schedule") or {}
        if isinstance(sched, dict) and sched.get("kind") == "once":
            continue
        last = _dt(j.get("last_run_at"))
        if j.get("last_status") not in (None, "ok") and last and now - last <= FRESH:
            key = f"{j['id']}:fejl:{j.get('last_run_at')}"
            if key not in seen:
                out.append({"key": key, "job": j, "kind": "fejl"})
        nxt = _dt(j.get("next_run_at"))
        if nxt and now - nxt > OVERDUE:
            key = f"{j['id']}:forsinket:{j.get('next_run_at')}"
            if key not in seen:
                out.append({"key": key, "job": j, "kind": "forsinket"})
    return out


def output_tail(job_id: str, chars: int = 1500) -> str:
    d = OUTPUT / job_id
    try:
        newest = max(d.iterdir(), key=lambda p: p.stat().st_mtime)
        return newest.read_text(encoding="utf-8", errors="replace")[-chars:]
    except (OSError, ValueError):
        return ""


def jev_state(ev: dict) -> dict:
    j = ev["job"]
    return {"haendelse": {
        "job": j.get("name"), "type": ev["kind"], "plan": j.get("schedule_display"),
        "status": j.get("last_status"), "fejl_i_traek": j.get("failure_streak"),
        "fejl": (j.get("last_error") or "")[:800], "output_hale": output_tail(j["id"]) if ev["kind"] == "fejl" else "",
        "naeste_koersel_skulle_vaere": j.get("next_run_at") if ev["kind"] == "forsinket" else "",
    }}


def is_important(raw: dict | None, ev: dict) -> bool:
    """Jev-svar → ja/nej. Jev nede: kun væsentlig hvis jobbet har fejlet ≥2 gange i træk (eller er forsinket)."""
    try:
        ans = raw["answers"]["vaesentlig"]
        return ans["choice"] == "ja" and float(ans.get("confidence", 1)) >= 0.55
    except (TypeError, KeyError, ValueError):
        return ev["kind"] == "forsinket" or int(ev["job"].get("failure_streak") or 0) >= 2


def diagnose(state: dict) -> str:
    import konkurrent_analyse  # genbruger nøgle-indlæsning; ét kort kald
    from urllib.request import Request, urlopen
    # max_tokens 500: modellen tænker før den svarer; for lavt loft = tom linje.
    body = json.dumps({"model": konkurrent_analyse.MODEL, "max_tokens": 900, "temperature": 0.2, **konkurrent_analyse.NO_THINKING, "messages": [
        {"role": "system", "content": DIAG_PROMPT},
        {"role": "user", "content": json.dumps(state, ensure_ascii=False)[:3000]}]}).encode()
    req = Request(konkurrent_analyse.URL, data=body, method="POST",
                  headers={"Content-Type": "application/json", "Authorization": f"Bearer {konkurrent_analyse.load_key()}"})
    with urlopen(req, timeout=60) as res:
        data = json.loads(res.read().decode())
    line = " ".join((data["choices"][0]["message"].get("content") or "").split())[:150]
    if not line:
        raise ValueError("tomt svar")
    return line


def task_title(ev: dict, diag: str) -> str:
    what = "fejler" if ev["kind"] == "fejl" else "kører ikke"
    return f"Hermes-job {ev['job'].get('name')} {what}: {diag}"[:200]


def run(dry_run: bool) -> int:
    import jev_lib
    import crm_tasks
    now = datetime.now(timezone.utc)
    state = jev_lib.load_json(STATE, {"seen": []})
    seen = set(state.get("seen", []))
    jobs = json.loads(JOBS.read_text(encoding="utf-8"))["jobs"]
    events = find_events(jobs, now, seen)[:MAX_EVENTS]
    if not events:
        print("vagt: intet nyt (0 Jev, 0 LLM)")
        return 0
    jev_calls = llm_calls = tasks = 0
    for ev in events:
        st = jev_state(ev)
        raw = jev_lib.ask(st, QUESTIONS)
        jev_calls += 1
        important = is_important(raw, ev)
        print(f"vagt: {ev['key']} → {'VÆSENTLIG' if important else 'ignoreret'}")
        if important:
            try:
                diag = diagnose(st)
                llm_calls += 1
            except Exception as exc:  # noqa: BLE001
                diag = (ev["job"].get("last_error") or "se cron-output")[:120].replace("\n", " ")
                print(f"vagt: diagnose sprunget over ({exc})")
            title = task_title(ev, diag)
            if dry_run:
                print(f"[DRY-RUN] opgave: {title}")
            else:
                resp = crm_tasks.call(crm_tasks.payload_create("lucas", title, owner="lucas", due=now.astimezone().date().isoformat()))
                if not resp.get("ok"):
                    print(f"vagt: HQ-opgave fejlede {resp}; prøver igen næste time")
                    continue  # ikke markeret set → næste time forsøger igen
                tasks += 1
        seen.add(ev["key"])
    if not dry_run:
        jev_lib.atomic_write_json(STATE, {"seen": list(seen)[-SEEN_KEEP:], "last": now.isoformat()})
    print(f"vagt: {len(events)} hændelser, {jev_calls} Jev, {llm_calls} LLM, {tasks} opgaver")
    return 0


def _selftest() -> None:
    now = datetime(2026, 9, 27, 12, tzinfo=timezone.utc)
    iso = lambda h: (now - timedelta(hours=h)).isoformat()  # noqa: E731
    jobs = [
        {"id": "a", "name": "ok-job", "last_status": "ok", "last_run_at": iso(1), "next_run_at": iso(-1)},
        {"id": "b", "name": "fejl-ny", "last_status": "error", "last_run_at": iso(3), "next_run_at": iso(-20)},
        {"id": "c", "name": "fejl-gammel", "last_status": "error", "last_run_at": iso(100), "next_run_at": iso(-50)},
        {"id": "d", "name": "forsinket", "last_status": "ok", "last_run_at": iso(30), "next_run_at": iso(5)},
        {"id": "e", "name": "pauset", "last_status": "error", "last_run_at": iso(1), "paused_at": iso(1)},
        {"id": "f", "name": SELF_NAME, "last_status": "error", "last_run_at": iso(1)},
        {"id": "g", "name": "engang", "last_status": "ok", "next_run_at": iso(10), "schedule": {"kind": "once"}},
    ]
    ev = find_events(jobs, now, set())
    assert [(e["job"]["id"], e["kind"]) for e in ev] == [("b", "fejl"), ("d", "forsinket")], ev
    assert find_events(jobs, now, {e["key"] for e in ev}) == []  # set én gang = ikke igen
    yes = {"answers": {"vaesentlig": {"type": "choice", "choice": "ja", "confidence": 0.8}}}
    no = {"answers": {"vaesentlig": {"type": "choice", "choice": "nej", "confidence": 0.9}}}
    assert is_important(yes, ev[0]) and not is_important(no, ev[0])
    assert not is_important(None, {"kind": "fejl", "job": {"failure_streak": 1}})
    assert is_important(None, {"kind": "fejl", "job": {"failure_streak": 2}})
    assert len(task_title(ev[0], "x" * 300)) == 200
    print("selftest ok")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        _selftest()
    else:
        sys.exit(run(a.dry_run))
