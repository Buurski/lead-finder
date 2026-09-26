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

PROMPT = """Du er strateg for Kinly (lille webbureau i Herning/Ikast: håndkodede hjemmesider fra 3.997 kr. fast pris, kunde-CMS, du ejer koden, lokal SEO/GEO).
Nedenfor er Jevs ugentlige målinger af konkurrenter (tal, mønstre, huller). Brug KUN disse data — opfind ingen tal, navne eller priser.
Skriv 3-6 punkter om hvad det betyder for Kinly: hvor vi kan vinde (salg, SEO, GEO/AI-søgning, blogemner), og hvad vi skal passe på.
Hvert punkt: konkret, nævn tallet fra data, max 2 sætninger. Dansk, jordnært, ingen buzzwords.
Svar KUN med JSON: {"points":[{"title":"max 70 tegn","detail":"max 350 tegn"}]}"""


def compact(report: dict) -> str:
    comps = []
    for c in report.get("competitors", []):
        g = c.get("google") or {}
        s = c.get("site") or {}
        b = c.get("blog") or {}
        comps.append({
            "navn": c.get("name"), "by": c.get("city"),
            "google": [g.get("rating"), g.get("reviews")],
            "priser_synlige": s.get("hasPrices"), "pagespeed_mobil": s.get("pagespeedMobile"), "cms": s.get("cms"),
            "ydelser": c.get("services"), "position": c.get("positioning"),
            "blog_30d": b.get("posts30d"), "blog_kvalitet": b.get("quality"),
            "geo": (c.get("geo") or {}).get("mentioned"),
            "styrker": c.get("strengths"), "svagheder": c.get("weaknesses"),
        })
    data = {
        "konkurrenter": comps,
        "moenstre": [{"t": p.get("title"), "d": p.get("detail")} for p in report.get("patterns", [])],
        "huller": [{"t": g.get("title"), "d": g.get("detail"), "type": g.get("kind")} for g in report.get("gaps", [])],
    }
    return json.dumps(data, ensure_ascii=False, separators=(",", ":"))[:MAX_INPUT_CHARS]


def parse_points(text: str) -> list[dict]:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        raise ValueError("intet JSON i svaret")
    pts = json.loads(m.group(0)).get("points") or []
    out = [{"title": str(p["title"]).strip()[:80], "detail": str(p["detail"]).strip()[:400]}
           for p in pts if isinstance(p, dict) and p.get("title") and p.get("detail")]
    if not out:
        raise ValueError("ingen gyldige punkter")
    return out[:6]


def load_key() -> str:
    key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not key and os.path.exists("/root/.hermes/.env"):
        for line in open("/root/.hermes/.env", encoding="utf-8"):
            if line.startswith("DEEPSEEK_API_KEY="):
                key = line.split("=", 1)[1].strip().strip('"').strip("'")
    if not key:
        raise RuntimeError("DEEPSEEK_API_KEY mangler")
    return key


def analyse(report: dict) -> dict:
    body = json.dumps({
        "model": MODEL,
        "messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": compact(report)}],
        "max_tokens": 900, "temperature": 0.3, "response_format": {"type": "json_object"},
    }).encode("utf-8")
    req = Request(URL, data=body, method="POST",
                  headers={"Content-Type": "application/json", "Authorization": f"Bearer {load_key()}"})
    with urlopen(req, timeout=90) as res:
        data = json.loads(res.read().decode("utf-8"))
    usage = data.get("usage") or {}
    print(f"[analyse] tokens ind={usage.get('prompt_tokens')} ud={usage.get('completion_tokens')}")
    return {"model": MODEL, "points": parse_points(data["choices"][0]["message"]["content"])}


def _selftest() -> None:
    rep = {"competitors": [{"name": "A", "google": {"rating": 4.6, "reviews": 17}, "site": {"hasPrices": False},
                            "blog": {"posts30d": 2}, "services": ["seo"]}] * 60,
           "patterns": [{"title": "FAQ", "detail": "64% har FAQ"}], "gaps": [{"title": "Pris", "detail": "13/18 skjuler pris", "kind": "pris"}]}
    s = compact(rep)
    assert len(s) <= MAX_INPUT_CHARS and "sidetekst" not in s
    assert parse_points('snak {"points":[{"title":"x","detail":"y"},{"title":"","detail":"z"}]}') == [{"title": "x", "detail": "y"}]
    for bad in ("ingen json", '{"points":[]}'):
        try:
            parse_points(bad)
            raise AssertionError(bad)
        except ValueError:
            pass
    print("selftest ok")


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        _selftest()
    elif "--probe" in sys.argv:  # ét minimalt live-kald for at bevise model-id + nøgle
        print(analyse({"competitors": [], "patterns": [{"title": "FAQ", "detail": "64% af stærke blogs har FAQ"}], "gaps": []}))
