#!/usr/bin/env python3
"""Starter Hermes' blog-skriver, når Lucas har trukket et kort til Arbejder i HQ.

Kører hvert 5. minut som no-agent-job (0 tokens): spørger HQ om kort der venter
(`crm_posts queue`) og beder Hermes' scheduler køre blog-drafter-nat ved næste tick
(`hermes cron run <id>`). Selve skrivningen (agent) tager kortet med `claim`.

Tempo (Lucas 27/9): ÉT indlæg ad gangen, ét nyt pr. hverdag = 5 om ugen — få, gode
indlæg; hver kørsel er et agent-run (6-8 mio. tokens). Lucas' rettelser (work.instructions)
går uden om loftet og tæller ikke med i det. HQ viser forventet dag ud fra samme regel
(expectedDay i src/components/blog/blog-utils.ts).
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crm_posts  # noqa: E402

BLOG_JOB_ID = "fc9f43db4b74"  # blog-drafter-nat
STATE = Path("/root/.hermes/state/blog-trigger.json")
CLAIM_GRACE = 10 * 60  # en netop startet kørsel når at claime sit kort (tager ~4 min), før næste startes
DAY = 86400
TZ = ZoneInfo("Europe/Copenhagen")


def pick(cards: list[dict], running: int, starts: list[float], now: float, last: float = 0) -> dict | None:
    """Det kort der skal startes nu, eller None. Køen er allerede ældste-først fra HQ.
    `starts` = nye indlæg (tæller mod loftet), `last` = seneste start af enhver slags."""
    if not cards or running > 0:
        return None
    if now - max(starts + [last]) < CLAIM_GRACE:
        return None
    # Lucas' besked til Hermes (rettelse fra gennemlæsning) går uden om loftet —
    # "med det samme" (27/9). HQ sorterer dem forrest i køen.
    if ((cards[0].get("work") or {}).get("instructions")):
        return cards[0]
    today = datetime.fromtimestamp(now, TZ).date()
    if today.weekday() >= 5 or any(datetime.fromtimestamp(s, TZ).date() == today for s in starts):
        return None
    return cards[0]


def load_state() -> tuple[list[float], float]:
    try:
        data = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return [], 0.0
    # Gammelt format var {kort-id: tidspunkt}; værdierne er stadig starttidspunkter.
    raw = data.get("starts", []) if isinstance(data, dict) and "starts" in data else list(data.values()) if isinstance(data, dict) else []
    starts = [float(s) for s in raw]
    return starts, float(data.get("last", max(starts, default=0.0))) if isinstance(data, dict) else 0.0


PUB_STATE = Path("/root/.hermes/state/blog-publish-dispatch.json")
PUB_GAP = 30 * 60  # et udgiver-run tager 5-15 min inkl. Vercel; vent før næste forsøg
PUB_MAX = 4  # pr. kort — et kort der ikke kan udgives (fx forældet faktatjek) må ikke starte runs i det uendelige
WORKFLOW = "https://api.github.com/repos/Buurski/kinly-site/actions/workflows/blog-publish.yml/dispatches"


def due_publish(ids: list[str], log: dict, now: float) -> bool:
    """Skal udgiveren startes nu? Ja når et kort i Publicer ikke er forsøgt for nylig og har forsøg tilbage."""
    return any(len(log.get(i, [])) < PUB_MAX and now - max(log.get(i, [0])) >= PUB_GAP for i in ids)


def github_token() -> str:
    tok = ""
    for line in Path("/root/.hermes/credentials.env").read_text(encoding="utf-8").splitlines():
        if line.startswith("GITHUB_TOKEN="):
            tok = line.split("=", 1)[1].strip().strip("\"'")  # sidste linje vinder, som i sync_kinly_site.py
    return tok


def publish_now(now: float) -> None:
    """Kort i Publicer udgives med det samme i stedet for at vente på GitHubs timer (der i praksis
    springer kørsler over og forsinker 1-3 t). Timeren i blog-publish.yml bliver som reserve."""
    data = crm_posts.call({"action": "list", "stage": "publicer"})
    ids = [str(p.get("id")) for p in (data.get("cards") or []) if p.get("id")]
    try:
        log = json.loads(PUB_STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        log = {}
    log = {i: v for i, v in log.items() if i in ids}  # udgivne/flyttede kort glemmes
    if ids and due_publish(ids, log, now):
        import urllib.request
        req = urllib.request.Request(WORKFLOW, data=b'{"ref":"main"}', method="POST", headers={
            "Authorization": f"token {github_token()}", "Accept": "application/vnd.github+json", "User-Agent": "hermes-blog-trigger"})
        urllib.request.urlopen(req, timeout=20)  # 204; fejl rejses og ses i cron-loggen
        for i in ids:
            log.setdefault(i, []).append(now)
        print(f"blog-trigger: startede udgiveren for {len(ids)} kort i Publicer")
    PUB_STATE.parent.mkdir(parents=True, exist_ok=True)
    PUB_STATE.write_text(json.dumps(log), encoding="utf-8")


def main() -> None:
    try:
        publish_now(time.time())
    except Exception as e:  # udgiveren må ikke stoppe skrive-køen; fejlen står i cron-output
        print(f"blog-trigger: kunne ikke starte udgiveren: {e}")
    data = crm_posts.call({"action": "queue"})
    if not data.get("ok"):
        print(f"blog-trigger: HQ-fejl {data.get('error')}")
        sys.exit(1)
    now = time.time()
    starts, last = load_state()
    card = pick(data.get("cards") or [], int(data.get("running") or 0), starts, now, last)
    if not card:
        return
    # Gem starten FØR kaldet: `hermes cron run` kan blokere >60 s når det kaldes inde fra
    # schedulerens tick (27/9 crashede triggeren på timeout efter at kørslen var sat i gang,
    # så døgnloftet aldrig blev talt op). Kaldet løsrives og ventes ikke på.
    starts = [s for s in starts if now - s < 7 * DAY]
    if not (card.get("work") or {}).get("instructions"):
        starts.append(now)  # kun nye indlæg tæller mod loftet
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({"starts": starts, "last": now}), encoding="utf-8")
    subprocess.Popen(["hermes", "cron", "run", BLOG_JOB_ID], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    print(f"blog-trigger: satte Hermes i gang med '{card.get('title')}'")


def _selftest() -> None:
    a, b = {"id": "a"}, {"id": "b"}
    ts = lambda s: datetime.fromisoformat(s).replace(tzinfo=TZ).timestamp()  # noqa: E731
    mon, sun = ts("2026-09-28T14:00"), ts("2026-09-27T14:00")
    assert pick([a, b], 0, [], mon) == a
    assert pick([], 0, [], mon) is None
    assert pick([a], 1, [], mon) is None, "kører allerede ét"
    assert pick([a], 0, [], mon, mon - 60) is None, "netop startet — vent på claim"
    assert pick([a], 0, [ts("2026-09-28T02:00")], mon) is None, "dagens ene indlæg er startet"
    assert pick([a], 0, [ts("2026-09-27T23:00")], mon) == a, "loftet følger dansk dato"
    assert pick([a], 0, [], sun) is None, "ingen nye indlæg i weekenden"
    c = {"id": "c", "work": {"instructions": "nyt billede B"}}
    assert pick([c], 0, [ts("2026-09-28T02:00")], mon) == c, "besked fra Lucas går uden om loftet"
    assert pick([c], 0, [], sun) == c, "også i weekenden"
    assert pick([c], 1, [], mon) is None, "men stadig ét ad gangen"
    now = mon
    assert due_publish(["x"], {}, now), "nyt kort i Publicer → start udgiver"
    assert not due_publish([], {}, now)
    assert not due_publish(["x"], {"x": [now - 60]}, now), "netop startet — vent"
    assert due_publish(["x"], {"x": [now - PUB_GAP]}, now), "ikke live efter 30 min → prøv igen"
    assert not due_publish(["x"], {"x": [now - DAY] * PUB_MAX}, now), "opgiv efter PUB_MAX forsøg"
    print("selftest ok")


if __name__ == "__main__":
    _selftest() if "--selftest" in sys.argv else main()
