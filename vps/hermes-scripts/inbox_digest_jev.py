#!/usr/bin/env python3
"""No-agent Svar-indbakke: paginer alle mails, Jev klassificerer kun delta, KV verificeres.

Der er ingen send-route i dette script og ingen kladde-generering. Jev bruges til
type/svar/prioritet; billedmails bliver synlige som manuel triage og caches ikke.
KV-skrivning sker kun efter read-back af hele digesten.
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import jev_lib
from mail_sync_common import (mask_pii, DEFAULT_AUDIT, DeltaCache, content_hash, content_is_image,
                               fetch_gmail_window, iso_at, jev_input_tokens, kr_for_tokens,
                               message_body, message_fields, write_mail_audit)
import inbox_digest_sync

JOB = "inbox-digest-sync"
STATE = Path.home() / ".hermes/mail-sync/inbox-digest-state.json"
MODEL = jev_lib.JEV_MODEL
MAIL_TYPES = ["kunde", "leverandør", "lead", "spam", "auto-svar", "notifikation", "andre"]
QUESTIONS = {
    "type": {
        "type": "choice",
        "instructions": "Vælg præcis én mailtype: kunde, leverandør, lead, spam, auto-svar, notifikation eller andre.",
        "criteria": {label: label for label in MAIL_TYPES},
    },
    "reply": {
        "type": "choice",
        "instructions": "Kræver denne mail et reelt svar fra Lucas? Ja eller nej.",
        "criteria": {"Ja": "Ja", "Nej": "Nej"},
    },
    "priority": {
        "type": "choice",
        "instructions": "Vælg høj, mellem eller lav prioritet ud fra reel tidsfrist og konsekvens.",
        "criteria": {label: label for label in ("høj", "mellem", "lav")},
    },
}


def triage(reason: str) -> dict:
    return {"ok": False, "type": "andre", "reply": "Ja", "priority": "mellem", "reason": f"Manuel triage: {reason}", "manual_triage": True}


def choice(answer: dict, allowed: set[str]) -> str:
    if answer.get("type") != "choice" or answer.get("choice") not in allowed:
        raise ValueError("ugyldigt choice-svar")
    return str(answer["choice"])


def classify(raw: dict | None) -> dict:
    try:
        answers = (raw or {}).get("answers", {})
        if not isinstance(answers, dict):
            raise ValueError("manglende answers")
        mail_type = choice(answers["type"], set(MAIL_TYPES))
        reply = choice(answers["reply"], {"Ja", "Nej"})
        priority = choice(answers["priority"], {"høj", "mellem", "lav"})
        return {"ok": True, "type": mail_type, "reply": reply, "priority": priority, "reason": "", "manual_triage": False}
    except (KeyError, TypeError, ValueError):
        return triage("Jev svarede ikke gyldigt")


def importance(priority: str, manual: bool = False) -> int:
    if manual:
        return 80
    return {"høj": 90, "mellem": 60, "lav": 25}[priority]


def digest_item(msg: dict, result: dict) -> dict:
    sender, subject, date = message_fields(msg)
    body = message_body(msg)
    mail_type = result["type"]
    category = {
        "kunde": "client", "leverandør": "admin", "lead": "interested", "spam": "spam",
        "auto-svar": "auto-reply", "notifikation": "other", "andre": "other",
    }.get(mail_type, "other")
    item = {
        "id": str(msg.get("id") or msg.get("messageId") or ""),
        "account": "lucas@kinly.dk",
        "from": sender,
        "subject": subject,
        "snippet": body[:400],
        "date": iso_at(date) or date,  # ISO: appens handled-filter + sortering forventer ISO
        "category": category,
        "importance": importance(result["priority"], result.get("manual_triage", False)),
        "needsReply": result["reply"] == "Ja" or result.get("manual_triage", False),
        "reason": result.get("reason") or result.get("summary") or f"{mail_type} — ingen reel svarfrist fundet",
    }
    thread_id = str(msg.get("threadId") or "").strip()
    if thread_id:
        item["threadId"] = thread_id[:200]  # tråd-linket i Svar-siden kræver tråd-id'et
    return item


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--since", type=int, default=5)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if not jev_lib.load_key():
        raise RuntimeError("TYPESAFE_API_KEY missing; refusing Gmail/Jev run")
    started = datetime.now(timezone.utc)
    cache = DeltaCache(STATE)
    messages, gmail_calls, total = fetch_gmail_window(f"in:inbox newer_than:{args.since}d", args.since)
    rows: list[dict] = []
    pending_cache: list[tuple[str, str, dict]] = []
    new = changed = cached = manual = errors = jev_calls = input_tokens = 0
    failed: list[str] = []
    for msg in messages:
        mid = str(msg.get("id") or msg.get("messageId") or "")
        sender, subject, _ = message_fields(msg)
        body = message_body(msg)
        digest = content_hash(sender, subject, body, QUESTIONS, MODEL)
        old_item = cache.data.get("items", {}).get(mid)
        old = cache.cached(mid, digest)
        if old:
            result = old
            cached += 1
        elif content_is_image(body):
            result = triage("billede/ukendt krop")
            manual += 1
        else:
            raw = jev_lib.ask({"email": {"from": sender, "subject": subject, "body": mask_pii(body)[:12000]}}, QUESTIONS)
            result = classify(raw)
            result["model"] = str((raw or {}).get("model") or MODEL)
            jev_calls += 1
            input_tokens += jev_input_tokens(raw, body)
            if result["ok"]:
                if old_item and old_item.get("content_sha256") != digest:
                    changed += 1
                else:
                    new += 1
                pending_cache.append((mid, digest, result))
            else:
                errors += 1
                failed.append(mid or "?")
        rows.append(digest_item(msg, result))
    if errors:
        raise RuntimeError(f"{errors} mails lack a valid classification ({', '.join(failed[:8])}); refusing fresh digest/KV write")
    stats = {"fetched": total, "gmail_pages": gmail_calls, "new": new, "changed": changed, "cached": cached, "manual": manual, "errors": errors, "jev_calls": jev_calls}
    digest = {
        "generatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "generatedBy": "vps-hermes-jev",
        "account": "lucas@kinly.dk", "windowDays": args.since,
        "note": f"{total} hentet · {new} nye · {changed} ændrede · {cached} cache · {manual} manuel · {errors} fejl",
        "items": rows,
    }
    if not args.dry_run:
        validated = inbox_digest_sync.validate(digest)
        inbox_digest_sync.load_env()
        inbox_digest_sync.kv_cmd("SET", inbox_digest_sync.DIGEST_KEY, json.dumps(validated, ensure_ascii=False))
        # A write is a checkpoint only after read-back verification.
        back_raw = inbox_digest_sync.kv_cmd("GET", inbox_digest_sync.DIGEST_KEY)
        back = json.loads(back_raw) if isinstance(back_raw, str) else back_raw
        if (not isinstance(back, dict)
                or back.get("generatedAt") != validated.get("generatedAt")
                or len(back.get("items", [])) != len(validated["items"])):
            raise RuntimeError("KV read-back mismatch; checkpoint/cache not treated as fresh")
        for mid, digest, result in pending_cache:
            cache.update_item(mid, digest, result)
        write_mail_audit(DEFAULT_AUDIT, JOB, jev_calls, input_tokens, kr_for_tokens(input_tokens),
                         model=MODEL, cache_hits=cached, changed=changed, errors=errors,
                         duration_ms=int((datetime.now(timezone.utc) - started).total_seconds() * 1000))
    print(json.dumps({"stats": stats, "kv": inbox_digest_sync.DIGEST_KEY, "items": len(rows), "drafts": 0, "sent": 0}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
