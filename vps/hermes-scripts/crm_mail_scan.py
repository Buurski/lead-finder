#!/usr/bin/env python3
"""Daily Gmail->CRM scan helper (Kinly mail-sync cron).

Fetch recent mails for the 4 Kinly customers from the Composio bridge
(user_id lucas@kinly.dk), filter to mails newer than lastRunAt from
doc:crm/mail-sync-state, write /tmp/crm_mail_scan.json + print compact list.

Skriver INTET til KV. Ingen mails sendes. Kun de 4 kunder berøres i output.
"""
import json
import os
import time
import urllib.request
from email.utils import parsedate_to_datetime

CUSTOMERS = ["VIDA Skønhedsklinik", "KT VVS", "Jernbanecaféen", "Ikast AutoService"]
BRIDGE = "http://127.0.0.1:8765/mcp"
_id = [900]


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
        fileobj = json.load(open(fp))
        return fileobj.get("data") or fileobj
    if isinstance(obj, dict) and obj.get("data") is not None:
        return obj["data"]
    return obj


def norm_ts(s):
    if not s:
        return ""
    s = str(s).strip()
    if s.isdigit():
        return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(s)))
    if "," in s or s[:3].isalpha():  # RFC2822
        try:
            dt = parsedate_to_datetime(s)
            return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(dt.timestamp()))
        except Exception:  # noqa: BLE001
            return ""
    s = s.replace(" ", "T")
    if s.endswith("+00:00"):
        s = s[:-6] + "Z"
    if "." in s and s.index(".") < len(s) - 1:
        s = s.split(".")[0] + "Z"
    if not s.endswith("Z"):
        s += "Z"
    return s


def fetch_all(query, cap=500):
    out, token = [], None
    while len(out) < cap:
        args = {"user_id": "lucas@kinly.dk", "query": query, "max_results": 200,
                "verbose": False, "include_payload": False}
        if token:
            args["page_token"] = token
        data = parse_result(call("GMAIL_FETCH_EMAILS", args))
        msgs = data.get("messages") or data.get("messages_list") or []
        out.extend(msgs)
        token = data.get("nextPageToken") or data.get("next_page_token")
        if not msgs or not token:
            break
    return out


def row(msg):
    hdrs = {}
    payload = msg.get("payload") or {}
    for h in payload.get("headers") or []:
        hdrs[(h.get("name") or "").lower()] = h.get("value", "")
    snip = ""
    for key in ("preview", "snippet", "messageText", "message_text"):
        v = msg.get(key)
        if isinstance(v, str) and v:
            snip = v
            break
    return {
        "messageId": msg.get("messageId") or msg.get("message_id") or "",
        "threadId": msg.get("threadId") or msg.get("thread_id") or "",
        "ts": norm_ts(msg.get("messageTimestamp") or msg.get("message_timestamp")
                      or hdrs.get("date")),
        "from": hdrs.get("from") or msg.get("sender") or "",
        "to": hdrs.get("to") or msg.get("to") or "",
        "subject": hdrs.get("subject") or msg.get("subject") or "",
        "snippet": snip[:300],
        "labelIds": msg.get("labelIds") or msg.get("label_ids") or [],
    }


def main():
    load_env()
    state = json.loads(kv("GET", "doc:crm/mail-sync-state") or "{}")
    last = state.get("lastRunAt") or "1970-01-01T00:00:00Z"
    print("lastRunAt:", last)

    queries = [
        "newer_than:2d",
        "newer_than:2d in:anywhere",  # spam/trash med, jf. 17/9-kørslen
        'newer_than:14d (vida-klinik OR "VIDA Skønhedsklinik" OR ditmedie)',
        'newer_than:14d (ktvvs OR "KT VVS")',
        'newer_than:14d (jbcafeen OR "Jernbanecaféen" OR jernbanecafe)',
        'newer_than:14d (ikastautoservice OR "Ikast AutoService")',
    ]
    seen, rows = set(), []
    for q in queries:
        try:
            msgs = fetch_all(q)
        except Exception as e:  # noqa: BLE001
            print(f"QUERY-FEJL {q!r}: {e}")
            continue
        new = 0
        for m in msgs:
            r = row(m)
            if r["messageId"] in seen:
                continue
            seen.add(r["messageId"])
            rows.append(r)
            new += 1
        print(f"query {q!r}: {len(msgs)} msgs ({new} nye)")

    fresh = sorted([r for r in rows if r["ts"] > last], key=lambda r: r["ts"], reverse=True)
    json.dump({"lastRunAt": last, "fresh": fresh, "all": sorted(rows, key=lambda r: r["ts"], reverse=True)},
              open("/tmp/crm_mail_scan.json", "w"), indent=1, ensure_ascii=False)
    print(f"\n=== {len(fresh)} mails nyere end lastRunAt ===")
    for r in fresh:
        labels = ",".join(l for l in r["labelIds"] if l in ("SENT", "INBOX", "DRAFT"))
        print(f"- {r['ts']} [{labels}] from: {r['from'][:60]} | {r['subject'][:90]}")
        if r["snippet"]:
            print(f"    {r['snippet'][:200]}")


if __name__ == "__main__":
    main()
