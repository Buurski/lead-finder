#!/usr/bin/env python3
"""Annonce-tests (HQ: Marketing → Annonce-studie) — dagligt no_agent-job, 0 LLM-tokens. Skrevet af Claude 16/10.

Læser /api/agent/annoncer (HMAC, kun GET) og skriver en kort dansk besked, når der er noget at gøre:
  - en annonce har ramt en stopregel (600 kr uden henvendelser / 1.200 kr med højst én) → sæt på pause i Meta
  - en test har en sikker fører
  - der er ikke skrevet tal ind i over 7 dage
  - der ligger nye bestillinger på varianter
Tavs (tom stdout), når beskeden er den samme som sidst (signal-porten: uændret output = intet sendes).

Scriptet ændrer ALDRIG noget i Meta eller i HQ. Det kan ikke se Meta. Tallene kommer fra det Lucas/Charlie taster i HQ.

  annonce_tests.py             # rigtig kørsel (cron)
  annonce_tests.py --vis       # vis altid (skill meta-annoncer), uden at røre signal-porten
  annonce_tests.py --selftest  # offline
Miljø: KINLY_HQ_URL (standard: prod), HERMES_API_SECRET (eller creds-filen, via crm_agent_log.load_secret).
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import sys
import time
from datetime import date
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from crm_agent_log import load_secret  # noqa: E402

HQ = os.environ.get("KINLY_HQ_URL", "https://lead-finder-three-beta.vercel.app").rstrip("/")
PATH = "/api/agent/annoncer"
STATE = Path(os.environ.get("HERMES_HOME", "/root/.hermes")) / "cron-data" / "annonce_tests.json"
GLEMT_DAGE = 7


def hent() -> dict:
    ts = str(int(time.time()))
    sig = hmac.new(load_secret().encode(), f"{ts}.GET.{PATH}.".encode(), hashlib.sha256).hexdigest()
    req = Request(HQ + PATH, method="GET", headers={"X-Timestamp": ts, "Authorization": f"Bearer {sig}"})
    with urlopen(req, timeout=60) as res:
        return json.loads(res.read().decode("utf-8"))


def kr(n: float) -> str:
    return f"{round(n):,} kr".replace(",", ".")


def besked(o: dict, idag: date) -> str:
    """Oversigten → besked. Tom streng = intet at sige."""
    linjer: list[str] = []
    for t in o.get("tests", []):
        if t.get("status") != "kører":
            continue
        punkter = [f"⏸ {a['navn']}: {a['stop']}" for a in t.get("arme", []) if a.get("stop")]
        if t.get("sikker") and t.get("foerer"):
            fører = next((a["navn"] for a in t["arme"] if a["slug"] == t["foerer"]), t["foerer"])
            punkter.append(f"🏁 Sikker fører: {fører}. Overvej at afslutte testen i HQ.")
        sidst = t.get("sidstIndtastet")
        dage = (idag - date.fromisoformat(sidst or t["start"])).days
        if dage > GLEMT_DAGE:
            punkter.append(f"📝 Ingen tal skrevet ind i {dage} dage. Skriv ugens tal ind fra Ads Manager.")
        if punkter:
            brugt = sum(a.get("forbrug", 0) for a in t.get("arme", []))
            leads = sum(a.get("leads", 0) for a in t.get("arme", []))
            linjer.append(f"Test \"{t['navn']}\" ({kr(brugt)} brugt, {leads} henvendelser)")
            linjer += [f"  {p}" for p in punkter]
    nye = o.get("bestillinger", [])
    if nye:
        linjer.append(f"🧩 {len(nye)} bestilling{'er' if len(nye) != 1 else ''} på nye annonce-varianter venter. Bed Claude Code lave dem.")
    if not linjer:
        return ""
    return "Annonce-studie\n" + "\n".join(linjer) + "\nHQ → Marketing → Annoncer. Intet er ændret i Meta."


def kun_nyt(tekst: str, state: Path = STATE) -> str:
    """Signal-port: samme besked som sidst → tom. Gemmer hash af den nye."""
    h = hashlib.sha256(tekst.encode()).hexdigest()
    try:
        gammel = json.loads(state.read_text()).get("hash")
    except (OSError, ValueError):
        gammel = None
    if h == gammel:
        return ""
    state.parent.mkdir(parents=True, exist_ok=True)
    state.write_text(json.dumps({"hash": h, "at": int(time.time())}))
    return tekst


def selftest() -> None:
    import tempfile
    o = {"tests": [{"navn": "Hånd mod pris", "status": "kører", "start": "2026-10-01", "sidstIndtastet": "2026-10-05", "sikker": True, "foerer": "b",
                    "arme": [{"slug": "a", "navn": "Hånd · Priser", "forbrug": 650, "leads": 0, "stop": "Har brugt 650 kr uden en eneste henvendelse: sæt den på pause."},
                             {"slug": "b", "navn": "Pris · Priser", "forbrug": 640, "leads": 7, "stop": None}]},
                   {"navn": "Gammel", "status": "afsluttet", "start": "2026-09-01", "arme": []}],
         "bestillinger": [{"id": "x"}]}
    b = besked(o, date(2026, 10, 16))
    assert "⏸ Hånd · Priser" in b and "Sikker fører: Pris · Priser" in b and "11 dage" in b and "1 bestilling " in b and "Gammel" not in b, b
    assert "1.290 kr brugt, 7 henvendelser" in b, b
    assert besked({"tests": [], "bestillinger": []}, date(2026, 10, 16)) == ""
    stille = {"tests": [{"navn": "T", "status": "kører", "start": "2026-10-14", "sidstIndtastet": None, "sikker": False, "foerer": None, "arme": [{"slug": "a", "navn": "A", "forbrug": 100, "leads": 0, "stop": None}]}], "bestillinger": []}
    assert besked(stille, date(2026, 10, 16)) == "", "ung test uden stop skal være tavs"
    with tempfile.TemporaryDirectory() as d:
        s = Path(d) / "s.json"
        assert kun_nyt(b, s) == b and kun_nyt(b, s) == "" and kun_nyt(b + "x", s) == b + "x"
    print("selftest ok")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--vis", action="store_true")
    args = ap.parse_args()
    if args.selftest:
        return selftest()
    o = hent()
    if not o.get("ok"):
        print(f"Annonce-studie: HQ svarede ikke ({o.get('error', 'ukendt fejl')}).")
        return
    b = besked(o, date.today())
    if args.vis:
        print(b or f"Annonce-studie: intet at gøre. {len(o.get('godkendte', []))} godkendte annoncer, ingen stopregler ramt.")
        return
    tekst = kun_nyt(b)
    if tekst:
        print(tekst)


if __name__ == "__main__":
    main()
