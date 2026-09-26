#!/usr/bin/env python3
"""Deterministic no-agent CRM mail sync. Jev classifies; CRM writes are factual only.

26/9-omskrivning: kundelisten hentes dynamisk fra HQ (var hardkodet til 4 kunder,
fangede aldrig nye) og mails matches på deltager-adresser (From/To/Cc), aldrig på
fritekst i mailen (fritekst-match sendte tidligere kold-mails og Brevo-tests ind
som kunde-aktivitet). Se KONSTATEREDE FEJL i opgavebeskrivelsen for baggrunden.
"""
from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import crm_agent_log
import crm_read
import jev_lib
from mail_sync_common import (DEFAULT_AUDIT, DeltaCache, content_hash, content_is_image,
                               fetch_gmail_window, jev_input_tokens, kr_for_tokens,
                               message_body, message_fields, write_mail_audit)

JOB = "crm-mail-sync"
STATE = Path.home() / ".hermes/mail-sync/crm-mail-sync-state.json"
MODEL = jev_lib.JEV_MODEL
TYPES = ["kunde", "leverandør", "lead", "spam", "auto-svar", "notifikation", "andre"]
QUESTIONS = {
    "type": {
        "type": "choice",
        "instructions": "Vælg præcis én mailtype: kunde, leverandør, lead, spam, auto-svar, notifikation eller andre.",
        "criteria": {label: label for label in TYPES},
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
# ponytail: ingen billig fritekstmodel er wired ind i denne jobs kontekst (mail-jobs
# blev 24-25/9 lige flyttet VÆK fra deepseek til ren Jev for at spare tokens) —
# næste-skridt-feltet holdes derfor altid tomt. Kun waiting_on kommer fra Jev.
# Upgrade: kobl en billig tekstmodel på hvis Hermes får én til rådighed for scripts.
STATUS_QUESTIONS = {
    "waiting_on": {
        "type": "choice",
        "instructions": (
            "Ud fra de seneste mails i tråden: hvem venter på hvem lige nu? "
            "'os' = kunden venter på svar fra os (vi skylder svar). "
            "'kunden' = vi venter på svar fra kunden (bolden ligger hos dem). "
            "'ingen' = ingen venter, tråden kræver ikke handling lige nu."
        ),
        "criteria": {"os": "os", "kunden": "kunden", "ingen": "ingen"},
    },
}
STATUS_LABEL = {"os": "kunden venter på os", "kunden": "vi venter på kunden", "ingen": "ingen venter"}
# Domæne-match ignoreres for gratis mailudbydere (kun eksakt adresse tæller der);
# ponytail: statisk liste, udvid hvis en kunde bruger en udbyder der ikke er med.
FREEMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "hotmail.com", "hotmail.dk", "outlook.com", "outlook.dk",
    "live.dk", "live.com", "yahoo.com", "yahoo.dk", "icloud.com", "me.com", "msn.com",
    "protonmail.com", "gmx.com", "mail.com",
}
BREVO_MARKERS = ("sendinblue", "brevo")


def _load_credentials_env() -> None:
    import os
    for line in open("/root/.hermes/credentials.env", encoding="utf-8"):
        line = line.strip()
        if "=" in line and not line.startswith("#"):
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def kv(*args):
    import os
    import urllib.request
    _load_credentials_env()
    req = urllib.request.Request(os.environ["KV_REST_API_URL"], data=json.dumps(list(args)).encode(),
                                 headers={"Authorization": f"Bearer {os.environ['KV_REST_API_TOKEN']}"})
    with urllib.request.urlopen(req, timeout=30) as response:
        return json.load(response).get("result")


def our_addresses() -> set[str]:
    """Lucas/Charlie/Kinly-adresser: mails herfra er 'ud' (spec §C)."""
    import os
    _load_credentials_env()
    raw = {os.environ.get("GMAIL_USER", ""), os.environ.get("CHARLIE_GMAIL_USER", ""), "lucas@kinly.dk"}
    return {a.strip().lower() for a in raw if a.strip()}


def sender_address(header_value: str) -> str:
    match = jev_lib.EMAIL_RE.search(header_value or "")
    return match.group(0).lower() if match else ""


def load_customers() -> list[dict]:
    """Kunder = company.lifecycle 'kunde' + varme leads med aftale (HQ afgør, spec §A)."""
    data = crm_read.fetch("/api/agent/read", {"what": "customer-contacts"})
    if not isinstance(data, dict) or not data.get("ok"):
        raise RuntimeError(f"kunne ikke hente kundeliste fra HQ: {data}")
    customers = data.get("customers")
    if not isinstance(customers, list):
        raise RuntimeError("HQ svarede uden kundeliste")
    return customers


def build_index(customers: list[dict]) -> tuple[dict[str, str], dict[str, str]]:
    """adresse→kundenavn (eksakt) og domæne→kundenavn (aldrig gratis-udbydere)."""
    by_address: dict[str, str] = {}
    by_domain: dict[str, str] = {}
    for c in customers:
        name = str(c.get("name") or "").strip()
        if not name:
            continue
        for email in c.get("emails") or []:
            addr = str(email).strip().lower()
            if addr:
                by_address[addr] = name
        for domain in c.get("domains") or []:
            d = str(domain).strip().lower().removeprefix("www.")
            if d and d not in FREEMAIL_DOMAINS:
                by_domain[d] = name
    return by_address, by_domain


def build_query(customers: list[dict], days: int = 14) -> str:
    """Gmail-forespørgsel afgrænset til kundernes egne from:/to:/cc:-adresser og domæner."""
    terms: set[str] = set()
    for c in customers:
        addresses = {str(e).strip().lower() for e in (c.get("emails") or []) if str(e).strip()}
        domains = {str(d).strip().lower().removeprefix("www.") for d in (c.get("domains") or []) if str(d).strip()}
        domains -= FREEMAIL_DOMAINS
        for token in addresses | domains:
            terms.update((f"from:{token}", f"to:{token}", f"cc:{token}"))
    if not terms:
        raise RuntimeError("ingen kunde-adresser fundet i HQ; nægter tomt Gmail-søgevindue")
    return f"({' OR '.join(sorted(terms))}) newer_than:{days}d"


def _headers(message: dict) -> dict[str, str]:
    return {str(h.get("name", "")).lower(): str(h.get("value", "")) for h in (message.get("payload") or {}).get("headers", [])}


def participant_addresses(message: dict) -> list[str]:
    headers = _headers(message)
    raw = " ".join(headers.get(k, "") for k in ("from", "to", "cc"))
    return [m.lower() for m in jev_lib.EMAIL_RE.findall(raw)]


def customer_for(message: dict, by_address: dict[str, str], by_domain: dict[str, str]) -> str:
    """Matcher KUN på deltager-adresser (From/To/Cc) — aldrig på tekst i mailen (spec §A)."""
    for addr in participant_addresses(message):
        if addr in by_address:
            return by_address[addr]
        domain = addr.rsplit("@", 1)[-1]
        if domain in by_domain:
            return by_domain[domain]
    return ""


def is_campaign_noise(message: dict) -> bool:
    """Brevo/nyhedsbrev-tests og lignende støj (spec §B) — filtreres FØR Jev-kald."""
    headers = _headers(message)
    subject = headers.get("subject", "").strip()
    if re.match(r"^test\b", subject, re.IGNORECASE):
        return True
    signal = " ".join(headers.get(k, "") for k in ("list-unsubscribe", "x-mailer", "return-path", "received")).lower()
    return any(marker in signal for marker in BREVO_MARKERS)


def slug(value: str) -> str:
    value = re.sub(r"[^a-z0-9æøå]+", "-", value.lower()).strip("-")
    return value[:60] or "mail"


def day_of(value: str) -> str:
    """Normalisér RFC 2822- eller ISO-dato til YYYY-MM-DD (til transition-dedupe)."""
    s = str(value or "").strip()
    if not s:
        return ""
    try:
        if len(s) >= 10 and s[:4].isdigit() and s[4] == "-":
            return s[:10]
        from email.utils import parsedate_to_datetime
        return parsedate_to_datetime(s).date().isoformat()
    except (TypeError, ValueError):
        return ""


def iso_at(value: str) -> str:
    """RFC 2822 → ISO-8601, så CRM-loggen matcher de gamle postes format (JS Date-parsebart)."""
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


def _sort_key(message: dict):
    _, _, date = message_fields(message)
    iso = iso_at(date)
    try:
        return datetime.fromisoformat(iso) if iso else datetime.min.replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.min.replace(tzinfo=timezone.utc)


def thread_text(messages: list[dict], limit: int = 2500) -> str:
    """Seneste ≤3 mails, trunkeret til i alt ~2.500 tegn (spec §D)."""
    # Budgettet bruges nyeste-først (fix 26/9: ældste-først skar den nyeste mail
    # helt væk, så Jev dømte VIDA "ingen venter" på en mail med 5 spørgsmål).
    parts: list[str] = []
    total = 0
    for m in reversed(messages):
        sender, subject, date = message_fields(m)
        chunk = f"[{date}] {sender}: {subject}\n{message_body(m)}".strip()
        if total + len(chunk) > limit:
            chunk = chunk[: max(0, limit - total)]
        if chunk:
            parts.append(chunk)
            total += len(chunk)
        if total >= limit:
            break
    return "\n---\n".join(reversed(parts))


def guard_status(waiting_on: str, last_is_ours: bool, last_body: str) -> str:
    """Deterministisk værn over Jev: stiller vores seneste mail et spørgsmål,
    ligger bolden hos kunden — uanset hvad Jev mener."""
    own = re.split(r"(?m)^(?:>|Den .{0,80} skrev|On .{0,80} wrote)", last_body, maxsplit=1)[0]
    if last_is_ours and re.search(r"\?(\s|$)", own) and waiting_on != "kunden":
        return "kunden"
    return waiting_on


def fresh_activities(activities: list[dict], prior: list[dict]) -> list[dict]:
    """Fjern dubletter: (a) eksakt id, (b) transition — legacy-scan har allerede dækket klient+dag."""
    existing = {str(p.get("id")) for p in prior if p.get("id")}
    legacy_pairs = {(p.get("clientName"), day_of(str(p.get("at", "")))) for p in prior
                    if str(p.get("id", "")).startswith("act_mail_") and p.get("actor") != "hermes (mail-sync)"}
    return [item for item in activities
            if item["id"] not in existing and (item["clientName"], day_of(item["at"])) not in legacy_pairs]


def classify(raw: dict | None) -> dict:
    try:
        answers = (raw or {}).get("answers", {})
        if not isinstance(answers, dict):
            raise ValueError("manglende answers")
        def get(key, allowed):
            value = answers[key]
            if value.get("type") != "choice" or value.get("choice") not in allowed:
                raise ValueError("ugyldigt svar")
            return str(value["choice"])
        return {"ok": True, "type": get("type", set(TYPES)), "reply": get("reply", {"Ja", "Nej"}),
                "priority": get("priority", {"høj", "mellem", "lav"}), "manual_triage": False}
    except (KeyError, TypeError, ValueError):
        return {"ok": False, "type": "andre", "reply": "Ja", "priority": "mellem", "manual_triage": True}


def classify_status(raw: dict | None) -> dict:
    try:
        answer = (raw or {}).get("answers", {})["waiting_on"]
        if answer.get("type") != "choice" or answer.get("choice") not in STATUS_LABEL:
            raise ValueError("ugyldigt svar")
        return {"ok": True, "waitingOn": str(answer["choice"])}
    except (KeyError, TypeError, ValueError):
        return {"ok": False, "waitingOn": "ingen"}


def main() -> int:
    if not jev_lib.load_key():
        raise RuntimeError("TYPESAFE_API_KEY missing; refusing Gmail/Jev run")
    started = datetime.now(timezone.utc)
    customers = load_customers()
    by_address, by_domain = build_index(customers)
    query = build_query(customers)
    ours = our_addresses()
    cache = DeltaCache(STATE)
    previous = json.loads(kv("GET", "doc:crm/mail-sync-state") or "{}")
    # Bounded window: all matching mail in the 14-day safety window, paginated.
    messages, gmail_calls, fetched = fetch_gmail_window(query, 14)
    new = changed = cached = manual = noise = errors = jev_calls = input_tokens = 0
    failed: list[str] = []
    activities: list[dict] = []
    messages_by_client: dict[str, list[dict]] = {}
    pending_cache: list[tuple[str, str, dict]] = []
    for message in messages:
        client = customer_for(message, by_address, by_domain)
        if not client:
            continue
        if is_campaign_noise(message):
            noise += 1
            continue
        mid = str(message.get("id") or message.get("messageId") or "")
        sender, subject, date = message_fields(message)
        body = message_body(message)
        if content_is_image(body):
            manual += 1
            continue
        digest = content_hash(sender, subject, body, QUESTIONS, MODEL)
        old_item = cache.data.get("items", {}).get(mid)
        result = cache.cached(mid, digest)
        if result:
            cached += 1
        else:
            raw = jev_lib.ask({"email": {"from": sender, "subject": subject, "body": body[:12000]}}, QUESTIONS)
            result = classify(raw)
            result["model"] = str((raw or {}).get("model") or MODEL)
            jev_calls += 1
            input_tokens += jev_input_tokens(raw, body)
            if not result["ok"]:
                errors += 1
                failed.append(mid or "?")
                continue
            if old_item and old_item.get("content_sha256") != digest:
                changed += 1
            else:
                new += 1
            pending_cache.append((mid, digest, result))
        if result["type"] in {"spam", "auto-svar", "notifikation", "andre"}:
            continue
        messages_by_client.setdefault(client, []).append(message)
        # Deterministic factual CRM activity; no generated prose and no drafts.
        # id/at i ISO (fix 25/9: rå RFC-dato gav id'er som "act_mail_Mon, 21 Se_…").
        activity_id = f"act_mail_{(day_of(date).replace('-', '') or '00000000')}_{slug(client)}_{mid[-12:]}"
        actor = "Lucas" if "lucas" in sender.lower() else (sender.split("<")[-1].split(">")[0].strip() or "Afsender")
        text = f"{actor}: {subject or '(uden emne)'}".strip()[:240]
        dir_ = "ud" if sender_address(sender) in ours else "ind"
        activities.append({"id": activity_id, "clientName": client, "at": iso_at(date) or date or datetime.now(timezone.utc).isoformat(),
                            "type": "email", "text": text, "actor": "hermes (mail-sync)", "dir": dir_})
    if errors:
        raise RuntimeError(f"{errors} mails lack a valid classification ({', '.join(failed[:8])}); refusing CRM writes")
    # Dedupe mod eksisterende KV-poster før nogen skrivning: eksakt id + transition (legacy-dækkede dage).
    prior: list[dict] = []
    for item in kv("LRANGE", "log:crm-activity", "0", "-1") or []:
        if isinstance(item, str) and item.startswith("{"):
            try:
                parsed = json.loads(item)
            except ValueError:
                continue
            if isinstance(parsed, dict):
                prior.append(parsed)
    fresh = fresh_activities(activities, prior)
    for item in fresh:
        kv("RPUSH", "log:crm-activity", json.dumps(item, ensure_ascii=False))
    back = {str(json.loads(item).get("id")) for item in (kv("LRANGE", "log:crm-activity", "0", "-1") or []) if isinstance(item, str) and item.startswith("{")}
    if any(item["id"] not in back for item in fresh):
        raise RuntimeError("CRM activity read-back mismatch; state not advanced")
    now = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
    state = {**previous, "lastRunAt": now, "by": "hermes (mail-sync script)"}
    kv("SET", "doc:crm/mail-sync-state", json.dumps(state, ensure_ascii=False))
    state_back = json.loads(kv("GET", "doc:crm/mail-sync-state") or "{}")
    if state_back.get("lastRunAt") != now:
        raise RuntimeError("CRM state read-back mismatch")
    for mid, digest, result in pending_cache:
        cache.update_item(mid, digest, result)

    # Auto-status pr. kunde med nye mails denne kørsel (spec §D). Best-effort: en
    # fejl her må aldrig rulle den allerede bekræftede mail-sync tilbage.
    status_written = status_errors = 0
    # --status-all: engangs-genberegning for alle kunder (fx efter fix af status-logik).
    status_clients = set(messages_by_client) if "--status-all" in sys.argv else {item["clientName"] for item in fresh}
    for client in sorted(status_clients):
        recent = sorted(messages_by_client.get(client, []), key=_sort_key)[-3:]
        if not recent:
            continue
        try:
            text = thread_text(recent)
            raw = jev_lib.ask({"thread": text}, STATUS_QUESTIONS)
            jev_calls += 1
            input_tokens += jev_input_tokens(raw, text)
            result = classify_status(raw)
            if not result["ok"]:
                status_errors += 1
                continue
            last_sender, _, _ = message_fields(recent[-1])
            result["waitingOn"] = guard_status(result["waitingOn"], sender_address(last_sender) in ours,
                                               message_body(recent[-1]))
            based_on = [str(m.get("id") or m.get("messageId") or "") for m in recent]
            crm_agent_log.log_activity(
                actor="hermes", event_type="status", company=client,
                summary=f"Mail-status: {STATUS_LABEL[result['waitingOn']]}",
                payload={"waitingOn": result["waitingOn"], "nextStep": "", "basedOn": based_on},
            )
            status_written += 1
        except Exception:  # noqa: BLE001 — best-effort, må aldrig vælte den bekræftede sync
            status_errors += 1

    write_mail_audit(DEFAULT_AUDIT, JOB, jev_calls, input_tokens, kr_for_tokens(input_tokens),
                     model=MODEL, cache_hits=cached, changed=changed, errors=errors,
                     duration_ms=int((datetime.now(timezone.utc) - started).total_seconds() * 1000))
    print(json.dumps({"fetched": fetched, "gmail_pages": gmail_calls, "new": new, "changed": changed,
                      "cached": cached, "manual": manual, "noise": noise, "errors": errors, "jev_calls": jev_calls,
                      "activities": len(fresh), "status_written": status_written, "status_errors": status_errors,
                      "tasks": 0, "drafts": 0, "sent": 0,
                      "state_verified": state_back.get("lastRunAt") == now}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
