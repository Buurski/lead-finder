#!/usr/bin/env python3
"""udgifter_hq.py — månedlig kvitterings-høst → Kinly HQ's udgiftslog (/udgifter).

Læser kvitterings-mails via Composio-CLI'en (read-only), trækker beløb ud med faste
regler pr. leverandør (ingen LLM), og POSTer dem til HQ: POST /api/agent/expenses
(HMAC med HERMES_API_SECRET via crm_agent_log.sign). HQ deduplikerer på `ref`
(kvitteringsnummer, ellers message-id), så scriptet kan køres igen uden skade.

Charlies gæld regnes i HQ: ½ af fælles poster Lucas har lagt ud − ½ af dem Charlie har
lagt ud − hans overførsler (alt efter 26/7-2026). ChatGPT (179 kr/md, Charlie betaler)
lægges ind som fast post d. 1. hver måned fra sep-2026.

Kører som no-agent cron-job (stdout = rapporten på Telegram). Manuelt:
  python3 /root/.hermes/scripts/udgifter_hq.py --dry-run
  python3 /root/.hermes/scripts/udgifter_hq.py --since 2026-07-27
"""
from __future__ import annotations

import argparse
import fcntl
import json
import os
import re
import subprocess
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

sys.path.insert(0, str(Path(__file__).resolve().parent))
from crm_agent_log import load_secret, sign  # noqa: E402

ENDPOINT = "https://lead-finder-three-beta.vercel.app/api/agent/expenses"
PATH = "/api/agent/expenses"
CLI = os.path.expanduser("~/.composio/composio")
LOCK = Path("/root/.hermes/state/udgifter-hq.lock")
LEDGER_START = date(2026, 7, 26)  # alt til og med denne dag er afregnet (samme som HQ)
RATES = {"DKK": 1.0, "USD": 6.9, "EUR": 7.46}  # samme faste kurser som HQ's subscriptions.ts
TZ = ZoneInfo("Europe/Copenhagen")
CHATGPT = {"vendor": "ChatGPT (Charlie betaler)", "amount": 179.0, "from": date(2026, 9, 1)}

# Én konto pr. regel: lucas@kinly.dk får videresendte kopier med ANDRE message-id'er,
# så samme kvittering må kun høstes ét sted. ref-regex = kvitteringsnummer når det findes.
RULES = [
    {"vendor": "Vercel", "user": "buur.aigro@gmail.com",
     "query": 'from:vercel.com subject:"Your receipt from Vercel"',
     "amount": r"Receipt from Vercel Inc\.\s*\$([\d.,]+)\s*Paid", "cur": "USD", "ref": r"Receipt #([\d-]+)"},
    {"vendor": "Contabo VPS", "user": "buur.aigro@gmail.com",
     "query": 'from:contabo.com subject:"Automatic payment via Credit Card successful"',
     "amount": r"charged\s*€\s*([\d.,]+)", "cur": "EUR", "ref": None},
    {"vendor": "Google Cloud (Places)", "user": "buur.aigro@gmail.com",
     "query": 'from:payments-noreply@google.com subject:"Google Cloud Platform" subject:"Betaling modtaget"',
     "amount": r"betaling på\s*([\d.,]+)\s*kr", "cur": "DKK", "ref": r"reference\s+(CLOUD\s+[A-Z0-9]+)"},
    {"vendor": "OpenRouter", "user": "buur.aigro@gmail.com",
     "query": 'from:receipts@openrouter.ai',
     "amount": r"Amount paid\s*\$([\d.,]+)", "cur": "USD", "ref": r"Receipt #([\d-]+)"},
]
# Ingen høstbar mail-kvittering (Workspace: beløb kun i PDF på lucas@kinly.dk, som CLI'en på
# VPS'en ikke når; DeepSeek: sender ingen kvitteringer). Rapporten minder om dem hver måned.
MANUAL_REMINDERS = [
    "Google Workspace (faktura ~d. 1., ca. €10/md — beløbet står i PDF'en i lucas@kinly.dk)",
    "DeepSeek-topups (ingen mailkvittering — se DeepSeek-konsollen)",
]

def parse_num(s: str) -> float | None:
    s = s.strip().rstrip(".")
    if "," in s and "." in s:
        s = s.replace(".", "").replace(",", ".") if s.rfind(",") > s.rfind(".") else s.replace(",", "")
    elif "," in s:
        s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def fetch(user: str, query: str, max_results: int = 100) -> list[dict] | None:
    payload = {"user_id": user, "query": query, "max_results": max_results}
    for attempt in range(4):
        try:
            r = subprocess.run([CLI, "execute", "GMAIL_FETCH_EMAILS", "-d", json.dumps(payload)],
                               capture_output=True, text=True, timeout=150)
            out = (r.stdout or "").strip()
            i = out.find("{")
            meta = json.loads(out[i:]) if i >= 0 else {}
            data = meta
            if meta.get("outputFilePath"):
                data = json.load(open(meta["outputFilePath"], encoding="utf-8"))
            msgs = (data.get("data") or {}).get("messages")
            if meta.get("successful") and msgs is not None:
                return msgs
        except (subprocess.SubprocessError, ValueError, OSError):
            pass
        time.sleep(3 + attempt * 3)
    return None


def local_date(ts: str) -> date:
    return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(TZ).date()


def harvest(since: date) -> tuple[list[dict], list[str]]:
    after = (since - timedelta(days=1)).strftime("%Y/%m/%d")
    items: list[dict] = []
    problems: list[str] = []
    for rule in RULES:
        msgs = fetch(rule["user"], f'{rule["query"]} after:{after}')
        if msgs is None:
            problems.append(f"{rule['vendor']}: kunne ikke hente mail")
            continue
        for m in msgs:
            text = re.sub(r"\s+", " ", m.get("messageText") or "")
            d = local_date(m.get("messageTimestamp") or "1970-01-01T00:00:00Z")
            if d < since:
                continue
            hit = re.search(rule["amount"], text, re.I)
            amt = parse_num(hit.group(1)) if hit else None
            if not amt:
                problems.append(f"{rule['vendor']} {d}: fandt ikke beløbet ({(m.get('subject') or '')[:60]})")
                continue
            ref_hit = re.search(rule["ref"], text) if rule["ref"] else None
            ref = f"{rule['vendor']}:{ref_hit.group(1)}" if ref_hit else f"gmail:{m.get('messageId')}"
            items.append({
                "date": d.isoformat(), "vendor": rule["vendor"],
                "amount": round(amt * RATES[rule["cur"]], 2),
                "original": f"{amt:g} {rule['cur']}", "share": "selskab", "payer": "lucas", "ref": ref,
                "note": (m.get("subject") or "")[:120],
            })
    return items, problems


def chatgpt_items(since: date, today: date) -> list[dict]:
    out = []
    y, mth = CHATGPT["from"].year, CHATGPT["from"].month
    while date(y, mth, 1) <= today:
        d = date(y, mth, 1)
        if d >= since:
            out.append({"date": d.isoformat(), "vendor": CHATGPT["vendor"], "amount": CHATGPT["amount"],
                        "share": "selskab", "payer": "charlie", "ref": f"chatgpt:{d:%Y-%m}",
                        "note": "Fast: Charlie betaler hele abonnementet, ½ modregnes"})
        y, mth = (y + 1, 1) if mth == 12 else (y, mth + 1)
    return out


def post(items: list[dict]) -> dict:
    body = json.dumps({"expenses": items}, ensure_ascii=False, separators=(",", ":"))
    ts = str(int(time.time()))
    req = Request(ENDPOINT, data=body.encode("utf-8"), method="POST", headers={
        "Content-Type": "application/json", "X-Timestamp": ts,
        "Authorization": f"Bearer {sign(load_secret(), ts, body, PATH)}"})
    try:
        with urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except HTTPError as e:
        return {"ok": False, "error": f"HTTP {e.code}: {e.read().decode('utf-8', 'replace')[:200]}"}


def kr(n: float) -> str:
    return f"{n:,.2f} kr".replace(",", "X").replace(".", ",").replace("X", ".")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--since", help="YYYY-MM-DD (default: 45 dage tilbage)")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    today = datetime.now(TZ).date()
    since = date.fromisoformat(a.since) if a.since else today - timedelta(days=45)
    since = max(since, LEDGER_START + timedelta(days=1))

    LOCK.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCK, "w") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("udgifter-hq: kører allerede — springer over")
            return 0
        items, problems = harvest(since)
        items += chatgpt_items(since, today)
        if a.dry_run:
            print(json.dumps(items, ensure_ascii=False, indent=1))
            print("problemer:", problems)
            return 0
        res = post(items) if items else {"ok": True, "added": 0, "skipped": 0, "rejected": [], "possibleDuplicates": []}

    lines = [f"🧾 Udgifter → HQ ({since:%d/%m}–{today:%d/%m})"]
    if not res.get("ok"):
        lines.append(f"❌ HQ afviste: {res.get('error')}")
    else:
        lines.append(f"Nye poster: {res.get('added', 0)} · allerede i HQ: {res.get('skipped', 0)}")
        for r in res.get("rejected") or []:
            it = items[r["index"]]
            lines.append(f"⚠️ afvist: {it['vendor']} {it['date']} — {r['error']}")
        for dup in res.get("possibleDuplicates") or []:
            lines.append(f"⚠️ ligner en manuel post, ikke lagt ind: {dup['vendor']} {dup['date']} {kr(dup['amount'])}")
        bal = res.get("balance")
        if bal:
            owed = bal["owed"]
            lines.append(f"💰 Charlie skylder nu: {kr(owed)}" if owed >= 0 else f"💰 Lucas skylder Charlie: {kr(-owed)}")
    for p in problems:
        lines.append(f"⚠️ {p}")
    for m in MANUAL_REMINDERS:
        lines.append(f"✍️ Tilføj selv i HQ /udgifter: {m}")
    print("\n".join(lines))
    return 0


if __name__ == "__main__":
    sys.exit(main())
