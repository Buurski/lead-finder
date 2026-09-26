#!/usr/bin/env python3
"""Fælles, små hjælpefunktioner for de to mail-cronjobs."""
from __future__ import annotations

import fcntl
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

COMPOSIO = str(Path.home() / ".composio/composio")
MAIL_JOBS = {"inbox-digest-sync": "67565a6352eb", "crm-mail-sync": "a4793b9ca62d"}
DEFAULT_AUDIT = Path.home() / ".hermes/cron/usage_audit.jsonl"

# Jev-pris 24-09: $0,042 pr. mio. input-tokens ≈ 0,30 kr. Output gratis.
JEV_KR_PER_MTOKEN = 0.30


def content_hash(*parts: object) -> str:
    raw = json.dumps(parts, ensure_ascii=False, sort_keys=True, default=str).encode()
    return hashlib.sha256(raw).hexdigest()


def content_is_image(body: str) -> bool:
    clean = re.sub(r"\s+", " ", body).strip().lower()
    return not clean or clean.startswith("[image]") or clean.startswith("[inline image]")


def jev_input_tokens(raw: object, body: str) -> int:
    """Faktiske input-tokens fra Jev-svaret når provideren leverer 'usage', ellers proxy."""
    usage = (raw or {}).get("usage") if isinstance(raw, dict) else None
    if isinstance(usage, dict):
        try:
            value = int(usage.get("input_tokens") or 0)
            if value > 0:
                return value
        except (TypeError, ValueError):
            pass
    return max(1, len(body) // 4)


def kr_for_tokens(tokens: int) -> float:
    return round(tokens * JEV_KR_PER_MTOKEN / 1_000_000, 6)


def extract_payload(data: object) -> tuple[dict, list[dict]]:
    cur = data
    if isinstance(cur, dict) and cur.get("storedInFile") and cur.get("outputFilePath"):
        try:
            cur = json.loads(Path(cur["outputFilePath"]).read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise RuntimeError(f"could not read stored Composio response: {exc}") from exc
    if isinstance(cur, dict) and "successful" in cur and isinstance(cur.get("data"), dict):
        cur = cur["data"]
    if not isinstance(cur, dict):
        raise RuntimeError("unexpected Composio response")
    messages = cur.get("messages") or cur.get("messages_list") or cur.get("data", {}).get("messages") or []
    if not isinstance(messages, list):
        raise RuntimeError("Gmail response missing message list")
    next_token = cur.get("nextPageToken") or cur.get("next_page_token")
    if not next_token and isinstance(cur.get("data"), dict):
        next_token = cur["data"].get("nextPageToken") or cur["data"].get("next_page_token")
    return cur, messages


def message_id(message: dict) -> str:
    return str(message.get("id") or message.get("messageId") or message.get("message_id") or "")


def fetch_gmail_window(query: str, days: int, page_size: int = 50) -> tuple[list[dict], int, int]:
    """Hent hele det bounded Gmail-vindue, aldrig kun første side."""
    max_messages = page_size * 20
    messages: list[dict] = []
    seen: set[str] = set()
    token = ""
    calls = 0
    for page in range(20):
        args = [COMPOSIO, "execute", "GMAIL_FETCH_EMAILS", "--account", "Kinly-1", "-d"]
        payload: dict[str, object] = {
            "user_id": "lucas@kinly.dk",
            "query": query or f"in:inbox newer_than:{days}d",
            "verbose": True,
            "max_results": page_size,
            "include_payload": True,
        }
        if token:
            payload["page_token"] = token
        proc = subprocess.run(args + [json.dumps(payload, ensure_ascii=False)], capture_output=True, text=True, timeout=180)
        calls += 1
        if proc.returncode:
            raise RuntimeError(f"Gmail page {page + 1} failed: {proc.stderr[-300:]}")
        try:
            data = json.loads(proc.stdout)
            response, page_messages = extract_payload(data)
        except Exception as exc:
            raise RuntimeError(f"Gmail page {page + 1}: {exc}") from exc
        for message in page_messages:
            if not isinstance(message, dict):
                continue
            mid = message_id(message)
            if mid and mid in seen:
                continue
            if mid:
                seen.add(mid)
            messages.append(message)
        token = response.get("nextPageToken") or ""
        if not token:
            return messages, calls, len(messages)
    raise RuntimeError(f"Gmail pagination exceeded bounded window of {max_messages} messages")


def decode_b64url(value: str) -> str:
    import base64
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4)).decode("utf-8", "replace")


def message_body(message: dict) -> str:
    payload = message.get("payload") or {}
    chunks: list[str] = []
    def walk(part: dict) -> None:
        mime = part.get("mimeType", "")
        body = part.get("body") or {}
        data = body.get("data")
        if data and mime in {"text/plain", "text/html"}:
            chunks.append(decode_b64url(data))
        for child in part.get("parts") or []:
            if isinstance(child, dict):
                walk(child)
    walk(payload)
    if chunks:
        return "\n".join(chunks).strip()
    snippet = str(message.get("snippet") or "").strip()
    return snippet


def message_fields(message: dict) -> tuple[str, str, str]:
    headers = {str(h.get("name", "")).lower(): str(h.get("value", "")) for h in (message.get("payload") or {}).get("headers", [])}
    return headers.get("from", ""), headers.get("subject", "(uden emne)"), headers.get("date", "")


def iso_at(value: str) -> str:
    """RFC 2822 → ISO-8601 (matcher app'ens ISO-forventning i handled-filter/sortering).
    Allerede-ISO input returneres uændret; ugyldig input giver ''."""
    s = str(value or "").strip()
    if not s:
        return ""
    try:
        if len(s) >= 10 and s[:4].isdigit() and s[4] == "-":
            return s
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(s).isoformat()
    except (TypeError, ValueError):
        return ""


class DeltaCache:
    def __init__(self, path: str | Path, days: int = 30):
        self.path = Path(path)
        self.days = days
        self.data = {"version": 2, "items": {}}
        try:
            loaded = json.loads(self.path.read_text(encoding="utf-8"))
            if loaded.get("version") == 2 and isinstance(loaded.get("items"), dict):
                self.data = loaded
        except (OSError, ValueError):
            pass

    def cached(self, message_id: str, digest: str) -> dict | None:
        item = self.data["items"].get(message_id)
        return item.get("result") if item and item.get("content_sha256") == digest and isinstance(item.get("result"), dict) and item.get("result", {}).get("ok") is True else None

    def update_item(self, message_id: str, digest: str, result: dict) -> None:
        old = self.data["items"].get(message_id) or {}
        if result.get("ok") is False and old.get("content_sha256") == digest:
            return
        if result.get("ok") is False:
            return
        merged = {**old, "content_sha256": digest, "updated_at": datetime.now(timezone.utc).isoformat(), "result": result}
        self.data["items"][message_id] = merged
        self._prune()
        self.save()

    def _prune(self) -> None:
        cutoff = datetime.now(timezone.utc) - timedelta(days=self.days)
        keep = {}
        for key, value in self.data["items"].items():
            try:
                if datetime.fromisoformat(value.get("updated_at", "").replace("Z", "+00:00")) >= cutoff:
                    keep[key] = value
            except ValueError:
                keep[key] = value
        self.data["items"] = keep

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(prefix=self.path.name + ".", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as fh:
                json.dump(self.data, fh, ensure_ascii=False, sort_keys=True, indent=2)
                fh.write("\n")
                fh.flush()
                os.fsync(fh.fileno())
            os.replace(tmp, self.path)
        finally:
            if os.path.exists(tmp):
                os.unlink(tmp)


def _today_audit(path: Path) -> tuple[int, float]:
    today = datetime.now(timezone.utc).date()
    calls = 0
    cost = 0.0
    try:
        for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
            try:
                row = json.loads(line)
                if "mail_job" not in row or datetime.fromisoformat(row["ts"].replace("Z", "+00:00")).date() != today:
                    continue
                calls += int(row.get("jev_calls", 0))
                cost += float(row.get("estimated_cost_kr", 0))
            except (ValueError, KeyError, TypeError):
                continue
    except OSError:
        pass
    return calls, cost


def write_mail_audit(path: str | Path, job_name: str, jev_calls: int, input_tokens: int, cost_kr: float, max_calls: int = 50, max_kr: float = 5.0, model: str = "jev-1.13.0", cache_hits: int = 0, changed: int = 0, errors: int = 0, duration_ms: int = 0) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+", encoding="utf-8") as fh:
        fcntl.flock(fh, fcntl.LOCK_EX)
        fh.seek(0)
        calls, cost = _read_open_audit(fh, job_name)
        if calls + jev_calls > max_calls or cost + cost_kr > max_kr:
            raise RuntimeError(f"daily budget exceeded for {job_name}: {calls}+{jev_calls} calls, kr {cost:.2f}+{cost_kr:.2f}")
        row = {
            "ts": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            "job_id": MAIL_JOBS.get(job_name, job_name),
            "fire_id": f"mail-{time.time_ns():x}",
            "mail_job": job_name,
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
            "jev_calls": jev_calls,
            "jev_input_tokens": input_tokens,
            "estimated_cost_kr": round(cost_kr, 6),
            "response_silent": True,
            "deliver_target": "local",
            "model": model,
            "cache_hits": cache_hits,
            "changed": changed,
            "errors": errors,
            "duration_ms": duration_ms,
            "error": None,
        }
        fh.seek(0, os.SEEK_END)
        fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        fh.flush()
        os.fsync(fh.fileno())
        fcntl.flock(fh, fcntl.LOCK_UN)


def _read_open_audit(fh, job_name: str) -> tuple[int, float]:
    today = datetime.now(timezone.utc).date()
    calls = 0
    cost = 0.0
    fh.seek(0)
    for line in fh:
        try:
            row = json.loads(line)
            if row.get("mail_job") == job_name and datetime.fromisoformat(row["ts"].replace("Z", "+00:00")).date() == today:
                calls += int(row.get("jev_calls", 0))
                cost += float(row.get("estimated_cost_kr", 0))
        except (ValueError, KeyError, TypeError):
            continue
    return calls, cost
