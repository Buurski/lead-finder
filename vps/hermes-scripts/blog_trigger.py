#!/usr/bin/env python3
"""Starter Hermes' blog-skriver, når Lucas har trukket et kort til Arbejder i HQ.

Kører hvert 5. minut som no-agent-job (0 tokens): spørger HQ om kort der venter
(`crm_posts queue`) og beder Hermes' scheduler køre blog-drafter-nat ved næste tick
(`hermes cron run <id>`). Selve skrivningen (agent) tager kortet med `claim`.

Tempo (Lucas 27/9: "de behøver ikke laves samme dag, men de skal laves ordentligt"):
ÉT indlæg ad gangen, og højst PER_DAY starter pr. døgn — hver kørsel er et
agent-run (2-4 mio. tokens). HQ viser kø-plads og forventet dag ud fra samme tal
(BLOG_PER_DAY i src/components/blog/blog-utils.ts).
"""
from __future__ import annotations

import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crm_posts  # noqa: E402

BLOG_JOB_ID = "fc9f43db4b74"  # blog-drafter-nat
STATE = Path("/root/.hermes/state/blog-trigger.json")
PER_DAY = 2  # spejles af BLOG_PER_DAY i HQ
CLAIM_GRACE = 10 * 60  # en netop startet kørsel når at claime sit kort (tager ~4 min), før næste startes
DAY = 86400


def pick(cards: list[dict], running: int, starts: list[float], now: float) -> dict | None:
    """Det kort der skal startes nu, eller None. Køen er allerede ældste-først fra HQ."""
    if not cards or running > 0:
        return None
    if starts and now - max(starts) < CLAIM_GRACE:
        return None
    # Lucas' besked til Hermes (rettelse fra gennemlæsning) går uden om døgnloftet —
    # "med det samme" (27/9). HQ sorterer dem forrest i køen.
    if ((cards[0].get("work") or {}).get("instructions")):
        return cards[0]
    if sum(1 for s in starts if now - s < DAY) >= PER_DAY:
        return None
    return cards[0]


def load_starts() -> list[float]:
    try:
        data = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    # Gammelt format var {kort-id: tidspunkt}; værdierne er stadig starttidspunkter.
    raw = data.get("starts", []) if isinstance(data, dict) and "starts" in data else list(data.values()) if isinstance(data, dict) else []
    return [float(s) for s in raw]


def main() -> None:
    data = crm_posts.call({"action": "queue"})
    if not data.get("ok"):
        print(f"blog-trigger: HQ-fejl {data.get('error')}")
        sys.exit(1)
    now = time.time()
    starts = load_starts()
    card = pick(data.get("cards") or [], int(data.get("running") or 0), starts, now)
    if not card:
        return
    # Gem starten FØR kaldet: `hermes cron run` kan blokere >60 s når det kaldes inde fra
    # schedulerens tick (27/9 crashede triggeren på timeout efter at kørslen var sat i gang,
    # så døgnloftet aldrig blev talt op). Kaldet løsrives og ventes ikke på.
    starts = [s for s in starts if now - s < 7 * DAY] + [now]
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps({"starts": starts}), encoding="utf-8")
    subprocess.Popen(["hermes", "cron", "run", BLOG_JOB_ID], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    print(f"blog-trigger: satte Hermes i gang med '{card.get('title')}'")


def _selftest() -> None:
    a, b = {"id": "a"}, {"id": "b"}
    now = 100 * DAY
    assert pick([a, b], 0, [], now) == a
    assert pick([], 0, [], now) is None
    assert pick([a], 1, [], now) is None, "kører allerede ét"
    assert pick([a], 0, [now - 60], now) is None, "netop startet — vent på claim"
    assert pick([a], 0, [now - 3 * 3600], now) == a
    assert pick([a], 0, [now - 3 * 3600, now - 5 * 3600], now) is None, "døgnloft nået"
    assert pick([a], 0, [now - 25 * 3600, now - 26 * 3600], now) == a, "loftet er rullende 24 t"
    c = {"id": "c", "work": {"instructions": "nyt billede B"}}
    assert pick([c], 0, [now - 3 * 3600, now - 5 * 3600], now) == c, "besked fra Lucas går uden om døgnloftet"
    assert pick([c], 1, [], now) is None, "men stadig ét ad gangen"
    print("selftest ok")


if __name__ == "__main__":
    _selftest() if "--selftest" in sys.argv else main()
