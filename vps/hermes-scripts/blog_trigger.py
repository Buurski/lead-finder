#!/usr/bin/env python3
"""Starter Hermes' blog-skriver, når Lucas har trukket et kort til Arbejder i HQ.

Kører hvert 5. minut som no-agent-job (0 tokens): spørger HQ om kort der venter
(`crm_posts queue`), og hvis ét ikke er sat i gang for nylig, beder den Hermes'
scheduler køre blog-drafter-nat ved næste tick (`hermes cron run <id>`). Selve
skrivningen (agent) tager kortet med `claim` — så to kørsler aldrig skriver samme kort.
Uden ventende kort: ingen output, intet kald ud over ét HQ-opslag.
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
RETRIGGER_AFTER = 30 * 60  # samme kort sættes højst i gang hver 30. min (ellers hænger det — HQ viser det)


def due(cards: list[dict], state: dict, now: float) -> list[dict]:
    """Kort der skal sættes i gang: ikke trigget inden for RETRIGGER_AFTER."""
    return [c for c in cards if c.get("id") not in state or now - float(state[c["id"]]) >= RETRIGGER_AFTER]


def main() -> None:
    data = crm_posts.call({"action": "queue"})
    if not data.get("ok"):
        print(f"blog-trigger: HQ-fejl {data.get('error')}")
        sys.exit(1)
    cards = data.get("cards") or []
    if not cards:
        return
    try:
        state = json.loads(STATE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        state = {}
    now = time.time()
    todo = due(cards, state, now)
    if not todo:
        return
    # Én kørsel pr. ventende kort; hver kørsel claimer det ældste ledige.
    for c in todo:
        subprocess.run(["hermes", "cron", "run", BLOG_JOB_ID], check=True, capture_output=True, timeout=60)
        state[c["id"]] = now
        print(f"blog-trigger: satte Hermes i gang med '{c.get('title')}'")
    state = {k: v for k, v in state.items() if now - float(v) < 7 * 86400}
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state), encoding="utf-8")


def _selftest() -> None:
    cards = [{"id": "a"}, {"id": "b"}]
    assert [c["id"] for c in due(cards, {}, 1000.0)] == ["a", "b"]
    assert [c["id"] for c in due(cards, {"a": 900.0}, 1000.0)] == ["b"]
    assert [c["id"] for c in due(cards, {"a": 1000.0 - RETRIGGER_AFTER}, 1000.0)] == ["a", "b"]
    print("selftest ok")


if __name__ == "__main__":
    _selftest() if "--selftest" in sys.argv else main()
