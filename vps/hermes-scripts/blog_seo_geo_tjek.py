#!/usr/bin/env python3
"""Ugentligt SEO/GEO/kundespørgsmål-tjek af Kinlys blogindlæg. 0 LLM-tokens (kun Jev, maks 20 kald/kørsel).

Læser kort i stages klar/publicer/udgivet via crm_posts.py (genbruger dens
signerede call()/HMAC — bygger ingen ny). Pr. kort: deterministisk SEO-tjek,
kundespørgsmål-dækning (spørgsmål fra kundespoergsmaal.py, dømt ja/delvist/nej
af Jev), og for udgivne indlæg en best-effort GEO-status ud fra seneste måling
i geo-log.md.

Output: overskriver /root/KnowledgeOS/wiki/kinly/blog-seo-geo-tjek.md (én
sektion pr. kort) + pusher via safe-push.sh, og skriver
/root/.hermes/state/geo-blog-queries.json (læses af den foreslåede udvidelse
i geo_citation_loop.py) — begge kun uden --dry-run.

Brug:
  blog_seo_geo_tjek.py --dry-run   # udskriver rapport til stdout, skriver intet
  blog_seo_geo_tjek.py             # rigtig kørsel (cron, mandag 09:00)
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import crm_posts  # noqa: E402
import jev_lib  # noqa: E402
import kundespoergsmaal  # noqa: E402

try:  # ponytail: VPS/cron kører allerede UTF-8; dette gør ✓/✗ sikre i print() overalt
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except (AttributeError, ValueError):
    pass

STAGES = ("klar", "publicer", "udgivet")
JEV_BUDGET_DEFAULT = 20
TOP_N_QUESTIONS = 5

OUTPUT = Path("/root/KnowledgeOS/wiki/kinly/blog-seo-geo-tjek.md")  # VPS-prod-sti
GEO_LOG_PATH = Path("/root/KnowledgeOS/wiki/kinly/geo-log.md")  # VPS-prod-sti
GEO_QUERIES_PATH = Path("/root/.hermes/state/geo-blog-queries.json")  # VPS-prod-sti
SAFE_PUSH = Path("/root/KnowledgeOS/scripts/safe-push.sh")  # VPS-prod-sti
KINLY_PATTERN = r"(?i)\bKinly(?:\.dk)?\b"

FAQ_QUESTIONS = {
    "besvaret": {
        "type": "choice",
        "instructions": (
            "Besvarer `tekst` (et blogindlæg) spørgsmålet `spoergsmaal` tydeligt? "
            "Vælg 'ja' hvis det besvares direkte og konkret, 'delvist' hvis det antydes "
            "eller kun delvist dækkes, 'nej' hvis det slet ikke besvares."
        ),
        "criteria": {"ja": "Tydeligt besvaret", "delvist": "Delvist/indirekte besvaret", "nej": "Ikke besvaret"},
    },
}

SUGGESTIONS = {
    "titel_30_60": "Ret titlens længde til 30-60 tegn.",
    "uddrag_70_160": "Skriv uddraget om til 70-160 tegn.",
    "keyword_i_titel": "Få hovedsøgeordet ind i titlen.",
    "keyword_i_foerste_afsnit": "Nævn hovedsøgeordet i første afsnit.",
    "mindst_2_h2": "Tilføj flere H2-mellemrubrikker (mindst 2).",
    "faq_3_til_5": "Justér antal FAQ til 3-5 spørgsmål.",
    "mindst_2_interne_links": "Tilføj mindst 2 interne kinly.dk-links.",
    "cta_link": "Indsæt CTA-linket til /seo-tjek/.",
    "ordtal_600_900": "Justér indlæggets ordtal til 600-900 ord.",
}
LABELS = {
    "titel_30_60": "titel 30-60 tegn",
    "uddrag_70_160": "uddrag 70-160 tegn",
    "keyword_i_titel": "hovedsøgeord i titel",
    "keyword_i_foerste_afsnit": "hovedsøgeord i første afsnit",
    "mindst_2_h2": "mindst 2 H2",
    "faq_3_til_5": "3-5 FAQ",
    "mindst_2_interne_links": "mindst 2 interne kinly.dk-links",
    "cta_link": "CTA-link findes",
    "ordtal_600_900": "ordtal 600-900",
}


# ---------------------------------------------------------------- HQ (genbruger crm_posts.call)

def list_cards(stage: str) -> list[dict]:
    data = crm_posts.call({"action": "list", "stage": stage})
    return data.get("cards") or [] if data.get("ok") else []


def get_card(card_id: str) -> dict | None:
    data = crm_posts.call({"action": "get", "id": card_id})
    return data.get("post") if data.get("ok") else None


# ---------------------------------------------------------------- deterministisk SEO

def _first_paragraph(body: str) -> str:
    for block in body.split("\n\n"):
        block = block.strip()
        if block and not block.startswith("#"):
            return block
    return ""


# ponytail: fjernes fra hovedsøgeordet før tegn-for-tegn-match, så et afledt
# søgeord ("hvad koster en hjemmeside i Herning") ikke kræver ordret gentagelse
# — kun at de betydningsbærende ord alle findes i teksten.
_STOPWORDS = {"i", "til", "for", "og", "en", "et", "der", "som", "med", "på", "om", "du", "din", "dit",
              "er", "det", "den", "de", "hvad", "hvordan", "hvorfor", "man", "skal", "kan", "af", "at"}


def _keyword_tokens(keyword: str) -> list[str]:
    words = re.findall(r"[a-zæøåA-ZÆØÅ0-9]+", keyword.lower())
    significant = [w for w in words if w not in _STOPWORDS]
    return significant or ([keyword.strip().lower()] if keyword.strip() else [])


def _contains_keyword(text: str, keyword: str) -> bool:
    tokens = _keyword_tokens(keyword)
    text_l = text.lower()
    return bool(tokens) and all(t in text_l for t in tokens)


def _keyword_for(post: dict) -> str:
    """hovedsøgeord = 'søgeord: ...' i kortets note hvis den findes, ellers titlen."""
    note = str(post.get("note") or "")
    m = re.search(r"søgeord\s*[:\-]\s*([^\n]+)", note, re.I)
    if m:
        return m.group(1).split(",")[0].strip().rstrip(".")
    for field in ("mainKeyword", "searchKeyword", "keyword"):
        val = post.get(field)
        if isinstance(val, str) and val.strip():
            return val.strip()
    # Fallback: titlens kerne før kolon/spørgsmålstegn ("Google-anmeldelser: sådan…"
    # → "google-anmeldelser"). Hele titlen giver 0 autofuldførelser (fix 26/9).
    title = str(post.get("title") or "").strip()
    return re.split(r"[:?–]", title)[0].strip().lower() or title


def seo_checks(post: dict) -> dict:
    title = str(post.get("title") or "")
    excerpt = str(post.get("excerpt") or "")
    body = str(post.get("body") or "")
    faq = (post.get("proofs") or {}).get("faq") or []
    keyword = _keyword_for(post)
    h2_count = len(re.findall(r"(?m)^##\s+\S", body))
    kinly_links = len(re.findall(r"\]\(https://kinly\.dk/", body))
    word_count = len(body.split())
    checks = {
        "titel_30_60": 30 <= len(title) <= 60,
        "uddrag_70_160": 70 <= len(excerpt) <= 160,
        "keyword_i_titel": _contains_keyword(title, keyword),
        "keyword_i_foerste_afsnit": _contains_keyword(_first_paragraph(body), keyword),
        "mindst_2_h2": h2_count >= 2,
        "faq_3_til_5": 3 <= len(faq) <= 5,
        "mindst_2_interne_links": kinly_links >= 2,
        "cta_link": "kinly.dk/seo-tjek" in body,
        "ordtal_600_900": 600 <= word_count <= 900,
    }
    return {"checks": checks, "keyword": keyword, "word_count": word_count, "h2_count": h2_count,
            "kinly_links": kinly_links, "faq_count": len(faq), "title_len": len(title), "excerpt_len": len(excerpt)}


# ---------------------------------------------------------------- kundespørgsmål-dækning (Jev)

def classify_faq_answer(raw: dict | None) -> str:
    try:
        ans = (raw or {}).get("answers", {})["besvaret"]
        if ans.get("type") != "choice" or ans.get("choice") not in {"ja", "delvist", "nej"}:
            raise ValueError("ugyldigt svar")
        return str(ans["choice"])
    except (KeyError, TypeError, ValueError, AttributeError):
        return "ukendt"


def question_coverage(body: str, keyword: str, jev_budget: list[int]) -> list[dict]:
    questions = kundespoergsmaal.get_questions(keyword, max_n=TOP_N_QUESTIONS)["questions"][:TOP_N_QUESTIONS]
    coverage = []
    for question in questions:
        if jev_budget[0] <= 0:
            coverage.append({"question": question, "answer": "sprunget over (Jev-loft nået)"})
            continue
        raw = jev_lib.ask({"tekst": body[:4000], "spoergsmaal": question}, FAQ_QUESTIONS)
        jev_budget[0] -= 1
        coverage.append({"question": question, "answer": classify_faq_answer(raw)})
    return coverage


# ---------------------------------------------------------------- GEO (best-effort, seneste måling)

def parse_geo_sections(text: str) -> list[dict]:
    sections: list[dict] = []
    current: dict | None = None
    for line in text.splitlines():
        m = re.match(r"^## (\d{4}-\d{2}-\d{2})", line)
        if m:
            if current is not None:
                sections.append(current)
            current = {"date": m.group(1), "rows": []}
            continue
        if current is not None and line.startswith("|") and "---" not in line and "Fast prompt" not in line:
            cells = [c.strip() for c in line.strip("|").split("|")]
            current["rows"].append(cells)
    if current is not None:
        sections.append(current)
    return sections


def latest_geo_section(text: str) -> dict | None:
    sections = parse_geo_sections(text)
    return sections[-1] if sections else None


# ponytail: emne-match er heuristisk (delte ord mellem hovedsøgeord og "Fast
# prompt"-kolonnen) — geo-log.md's faste spørgsmål er ikke skrevet til at
# matche et enkelt blogindlæg 1:1. Den rigtige løsning er load_extra_queries()
# i geo_citation_loop.py + write_geo_blog_queries() nedenfor: når den kører
# ugentligt, får hvert udgivet indlæg sin EGEN dedikerede GEO-forespørgsel, og
# denne heuristik kan skrottes.
def geo_status_for(post: dict, geo_log_path: Path = GEO_LOG_PATH) -> dict:
    try:
        text = geo_log_path.read_text(encoding="utf-8")
    except OSError:
        return {"status": "geo-log.md ikke fundet (endnu ingen GEO-måling at sammenligne med)"}
    section = latest_geo_section(text)
    if not section:
        return {"status": "ingen målinger fundet i geo-log.md"}
    keyword = _keyword_for(post)
    tokens = [t for t in re.findall(r"[a-zæøå]{4,}", keyword.lower())]
    slug = str(post.get("slug") or "")
    hits = []
    for row in section["rows"]:
        row_l = " | ".join(row).lower()
        if slug and slug in row_l:
            hits.append(row)
        elif tokens and sum(1 for t in tokens if t in row_l) >= max(1, len(tokens) // 2):
            hits.append(row)
    if not hits:
        return {"status": f"ingen af de faste GEO-forespørgsler i målingen {section['date']} matcher dette emne "
                           f"— dedikeret forespørgsel foreslået via geo-blog-queries.json (se næste måling)",
                "date": section["date"]}
    mentioned_any = any("kinly.dk" in " | ".join(r).lower() or re.search(r"\bja\b", " | ".join(r).lower()) for r in hits)
    return {"status": f"muligt relateret emne fundet i målingen {section['date']} (heuristisk match, ikke "
                       f"slug-specifik) — {'Kinly nævnes' if mentioned_any else 'Kinly nævnes ikke'} i {len(hits)} matchende række(r)",
            "date": section["date"], "rows_matched": len(hits), "mentioned_hint": mentioned_any}


def write_geo_blog_queries(entries: list[dict], path: Path = GEO_QUERIES_PATH) -> None:
    queries = [{"gruppe": f"blog:{e['slug']}", "query": e["keyword"], "maal": "Kinly", "pattern": KINLY_PATTERN}
               for e in entries if e.get("keyword") and e.get("slug")]
    jev_lib.atomic_write_json(path, {"queries": queries, "generated_at": _now_iso()})


# ---------------------------------------------------------------- rapport

def rettelser_for(checks: dict, coverage: list[dict]) -> list[str]:
    fixes = [SUGGESTIONS[k] for k, ok in checks.items() if not ok]
    for c in coverage:
        if c["answer"] == "nej":
            fixes.append(f'Besvar spørgsmålet i teksten (fx som FAQ): "{c["question"]}"')
    return fixes[:3]


def render_section(post: dict, result: dict) -> str:
    title = post.get("title") or "(uden titel)"
    stage = post.get("stage", "?")
    card_id = post.get("id", "?")
    checks = result["checks"]
    counts = {
        "titel_30_60": f" ({result['title_len']} tegn)",
        "uddrag_70_160": f" ({result['excerpt_len']} tegn)",
        "mindst_2_h2": f" ({result['h2_count']})",
        "faq_3_til_5": f" ({result['faq_count']})",
        "mindst_2_interne_links": f" ({result['kinly_links']})",
        "ordtal_600_900": f" ({result['word_count']})",
    }
    lines = [f"## {title} ({stage}) — {card_id}", "", f'Hovedsøgeord (afledt): "{result["keyword"]}"', "", "SEO:"]
    for key, label in LABELS.items():
        mark = "✓" if checks[key] else "✗"
        lines.append(f"- {mark} {label}{counts.get(key, '')}")
    lines += ["", "Kundespørgsmål-dækning:"]
    if result["coverage"]:
        for c in result["coverage"]:
            lines.append(f"- {c['answer']}: {c['question']}")
    else:
        lines.append("- (ingen spørgsmål fundet via autofuldførelse)")
    if result.get("geo") is not None:
        lines += ["", f"GEO-status: {result['geo']['status']}"]
    fixes = rettelser_for(checks, result["coverage"])
    lines += ["", "Rettelser:"]
    lines += [f"- {f}" for f in fixes] if fixes else ["- Ingen — alle tjek bestået."]
    return "\n".join(lines)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _safe_push(message: str) -> bool:
    try:
        proc = subprocess.run(["bash", str(SAFE_PUSH), message], capture_output=True, text=True, timeout=60)
        return proc.returncode == 0
    except Exception:
        return False


# ---------------------------------------------------------------- main

def check_card(post: dict, jev_budget: list[int]) -> dict:
    result = seo_checks(post)
    body = str(post.get("body") or "")
    result["coverage"] = question_coverage(body, result["keyword"], jev_budget)
    result["geo"] = geo_status_for(post) if post.get("stage") == "udgivet" else None
    return result


def run(dry_run: bool, jev_budget_total: int = JEV_BUDGET_DEFAULT) -> dict:
    started = datetime.now(timezone.utc)
    errors = 0
    total_cards = 0
    jev_budget = [jev_budget_total]
    sections: list[str] = []
    published_entries: list[dict] = []

    for stage in STAGES:
        try:
            cards = list_cards(stage)
        except Exception:
            errors += 1
            continue
        for summary_card in cards:
            card_id = summary_card.get("id")
            if not card_id:
                continue
            total_cards += 1
            try:
                post = get_card(card_id)
                if not post:
                    errors += 1
                    continue
                post.setdefault("stage", stage)
                result = check_card(post, jev_budget)
                sections.append(render_section(post, result))
                if stage == "udgivet" and result.get("keyword"):
                    published_entries.append({"slug": post.get("slug", ""), "keyword": result["keyword"]})
            except Exception:
                errors += 1

    body = "\n\n".join(sections) if sections else "(ingen kort fundet i klar/publicer/udgivet)"
    header = (
        "---\ntitle: Blog SEO/GEO-tjek\ntags: [kinly, blog, seo, geo]\nstatus: aktiv\nauthor: hermes\n---\n\n"
        f"# Blog SEO/GEO-tjek\n\nKørt {started.date().isoformat()}. Deterministisk SEO-tjek + Jev-dømt "
        f"kundespørgsmål-dækning (top {TOP_N_QUESTIONS} pr. kort, loft {jev_budget_total} Jev-kald/kørsel). "
        "Overskrives hver kørsel.\n\n"
    )
    full_report = header + body + "\n"

    push_ok = None
    if dry_run:
        print(full_report)
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(full_report, encoding="utf-8")
        write_geo_blog_queries(published_entries)
        push_ok = _safe_push(f"hermes: blog SEO/GEO-tjek {started.date().isoformat()}")

    summary = {
        "cards_checked": total_cards,
        "errors": errors,
        "jev_calls": jev_budget_total - jev_budget[0],
        "published_with_keyword": len(published_entries),
        "push_ok": push_ok,
        "dry_run": dry_run,
        "duration_ms": int((datetime.now(timezone.utc) - started).total_seconds() * 1000),
    }
    print(json.dumps(summary, ensure_ascii=False))
    return summary


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--dry-run", action="store_true", help="udskriv rapport til stdout; skriv aldrig vault/HQ/state")
    ap.add_argument("--jev-budget", type=int, default=JEV_BUDGET_DEFAULT)
    args = ap.parse_args()
    run(args.dry_run, args.jev_budget)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
