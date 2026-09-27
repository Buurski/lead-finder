#!/usr/bin/env python3
"""Idé-oprydning på Kinlys blog-board hver 2. uge. no_agent-job, 0 LLM-tokens (kun Jev). Skrevet af Claude 27/9.

"Vi skal ikke have hundrede blogs op." For hvert kort i Idéer: ÉT Jev-kald med alle andre kort
(idéer, i arbejde, udgivet) som kontekst:
  - overlapper den (næsten samme emne som et andet kort)?
  - er den svag (sælger ikke Kinly, eller lav Jev-score i card.scores)?
Er der flere end 10 idéer, foreslås de laveste scorer ud, til der er 10 tilbage.

Kun FORSLAG: postes til HQ (/api/agent/seo-signals, action "ideacleanup") og vises som en
linje over Idéer på /blog, hvor Lucas trykker Slet eller Behold. Scriptet sletter aldrig.

  blog_ide_oprydning.py --selftest   # offline
  blog_ide_oprydning.py --dry-run    # læser HQ + kalder Jev, printer forslag, poster intet
  blog_ide_oprydning.py              # rigtig kørsel (cron)
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import crm_posts  # noqa: E402
import jev_lib  # noqa: E402

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

HQ_PATH = "/api/agent/seo-signals"
MAX_IDEAS = 10
MAX_JEV = 30  # ponytail: loft pr. kørsel; flere idéer end det tjekkes ikke for overlap (max-grænsen fanger dem)
MAX_CONTEXT = 25  # andre kort Jev ser pr. kald
OVERLAP_CONF = 0.6
WEAK_SELLS = 0.35
WEAK_SCORE = 45
STAGE_LABEL = {"ide": "Idéer", "arbejder": "Arbejder", "klar": "Til gennemlæsning", "publicer": "Publicer", "udgivet": "Udgivet"}


def overall(card: dict) -> int | None:
    vals = [v.get("score") for v in (card.get("scores") or {}).values() if isinstance(v, dict) and isinstance(v.get("score"), (int, float))]
    return round(sum(vals) / len(vals)) if vals else None


def context_for(idea: dict, cards: list[dict]) -> list[dict]:
    """Andre kort: udgivne/i gang først (dem skal en idé ikke gentage), så de andre idéer."""
    others = [c for c in cards if c.get("id") != idea.get("id")]
    others.sort(key=lambda c: c.get("stage") == "ide")
    return others[:MAX_CONTEXT]


def questions(others: list[dict]) -> dict:
    criteria = {"ingen": "Ingen af de andre kort handler om næsten samme emne"}
    criteria.update({f"k{i}": str(c.get("title") or "")[:140] for i, c in enumerate(others)})
    return {
        "overlap": {
            "type": "choice",
            "instructions": "Handler blog-idéen `ide` om næsten samme emne som et af kortene i `andre`, så de to indlæg ville "
                            "konkurrere om de samme søgninger og sige det samme? Vælg det kort, ellers 'ingen'.",
            "criteria": criteria,
        },
        "saelger": {
            "type": "noul",
            "instructions": "Hjælper et blogindlæg om `ide` Kinly (lille webbureau: hjemmesider, lokal SEO og AI-synlighed "
                            "for små danske virksomheder) med at få kunder?",
        },
    }


def judge(idea: dict, others: list[dict], raw: dict | None) -> dict | None:
    """Ét forslag (eller None) for én idé ud fra Jev-svaret + kortets egen score."""
    ans = (raw or {}).get("answers") or {}
    ov = ans.get("overlap") or {}
    choice = ov.get("choice") if ov.get("type") == "choice" else None
    if choice and choice != "ingen" and float(ov.get("confidence") or 0) >= OVERLAP_CONF:
        try:
            other = others[int(choice[1:])]
        except (ValueError, IndexError):
            other = None
        # To overlappende idéer: kun den svageste foreslås (her den anden, så denne går videre til svag-tjekket).
        if other and not (other.get("stage") == "ide" and (overall(other) or 0) < (overall(idea) or 0)):
            return {"kind": "overlap", "overlapWith": str(other.get("title"))[:200],
                    "reason": f'Næsten samme emne som "{str(other.get("title"))[:90]}" ({STAGE_LABEL.get(other.get("stage"), other.get("stage"))}).'}
    sells = ans.get("saelger") or {}
    score = overall(idea)
    if sells.get("type") == "noul" and float(sells.get("noul", 1)) < WEAK_SELLS:
        return {"kind": "svag", "reason": f"Svag: Jev vurderer at den næppe skaffer Kinly kunder ({round(100 * float(sells['noul']))} %)."}
    if score is not None and score < WEAK_SCORE:
        return {"kind": "svag", "reason": f"Svag: lav samlet Jev-score ({score})."}
    return None


def run(dry_run: bool, hq=crm_posts.call, jev=jev_lib.ask, now: datetime | None = None) -> dict:
    now = now or datetime.now(timezone.utc)
    listed = hq({"action": "list"})
    if not listed.get("ok"):
        raise RuntimeError(f"HQ list fejlede: {listed.get('error')}")
    cards = listed.get("cards") or []
    ideas = [c for c in cards if c.get("stage") == "ide"]
    out: list[dict] = []
    calls = 0
    for idea in ideas[:MAX_JEV]:
        others = context_for(idea, cards)
        raw = jev({"ide": {"titel": idea.get("title"), "note": str(idea.get("note") or "")[:300], "kategori": idea.get("category")},
                   "andre": {f"k{i}": f'{c.get("title")} [{STAGE_LABEL.get(c.get("stage"), c.get("stage"))}]' for i, c in enumerate(others)}},
                  questions(others))
        calls += 1
        s = judge(idea, others, raw)
        if s:
            out.append({"id": idea["id"], "title": str(idea.get("title"))[:200], **s})

    # Max-grænsen: flere end 10 idéer ⇒ de laveste scorer ud (ubedømte først), til 10 er tilbage.
    extra = len(ideas) - MAX_IDEAS - len(out)
    if extra > 0:
        taken = {s["id"] for s in out}
        rest = sorted((c for c in ideas if c["id"] not in taken), key=lambda c: overall(c) if overall(c) is not None else -1)
        for c in rest[:extra]:
            sc = overall(c)
            out.append({"id": c["id"], "title": str(c.get("title"))[:200], "kind": "for-mange",
                        "reason": f"Over {MAX_IDEAS} idéer — {'ingen Jev-score' if sc is None else f'lav Jev-score ({sc})'} blandt de {len(ideas)}."})

    doc = {"action": "ideacleanup", "checkedAt": now.isoformat(timespec="seconds").replace("+00:00", "Z"), "ideas": len(ideas), "suggestions": out}
    stats = {"ideas": len(ideas), "suggestions": len(out), "jev_calls": calls, "posted": False}
    if dry_run:
        print(json.dumps(doc, ensure_ascii=False, indent=1))
        return stats
    resp = hq(doc, HQ_PATH)  # altid, også tom: overskriver gamle forslag
    if not resp.get("ok"):
        raise RuntimeError(f"HQ afviste ideacleanup: {resp.get('error')}")
    stats["posted"] = True
    return stats


def _selftest() -> None:
    sc = lambda n: {"styrke": {"score": n, "why": ""}, "seo": {"score": n, "why": ""}}  # noqa: E731
    cards = [
        {"id": "u1", "stage": "udgivet", "title": "Hvad koster en hjemmeside?"},
        {"id": "i1", "stage": "ide", "title": "Pris på hjemmeside i Herning", "scores": sc(70)},
        {"id": "i2", "stage": "ide", "title": "Google-anmeldelser", "scores": sc(80)},
        {"id": "i3", "stage": "ide", "title": "Mit yndlingskaffe", "scores": sc(60)},
        {"id": "i4", "stage": "ide", "title": "Anmeldelser på Google", "scores": sc(50)},
    ]
    assert overall(cards[1]) == 70 and overall(cards[0]) is None
    assert [c["id"] for c in context_for(cards[1], cards)][0] == "u1"
    q = questions(context_for(cards[1], cards))
    assert q["overlap"]["criteria"]["k0"] == "Hvad koster en hjemmeside?" and "ingen" in q["overlap"]["criteria"]

    def fake_jev(state, qs):
        t = state["ide"]["titel"]
        crit = qs["overlap"]["criteria"]
        pick = lambda title: next((k for k, v in crit.items() if v == title), "ingen")  # noqa: E731
        choice = {"Pris på hjemmeside i Herning": pick("Hvad koster en hjemmeside?"),
                  "Google-anmeldelser": pick("Anmeldelser på Google"),
                  "Anmeldelser på Google": pick("Google-anmeldelser")}.get(t, "ingen")
        return {"answers": {"overlap": {"type": "choice", "choice": choice, "confidence": 0.9},
                            "saelger": {"type": "noul", "noul": 0.1 if "kaffe" in t else 0.8}}}

    posted = []
    s = run(False, hq=lambda p, path=crm_posts.PATH: posted.append(p) or {"ok": True, "cards": cards}, jev=fake_jev,
            now=datetime(2026, 10, 5, 7, tzinfo=timezone.utc))
    doc = posted[-1]
    got = {x["id"]: x["kind"] for x in doc["suggestions"]}
    # i1 gentager et udgivet indlæg; i2/i4 overlapper hinanden ⇒ kun den svageste (i4); i3 sælger ikke
    assert got == {"i1": "overlap", "i4": "overlap", "i3": "svag"}, got
    assert s == {"ideas": 4, "suggestions": 3, "jev_calls": 4, "posted": True}
    assert doc["action"] == "ideacleanup" and doc["checkedAt"] == "2026-10-05T07:00:00Z"

    # Max-grænse: 13 idéer uden overlap ⇒ de 3 laveste (ubedømt først) foreslås
    many = [{"id": f"m{i}", "stage": "ide", "title": f"Idé {i}", "scores": sc(50 + i)} for i in range(12)] + [{"id": "m-ny", "stage": "ide", "title": "Ny"}]
    posted.clear()
    run(False, hq=lambda p, path=crm_posts.PATH: posted.append(p) or {"ok": True, "cards": many},
        jev=lambda st, qs: {"answers": {"overlap": {"type": "choice", "choice": "ingen", "confidence": 0.9}, "saelger": {"type": "noul", "noul": 0.9}}})
    assert [x["id"] for x in posted[-1]["suggestions"]] == ["m-ny", "m0", "m1"], posted[-1]["suggestions"]
    assert posted[-1]["suggestions"][0]["kind"] == "for-mange"

    # Jev nede ⇒ ingen overlap-forslag, kun score-regler; lav-confidence overlap ignoreres
    assert judge(cards[3], [], None) is None
    assert judge(cards[1], [cards[0]], {"answers": {"overlap": {"type": "choice", "choice": "k0", "confidence": 0.4}}}) is None
    print("selftest ok")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        _selftest()
        return 0
    print(json.dumps(run(a.dry_run), ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
