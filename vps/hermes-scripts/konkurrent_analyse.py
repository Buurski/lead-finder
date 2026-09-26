#!/usr/bin/env python3
"""LLM-læsning af Jevs konkurrent-tal — ÉT billigt kald (DeepSeek), ingen agent. Skrevet af Claude 26/9.

Jev gør det tunge (dommer hver side/blog, 0 LLM-tokens). Dette trin får kun
den komprimerede rapport (navne, tal, mønstre, huller — ingen sidetekst) og
skriver 3-6 punkter "hvad betyder det for Kinly". Kaldes af konkurrent_scan.py
efter POST; fejl her vælter aldrig scannet.

  python3 konkurrent_analyse.py --selftest     # offline: komprimering + parsing
"""
from __future__ import annotations

import json
import os
import re
import sys
from urllib.request import Request, urlopen

MODEL = "deepseek-v4-flash"
URL = "https://api.deepseek.com/chat/completions"
MAX_INPUT_CHARS = 12_000  # ponytail: hårdt loft på input ≈ 4k tokens; hæv kun hvis rapporten vokser forbi 40 konkurrenter

# Samme enums som konkurrent_scan.py's findings — duplikeret bevidst (to selvstændige scripts, ingen
# cirkulær import) frem for at dele en konstant hen over en dynamisk `import konkurrent_analyse`.
FINDING_CATEGORIES = ("ydelse", "pris-budskab", "seo", "geo", "alternativ", "forbedring")
SUGGEST_KINDS = ("blog", "annonce", "kinly-dk", "salg")

PROMPT = """Du er strateg for Kinly (lille webbureau i Herning/Ikast: håndkodede hjemmesider fra 3.997 kr. fast pris, kunde-CMS, du ejer koden, lokal SEO/GEO).
Nedenfor er Jevs ugentlige findings om konkurrenterne (allerede prioriteret med rating 1-5) — ikke rå sidetekst. Brug KUN disse data — opfind ingen tal, navne eller priser.
Skriv max 5 punkter om hvad det betyder for Kinly: hvor vi kan vinde (salg, SEO, GEO/AI-søgning, blogemner, AI-byggere som Wix/Framer), og hvad vi skal passe på.
Sæt det VIGTIGSTE punkt (én konkret ting Kinly kan gøre denne uge) først.
Hvert punkt: konkret, nævn tallet fra data, max 2 sætninger. Dansk, jordnært, ingen buzzwords.
Sæt "category" til én af: ydelse, pris-budskab, seo, geo, alternativ, forbedring. Sæt "suggest" til én af: blog, annonce, kinly-dk, salg.
Data kan også have "inspiration": opslag fra X/LinkedIn/Hacker News som Jev har vurderet relevante. For HVERT af dem: omskriv til en dansk idé for Kinly — "title" (max 70 tegn, start med et verbum) og "detail" (max 200 tegn: hvad idéen er, og hvordan Kinly konkret bruger den). Kopiér aldrig opslaget, oversæt idéen.
Svar KUN med JSON: {"points":[{"title":"max 70 tegn","detail":"max 350 tegn","category":"...","suggest":"..."}],"inspiration":[{"id":"...","title":"...","detail":"..."}]}"""


def compact(report: dict, inspiration: list[dict] | None = None) -> str:
    findings = [
        {"cat": f.get("category"), "t": f.get("title"), "d": f.get("detail"),
         "rating": f.get("rating"), "suggest": f.get("suggest"), "evidence": f.get("evidence")}
        for f in (report.get("findings") or [])[:15]
    ]
    data = {"antal_konkurrenter": len(report.get("competitors", [])), "findings": findings}
    if inspiration:  # inspiration først i budgettet: kortes opslagene, ikke findings
        data["inspiration"] = [{"id": c["id"], "kilde": c["source"], "type": c.get("typeLabel"),
                                "tekst": " ".join(c["text"].split())[:500]} for c in inspiration[:6]]
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))[:MAX_INPUT_CHARS]


def parse_inspiration(text: str, ids: set[str]) -> dict[str, tuple[str, str]]:
    """{id: (title, detail)} for kendte id'er. Tåler manglende/ugyldigt — så bruges fallback-teksten."""
    m = re.search(r"\{.*\}", text, re.S)
    try:
        items = json.loads(m.group(0)).get("inspiration") or [] if m else []
    except ValueError:
        return {}
    out = {}
    for it in items if isinstance(items, list) else []:
        if isinstance(it, dict) and it.get("id") in ids and it.get("title") and it.get("detail"):
            out[it["id"]] = (str(it["title"]).strip()[:80], str(it["detail"]).strip()[:240])
    return out


def parse_points(text: str) -> list[dict]:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("intet JSON i svaret")
    pts = json.loads(m.group(0)).get("points") or []
    out = []
    for p in pts:
        if not (isinstance(p, dict) and p.get("title") and p.get("detail")):
            continue
        point = {"title": str(p["title"]).strip()[:80], "detail": str(p["detail"]).strip()[:400]}
        if p.get("category") in FINDING_CATEGORIES:
            point["category"] = p["category"]
        if p.get("suggest") in SUGGEST_KINDS:
            point["suggest"] = p["suggest"]
        out.append(point)
    if not out:
        raise ValueError("ingen gyldige punkter")
    return out[:5]


def load_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not key and os.path.exists("/root/.hermes/.env"):
        for line in open("/root/.hermes/.env", encoding="utf-8"):
            if line.startswith("DEEPSEEK_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY mangler")
    return key


def analyse(report: dict, inspiration: list[dict] | None = None) -> tuple[dict, dict[str, tuple[str, str]]]:
    """ÉT kald -> (analysis til HQ, {inspiration-id: (title, detail)})."""
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": compact(report, inspiration)}],
        "max_tokens": 1500 if inspiration else 900, "temperature": 0.3, "response_format": {"type": "json_object"},
    }).encode("utf-8")
    req = Request(URL, data=body, method="POST",
                  headers={"Content-Type": "application/json", "Authorization": f"Bearer {load_key()}"})
    with urlopen(req, timeout=90) as res:
        data = json.loads(res.read().decode("utf-8"))
    usage = data.get("usage") or {}
    print(f"[analyse] tokens ind={usage.get('prompt_tokens')} ud={usage.get('completion_tokens')}")
    content = data["choices"][0]["message"]["content"]
    rewrites = parse_inspiration(content, {c["id"] for c in inspiration or []})
    return {"model": MODEL, "points": parse_points(content)}, rewrites


def _selftest() -> None:
    rep = {"competitors": [{"name": "A"}] * 60,
           "findings": [{"category": "seo", "title": "FAQ", "detail": "64% har FAQ", "rating": 4,
                         "suggest": "kinly-dk", "evidence": ["A", "B"]}] * 20}
    s = compact(rep)
    assert len(s) <= MAX_INPUT_CHARS and "sidetekst" not in s
    assert json.loads(s)["antal_konkurrenter"] == 60
    assert len(json.loads(s)["findings"]) == 15  # capped

    ok = parse_points('snak {"points":[{"title":"x","detail":"y","category":"seo","suggest":"blog"},'
                       '{"title":"","detail":"z"},{"title":"a","detail":"b","category":"gis-om-katte"}]}')
    assert ok[0] == {"title": "x", "detail": "y", "category": "seo", "suggest": "blog"}
    assert ok[1] == {"title": "a", "detail": "b"}  # ugyldig category droppes, punktet beholdes
    assert len(ok) == 2

    for bad in ("ingen json", '{"points":[]}'):
        try:
            parse_points(bad)
            raise AssertionError(bad)
        except ValueError:
            pass

    many = json.dumps({"points": [{"title": f"t{i}", "detail": "d"} for i in range(8)]})
    assert len(parse_points(many)) == 5  # max 5 nu (var 6)

    insp = [{"id": "x:1", "source": "x", "typeLabel": "blog-idé", "text": "how  I\nprice sites " * 100}]
    s2 = json.loads(compact(rep, insp))
    assert s2["inspiration"][0]["id"] == "x:1" and len(s2["inspiration"][0]["tekst"]) == 500
    assert "inspiration" not in json.loads(compact(rep))
    rw = parse_inspiration('{"points":[],"inspiration":[{"id":"x:1","title":"Vis pris","detail":"d"},'
                           '{"id":"fremmed","title":"t","detail":"d"},{"id":"x:1b","title":""}]}', {"x:1", "x:1b"})
    assert rw == {"x:1": ("Vis pris", "d")}  # ukendt id og tom titel droppes
    assert parse_inspiration("ingen json", {"x:1"}) == {} and parse_inspiration('{"inspiration":"x"}', {"x:1"}) == {}
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    elif "--probe" in sys.argv:  # ét minimalt live-kald for at bevise model-id + nøgle
        print(analyse({"competitors": [], "findings": [{"category": "seo", "title": "FAQ",
              "detail": "64% af stærke blogs har FAQ", "rating": 4, "suggest": "kinly-dk", "evidence": []}]},
              [{"id": "x:1", "source": "x", "typeLabel": "salg", "text": "We doubled close rate by showing a fixed price upfront on every proposal."}]))
