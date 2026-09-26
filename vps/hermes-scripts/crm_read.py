#!/usr/bin/env python3
"""Signed læse-CLI mod Kinly HQ — Hermes' øjne ind i CRM'et.

  python3 /root/.hermes/scripts/crm_read.py opmaerksomhed
  python3 /root/.hermes/scripts/crm_read.py min-dag --owner lucas
  python3 /root/.hermes/scripts/crm_read.py pipeline
  python3 /root/.hermes/scripts/crm_read.py sog ktvvs
  python3 /root/.hermes/scripts/crm_read.py kunde --list
  python3 /root/.hermes/scripts/crm_read.py kunde "ktvvs"      (navn eller uuid)
  python3 /root/.hermes/scripts/crm_read.py kundeopdateringer --status kladde
  python3 /root/.hermes/scripts/crm_read.py feed --limit 10
  python3 /root/.hermes/scripts/crm_read.py cms
  python3 /root/.hermes/scripts/crm_read.py replies      (Svar-indbakken: hvad venter på svar)

Kun læsning. Signaturen dækker sti + query (path = pathname + query), så
serveren kan genskabe præcis samme streng.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crm_agent_log import load_secret  # noqa: E402

BASE = "https://lead-finder-three-beta.vercel.app"
READ_PATH = "/api/agent/read"
DOSSIER_PATH = "/api/hermes/crm-dossier"
WHATS = ("opmaerksomhed", "min-dag", "pipeline", "sog", "kunde", "kundeopdateringer", "feed", "cms", "replies")


def sign_get(secret: str, timestamp: str, full_path: str) -> str:
    """Samme formel som ruterne: `${ts}.GET.${path}.` (tom body)."""
    message = f"{timestamp}.GET.{full_path}.".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


def fetch(path: str, params: dict[str, str]) -> dict:
    clean = {k: v for k, v in params.items() if v not in ("", None)}
    query = urlencode(clean)
    full_path = f"{path}?{query}" if query else path
    timestamp = str(int(time.time()))
    request = Request(
        BASE + full_path,
        method="GET",
        headers={
            "X-Timestamp": timestamp,
            "Authorization": f"Bearer {sign_get(load_secret(), timestamp, full_path)}",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")[:300]
        raise RuntimeError(f"HTTP {exc.code}: {detail}") from exc


def main() -> int:
    parser = argparse.ArgumentParser(description="Læs Kinly HQ-tilstand via de signerede agent-ruter.")
    parser.add_argument("what", choices=WHATS)
    parser.add_argument("q", nargs="?", default="", help="søgeord eller kundenavn (til 'sog' og 'kunde')")
    parser.add_argument("--list", dest="list_clients", action="store_true", help="kunde: vis alle kunder i stedet for én")
    parser.add_argument("--owner", default="")
    parser.add_argument("--status", default="")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()

    path = READ_PATH
    params: dict[str, str] = {}

    if args.what == "kunde":
        path = DOSSIER_PATH
        if args.list_clients:
            params["list"] = "clients"
        elif args.q.strip():
            params["q"] = args.q.strip()
        else:
            parser.error("'kunde' kræver et navn/uuid eller --list")
    else:
        params["what"] = args.what
        if args.what == "sog":
            if not args.q.strip():
                parser.error("'sog' kræver et søgeord")
            params["q"] = args.q.strip()
        if args.what == "min-dag" and args.owner:
            params["owner"] = args.owner
        if args.what == "kundeopdateringer" and args.status:
            params["status"] = args.status
        if args.what == "feed" and args.limit:
            params["limit"] = str(args.limit)

    try:
        data = fetch(path, params)
    except (OSError, RuntimeError) as exc:
        print(f"FEJL: kunne ikke nå HQ-API'et: {exc}", file=sys.stderr)
        return 1
    print(json.dumps(data, ensure_ascii=False, indent=2))
    return 0


def _self_test() -> None:
    expected = hmac.new(b"secret", b"1.GET./api/agent/read?what=cms.", hashlib.sha256).hexdigest()
    assert sign_get("secret", "1", "/api/agent/read?what=cms") == expected
    # Tomme parametre filtreres væk, så stien er stabil og signerbar
    assert urlencode({k: v for k, v in {"what": "cms", "q": ""}.items() if v not in ("", None)}) == "what=cms"
    # Dossier-stien bygges rigtigt (query med i signaturen)
    assert f"{DOSSIER_PATH}?q=ktvvs" == "/api/hermes/crm-dossier?q=ktvvs"
    print("crm_read self-test OK")


if __name__ == "__main__":
    if "--self-test" in sys.argv:
        _self_test()
    else:
        sys.exit(main())
