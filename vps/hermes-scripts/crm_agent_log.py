#!/usr/bin/env python3
"""Signed POST helper for Kinly HQ's internal agent activity log."""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import sys
import time
from urllib.request import Request, urlopen

ENDPOINT = "https://lead-finder-three-beta.vercel.app/api/agent/log"
PATH = "/api/agent/log"
CREDS_FILES = (
    "/root/.hermes/credentials.env",
    "/root/.hermes/.env",
    "/etc/hermes-api.env",
)
ALLOWED_ACTORS = {"lucas", "charlie", "hermes"}
ALLOWED_TYPES = {"checkin", "session", "status"}


def load_secret() -> str:
    """Offentligt navn — crm_tasks.py genbruger den via import."""
    value = os.environ.get("HERMES_API_SECRET")
    if value:
        return value.strip()
    for credentials_file in CREDS_FILES:
        try:
            with open(credentials_file, encoding="utf-8") as handle:
                for line in handle:
                    key, sep, raw = line.partition("=")
                    if sep and key.strip() == "HERMES_API_SECRET":
                        return raw.strip().strip('"').strip("'")
        except OSError:
            continue
    raise RuntimeError("HERMES_API_SECRET mangler")


def _one_line(value: str, limit: int = 240) -> str:
    clean = re.sub(r"\s+", " ", value or "").strip()
    if not clean:
        raise ValueError("summary må ikke være tom")
    return clean[:limit]


def _payload(actor: str, event_type: str, summary: str, company: str = "", payload: dict | None = None) -> dict[str, object]:
    if actor not in ALLOWED_ACTORS:
        raise ValueError(f"ugyldig actor: {actor}")
    if event_type not in ALLOWED_TYPES:
        raise ValueError(f"ugyldig type: {event_type}")
    body: dict[str, object] = {
        "actor": actor,
        "type": event_type,
        "summary": _one_line(summary),
        "company": _one_line(company) if company else "",
    }
    if payload is not None:
        if not isinstance(payload, dict):
            raise ValueError("payload skal være et objekt")
        body["payload"] = payload
    return body


def _body(payload: dict[str, str]) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def sign(secret: str, timestamp: str, body: str, path: str = PATH) -> str:
    message = f"{timestamp}.POST.{path}.{body}".encode("utf-8")
    return hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()


# Bagudkompatible aliaser (samme formel, samme adfærd).
_secret = load_secret
_signature = sign


def log_activity(actor: str, event_type: str, summary: str, company: str = "", *, dry_run: bool = False, payload: dict | None = None) -> dict[str, object]:
    request_payload = _payload(actor, event_type, summary, company, payload)
    body = _body(request_payload)
    if dry_run or os.environ.get("CRM_AGENT_LOG_DRY_RUN") == "1":
        return {"dry_run": True, "payload": request_payload, "body": body}

    timestamp = str(int(time.time()))
    request = Request(
        ENDPOINT,
        data=body.encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Timestamp": timestamp,
            "Authorization": f"Bearer {_signature(_secret(), timestamp, body)}",
        },
    )
    with urlopen(request, timeout=20) as response:
        response_body = response.read().decode("utf-8", errors="replace")
        if not 200 <= response.status < 300:
            raise RuntimeError(f"CRM-log HTTP {response.status}: {response_body[:200]}")
        return {"status": response.status, "response": response_body[:500], "payload": request_payload}


def _self_test() -> None:
    assert _signature("secret", "1", "{}") == "1deb89261157acb1693c0c4f31dfe1565182713e5c5430f2d9d356b9578c7b07"
    assert _payload("hermes", "session", "færdig:  demo\nbygget", "VIDA") == {
        "actor": "hermes",
        "type": "session",
        "summary": "færdig: demo bygget",
        "company": "VIDA",
    }
    assert _payload("hermes", "status", "Mail-status: kunden venter på os", "VIDA",
                     {"waitingOn": "os", "nextStep": "", "basedOn": ["m1"]}) == {
        "actor": "hermes",
        "type": "status",
        "summary": "Mail-status: kunden venter på os",
        "company": "VIDA",
        "payload": {"waitingOn": "os", "nextStep": "", "basedOn": ["m1"]},
    }
    print("crm_agent_log self-test OK")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--actor")
    parser.add_argument("--type", dest="event_type")
    parser.add_argument("--summary")
    parser.add_argument("--company", default="")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        _self_test()
        return 0
    if not args.actor or not args.event_type or args.summary is None:
        parser.error("--actor, --type og --summary er påkrævet")
    result = log_activity(args.actor, args.event_type, args.summary, args.company, dry_run=args.dry_run)
    print(json.dumps(result, ensure_ascii=False, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    sys.exit(main())
