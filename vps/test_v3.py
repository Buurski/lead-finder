#!/usr/bin/env python3
"""Hurtig signeret test af hermes-api v3 (health + stream + blocking chat)."""
import hashlib
import hmac
import json
import os
import sys
import time
import urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8788")
SECRET = os.environ["HERMES_API_SECRET"]


def signed(method, path, body=b""):
    ts = str(int(time.time()))
    msg = f"{ts}.{method}.{path}.".encode() + body
    sig = hmac.new(SECRET.encode(), msg, hashlib.sha256).hexdigest()
    req = urllib.request.Request(BASE + path, data=body or None, method=method)
    req.add_header("X-Timestamp", ts)
    req.add_header("Authorization", f"Bearer {sig}")
    if body:
        req.add_header("Content-Type", "application/json")
    return req


# 1) health
with urllib.request.urlopen(signed("GET", "/api/health"), timeout=10) as r:
    h = json.load(r)
print("HEALTH:", json.dumps({k: h[k] for k in ("ok", "acp", "acp_healthy", "version")}, ensure_ascii=False))

# 2) stream — mål første token + total
body = json.dumps({"message": "Sig kort hej og nævn ét tal mellem 1 og 10.",
                   "profile": "default", "session_id": "v3test1"}).encode()
t0 = time.time()
first = None
total_text = ""
with urllib.request.urlopen(signed("POST", "/api/chat/stream", body), timeout=180) as r:
    buf = b""
    while True:
        chunk = r.read(1)
        if not chunk:
            break
        buf += chunk
        while b"\n\n" in buf:
            event, buf = buf.split(b"\n\n", 1)
            line = event.decode("utf-8", "replace").strip()
            if not line.startswith("data: "):
                continue
            obj = json.loads(line[6:])
            if "text" in obj:
                if first is None:
                    first = time.time() - t0
                total_text += obj["text"]
            if obj.get("done"):
                print(f"STREAM: first_token={first:.2f}s total={time.time()-t0:.2f}s "
                      f"method={obj.get('method')} len={len(total_text)}")
                sys.stdout.flush()
                buf = b"__END__"
                break
        if buf == b"__END__":
            break

# 3) blocking chat — 2. tur i samme session (ACP session reuse)
body2 = json.dumps({"message": "Hvilket tal sagde du lige?",
                    "profile": "default", "session_id": "v3test1"}).encode()
t0 = time.time()
with urllib.request.urlopen(signed("POST", "/api/chat", body2), timeout=180) as r:
    d = json.load(r)
print(f"CHAT2: {time.time()-t0:.2f}s method={d.get('method')} reply={d.get('reply', '')[:80]!r}")
