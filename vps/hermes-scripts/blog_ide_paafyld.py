#!/usr/bin/env python3
"""Blog-idé-påfyld. no_agent-job hver time. Skrevet af Claude 27/9.

Lucas (27/9): "Kun når der fx kun er tre tilbage, skal du begynde at lave flere idéer — uden at
bruge mange tokens." Derfor:
  - Flere end MIN_LEFT idéer på boardet → stop. 0 tokens (kun ét HQ-kald).
  - Ellers højst én gang pr. døgn: ÉT DeepSeek-kald skriver CANDIDATES forslag ud fra
    konkurrent-scannets fund (state/konkurrent-last-report.json) og alle eksisterende titler,
    Jev tjekker hvert forslag for overlap og om det sælger Kinly (samme spørgsmål som
    blog_ide_oprydning), og de bedste NEW_IDEAS oprettes som idékort i HQ.
Hermes skriver aldrig selv et indlæg herfra — det sker først når Lucas trækker kortet til Arbejder.

  blog_ide_paafyld.py --selftest   # offline
  blog_ide_paafyld.py --dry-run    # kalder HQ-list/DeepSeek/Jev, opretter intet
  blog_ide_paafyld.py --force      # ignorér døgn-grænsen (ikke idé-grænsen)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import blog_ide_oprydning as oprydning  # noqa: E402
import crm_posts  # noqa: E402
import jev_lib  # noqa: E402
from konkurrent_analyse import NO_THINKING, load_key as deepseek_key  # noqa: E402

MIN_LEFT = 3          # så mange idéer eller færre → lav nye
NEW_IDEAS = 3         # antal nye kort pr. påfyld
CANDIDATES = 6        # forslag fra DeepSeek, Jev sorterer
MIN_GAP = timedelta(hours=20)
STATE = Path("/root/.hermes/state/blog-ide-paafyld.json")
REPORT = Path("/root/.hermes/state/konkurrent-last-report.json")
DEEPSEEK_URL = "https://api.deepseek.com/chat/completions"
DEEPSEEK_MODEL = "deepseek-v4-flash"
CATEGORIES = ["lokal-synlighed", "ai-soegning", "hjemmeside", "kundecases", "pris", "kinly"]

PROMPT = f"""Du foreslår blogindlæg til kinly.dk. Kinly er et lille webbureau i Herning/Ikast: håndkodede
hjemmesider fra 3.997 kr. i fast startpris, kunden ejer koden, kunde-CMS, lokal SEO og synlighed i AI-søgning
(ChatGPT, Google AI). Læserne er små lokale virksomheder (frisører, klinikker, håndværkere, restauranter).

Skriv {CANDIDATES} forslag. Krav:
- Hvert indlæg skal hjælpe læseren OG sælge Kinly (ejerskab, fast pris, lokal synlighed, AI-synlighed, kvalitet).
- Titlen er et konkret spørgsmål eller løfte, som en lokal virksomhedsejer ville google eller spørge ChatGPT om.
  Dansk, under 70 tegn, ingen clickbait. Ingen reklame-titler ("Derfor vælger X Kinly", "Kinlys pakke") —
  salget sker i teksten, titlen er læserens eget spørgsmål.
- PRISREGEL: Kinly må aldrig fremstå dyr. Ingen sammenligning af løbende kr./md eller kr./år mod Wix/WordPress.
  Pris vises kun som startpris 3.997 kr. mod bureauer og freelancere. Højst ÉT forslag må handle om pris.
- Må ikke overlappe de eksisterende titler (samme emne = forkast).
- Byg på signalerne fra konkurrent-scannet, hvor det giver mening, men opfind aldrig tal.
- note: 1-2 sætninger: vinklen, mål-søgeord og hvilke rigtige data indlægget kan bygge på.
- category: én af {", ".join(CATEGORIES)}.

Svar KUN med JSON: {{"ideas": [{{"title": "...", "category": "...", "note": "..."}}]}}"""


def signals(report: dict) -> list[str]:
    out = [f"{g.get('title')}: {g.get('detail')}" for g in report.get("gaps") or []]
    out += [f"[{f.get('category')}] {f.get('title')}" for f in report.get("findings") or [] if (f.get("rating") or 0) >= 2]
    return out[:25]


def deepseek_ideas(existing: list[str], sig: list[str]) -> list[dict]:
    user = "Eksisterende titler (alle stadier):\n" + "\n".join(f"- {t}" for t in existing) + \
           "\n\nSignaler fra konkurrent-scannet:\n" + ("\n".join(f"- {s}" for s in sig) or "- (ingen)")
    body = json.dumps({
        "model": DEEPSEEK_MODEL,
        "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": user}],
        "max_tokens": 900, "temperature": 0.7, "response_format": {"type": "json_object"},
        **NO_THINKING,
    }).encode("utf-8")
    req = Request(DEEPSEEK_URL, data=body, method="POST",
                  headers={"Content-Type": "application/json", "Authorization": f"Bearer {deepseek_key()}"})
    with urlopen(req, timeout=90) as res:
        data = json.loads(res.read().decode("utf-8"))
    usage = data.get("usage") or {}
    print(f"[deepseek] tokens ind={usage.get('prompt_tokens')} ud={usage.get('completion_tokens')}")
    return clean(json.loads(data["choices"][0]["message"]["content"]).get("ideas") or [])


def clean(ideas: list) -> list[dict]:
    out = []
    for i in ideas:
        if not isinstance(i, dict):
            continue
        title = str(i.get("title") or "").strip()[:120]
        if not title:
            continue
        cat = i.get("category") if i.get("category") in CATEGORIES else "hjemmeside"
        out.append({"title": title, "category": cat, "note": str(i.get("note") or "").strip()[:600]})
    return out


def pick(cands: list[dict], cards: list[dict], jev) -> tuple[list[dict], int]:
    """Jev-tjek pr. forslag mod alle kort + de allerede valgte. Forkast overlap/svag."""
    chosen: list[dict] = []
    calls = 0
    # Lucas 27/9: for mange pris-indlæg. Ligger der allerede et pris-kort i Idéer/Arbejder, ingen flere.
    pris_open = any(c.get("category") == "pris" and c.get("stage") in ("ide", "arbejder") for c in cards)
    for c in cands:
        if len(chosen) >= NEW_IDEAS:
            break
        if c["category"] == "pris" and (pris_open or any(x["category"] == "pris" for x in chosen)):
            print(f"  FORKAST {c['title']} — pris-emne findes allerede")
            continue
        idea = {"id": None, "title": c["title"], "note": c["note"], "category": c["category"], "stage": "ide"}
        others = oprydning.context_for(idea, cards + [{**x, "id": f"ny{n}", "stage": "ide"} for n, x in enumerate(chosen)])
        raw = jev({"ide": {"titel": c["title"], "note": c["note"][:300], "kategori": c["category"]},
                   "andre": {f"k{i}": f'{o.get("title")} [{o.get("stage")}]' for i, o in enumerate(others)}},
                  oprydning.questions(others))
        calls += 1
        verdict = oprydning.judge(idea, others, raw)
        print(f"  {'FORKAST' if verdict else 'OK     '} {c['title']}" + (f" — {verdict['reason']}" if verdict else ""))
        if not verdict:
            chosen.append(c)
    return chosen, calls


def run(dry_run: bool, force: bool, hq=crm_posts.call, jev=jev_lib.ask, llm=deepseek_ideas,
        now: datetime | None = None, state_path: Path = STATE) -> dict:
    now = now or datetime.now(timezone.utc)
    listed = hq({"action": "list"})
    if not listed.get("ok"):
        raise RuntimeError(f"HQ list fejlede: {listed.get('error')}")
    cards = listed.get("cards") or []
    n_ideas = sum(1 for c in cards if c.get("stage") == "ide")
    if n_ideas > MIN_LEFT:
        print(f"{n_ideas} idéer på boardet (> {MIN_LEFT}) — intet at gøre, 0 tokens.")
        return {"ideas": n_ideas, "created": 0, "skipped": "nok"}
    state = jev_lib.load_json(state_path, {})
    last = state.get("lastRun")
    if last and not force and now - datetime.fromisoformat(last) < MIN_GAP:
        print(f"Kun {n_ideas} idéer, men påfyld kørte {last} — venter til døgnet er gået.")
        return {"ideas": n_ideas, "created": 0, "skipped": "døgn"}
    if not dry_run:  # skriv før LLM-kaldet, så en fejl ikke giver et nyt kald hver time
        jev_lib.atomic_write_json(state_path, {**state, "lastRun": now.isoformat()})
    report = jev_lib.load_json(REPORT, {})
    cands = llm([str(c.get("title")) for c in cards], signals(report))
    chosen, calls = pick(cands, cards, jev)
    created = []
    for c in chosen:
        if dry_run:
            created.append(c["title"])
            continue
        resp = hq({"action": "create", **c})
        if resp.get("ok"):
            created.append(c["title"])
        else:
            print(f"  HQ afviste {c['title']!r}: {resp.get('error')}")
    print(f"{'[dry-run] ville oprette' if dry_run else 'Oprettet'} {len(created)} idékort ({calls} Jev-kald).")
    return {"ideas": n_ideas, "created": len(created), "jev_calls": calls}


def _selftest() -> None:
    import tempfile
    cards = [{"id": str(i), "title": f"Idé {i}", "stage": "ide"} for i in range(5)]
    posted = []

    def hq(p, path=None):
        if p["action"] == "list":
            return {"ok": True, "cards": cards}
        posted.append(p)
        return {"ok": True}

    def boom(*a, **k):
        raise AssertionError("må ikke kaldes")

    st = Path(tempfile.mkdtemp()) / "s.json"
    r = run(False, False, hq=hq, jev=boom, llm=boom, state_path=st)
    assert r["skipped"] == "nok" and not posted, r  # 5 idéer → 0 tokens

    cards[:] = cards[:2] + [{"id": "u", "title": "Udgivet", "stage": "udgivet"}]
    cands = [{"title": f"Ny {i}", "category": "pris" if i == 0 else "xx", "note": "n"} for i in range(5)]

    def jev(state, qs):  # forslag 1 overlapper, resten ok
        overlap = "k0" if state["ide"]["titel"] == "Ny 1" else "ingen"
        return {"answers": {"overlap": {"type": "choice", "choice": overlap, "confidence": 0.9},
                            "saelger": {"type": "noul", "noul": 0.9}}}

    r = run(False, False, hq=hq, jev=jev, llm=lambda e, s: clean(cands), state_path=st,
            now=datetime(2026, 9, 28, 8, tzinfo=timezone.utc))
    assert r["created"] == 3 and [p["title"] for p in posted] == ["Ny 0", "Ny 2", "Ny 3"], posted
    assert posted[1]["category"] == "hjemmeside"  # ukendt kategori → hjemmeside
    posted.clear()
    r = run(False, False, hq=hq, jev=boom, llm=boom, state_path=st,
            now=datetime(2026, 9, 28, 12, tzinfo=timezone.utc))
    assert r["skipped"] == "døgn" and not posted  # samme døgn → intet nyt LLM-kald
    print("selftest OK")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        _selftest()
        return 0
    print(json.dumps(run(a.dry_run, a.force), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
