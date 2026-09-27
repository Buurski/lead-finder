#!/usr/bin/env python3
"""DeepSeek-saldoalarm (no_agent cron, 0 LLM-tokens).

Tavs (tom stdout) medmindre DeepSeek har svaret "Insufficient Balance" (402)
siden sidste kørsel. Kilder: Hermes-logs + sessions.compression_failure_error.
Baggrund: wiki/os/hermes-token-diagnose-2026-09-26.md (saldo løb tør >=4x uden varsel).
"""
import glob, json, os, re, sqlite3, time

HOME = os.environ.get("HERMES_HOME", "/root/.hermes")
STATE = os.path.join(HOME, "cron-data", "deepseek_saldo_alarm.json")
PAT = re.compile(r"insufficient.?balance", re.I)

def main():
    try:
        last = json.load(open(STATE))["last"]
    except Exception:
        last = time.time() - 3600
    now = time.time()
    hits = 0
    for path in glob.glob(os.path.join(HOME, "logs", "*.log")):
        if os.path.getmtime(path) < last:
            continue
        with open(path, errors="replace") as f:
            for line in f:
                if PAT.search(line):
                    m = re.match(r"(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d)", line)
                    if m and time.mktime(time.strptime(m.group(1), "%Y-%m-%d %H:%M:%S")) >= last:
                        hits += 1
    for db in [os.path.join(HOME, "state.db")] + glob.glob(os.path.join(HOME, "profiles", "*", "state.db")):
        try:
            c = sqlite3.connect(f"file:{db}?mode=ro", uri=True, timeout=5)
            hits += c.execute("select count(*) from sessions where coalesce(last_activity_at, started_at) >= ? "
                              "and compression_failure_error like '%nsufficient%alance%'", (last,)).fetchone()[0]
            c.close()
        except sqlite3.Error:
            pass
    # Cron-jobs der døde på 402 (27/9: to ugejobs fejlede uden at alarmen sagde noget).
    try:
        from datetime import datetime
        d = json.load(open(os.path.join(HOME, "cron", "jobs.json")))
        for j in (d["jobs"] if isinstance(d, dict) else d):
            ran = j.get("last_run_at")
            if ran and PAT.search(str(j.get("last_error") or "")) and datetime.fromisoformat(ran).timestamp() >= last:
                hits += 1
    except (OSError, ValueError, KeyError):
        pass
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    json.dump({"last": now}, open(STATE, "w"))
    if hits:
        print(f"DeepSeek-saldoen er tom ({hits} afviste kald siden sidste tjek). "
              "Compression og fallback virker ikke før du fylder op: platform.deepseek.com/top_up")

if __name__ == "__main__":
    main()
