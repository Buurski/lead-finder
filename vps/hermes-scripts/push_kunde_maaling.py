#!/usr/bin/env python3
"""Læg en sendbar kunde-måling i Kinly HQ (/api/agent/kunde-rapport). Skrevet af Claude 28/9.

    push_kunde_maaling.py <måling.json> [--dry-run]

Kør det lige efter kunde_seo_tjek.py, KUN når den gav exit 0 (sendbar):

    python3 kunde_seo_tjek.py https://kunde.dk/ --navn "Kunde" && \
      python3 push_kunde_maaling.py ~/.hermes/state/kunde-seo-tjek/<domæne>-<dato>-kl<HHMM>.json

HQ afviser selv alt der ikke er status_flag=ok og kan_sendes=true (exit 2 her),
så en blokeret kørsel aldrig bliver til tal i en kunderapport. Én måling pr.
domæne pr. måned: en nyere sendbar kørsel samme måned erstatter den forrige,
indtil Lucas har markeret rapporten som sendt i HQ. Så er måneden låst.

Kun stdlib. Hemmeligheden læses af crm_agent_log.load_secret (samme som de
andre /api/agent-kald); den står aldrig i denne fil.
"""
from __future__ import annotations

import json
import os
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crm_agent_log import load_secret, sign  # noqa: E402

ENDPOINT = "https://lead-finder-three-beta.vercel.app/api/agent/kunde-rapport"
PATH = "/api/agent/kunde-rapport"


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1:
        print(__doc__)
        return 64
    with open(args[0], encoding="utf-8") as f:
        maaling = json.load(f)
    if maaling.get("status_flag") != "ok" or maaling.get("kan_sendes") is not True:
        print(f"ikke sendbar ({maaling.get('status_flag')}): {maaling.get('kan_sendes_grund', '')}", file=sys.stderr)
        return 2
    body = json.dumps({"action": "maaling", "maaling": maaling}, ensure_ascii=False, separators=(",", ":"))
    if "--dry-run" in argv:
        print(f"dry-run: ville sende {len(body)} tegn for {maaling.get('url')}")
        return 0
    ts = str(int(time.time()))
    req = Request(
        ENDPOINT,
        data=body.encode("utf-8"),
        method="POST",
        headers={"Content-Type": "application/json", "X-Timestamp": ts, "Authorization": f"Bearer {sign(load_secret(), ts, body, PATH)}"},
    )
    try:
        with urlopen(req, timeout=60) as res:
            print(res.read().decode("utf-8"))
            return 0
    except HTTPError as err:
        print(f"HTTP {err.code}: {err.read().decode('utf-8', 'replace')[:300]}", file=sys.stderr)
        return 2 if err.code == 422 else 1
    except URLError as err:
        print(f"kunne ikke nå HQ: {err.reason}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
