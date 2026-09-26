#!/usr/bin/env python3
"""Opdater doc:crm/mail-sync-state efter Gmail->CRM-scan.

Bevarer øvrige felter (kilder, naeste). Sætter lastRunAt=nu (ISO) og
by="hermes (mail-sync cron)". Verificerer skrivningen med en GET bagefter.

Brug: python3 /root/.hermes/scripts/crm_mail_state.py
"""
import json
import os
import time
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


def main():
    load_env()
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    state = json.loads(kv("GET", "doc:crm/mail-sync-state") or "{}")
    state["lastRunAt"] = now
    state["by"] = "hermes (mail-sync cron)"
    kv("SET", "doc:crm/mail-sync-state", json.dumps(state, ensure_ascii=False))
    back = json.loads(kv("GET", "doc:crm/mail-sync-state") or "{}")
    assert back.get("lastRunAt") == now, back
    assert back.get("by") == "hermes (mail-sync cron)", back
    print("state OK:", json.dumps(back, ensure_ascii=False))


if __name__ == "__main__":
    main()
