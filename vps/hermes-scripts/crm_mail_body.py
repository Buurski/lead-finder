#!/usr/bin/env python3
"""Hent Gmail-brødtekster by ID via Composio-broen (readonly, til mail-sync-cron).

Brug: python3 crm_mail_body.py <messageId> [<messageId> ...]
Printer for hver mail: id, emne, dato og text/plain-brødtekst (citatlinjer
strippet, max ca. 2500 tegn). Ingen mails sendes, intet ændres.
"""
import base64
import email
import json
import re
import sys
import time
import urllib.request

BRIDGE = "http://127.0.0.1:8765/mcp"
_id = [1200]

QUOTE_START = re.compile(r"^(Den \d|On \w{3},|Fra: |From: |-----|________)")


def call(name, args, tries=6):
    last = None
    for i in range(tries):
        try:
            _id[0] += 1
            payload = {"jsonrpc": "2.0", "id": _id[0], "method": "tools/call",
                       "params": {"name": name, "arguments": args}}
            req = urllib.request.Request(
                BRIDGE, data=json.dumps(payload).encode(),
                headers={"Content-Type": "application/json",
                         "Accept": "application/json, text/event-stream"})
            with urllib.request.urlopen(req, timeout=220) as r:
                doc = json.loads(r.read().decode())
            if "error" in doc:
                raise RuntimeError(str(doc["error"])[:300])
            return doc["result"]["content"][0]["text"]
        except Exception as e:  # noqa: BLE001 - retry uanset årsag
            last = e
            time.sleep(2 + i * 3)
    raise RuntimeError(f"Composio-kald fejlede efter {tries} forsøg: {last}")


def parse_result(raw_text):
    obj = json.loads(raw_text)
    if isinstance(obj, dict) and obj.get("storedInFile"):
        fp = obj.get("outputFilePath")
        obj = json.load(open(fp))
    if isinstance(obj, dict) and obj.get("data") is not None:
        return obj["data"]
    return obj


def decode_b64url(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def plain_text(msg):
    """Første text/plain-del, ellers HTML strippet for tags."""
    parts = msg.walk() if msg.is_multipart() else [msg]
    for part in parts:
        if part.get_content_type() == "text/plain":
            payload = part.get_payload(decode=True)
            if payload:
                return payload.decode(part.get_content_charset() or "utf-8", errors="replace")
    for part in msg.walk():
        if part.get_content_type() == "text/html":
            payload = part.get_payload(decode=True)
            if payload:
                html = payload.decode(part.get_content_charset() or "utf-8", errors="replace")
                text = re.sub(r"<(br|/p|/div|/tr)[^>]*>", "\n", html)
                text = re.sub(r"<[^>]+>", "", text)
                return text
    return ""


def clean_body(text, limit=2500):
    out = []
    for line in text.splitlines():
        if QUOTE_START.match(line.strip()):
            break
        if line.lstrip().startswith(">"):
            continue
        out.append(line)
    body = "\n".join(out)
    body = re.sub(r"[ \t]+", " ", body)
    body = re.sub(r"\n{3,}", "\n\n", body).strip()
    return body[:limit]


def fetch_body(message_id):
    raw_text = call("GMAIL_FETCH_MESSAGE_BY_MESSAGE_ID",
                    {"user_id": "lucas@kinly.dk", "message_id": message_id, "format": "raw"})
    data = parse_result(raw_text)
    if isinstance(data, dict):
        raw_b64 = data.get("raw") or data.get("messageText") or ""
    elif isinstance(data, str):
        raw_b64 = data if not data.lstrip().startswith("{") else ""
    else:
        raw_b64 = ""
    if not raw_b64:
        return None, f"intet raw-felt (noegler: {sorted(data)[:10] if isinstance(data, dict) else type(data).__name__})"
    msg = email.message_from_bytes(decode_b64url(raw_b64))
    hdrs = {k.lower(): v for k, v in msg.items()}
    text = clean_body(plain_text(msg))
    return {"subject": hdrs.get("subject", ""), "date": hdrs.get("date", ""),
            "from": hdrs.get("from", ""), "body": text}, None


def selftest():
    raw = base64.urlsafe_b64encode(
        b"Subject: Test\nFrom: a@b.dk\n\nHej med dig.\n\nDen 1. jan. 2026 skrev X: gammelt").decode()
    body, err = decode_b64url(raw), None
    assert b"Subject: Test" in body, "b64url-decode fejler"
    msg = email.message_from_bytes(body)
    txt = clean_body(plain_text(msg))
    assert "Hej med dig." in txt and "gammelt" not in txt, f"clean_body fejler: {txt!r}"
    print("selftest OK")


def main():
    if "--selftest" in sys.argv:
        selftest()
        return 0
    for mid in sys.argv[1:]:
        print(f"=== {mid} ===")
        try:
            res, err = fetch_body(mid)
        except Exception as e:  # noqa: BLE001
            print(f"FEJL: {e}")
            continue
        if err:
            print(f"FEJL: {err}")
            continue
        print("emne:", res["subject"])
        print("dato:", res["date"])
        print("fra :", res["from"])
        print("--- body ---")
        print(res["body"])
        print()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
