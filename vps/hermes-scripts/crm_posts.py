#!/usr/bin/env python3
"""Signed CLI mod Kinly HQ's blog-board (/api/agent/posts). Skrevet af Claude 26/9.

Hermes skriver ALTID som "hermes" — ruten afviser alt andet. Menneskets trin
(billedvalg blandt images.a/b/c, faktatjek, "Send til publicering") kan agenten ikke tage.

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


def call(payload: dict, path: str = PATH) -> dict:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    ts = str(int(time.time()))
    req = Request(
        ENDPOINT.replace(PATH, path),
        data=body.encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "X-Timestamp": ts,
            "Authorization": f"Bearer {sign(load_secret(), ts, body, path)}",
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
    last = "kan ikke nås"
    # Nogle bot-værn (fx Simply, HTTP 454) afviser browser-agtige UA'er men godtager en ærlig bot-UA — prøv begge.
    for ua in (UA, "KinlyBlog/1.0 (lucas@kinly.dk)"):
        for method in ("HEAD", "GET"):
            try:
                with urlopen(Request(url, method=method, headers={"User-Agent": ua}), timeout=20) as res:
                    if res.status >= 400:
                        continue
                    if want_image and not (res.headers.get("Content-Type") or "").startswith("image/"):
                        return "svarer ikke med et billede"
                    return None
            except HTTPError as err:
                last = f"HTTP {err.code}"
            except (URLError, TimeoutError, OSError) as err:
                last = f"kan ikke nås ({err.__class__.__name__})"
    return last


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
    for slot in ("a", "b", "c"):
        cand = images.get(slot)
        if isinstance(cand, dict) and cand.get("url"):
            err = reachable(cand["url"], want_image=True)
            if err:
                problems.append(f"billede {slot.upper()} ({cand['url']}): {err}")
    return problems


# Punkter kun Lucas/Charlie kan klare (billedvalg + faktatjek). Alt andet er agentens.
# "menneskets A/B-valg" er den gamle tekst — står stadig i gemte tjeklister.
HUMAN_ONLY = ("menneskets billedvalg", "menneskets A/B-valg", "menneskets faktatjek", "et billede skal vælges")


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
    p = sub.add_parser("upload", help="upload PNG/WebP (fx kinly_graf-output) -> offentlig url")
    p.add_argument("--id", required=True); p.add_argument("--slot", required=True, choices=["a", "b", "c", "a-mobile", "b-mobile", "c-mobile"])
    p.add_argument("--file", required=True)
    # Arbejds-flowet (27-09): Lucas trækker et kort til Arbejder = "skriv den nu".
    sub.add_parser("queue", help="kort i Arbejder der venter på Hermes (ældste først)")
    p = sub.add_parser("claim", help="tag kortet — før du skriver"); p.add_argument("--id", required=True)
    p = sub.add_parser("progress", help="vis fremdrift på kortet i HQ")
    p.add_argument("--id", required=True); p.add_argument("--step", type=int, required=True)
    p.add_argument("--steps", type=int, required=True); p.add_argument("--label", required=True)
    p = sub.add_parser("fail", help="marker kortet som fejlet (bliver i Arbejder)")
    p.add_argument("--id", required=True); p.add_argument("--error", required=True)
    a = ap.parse_args()

    if a.cmd == "queue":
        data = call({"action": "queue"})
        if data.get("ok"):
            cards = data.get("cards") or []
            if not cards:
                print("(ingen kort venter)")
            for c in cards:
                print(f"{c.get('id')}  {c.get('title')}  (bestilt {(c.get('work') or {}).get('requestedAt', '?')})")
            return
        out(data)
    elif a.cmd == "claim":
        out(call({"action": "claim", "id": a.id}))
    elif a.cmd == "progress":
        # Best-effort: fremdrift må aldrig stoppe selve skrivningen.
        data = call({"action": "progress", "id": a.id, "step": a.step, "steps": a.steps, "label": a.label[:120]})
        print("ok" if data.get("ok") else f"(fremdrift ikke gemt: {data.get('error')})")
        return
    elif a.cmd == "fail":
        out(call({"action": "fail", "id": a.id, "error": a.error[:300]}))
        return

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
    elif a.cmd == "upload":
        import base64
        mime = "image/webp" if a.file.lower().endswith(".webp") else "image/png"
        with open(a.file, "rb") as fh:
            data = base64.b64encode(fh.read()).decode("ascii")
        out(call({"id": a.id, "slot": a.slot, "mime": mime, "data": data}, "/api/agent/posts/image"))
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
        if stage == "ide":
            # Kortet ligger i Idéer = Lucas tog det tilbage midt i kørslen (alle kørsler claimer i Arbejder).
            print("STOP — kortet er taget tilbage til Idéer. Gemt, men ikke flyttet. Stop kørslen.")
            sys.exit(4)
        for target in (["klar"] if stage == "arbejder" else []):
            moved = call({"action": "move", "id": a.id, "stage": target})
            if not moved.get("ok"):
                out(moved)
        print(f"OK — gemt og flyttet til klar. Mangler kun menneskets trin (billedvalg + faktatjek).")
    elif a.cmd == "move":
        out(call({"action": "move", "id": a.id, "stage": a.stage}))


if __name__ == "__main__":
    main()
