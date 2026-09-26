#!/usr/bin/env python3
"""Signed CLI mod Kinly HQ's blog-board (/api/agent/posts). Skrevet af Claude 26/9.

Hermes skriver ALTID som "hermes" — ruten afviser alt andet. Menneskets trin
(A/B-billedvalg, faktatjek, "Send til publicering") kan agenten ikke tage.

  crm_posts.py list [--stage ide|arbejder|klar|publicer|udgivet]
  crm_posts.py get --id <uuid>
  crm_posts.py missing --id <uuid>          # tjeklistens manglende punkter
  crm_posts.py create --title "..." [--category pris] [--note "..."]
  crm_posts.py update --id <uuid> --fields-file felter.json
  crm_posts.py move --id <uuid> --stage arbejder|klar

update tjekker selv FØR afsendelse: hver kilde-url i proofs.sources svarer
(HTTP < 400), og hver billed-url i images svarer med et billede. Én død kilde
= intet sendes (så en opdigtet kilde aldrig lander på kortet).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from crm_agent_log import load_secret, sign  # noqa: E402

ENDPOINT = "https://lead-finder-three-beta.vercel.app/api/agent/posts"
PATH = "/api/agent/posts"
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36 KinlyFactCheck"


def call(payload: dict) -> dict:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    ts = str(int(time.time()))
    req = Request(
        ENDPOINT,
        data=body.encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Timestamp": ts,
            "Authorization": f"Bearer {sign(load_secret(), ts, body, PATH)}",
        },
    )
    try:
        with urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode("utf-8"))
    except HTTPError as err:
        try:
            data = json.loads(err.read().decode("utf-8"))
        except Exception:
            data = {"ok": False, "error": f"HTTP {err.code}"}
        return data


def reachable(url: str, want_image: bool = False) -> str | None:
    """None = ok, ellers en kort fejltekst."""
    if not isinstance(url, str) or not url.startswith("https://"):
        return "skal være https://"
    for method in ("HEAD", "GET"):
        try:
            with urlopen(Request(url, method=method, headers={"User-Agent": UA}), timeout=20) as res:
                if res.status >= 400:
                    continue
                if want_image and not (res.headers.get("Content-Type") or "").startswith("image/"):
                    return "svarer ikke med et billede"
                return None
        except HTTPError as err:
            if method == "GET":
                return f"HTTP {err.code}"
        except (URLError, TimeoutError, OSError) as err:
            if method == "GET":
                return f"kan ikke nås ({err.__class__.__name__})"
    return "kan ikke nås"


def verify_fields(fields: dict) -> list[str]:
    problems: list[str] = []
    for i, src in enumerate((fields.get("proofs") or {}).get("sources") or []):
        url = (src or {}).get("url", "")
        err = reachable(url)
        if err:
            problems.append(f"kilde {i + 1} ({url}): {err}")
        for key in ("date", "claim"):
            if not str((src or {}).get(key, "")).strip():
                problems.append(f"kilde {i + 1}: '{key}' mangler")
    images = fields.get("images") or {}
    for slot in ("a", "b"):
        cand = images.get(slot)
        if isinstance(cand, dict) and cand.get("url"):
            err = reachable(cand["url"], want_image=True)
            if err:
                problems.append(f"billede {slot.upper()} ({cand['url']}): {err}")
    return problems


# Punkter kun Lucas/Charlie kan klare (billedvalg + faktatjek). Alt andet er agentens.
HUMAN_ONLY = ("menneskets A/B-valg", "menneskets faktatjek", "et billede skal vælges")


def agent_missing(post: dict) -> list[str]:
    missing = (post.get("checklist") or {}).get("missing") or []
    return [m for m in missing if not m.startswith(HUMAN_ONLY)]


def out(data: dict) -> None:
    print(json.dumps(data, ensure_ascii=False, indent=1))
    if not data.get("ok"):
        sys.exit(1)


def main() -> None:
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("list"); p.add_argument("--stage")
    for name in ("get", "missing"):
        p = sub.add_parser(name); p.add_argument("--id", required=True)
    p = sub.add_parser("create"); p.add_argument("--title", required=True); p.add_argument("--category"); p.add_argument("--note")
    p = sub.add_parser("update"); p.add_argument("--id", required=True); p.add_argument("--fields-file", required=True)
    p.add_argument("--to-klar", action="store_true", help="flyt til klar når kun menneskets trin mangler")
    p = sub.add_parser("move"); p.add_argument("--id", required=True); p.add_argument("--stage", required=True, choices=["ide", "arbejder", "klar"])
    a = ap.parse_args()

    if a.cmd == "list":
        data = call({"action": "list", **({"stage": a.stage} if a.stage else {})})
        if data.get("ok"):
            if not data.get("cards"):
                print("(ingen kort)")
            for c in data.get("cards", []):
                print(f"{c.get('id')}  [{c.get('stage')}]  {c.get('title')}  (mangler {len((c.get('checklist') or {}).get('missing') or [])})")
            return
        out(data)
    elif a.cmd == "get":
        out(call({"action": "get", "id": a.id}))
    elif a.cmd == "missing":
        data = call({"action": "get", "id": a.id})
        if not data.get("ok"):
            out(data)
        post = data["post"]
        missing = (post.get("checklist") or {}).get("missing") or []
        print(f"{post.get('title')} [{post.get('stage')}] — {len(missing)} mangler:")
        for m in missing:
            print(f"- {m}")
    elif a.cmd == "create":
        payload = {"action": "create", "title": a.title}
        if a.category:
            payload["category"] = a.category
        if a.note:
            payload["note"] = a.note
        out(call(payload))
    elif a.cmd == "update":
        with open(a.fields_file, encoding="utf-8") as fh:
            fields = json.load(fh)
        problems = verify_fields(fields)
        if problems:
            print("STOP — intet sendt. Ret disse og prøv igen:")
            for pr in problems:
                print(f"- {pr}")
            sys.exit(2)
        data = call({"action": "update", "id": a.id, "fields": fields})
        if not data.get("ok") or not a.to_klar:
            out(data)
            return
        rest = agent_missing(data.get("post") or call({"action": "get", "id": a.id}).get("post") or {})
        if rest:
            print("Gemt, men IKKE flyttet — agenten mangler stadig:")
            for m in rest:
                print(f"- {m}")
            sys.exit(3)
        stage = (data.get("post") or {}).get("stage")
        for target in (["arbejder", "klar"] if stage == "ide" else ["klar"] if stage == "arbejder" else []):
            moved = call({"action": "move", "id": a.id, "stage": target})
            if not moved.get("ok"):
                out(moved)
        print(f"OK — gemt og flyttet til klar. Mangler kun menneskets trin (billedvalg + faktatjek).")
    elif a.cmd == "move":
        out(call({"action": "move", "id": a.id, "stage": a.stage}))


if __name__ == "__main__":
    main()
