#!/usr/bin/env python3
"""inbox_digest_sync.py — validér og skriv Svar-digesten til prod-KV.

Bruges af cron-jobbet "inbox-digest-sync": agenten henter mails fra
lucas@kinly.dk via Composio, bygger digest-JSON (samme format som
lead-system/src/lib/inbox-digest.ts) og kalder:

    python3 /root/.hermes/scripts/inbox_digest_sync.py /tmp/inbox-digest.json

Scriptet validerer FØRST og skriver KUN til doc:inbox/digest. Ved fejl røres
KV ikke, og exit-koden er 1 — så en dårlig agent-kørsel aldrig kan overskrive
en god digest med skrald. Skriver aldrig til andre nøgler, sletter intet.

    --selfcheck   kører de indbyggede validerings-tests uden KV-adgang.
"""
import json
import os
import sys
import time
import urllib.request

DIGEST_KEY = "doc:inbox/digest"
CATEGORIES = {
    "client", "interested", "question", "objection", "admin", "personal",
    "not-interested", "newsletter", "auto-reply", "receipt", "spam", "other",
}
MAX_ITEMS = 200


def load_env():
    for line in open("/root/.hermes/credentials.env"):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def kv_cmd(*args):
    req = urllib.request.Request(
        os.environ["KV_REST_API_URL"],
        data=json.dumps(list(args)).encode(),
        headers={"Authorization": f"Bearer {os.environ['KV_REST_API_TOKEN']}"},
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp).get("result")


def _str(v, cap):
    return str(v).strip()[:cap]


def validate(raw):
    """Returnér en renset digest eller raise ValueError med grunden. Spejler
    normalizeDigest() i appen, men failer højt i stedet for at gætte."""
    if not isinstance(raw, dict):
        raise ValueError("roden er ikke et objekt")
    items_raw = raw.get("items")
    if not isinstance(items_raw, list):
        raise ValueError("items mangler eller er ikke en liste")
    items = []
    seen = set()
    for i in items_raw[:MAX_ITEMS]:
        if not isinstance(i, dict) or not i.get("from"):
            continue  # samme drop-regel som appen: uden afsender er itemet ubrugeligt
        item = {
            "id": _str(i.get("id") or f"{i['from']}-{i.get('date', '')}", 200),
            "account": _str(i.get("account") or "lucas", 60),
            "from": _str(i["from"], 200),
            "subject": _str(i.get("subject") or "(intet emne)", 300),
            "snippet": _str(i.get("snippet") or "", 400),
            "date": _str(i.get("date") or "", 40),
            "category": i.get("category") if i.get("category") in CATEGORIES else "other",
            "importance": max(0, min(100, int(i.get("importance") or 40))),
            "needsReply": bool(i.get("needsReply")),
            "reason": _str(i.get("reason") or "", 200),
        }
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        if i.get("fromName"):
            item["fromName"] = _str(i["fromName"], 120)
        if i.get("gmailLink"):
            item["gmailLink"] = _str(i["gmailLink"], 400)
        if i.get("leadId"):
            item["leadId"] = _str(i["leadId"], 120)
        if i.get("suggestedReply"):
            item["suggestedReply"] = _str(i["suggestedReply"], 2000)
        if i.get("threadSummary"):
            item["threadSummary"] = _str(i["threadSummary"], 600)
        # Gmail-tråd-id: uden det kan UI'et ikke linke til selve samtalen, og et
        # svar ender som en ny, løsrevet mail hos kunden.
        if i.get("threadId"):
            item["threadId"] = _str(i["threadId"], 200)
        try:
            tc = int(i.get("threadCount") or 0)
            if tc > 0:
                item["threadCount"] = tc
        except (TypeError, ValueError):
            pass
        items.append(item)
    if not items:
        raise ValueError("0 gyldige items — nægter at overskrive med tomt scan")
    out = {
        "generatedAt": _str(raw.get("generatedAt") or "", 40) or time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "generatedBy": "vps-hermes",
        "account": _str(raw.get("account") or "lucas@kinly.dk", 120),
        "items": items,
    }
    try:
        wd = int(raw.get("windowDays") or 0)
        if wd > 0:
            out["windowDays"] = wd
    except (TypeError, ValueError):
        pass
    if raw.get("note"):
        out["note"] = _str(raw["note"], 300)
    return out


def main(argv):
    if len(argv) >= 2 and argv[1] == "--selfcheck":
        return selfcheck()
    if len(argv) < 2:
        print("brug: inbox_digest_sync.py <fil.json> | --selfcheck")
        return 2
    try:
        raw = json.load(open(argv[1], encoding="utf-8"))
    except (OSError, ValueError) as err:
        print(f"AFVIST: kunne ikke læse {argv[1]}: {err}")
        return 1
    try:
        digest = validate(raw)
    except ValueError as err:
        print(f"AFVIST: {err}")
        return 1
    load_env()
    kv_cmd("SET", DIGEST_KEY, json.dumps(digest, ensure_ascii=False))
    needs = sum(1 for i in digest["items"] if i["needsReply"])
    print(f"ok: {len(digest['items'])} items, {needs} kræver svar")
    return 0


def selfcheck():
    good = validate({
        "generatedAt": "2026-09-24T09:00:00Z",
        "items": [
            {"id": "m1", "from": "allan@ikastautoservice.dk", "subject": "Re: Google-profilen",
             "importance": 120, "needsReply": True, "category": "question",
             "date": "2026-09-24T05:38:17Z", "threadSummary": "x" * 700, "threadCount": 5,
             "threadId": "19a1b2c3d4e5f6a7"},
            {"id": "m1", "from": "dup@x.dk", "subject": "dublet droppes"},          # dublet-id
            {"from": "uden-id@x.dk", "subject": "får genereret id"},
            {"subject": "uden afsender droppes"},
        ],
    })
    assert len(good["items"]) == 2, good["items"]
    assert good["items"][0]["importance"] == 100, "importance skal clampes til 100"
    assert len(good["items"][0]["threadSummary"]) == 600, "threadSummary skal kapres til 600"
    assert good["items"][0]["threadCount"] == 5
    assert good["items"][0]["threadId"] == "19a1b2c3d4e5f6a7", "threadId skal bevares (tråd-link i Svar-siden)"
    assert good["items"][1]["id"] == "uden-id@x.dk-", good["items"][1]["id"]
    assert good["generatedBy"] == "vps-hermes"
    for bad, why in [
        ({"items": []}, "tomt scan"),
        ({"items": "nope"}, "ikke-liste"),
        ([], "ikke-objekt"),
    ]:
        try:
            validate(bad)
            raise AssertionError(f"skulle have afvist: {why}")
        except ValueError:
            pass
    print("selfcheck ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
