#!/usr/bin/env python3
"""hermes-api — tiny HTTP shim in front of the Hermes Agent CLI.

Runs on the Contabo VPS next to the Hermes gateway. Gives the lead-system
website (Vercel) a synchronous JSON API for chat, cron and health.

Auth: every request must carry
    X-Timestamp: <unix seconds>
    Authorization: Bearer <hex hmac-sha256(secret, "{ts}.{METHOD}.{path}.{body}")>
Secret lives in /etc/hermes-api.env (HERMES_API_SECRET). 5 min clock skew.

Endpoints:
    GET  /api/health              → {ok, gateway_running, cron_jobs, version}
    POST /api/chat                → {message, profile?, session_id} → {reply, ...}
    GET  /api/cron                → {jobs: [...]} (from ~/.hermes/cron/jobs.json)
    POST /api/cron/action         → {id, action: run|pause|resume} → CLI result

stdlib only — no pip dependencies.
"""

import hmac
import hashlib
import json
import os
import re
import subprocess
import threading
import time
from collections import OrderedDict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERMES_BIN = os.environ.get("HERMES_BIN", "/usr/local/bin/hermes")
HERMES_HOME = os.path.expanduser("~/.hermes")
SECRET = os.environ.get("HERMES_API_SECRET", "")
PORT = int(os.environ.get("HERMES_API_PORT", "8787"))
SKEW = 300
CHAT_TIMEOUT = 170
MAX_MSG = 8000
PROFILES = {"default", "lucas", "charlie"}
SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
CRON_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

_session_locks: "OrderedDict[str, threading.Lock]" = OrderedDict()
_locks_guard = threading.Lock()
_rate: dict = {}
_rate_guard = threading.Lock()


def session_lock(key: str) -> threading.Lock:
    # LRU-eviction i stedet for clear(): clear() smed ALLE aktive locks ud,
    # så to CLI-processer kunne køre parallelt for samme session.
    with _locks_guard:
        lock = _session_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _session_locks[key] = lock
        _session_locks.move_to_end(key)
        while len(_session_locks) > 500:
            _session_locks.popitem(last=False)
        return lock


def rate_ok(bucket: str = "global") -> bool:
    # Per-bucket (chat: per profil) så et langt cron-run eller én flittig
    # profil ikke blokerer de andre.
    now = time.time()
    with _rate_guard:
        q = _rate.setdefault(bucket, deque())
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= 30:
            return False
        q.append(now)
        return True


def verify(method: str, path: str, body: bytes, headers) -> bool:
    if not SECRET:
        return False
    ts = headers.get("X-Timestamp", "")
    auth = headers.get("Authorization", "")
    if not ts.isdigit() or not auth.startswith("Bearer "):
        return False
    if abs(time.time() - int(ts)) > SKEW:
        return False
    msg = f"{ts}.{method}.{path}.".encode() + body
    expected = hmac.new(SECRET.encode(), msg, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, auth[7:].strip())


def run_cli(args, timeout):
    env = dict(os.environ, HOME=os.path.expanduser("~"))
    proc = subprocess.run(
        [HERMES_BIN] + args,
        capture_output=True, text=True, timeout=timeout, env=env,
    )
    out = ANSI_RE.sub("", proc.stdout or "").strip()
    err = ANSI_RE.sub("", proc.stderr or "").strip()
    return proc.returncode, out, err


def handle_chat(payload):
    message = str(payload.get("message", "")).strip()
    profile = str(payload.get("profile", "default")).strip() or "default"
    session_id = str(payload.get("session_id", "")).strip()
    if not message:
        return 400, {"error": "message mangler"}
    if len(message) > MAX_MSG:
        return 400, {"error": f"besked over {MAX_MSG} tegn"}
    if profile not in PROFILES:
        return 400, {"error": "ukendt profil"}
    if not SESSION_RE.match(session_id):
        return 400, {"error": "ugyldigt session_id"}

    args = []
    if profile != "default":
        args += ["-p", profile]
    args += ["-z", message, "--continue", f"web-{session_id}"]

    started = time.time()
    with session_lock(f"{profile}:{session_id}"):
        try:
            code, out, err = run_cli(args, CHAT_TIMEOUT)
        except subprocess.TimeoutExpired:
            return 504, {"error": "Hermes svarede ikke i tide (timeout)"}
    if code != 0:
        return 502, {"error": "Hermes-fejl", "detail": (err or out)[:500]}
    return 200, {
        "reply": out or "(tomt svar)",
        "session_id": session_id,
        "profile": profile,
        "elapsed_ms": int((time.time() - started) * 1000),
    }


def handle_cron_list():
    path = os.path.join(HERMES_HOME, "cron", "jobs.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return 200, {"jobs": []}
    fields = (
        "id", "name", "prompt", "schedule_display", "enabled", "state",
        "next_run_at", "last_run_at", "last_status", "last_error",
        "deliver", "profile",
    )
    jobs = [{k: j.get(k) for k in fields} for j in data.get("jobs", [])]
    return 200, {"jobs": jobs, "updated_at": data.get("updated_at")}


def handle_cron_action(payload):
    job_id = str(payload.get("id", "")).strip()
    action = str(payload.get("action", "")).strip()
    if not CRON_ID_RE.match(job_id):
        return 400, {"error": "ugyldigt job-id"}
    if action not in {"run", "pause", "resume"}:
        return 400, {"error": "action skal være run|pause|resume"}
    try:
        code, out, err = run_cli(["cron", action, job_id], 60)
    except subprocess.TimeoutExpired:
        return 504, {"error": "cron-kommando timeout"}
    if code != 0:
        return 502, {"error": "cron-fejl", "detail": (err or out)[:500]}
    return 200, {"ok": True, "action": action, "id": job_id, "output": out[:1000]}


def handle_health():
    gateway_running = False
    pid_path = os.path.join(HERMES_HOME, "gateway.pid")
    try:
        raw = open(pid_path).read().strip()
        pid = json.loads(raw).get("pid") if raw.startswith("{") else int(raw)
        os.kill(int(pid), 0)
        gateway_running = True
    except (OSError, ValueError, TypeError, AttributeError):
        pass
    _, jobs = handle_cron_list()
    return 200, {
        "ok": True,
        "gateway_running": gateway_running,
        "cron_jobs": len(jobs.get("jobs", [])),
        "time": int(time.time()),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "hermes-api/1.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # no message bodies in logs
        print(f"{self.address_string()} {self.command} {self.path} {args[-1] if args else ''}", flush=True)

    def _send(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0) or 0)
        if length > 64 * 1024:
            return None
        return self.rfile.read(length) if length else b""

    def _route(self, method):
        body = self._read_body()
        if body is None:
            return self._send(413, {"error": "body for stor"})
        if not verify(method, self.path.split("?")[0], body, self.headers):
            return self._send(401, {"error": "unauthorized"})

        path = self.path.split("?")[0]
        try:
            payload = json.loads(body or b"{}")
        except ValueError:
            return self._send(400, {"error": "ugyldig JSON"})

        bucket = f"chat:{payload.get('profile', 'default')}" if path == "/api/chat" else "global"
        if not rate_ok(bucket):
            return self._send(429, {"error": "for mange requests — vent et øjeblik"})

        if method == "GET" and path == "/api/health":
            return self._send(*handle_health())
        if method == "GET" and path == "/api/cron":
            return self._send(*handle_cron_list())
        if method == "POST" and path == "/api/chat":
            return self._send(*handle_chat(payload))
        if method == "POST" and path == "/api/cron/action":
            return self._send(*handle_cron_action(payload))
        return self._send(404, {"error": "ukendt endpoint"})

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")


def main():
    if not SECRET:
        raise SystemExit("HERMES_API_SECRET mangler (sæt i /etc/hermes-api.env)")
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"hermes-api lytter på :{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
