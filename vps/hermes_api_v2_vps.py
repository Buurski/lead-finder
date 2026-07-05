#!/usr/bin/env python3
"""
hermes-api v2 — persistent ACP pool.

I stedet for at starte ny `hermes` subprocess per chat-kald (12-16s overhead),
holder vi en persistent `hermes acp` JSON-RPC server kørende. Første kald
tager ~5s (session setup), efterfølgende ~3s (kun inference).

Fallback: hvis ACP fejler, falder vi tilbage til gammel subprocess-metode.

Kører på alternativ port 8788, så vi kan teste uden at forstyrre prod 8787.
"""
import hashlib
import hmac
import json
import os
import subprocess
import threading
import time
from collections import OrderedDict, deque
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HERMES_BIN = os.environ.get("HERMES_BIN", "/usr/local/bin/hermes")
HERMES_HOME = os.path.expanduser("~/.hermes")
SECRET = os.environ.get("HERMES_API_SECRET", "")
PORT = int(os.environ.get("HERMES_API_PORT", "8788"))
SKEW = 300
CHAT_TIMEOUT = 170
ACP_SESSION_TIMEOUT = 60
MAX_MSG = 8000
PROFILES = {"default", "lucas", "charlie"}
SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$") if False else None
import re
SESSION_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
CRON_ID_RE = re.compile(r"^[A-Za-z0-9_-]{1,32}$")
ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")

_session_locks: "OrderedDict[str, threading.Lock]" = OrderedDict()
_locks_guard = threading.Lock()
_rate: dict = {}
_rate_guard = threading.Lock()


# ---- ACP Pool --------------------------------------------------------------

class ACPPool:
    """Håndterer en persistent `hermes acp` subprocess + multiple sessions."""

    def __init__(self):
        self.proc: subprocess.Popen | None = None
        self.sessions: dict[str, str] = {}  # session_id (vores) -> acp_sessionId
        self.last_used: dict[str, float] = {}
        self.rid = 0
        self.rid_lock = threading.Lock()
        self.responses: dict[int, dict] = {}
        self.responses_cv = threading.Condition()
        self.read_thread: threading.Thread | None = None
        self.lock = threading.Lock()
        self.healthy = False
        self.start_attempts = 0
        # Pre-warm idle sessions (key=profile, value=acp_sessionId klar til brug)
        self.warm_pool: dict[str, str] = {}
        self.warm_lock = threading.Lock()
        # Text-buffers per acp_sessionId for stream-chunks
        self._text_buffers: dict[str, dict] = {}
        self._text_lock = threading.Lock()

    def _next_rid(self):
        with self.rid_lock:
            self.rid += 1
            return self.rid

    def start(self):
        """Start persistent ACP subprocess."""
        with self.lock:
            if self.proc and self.proc.poll() is None:
                return True
            self.start_attempts += 1
            try:
                env = os.environ.copy()
                env["HOME"] = HERMES_HOME
                self.proc = subprocess.Popen(
                    [HERMES_BIN, "acp"],
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    text=True, bufsize=1, env=env,
                )
                # Læser-tråd
                self.read_thread = threading.Thread(target=self._reader, daemon=True)
                self.read_thread.start()
                # Vent kort på initialize
                if self._initialize():
                    self.healthy = True
                    return True
            except Exception as e:
                print(f"[ACP] start failed: {e}", flush=True)
            self.healthy = False
            return False

    def _reader(self):
        """Læs ACP responses og stream notifications i baggrunden."""
        while self.proc and self.proc.poll() is None:
            try:
                line = self.proc.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line)
                except Exception:
                    continue
                rid = msg.get("id")
                if rid is not None and ("result" in msg or "error" in msg):
                    with self.responses_cv:
                        self.responses[rid] = msg
                        self.responses_cv.notify_all()
                # Notifications: saml agent_message_chunk text per session
                else:
                    self._handle_notification(msg)
            except Exception:
                break
        self.healthy = False

    def _handle_notification(self, msg: dict):
        """Saml text-chunks fra session/update notifications."""
        try:
            method = msg.get("method", "")
            if method != "session/update":
                return
            params = msg.get("params", {})
            sid = params.get("sessionId") or params.get("session_id")
            update = params.get("update", {})
            if not sid:
                return
            update_type = update.get("sessionUpdate", update.get("type", ""))
            if update_type != "agent_message_chunk":
                return
            content = update.get("content", {})
            if isinstance(content, dict):
                chunk = content.get("text", "")
            elif isinstance(content, str):
                chunk = content
            else:
                return
            if not chunk:
                return
            with self._text_lock:
                buf = self._text_buffers.get(sid)
                if buf is None:
                    buf = {"text": "", "done": False}
                    self._text_buffers[sid] = buf
                buf["text"] += chunk
        except Exception:
            pass

    def _initialize(self):
        """Send initialize, vent på svar."""
        rid = self._next_rid()
        msg = {"jsonrpc": "2.0", "id": rid, "method": "initialize", "params": {"protocolVersion": 1}}
        try:
            self.proc.stdin.write(json.dumps(msg) + "\n")
            self.proc.stdin.flush()
        except Exception:
            return False
        return self._wait_for(rid, 5) is not None

    def _wait_for(self, rid: int, timeout: float):
        with self.responses_cv:
            deadline = time.time() + timeout
            while rid not in self.responses:
                rem = deadline - time.time()
                if rem <= 0:
                    return None
                self.responses_cv.wait(timeout=rem)
            return self.responses.pop(rid, None)

    def _request(self, method: str, params: dict, timeout: float):
        rid = self._next_rid()
        msg = {"jsonrpc": "2.0", "id": rid, "method": method, "params": params}
        try:
            self.proc.stdin.write(json.dumps(msg) + "\n")
            self.proc.stdin.flush()
        except (BrokenPipeError, OSError):
            self.healthy = False
            return None
        return self._wait_for(rid, timeout)

    def new_session(self, profile: str, session_id: str) -> str | None:
        """Opret eller genbrug ACP session. Bruger pre-warm pool hvis tilgængelig."""
        key = f"{profile}:{session_id}"
        if key in self.sessions:
            self.last_used[key] = time.time()
            return self.sessions[key]
        if not self.healthy and not self.start():
            return None
        # Tjek pre-warm pool først
        with self.warm_lock:
            warm_sid = self.warm_pool.pop(profile, None)
        if warm_sid:
            self.sessions[key] = warm_sid
            self.last_used[key] = time.time()
            return warm_sid
        # Opret ny
        r = self._request("session/new", {"cwd": "/root/KnowledgeOS", "mcpServers": []}, ACP_SESSION_TIMEOUT)
        if not r or "error" in r:
            return None
        acp_sid = r.get("result", {}).get("sessionId") or r.get("result", {}).get("session_id")
        if not acp_sid:
            return None
        self.sessions[key] = acp_sid
        self.last_used[key] = time.time()
        return acp_sid

    def prewarm(self, profile: str = "default") -> str | None:
        """Opret en idle session i forvejen — klar til næste kald (~3s i stedet for ~8s)."""
        if not self.healthy and not self.start():
            return None
        with self.warm_lock:
            if profile in self.warm_pool:
                return self.warm_pool[profile]
        r = self._request("session/new", {"cwd": "/root/KnowledgeOS", "mcpServers": []}, ACP_SESSION_TIMEOUT)
        if not r or "error" in r:
            return None
        acp_sid = r.get("result", {}).get("sessionId") or r.get("result", {}).get("session_id")
        if not acp_sid:
            return None
        with self.warm_lock:
            self.warm_pool[profile] = acp_sid
        return acp_sid

    def prompt(self, profile: str, session_id: str, text: str, timeout: float = 60) -> dict | None:
        """Send prompt, returnér result eller None ved fejl."""
        if not self.healthy and not self.start():
            return None
        acp_sid = self.new_session(profile, session_id)
        if not acp_sid:
            return None
        # Nulstil text-buffer for denne session
        with self._text_lock:
            self._text_buffers[acp_sid] = {"text": "", "done": False}
        r = self._request("session/prompt", {
            "sessionId": acp_sid,
            "prompt": [{"type": "text", "text": text}],
        }, timeout)
        if not r or "error" in r:
            return None
        result = r.get("result", {})
        # Hent samlet text fra buffer
        with self._text_lock:
            buf = self._text_buffers.pop(acp_sid, None)
        if buf and buf.get("text"):
            result["_text"] = buf["text"]
        return result

    def cleanup_idle(self):
        """Fjern sessioner der ikke er brugt i 1 time (frigør plads)."""
        cutoff = time.time() - 3600
        for k in list(self.sessions):
            if self.last_used.get(k, 0) < cutoff:
                self.sessions.pop(k, None)
                self.last_used.pop(k, None)


_pool = ACPPool()
_cleanup_thread_started = False


def _cleanup_loop():
    while True:
        time.sleep(300)
        try:
            _pool.cleanup_idle()
        except Exception:
            pass


# ---- Fallback (subprocess) -------------------------------------------------

def run_cli_fallback(args, timeout):
    env = os.environ.copy()
    env["HOME"] = os.path.expanduser("~")
    try:
        proc = subprocess.run(
            [HERMES_BIN] + args, capture_output=True, text=True,
            timeout=timeout, env=env,
        )
        out = ANSI_RE.sub("", proc.stdout or "").strip()
        err = ANSI_RE.sub("", proc.stderr or "").strip()
        return proc.returncode, out, err
    except subprocess.TimeoutExpired:
        return -1, "", "timeout"


# ---- Auth & rate -----------------------------------------------------------

def verify(method, path, body, headers):
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


def rate_ok(bucket="global"):
    now = time.time()
    with _rate_guard:
        q = _rate.setdefault(bucket, deque())
        while q and q[0] < now - 60:
            q.popleft()
        if len(q) >= 30:
            return False
        q.append(now)
        return True


def session_lock(key):
    with _locks_guard:
        lock = _session_locks.get(key)
        if lock is None:
            lock = threading.Lock()
            _session_locks[key] = lock
        _session_locks.move_to_end(key)
        while len(_session_locks) > 500:
            _session_locks.popitem(last=False)
        return lock


# ---- Handlers --------------------------------------------------------------

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

    started = time.time()
    with session_lock(f"{profile}:{session_id}"):
        # Prøv ACP først
        result = _pool.prompt(profile, session_id, message, CHAT_TIMEOUT)
        if result and "stopReason" in result:
            # Hent samlet text (samlet fra stream-chunks under inference)
            reply = result.pop("_text", "") or "(intet svar i stream)"
            return 200, {
                "reply": reply,
                "session_id": session_id,
                "profile": profile,
                "method": "acp",
                "stopReason": result.get("stopReason"),
                "usage": result.get("usage"),
                "elapsed_ms": int((time.time() - started) * 1000),
            }
        # Fallback til subprocess
        args = []
        if profile != "default":
            args += ["-p", profile]
        args += ["-z", message, "--continue", f"web-{session_id}"]
        try:
            code, out, err = run_cli_fallback(args, CHAT_TIMEOUT)
        except subprocess.TimeoutExpired:
            return 504, {"error": "timeout"}
        if code != 0:
            return 502, {"error": "Hermes-fejl", "detail": (err or out)[:500]}
        return 200, {
            "reply": out or "(tomt svar)",
            "session_id": session_id,
            "profile": profile,
            "method": "subprocess",
            "elapsed_ms": int((time.time() - started) * 1000),
        }


def handle_cron_list():
    path = os.path.join(HERMES_HOME, "cron", "jobs.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
    except (OSError, ValueError):
        return 200, {"jobs": []}
    fields = ("id", "name", "prompt", "schedule_display", "enabled", "state",
              "next_run_at", "last_run_at", "last_status", "last_error", "deliver", "profile")
    jobs = [{k: j.get(k) for k in fields} for j in data.get("jobs", [])]
    return 200, {"jobs": jobs, "updated_at": data.get("updated_at")}


def handle_health():
    gateway_running = False
    pid_path = os.path.join(HERMES_HOME, "gateway.pid")
    try:
        raw = open(pid_path).read().strip()
        pid = json.loads(raw).get("pid") if raw.startswith("{") else int(raw)
        os.kill(int(pid), 0)
        gateway_running = True
    except Exception:
        pass
    _, jobs = handle_cron_list()
    return 200, {
        "ok": True,
        "gateway_running": gateway_running,
        "cron_jobs": len(jobs.get("jobs", [])),
        "acp_healthy": _pool.healthy,
        "acp_sessions": len(_pool.sessions),
        "acp_attempts": _pool.start_attempts,
        "time": int(time.time()),
        "version": "v2-acp",
    }


# ---- HTTP ------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "hermes-api/2.0-acp"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} {self.command} {self.path}", flush=True)

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
            return self._send(429, {"error": "for mange requests"})
        if method == "GET" and path == "/api/health":
            return self._send(*handle_health())
        if method == "GET" and path == "/api/cron":
            return self._send(*handle_cron_list())
        if method == "POST" and path == "/api/chat":
            return self._send(*handle_chat(payload))
        return self._send(404, {"error": "ukendt endpoint"})

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")


def main():
    global _cleanup_thread_started
    if not SECRET:
        raise SystemExit("HERMES_API_SECRET mangler")
    # Start ACP pool eagerly
    print(f"[hermes-api v2] starter ACP pool...", flush=True)
    if _pool.start():
        print(f"[hermes-api v2] ACP healthy", flush=True)
        # Pre-warm default session så første chat er hurtig
        print(f"[hermes-api v2] pre-warm default session...", flush=True)
        if _pool.prewarm("default"):
            print(f"[hermes-api v2] pre-warm OK", flush=True)
        else:
            print(f"[hermes-api v2] pre-warm fejlede (ikke kritisk)", flush=True)
    else:
        print(f"[hermes-api v2] ACP ikke healthy — falder tilbage til subprocess", flush=True)
    # Cleanup thread
    if not _cleanup_thread_started:
        threading.Thread(target=_cleanup_loop, daemon=True).start()
        _cleanup_thread_started = True
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[hermes-api v2] lytter på :{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
