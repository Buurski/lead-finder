#!/usr/bin/env python3
"""Appendér CRM-aktiviteter til log:crm-activity med dedupe + verify.

Brug: python3 crm_mail_activity.py <json-fil med liste af entries>
Entry-felter: id, clientName, at, type, text, actor (text max 240 tegn).

Tjekker først eksisterende id'er (LRANGE, id-feltet) og springer dubletter
over. Verificerer efter skrivning at hvert nyt id findes i listen.
Ingen sletning. Ingen mails sendes.
"""
import json
import os
import sys
import urllib.request


def load_env():
    for line in open("/root/.hermes/credentials.env"):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def kv(*args):
    req = urllib.request.Request(
        os.environ["KV_REST_API_URL"],
        data=json.dumps(list(args)).encode(),
        headers={"Authorization": f"Bearer {os.environ['KV_REST_API_TOKEN']}"},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r).get("result")


def existing_ids():
    ids = set()
    for item in kv("LRANGE", "log:crm-activity", "0", "-1") or []:
        try:
            ids.add(json.loads(item).get("id", ""))
        except Exception:  # noqa: BLE001
            pass
    return ids


def main():
    load_env()
    path = sys.argv[1] if len(sys.argv) > 1 else "/tmp/crm_new_activities.json"
    entries = json.load(open(path))
    for e in entries:
        assert len(e.get("text", "")) <= 240, f"text for langt: {e['id']}"
        assert all(k in e for k in ("id", "clientName", "at", "type", "text", "actor")), e
    have = existing_ids()
    new = [e for e in entries if e["id"] not in have]
    skipped = len(entries) - len(new)
    for e in new:
        kv("RPUSH", "log:crm-activity", json.dumps(e, ensure_ascii=False))
    back = existing_ids()
    for e in new:
        assert e["id"] in back, f"ikke skrevet: {e['id']}"
    print(f"OK: {len(new)} nye aktiviteter skrevet, {skipped} dubletter sprunget over")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
