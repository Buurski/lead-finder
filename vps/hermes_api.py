#!/usr/bin/env python3
"""hermes-api v3 — HTTP shim foran Hermes Agent med persistent ACP + SSE.

Kører på Contabo-VPS'en ved siden af Hermes-gatewayen. Giver websitet
(Vercel) en JSON-API til chat, cron og health — nu med streaming.

Arkitektur:
    /api/chat         → ACP (persistent `hermes acp`, 3-5s) → subprocess-fallback (14-18s)
    /api/chat/stream  → SSE: første token så snart ACP streamer det
    /api/cron(+action), /api/health som før

v2-fejl rettet her:
  - HOME blev sat til ~/.hermes → `hermes acp` ledte efter config i
    /root/.hermes/.hermes og hang under systemd. HOME skal være /root.
  - Profil blev aldrig givet til ACP (alle chattede som default). Nu én
    ACP-subprocess PER profil (`hermes -p lucas acp`).
  - /api/cron/action manglede i v2.

Auth: X-Timestamp + Bearer hex(hmac_sha256(secret, "{ts}.{METHOD}.{path}.{body}")).
Secret i /etc/hermes-api.env. 5 min skew. Rate limit per chat-profil.

stdlib only — ingen pip-dependencies.
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
ACP_CWD = os.environ.get("HERMES_ACP_CWD", "/root/KnowledgeOS")
SECRET = os.environ.get("HERMES_API_SECRET", "")
PORT = int(os.environ.get("HERMES_API_PORT", "8787"))
SKEW = 300
CHAT_TIMEOUT = 170
ACP_SESSION_TIMEOUT = 60
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
    # LRU-eviction: clear() smed aktive locks ud og åbnede for parallelle
    # CLI-kørsler på samme session.
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


# ---- ACP pool (én persistent `hermes acp` per profil) ----------------------

class ACPPool:
    def __init__(self, profile: str):
        self.profile = profile
        self.proc: "subprocess.Popen | None" = None
        self.sessions: dict = {}      # vores session-nøgle -> acp sessionId
        self.last_used: dict = {}
        self.rid = 0
        self.rid_lock = threading.Lock()
        self.write_lock = threading.Lock()   # stdin er delt — én writer ad gangen
        self.responses: dict = {}
        self.responses_cv = threading.Condition()
        self.lock = threading.Lock()
        self.healthy = False
        self.start_attempts = 0
        self.warm_sid: "str | None" = None
        self.warm_lock = threading.Lock()
        # text-buffer per acp sessionId: {"text": str, "done": bool, "result": dict|None}
        self.buffers: dict = {}
        self.buf_lock = threading.Lock()

    def _next_rid(self) -> int:
        with self.rid_lock:
            self.rid += 1
            return self.rid

    def start(self) -> bool:
        with self.lock:
            if self.proc and self.proc.poll() is None and self.healthy:
                return True
            self.start_attempts += 1
            # Gamle sessions er ugyldige hvis processen er død
            self.sessions.clear()
            self.last_used.clear()
            with self.warm_lock:
                self.warm_sid = None
            try:
                env = os.environ.copy()
                # KRITISK: HOME skal være den rigtige bruger-home (/root) —
                # v2 satte HOME=~/.hermes og fik adapteren til at lede efter
                # config i /root/.hermes/.hermes → hang under systemd.
                env["HOME"] = os.path.expanduser("~")
                cmd = [HERMES_BIN]
                if self.profile != "default":
                    cmd += ["-p", self.profile]
                cmd += ["acp"]
                self.proc = subprocess.Popen(
                    cmd,
                    stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    text=True, bufsize=1, env=env,
                )
                threading.Thread(target=self._reader, daemon=True).start()
                if self._initialize():
                    self.healthy = True
                    print(f"[acp:{self.profile}] healthy", flush=True)
                    return True
            except Exception as e:
                print(f"[acp:{self.profile}] start fejlede: {e}", flush=True)
            self.healthy = False
            return False

    def _reader(self):
        proc = self.proc
        while proc and proc.poll() is None:
            try:
                line = proc.stdout.readline()
                if not line:
                    break
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                rid = msg.get("id")
                if rid is not None and ("result" in msg or "error" in msg):
                    with self.responses_cv:
                        self.responses[rid] = msg
                        self.responses_cv.notify_all()
                else:
                    self._on_notification(msg)
            except Exception:
                break
        self.healthy = False

    def _on_notification(self, msg: dict):
        if msg.get("method") != "session/update":
            return
        params = msg.get("params", {})
        sid = params.get("sessionId") or params.get("session_id")
        update = params.get("update", {})
        if not sid or update.get("sessionUpdate", update.get("type", "")) != "agent_message_chunk":
            return
        content = update.get("content", {})
        chunk = content.get("text", "") if isinstance(content, dict) else (content if isinstance(content, str) else "")
        if not chunk:
            return
        with self.buf_lock:
            buf = self.buffers.setdefault(sid, {"text": "", "done": False, "result": None})
            if not buf["text"]:
                # Minimax lækker af og til et hængende tænke-tag som første
                # chunk(s) ("\n</think>\n", tomme linjer) — drop dem indtil
                # rigtigt indhold starter.
                lead = chunk.strip()
                if lead in ("", "<think>", "</think>"):
                    return
                chunk = chunk.lstrip("\n")
            buf["text"] += chunk

    def _send_msg(self, msg: dict) -> bool:
        try:
            with self.write_lock:
                self.proc.stdin.write(json.dumps(msg) + "\n")
                self.proc.stdin.flush()
            return True
        except (BrokenPipeError, OSError, AttributeError):
            self.healthy = False
            return False

    def _initialize(self) -> bool:
        rid = self._next_rid()
        if not self._send_msg({"jsonrpc": "2.0", "id": rid, "method": "initialize",
                               "params": {"protocolVersion": 1}}):
            return False
        return self._wait_for(rid, 15) is not None

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
        if not self._send_msg({"jsonrpc": "2.0", "id": rid, "method": method, "params": params}):
            return None
        return self._wait_for(rid, timeout)

    def _new_acp_session(self):
        r = self._request("session/new", {"cwd": ACP_CWD, "mcpServers": []}, ACP_SESSION_TIMEOUT)
        if not r or "error" in r:
            return None
        return r.get("result", {}).get("sessionId") or r.get("result", {}).get("session_id")

    def get_session(self, session_id: str):
        if session_id in self.sessions:
            self.last_used[session_id] = time.time()
            return self.sessions[session_id]
        if not self.healthy and not self.start():
            return None
        with self.warm_lock:
            warm, self.warm_sid = self.warm_sid, None
        acp_sid = warm or self._new_acp_session()
        if not acp_sid:
            return None
        self.sessions[session_id] = acp_sid
        self.last_used[session_id] = time.time()
        return acp_sid

    def prewarm(self):
        if not self.healthy and not self.start():
            return
        with self.warm_lock:
            if self.warm_sid:
                return
        sid = self._new_acp_session()
        if sid:
            with self.warm_lock:
                self.warm_sid = sid
            print(f"[acp:{self.profile}] pre-warm klar", flush=True)

    def prompt_start(self, session_id: str, text: str, timeout: float):
        """Start prompt i baggrunden; returnér acp_sid til buffer-polling."""
        acp_sid = self.get_session(session_id)
        if not acp_sid:
            return None
        with self.buf_lock:
            self.buffers[acp_sid] = {"text": "", "done": False, "result": None}

        def run():
            r = self._request("session/prompt", {
                "sessionId": acp_sid,
                "prompt": [{"type": "text", "text": text}],
            }, timeout)
            with self.buf_lock:
                buf = self.buffers.setdefault(acp_sid, {"text": "", "done": False, "result": None})
                buf["done"] = True
                buf["result"] = r

        threading.Thread(target=run, daemon=True).start()
        return acp_sid

    def read_buffer(self, acp_sid: str):
        with self.buf_lock:
            buf = self.buffers.get(acp_sid)
            if buf is None:
                return "", True, None
            return buf["text"], buf["done"], buf["result"]

    def drop_buffer(self, acp_sid: str):
        with self.buf_lock:
            self.buffers.pop(acp_sid, None)

    def cleanup_idle(self):
        cutoff = time.time() - 3600
        for k in list(self.sessions):
            if self.last_used.get(k, 0) < cutoff:
                self.sessions.pop(k, None)
                self.last_used.pop(k, None)


_pools: dict = {}
_pools_guard = threading.Lock()


def pool_for(profile: str) -> ACPPool:
    with _pools_guard:
        p = _pools.get(profile)
        if p is None:
            p = ACPPool(profile)
            _pools[profile] = p
        return p


def _background_boot():
    # Pre-warm udenfor main-tråden så serveren svarer med det samme.
    for prof in ("default", "lucas"):
        try:
            pool_for(prof).prewarm()
        except Exception as e:
            print(f"[acp:{prof}] prewarm fejl: {e}", flush=True)
    while True:
        time.sleep(300)
        for p in list(_pools.values()):
            try:
                p.cleanup_idle()
            except Exception:
                pass


# ---- subprocess-fallback ----------------------------------------------------

def run_cli(args, timeout):
    env = dict(os.environ, HOME=os.path.expanduser("~"))
    proc = subprocess.run(
        [HERMES_BIN] + args,
        capture_output=True, text=True, timeout=timeout, env=env,
    )
    out = ANSI_RE.sub("", proc.stdout or "").strip()
    err = ANSI_RE.sub("", proc.stderr or "").strip()
    return proc.returncode, out, err


def chat_fallback(message: str, profile: str, session_id: str, started: float):
    args = []
    if profile != "default":
        args += ["-p", profile]
    args += ["-z", message, "--continue", f"web-{session_id}"]
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
        "method": "subprocess",
        "elapsed_ms": int((time.time() - started) * 1000),
    }


# ---- handlers ---------------------------------------------------------------

def validate_chat(payload):
    message = str(payload.get("message", "")).strip()
    profile = str(payload.get("profile", "default")).strip() or "default"
    session_id = str(payload.get("session_id", "")).strip()
    if not message:
        return None, (400, {"error": "message mangler"})
    if len(message) > MAX_MSG:
        return None, (400, {"error": f"besked over {MAX_MSG} tegn"})
    if profile not in PROFILES:
        return None, (400, {"error": "ukendt profil"})
    if not SESSION_RE.match(session_id):
        return None, (400, {"error": "ugyldigt session_id"})
    return (message, profile, session_id), None


def handle_chat(payload):
    parsed, err = validate_chat(payload)
    if err:
        return err
    message, profile, session_id = parsed
    started = time.time()
    with session_lock(f"{profile}:{session_id}"):
        pool = pool_for(profile)
        acp_sid = pool.prompt_start(session_id, message, CHAT_TIMEOUT)
        if acp_sid:
            deadline = time.time() + CHAT_TIMEOUT + 5
            while time.time() < deadline:
                text, done, result = pool.read_buffer(acp_sid)
                if done:
                    pool.drop_buffer(acp_sid)
                    if result and "error" not in result:
                        return 200, {
                            "reply": text or "(tomt svar)",
                            "session_id": session_id,
                            "profile": profile,
                            "method": "acp",
                            "elapsed_ms": int((time.time() - started) * 1000),
                        }
                    break  # ACP-fejl → fallback
                time.sleep(0.2)
            else:
                pool.drop_buffer(acp_sid)
        return chat_fallback(message, profile, session_id, started)


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
    acp = {prof: p.healthy for prof, p in _pools.items()}
    return 200, {
        "ok": True,
        "gateway_running": gateway_running,
        "cron_jobs": len(jobs.get("jobs", [])),
        "acp": acp,
        "acp_healthy": any(acp.values()),
        "version": "v3-acp-sse",
        "time": int(time.time()),
    }


# ---- HTTP -------------------------------------------------------------------

class Handler(BaseHTTPRequestHandler):
    server_version = "hermes-api/3.0"
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # ingen beskedindhold i logs
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

    # ---- SSE: POST /api/chat/stream ----
    def _sse_event(self, obj) -> bool:
        try:
            self.wfile.write(f"data: {json.dumps(obj, ensure_ascii=False)}\n\n".encode())
            self.wfile.flush()
            return True
        except (BrokenPipeError, OSError):
            return False  # klienten er væk — stop stille

    def _handle_chat_stream(self, payload):
        parsed, err = validate_chat(payload)
        if err:
            return self._send(*err)
        message, profile, session_id = parsed
        started = time.time()

        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "close")
        self.end_headers()

        with session_lock(f"{profile}:{session_id}"):
            pool = pool_for(profile)
            acp_sid = pool.prompt_start(session_id, message, CHAT_TIMEOUT)

            if acp_sid:
                if not self._sse_event({"status": "thinking", "method": "acp"}):
                    pool.drop_buffer(acp_sid)
                    return
                sent = 0
                last_write = time.time()
                deadline = time.time() + CHAT_TIMEOUT + 5
                while time.time() < deadline:
                    text, done, result = pool.read_buffer(acp_sid)
                    if len(text) > sent:
                        if not self._sse_event({"text": text[sent:]}):
                            pool.drop_buffer(acp_sid)
                            return
                        sent = len(text)
                        last_write = time.time()
                    if done:
                        pool.drop_buffer(acp_sid)
                        if result and "error" not in result:
                            self._sse_event({
                                "done": True, "method": "acp",
                                "elapsed_ms": int((time.time() - started) * 1000),
                                "full_text": text,
                            })
                            return
                        break  # ACP-fejl → fallback nedenfor
                    if time.time() - last_write > 10:
                        try:
                            self.wfile.write(b": hb\n\n")
                            self.wfile.flush()
                            last_write = time.time()
                        except (BrokenPipeError, OSError):
                            pool.drop_buffer(acp_sid)
                            return
                    time.sleep(0.15)
                else:
                    pool.drop_buffer(acp_sid)
                    self._sse_event({"error": "timeout", "done": True})
                    return
            else:
                if not self._sse_event({"status": "thinking", "method": "subprocess"}):
                    return

            # Fallback: blocking CLI, ét samlet svar til sidst
            status, obj = chat_fallback(message, profile, session_id, started)
            if status == 200:
                self._sse_event({"text": obj["reply"]})
                self._sse_event({"done": True, "method": "subprocess",
                                 "elapsed_ms": obj["elapsed_ms"], "full_text": obj["reply"]})
            else:
                self._sse_event({"error": obj.get("error", f"fejl ({status})"), "done": True})

    def _route(self, method):
        body = self._read_body()
        if body is None:
            return self._send(413, {"error": "body for stor"})
        path = self.path.split("?")[0]
        if not verify(method, path, body, self.headers):
            return self._send(401, {"error": "unauthorized"})
        try:
            payload = json.loads(body or b"{}")
        except ValueError:
            return self._send(400, {"error": "ugyldig JSON"})

        bucket = f"chat:{payload.get('profile', 'default')}" if path.startswith("/api/chat") else "global"
        if not rate_ok(bucket):
            return self._send(429, {"error": "for mange requests — vent et øjeblik"})

        if method == "GET" and path == "/api/health":
            return self._send(*handle_health())
        if method == "GET" and path == "/api/cron":
            return self._send(*handle_cron_list())
        if method == "POST" and path == "/api/chat":
            return self._send(*handle_chat(payload))
        if method == "POST" and path == "/api/chat/stream":
            return self._handle_chat_stream(payload)
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
    threading.Thread(target=_background_boot, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"hermes-api v3 lytter på :{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
