#!/usr/bin/env python3
"""Ugentlig GEO-måling: ChatGPT via Codex CLI-websøgning, grupper lokal/kontrol/kunde/bred.

26/9: kopieret fra /root/.hermes/scripts/geo_citation_loop.py (VPS, read-only)
til worktree'et for at foreslå load_extra_queries() nedenfor (blog_seo_geo_tjek.py
skal kunne lægge blog-specifikke GEO-forespørgsler ind i den ugentlige måling).
IKKE deployet af denne opgave — kun forslag. Deploy: scp denne fil til
/root/.hermes/scripts/geo_citation_loop.py på VPS'en, ellers rørt intet andet."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path
from urllib.parse import quote, unquote, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

HERMES_LIB = Path("/usr/local/lib/hermes-agent")
if str(HERMES_LIB) not in sys.path:
    sys.path.insert(0, str(HERMES_LIB))

try:
    from plugins.web.keyless_mcp import firecrawl_extract_keyless
except ImportError:  # ponytail: kun brugt af "gemini"-grenen (ikke i PLATFORMS pt.) —
    # lader load_extra_queries()-testen køre lokalt uden VPS-modulet. Ingen ændring på VPS'en.
    def firecrawl_extract_keyless(urls):
        raise RuntimeError("firecrawl_extract_keyless kræver /usr/local/lib/hermes-agent (kun på VPS'en)")

ROOT = Path("/root/KnowledgeOS")
LOG = ROOT / "wiki/kinly/geo-log.md"
SAFE_PUSH = ROOT / "scripts/safe-push.sh"
COMPOSIO_BRIDGE = "http://127.0.0.1:8765/mcp"
KINLY_RE = r"(?i)\bKinly(?:\.dk)?\b"
# (gruppe, spørgsmål, mål-navn, mål-regex). 22-09 udvidet efter Lucas: "lokal"
# ligner Kinlys egne sider ordret og overvurderer os. "bred" = andre byer og
# upræcise købsspørgsmål; "kontrol" = ingen skræddersyet Kinly-side; "kunde:*" =
# kundernes EGEN AI-synlighed (VIDA ligger i Aalborg, ikke Herning).
QUERY_SET = (
    ("lokal", "bedste webbureau til skønhedsklinik i Ikast og Herning", "Kinly", KINLY_RE),
    ("lokal", "hvem laver gode hjemmesider til frisører i Herning", "Kinly", KINLY_RE),
    ("lokal", "webbureau til restaurant og café i Herning", "Kinly", KINLY_RE),
    ("lokal", "bedste webbureau til håndværkere i Ikast", "Kinly", KINLY_RE),
    ("lokal", "lokalt webbureau til små virksomheder i Herning", "Kinly", KINLY_RE),
    ("kontrol", "hvem kan lave en ny hjemmeside til min virksomhed i Midtjylland", "Kinly", KINLY_RE),
    ("kontrol", "billig men professionel hjemmeside til lille virksomhed", "Kinly", KINLY_RE),
    ("kunde:VIDA", "bedste skønhedsklinik i Aalborg", "VIDA Skønhedsklinik", r"(?i)\bVIDA\b|vida-klinik\.dk"),
    ("kunde:VIDA", "hvor kan jeg få en god ansigtsbehandling i Aalborg", "VIDA Skønhedsklinik", r"(?i)\bVIDA\b|vida-klinik\.dk"),
    ("kunde:Ikast AutoService", "godt autoværksted i Ikast", "Ikast AutoService", r"(?i)ikast\s*auto\s*service|ikastautoservice\.dk"),
    ("kunde:Ikast AutoService", "værksted med gratis lånebil i Ikast", "Ikast AutoService", r"(?i)ikast\s*auto\s*service|ikastautoservice\.dk"),
    ("bred", "webbureau i Aarhus til en lille virksomhed", "Kinly", KINLY_RE),
    ("bred", "hvem laver hjemmesider til frisører i Aalborg", "Kinly", KINLY_RE),
    ("bred", "hvad koster en hjemmeside til en lille virksomhed i Danmark", "Kinly", KINLY_RE),
    ("bred", "hjemmeside uden månedligt abonnement hvor jeg selv ejer koden", "Kinly", KINLY_RE),
    ("bred", "webdesigner til håndværkere i Jylland", "Kinly", KINLY_RE),
)
QUERIES = tuple(q for _, q, _, _ in QUERY_SET)
# Ekstra forespørgsler fra blog_seo_geo_tjek.py — én pr. udgivet blogindlægs
# hovedsøgeord, så GEO-loopet også måler om ChatGPT nævner os for det EMNE
# indlægget selv dækker (ikke kun de faste webbureau-forespørgsler ovenfor).
BLOG_QUERIES_PATH = Path("/root/.hermes/state/geo-blog-queries.json")


def load_extra_queries(path: Path = BLOG_QUERIES_PATH) -> list[tuple[str, str, str, str]]:
    """Læser {"queries": [{"gruppe","query","maal","pattern"?}, ...]}. Fejl/tom fil = ingen ekstra."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return []
    out: list[tuple[str, str, str, str]] = []
    for item in data.get("queries") or []:
        if not isinstance(item, dict):
            continue
        query = str(item.get("query") or "").strip()
        if not query:
            continue
        out.append((
            str(item.get("gruppe") or "blog"),
            query,
            str(item.get("maal") or "Kinly"),
            str(item.get("pattern") or KINLY_RE),
        ))
    return out
# 22-09: Gemini (kræver login) og Perplexity (API-kredit brugt op, Lucas vil
# ikke købe mere) er ude. ChatGPT måles nu via Codex CLI med live websøgning
# på Lucas' ChatGPT-abonnement — anonym chatgpt.com-scrape giver "Chat stopped
# unexpectedly". Samme model-familie og søgeindeks som ChatGPT, men IKKE
# identisk med forbruger-appen; tal før/efter 22-09 er ikke 1:1 sammenlignelige.
PLATFORMS = ("chatgpt",)
CODEX = "/root/.hermes/node/bin/codex"
CODEX_HOME = "/root/.codex-geo"  # isoleret: ingen MCP/hooks, web_search = "live"
CODEX_MODEL = "gpt-6-luna"
LABELS = {"chatgpt": "ChatGPT", "perplexity": "Perplexity", "gemini": "Gemini"}
SUMMARY_RE = re.compile(r"<!-- geo-summary:(\{[^\n]*\}) -->")


def run(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=True)


def url_for(platform: str, query: str) -> str:
    q = quote(query)
    if platform == "chatgpt":
        return f"https://chatgpt.com/?q={q}"
    if platform == "perplexity":
        return f"https://www.perplexity.ai/search?q={q}"
    return f"https://gemini.google.com/app?hl=da&q={q}"


def perplexity_search(query: str) -> tuple[str, str]:
    arguments = {
        "query": query,
        "country": "DK",
        "max_results": 5,
        "max_tokens": 5000,
        "max_tokens_per_page": 800,
        "search_language_filter": ["da"],
    }
    payload = json.dumps({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": "PERPLEXITYAI_SEARCH", "arguments": arguments},
    }).encode()
    last = "ukendt fejl"
    for attempt in range(1, 4):  # Vercel-checkpointet er flaky; retries virker (se buur-agentic-os-skill)
        try:
            request = Request(COMPOSIO_BRIDGE, data=payload, headers={"Content-Type": "application/json"})
            with urlopen(request, timeout=150) as response:
                rpc = json.loads(response.read().decode())
            text = "\n".join(
                item.get("text", "")
                for item in rpc["result"]["content"]
                if item.get("type") == "text"
            )
            data = json.loads(text)
            while isinstance(data.get("result"), str):
                data = json.loads(data["result"])
            results = data.get("results") or []
            if not results:
                last = "Composio gav ingen Perplexity-resultater"
            else:
                lines = []
                for index, result in enumerate(results, 1):
                    lines.append(f"{index}. {result.get('title', '')} {result.get('url', '')}\n{result.get('snippet', '')}")
                return "\n".join(lines), ""
        except Exception as exc:
            last = f"Composio-fejl: {exc}"[:100]
        time.sleep(2 * attempt)
    return "", last


def codex_search(query: str) -> tuple[str, str]:
    # Neutral prompt: Kinly nævnes aldrig, ellers måler vi vores egen ledende tekst.
    prompt = (
        "Søg på nettet og svar som en hjælpsom assistent ville svare en dansk bruger, "
        f"der spørger: «{query}». Giv en nummereret liste med konkrete firmaer og deres URL."
    )
    out = Path(f"/tmp/geo-codex-{abs(hash(query))}.txt")
    try:
        proc = subprocess.run(
            # low effort: websøgningen er det dyre, ikke ræsonnementet — sparer kvote
            [CODEX, "exec", "-m", CODEX_MODEL, "-c", 'model_reasoning_effort="low"', "--sandbox", "read-only",
             "--skip-git-repo-check", "-o", str(out), "-"],
            input=prompt, text=True, capture_output=True, timeout=240, cwd="/tmp",
            env={"PATH": "/root/.hermes/node/bin:/usr/local/bin:/usr/bin:/bin",
                 "HOME": "/root", "CODEX_HOME": CODEX_HOME},
        )
        answer = out.read_text(encoding="utf-8").strip() if out.exists() else ""
    except Exception as exc:
        return "", f"codex-fejl: {exc}"[:100]
    finally:
        out.unlink(missing_ok=True)
    if answer:
        return answer, ""
    err = (proc.stderr or "") + (proc.stdout or "")
    if "usage limit" in err.lower():
        return "", "Codex usage-limit ramt (kontoen deles med Lucas' eget Codex-brug)"
    if "log out and sign in" in err.lower() or "401" in err:
        return "", "Codex-login udløbet — ny device-login kræves"
    return "", "codex gav intet svar"


def scrape(platform: str, query: str) -> tuple[str, str]:
    if platform == "chatgpt":
        return codex_search(query)
    if platform == "perplexity":
        return perplexity_search(query)
    url = url_for(platform, query)
    result: dict = {}
    for attempt in range(1, 4):  # keyless-scrape fejler flaky; 3 forsøg med backoff
        result = firecrawl_extract_keyless([url])[0]
        if not result.get("error"):
            break
        time.sleep(2 * attempt)
    return result.get("content") or "", str(result.get("error") or "")


def extract_answer(platform: str, query: str, content: str) -> tuple[str, str]:
    if platform == "chatgpt":
        # Codex returnerer selve svaret; den gamle scrape-markør er bevaret for
        # bagudkompatibilitet med self-testen.
        marker = "#### ChatGPT said:"
        answer = content.split(marker, 1)[1].split("ChatGPT is AI", 1)[0].strip() if marker in content else content.strip()
        return (answer, "") if len(answer.split()) >= 8 else ("", "tomt svar")

    if platform == "perplexity":
        return (content, "") if len(content.split()) >= 8 else ("", "ingen søgeresultater")

    if "Sig hej til Gemini" in content or query not in content:
        return "", "kræver Google-login"
    answer = content.split(query, 1)[1].strip()
    return (answer, "") if len(answer.split()) >= 8 else ("", "tomt svar")


def rank_of(answer: str, pattern: str = KINLY_RE) -> str:
    # Plads = nummeret på den listelinje hvor målet først nævnes.
    for line in answer.splitlines():
        m = re.match(r"\s*(\d+)[.)]\s+", line)
        if m and re.search(pattern, line):
            return m.group(1)
    return "—"


def source_domains(answer: str) -> str:
    ignored = {
        "chatgpt.com", "openai.com", "images.openai.com", "google.com",
        "gstatic.com", "perplexity.ai", "gemini.google.com", "mapbox.com",
        "openstreetmap.org",
    }
    found: list[str] = []
    decoded = unquote(answer)
    pattern = r"(?i)\b(?:https?://)?(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24}\b"
    for raw in re.findall(pattern, decoded):
        value = raw if raw.startswith("http") else "https://" + raw
        domain = (urlparse(value).hostname or "").lower().removeprefix("www.")
        parts = domain.split(".")
        label = parts[0]
        if len(label) % 2 == 0 and label[:len(label) // 2] == label[len(label) // 2:]:
            domain = ".".join([label[:len(label) // 2], *parts[1:]])
        blocked = any(domain == item or domain.endswith("." + item) for item in ignored)
        if domain and not blocked and domain not in found:
            found.append(domain)
    return ", ".join(found[:3]) or "—"


def measure() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    all_queries = QUERY_SET + tuple(load_extra_queries())
    for platform in PLATFORMS:
        for index, (gruppe, query, maal, pattern) in enumerate(all_queries):
            if index and rows[-1]["platform"] == platform and rows[-1]["status"] == "utilgængelig":
                rows.append({"platform": platform, "gruppe": gruppe, "maal": maal, "query": query, "status": "utilgængelig", "reason": "platform-probe fejlede", "mentioned": False, "rank": "—", "sources": "—"})
                continue
            content, error = scrape(platform, query)
            answer, reason = extract_answer(platform, query, content)
            if error or not answer:
                rows.append({"platform": platform, "gruppe": gruppe, "maal": maal, "query": query, "status": "utilgængelig", "reason": (error or reason)[:100], "mentioned": False, "rank": "—", "sources": "—"})
                continue
            mentioned = bool(re.search(pattern, answer))
            rows.append({"platform": platform, "gruppe": gruppe, "maal": maal, "query": query, "status": "svar", "reason": "", "answer": answer, "mentioned": mentioned, "rank": rank_of(answer, pattern) if mentioned else "—", "sources": source_domains(answer)})
    return rows


# 22-09: Jev dømmer hvert AI-svar. Regex ser kun OM Kinly nævnes; Jev ser HVORDAN,
# og hvad firmaet øverst på listen vinder på — det er det Kinly skal matche.
JEV_QUESTIONS = {
    "maal_anbefalet": {
        "type": "noul",
        "instructions": "Anbefaler `svar` tydeligt `maal` som et godt valg til spørgsmålet `query`?",
    },
    "vinder_fordel": {
        "type": "choice",
        "instructions": "Hvad fremhæver `svar` som hovedgrunden til at vælge det firma der nævnes FØRST?",
        "criteria": {
            "pris": "Lav eller gennemsigtig pris",
            "lokal": "Lokal nærhed / ligger i byen",
            "branche": "Specialiseret i netop den branche",
            "bevis": "Anmeldelser, cases eller kendte kunder",
            "kvalitet": "Design, teknik eller kvalitet",
            "andet": "Andet eller uklart",
        },
    },
}


def jev_judge(rows: list[dict[str, object]]) -> str:
    """Tilføjer Jev-domme til besvarede rækker. Returnerer én opsummeringslinje ('' ved fejl)."""
    try:
        sys.path.insert(0, str(Path(__file__).resolve().parent))
        import jev_lib
        if not jev_lib.load_key():
            return ""
        svar = [r for r in rows if r["status"] == "svar"]
        states = [{"query": r["query"], "maal": r.get("maal", "Kinly"), "svar": str(r.get("answer", ""))[:3000]} for r in svar]
        results = jev_lib.ask_many(states, lambda s: JEV_QUESTIONS)
    except Exception as exc:
        return f"Jev: fejl ({type(exc).__name__})"
    anbefalet, fordele, kunde = 0, {}, {}
    n_kinly = sum(r.get("maal", "Kinly") == "Kinly" for r in svar)
    for row, (_s, res) in zip(svar, results):
        ans = (res or {}).get("answers", {})
        noul = ans.get("maal_anbefalet", {}).get("noul")
        valg = ans.get("vinder_fordel", {})
        row["jev_anbefalet"] = round(noul, 2) if noul is not None else None
        if row.get("maal", "Kinly") != "Kinly":
            k = kunde.setdefault(str(row["maal"]), [0, 0])
            k[1] += 1
            k[0] += 1 if noul is not None and noul >= 0.6 else 0
            continue
        if noul is not None and noul >= 0.6:
            anbefalet += 1
        if valg.get("confidence", 0) >= 0.6:
            fordele[valg["choice"]] = fordele.get(valg["choice"], 0) + 1
    top = ", ".join(f"{k} {v}" for k, v in sorted(fordele.items(), key=lambda kv: -kv[1]))
    kunder = " · ".join(f"{k} {v[0]}/{v[1]}" for k, v in kunde.items())
    return (f"Jev: Kinly tydeligt anbefalet i {anbefalet}/{n_kinly} svar · vinderen fremhæves for: {top or 'uklart'}"
            + (f" · kunder anbefalet: {kunder}" if kunder else ""))


def summarize(rows: list[dict[str, object]]) -> dict[str, dict[str, int]]:
    # "chatgpt" tæller KUN rækker hvor målet er Kinly (bagudkompatibelt med
    # kinly_signal og ældre log-rækker). Alle grupper inkl. kunder står under "grupper".
    kinly = [r for r in rows if r.get("maal", "Kinly") == "Kinly"]
    out: dict = {
        platform: {
            "svar": sum(r["platform"] == platform and r["status"] == "svar" for r in kinly),
            "kinly": sum(r["platform"] == platform and r["status"] == "svar" and r["mentioned"] for r in kinly),
        }
        for platform in PLATFORMS
    }
    grupper: dict = {}
    for r in rows:
        if r["status"] != "svar":
            continue
        g = grupper.setdefault(str(r.get("gruppe", "lokal")), {"svar": 0, "naevnt": 0})
        g["svar"] += 1
        g["naevnt"] += 1 if r["mentioned"] else 0
    out["grupper"] = grupper
    return out


def format_summary(summary: dict[str, dict[str, int]]) -> str:
    parts = []
    for platform in PLATFORMS:
        values = summary[platform]
        label = LABELS[platform]
        parts.append(f"{label} {values['kinly']}/{values['svar']}" if values["svar"] else f"{label} utilgængelig")
    grupper = summary.get("grupper") or {}
    if grupper:
        parts.append("grupper: " + ", ".join(f"{g} {v['naevnt']}/{v['svar']}" for g, v in grupper.items()))
    return " · ".join(parts)


def document_header(today: str) -> str:
    return f"""---
title: GEO citation-log
tags: [kinly, geo, aeo, ai-citations]
status: aktiv
date: {today}
author: Agentic OS
---

# GEO citation-log

Ugentligt tjek fra VPS'en (mandag 08:20). ChatGPT måles via Codex CLI med live websøgning (gpt-6-luna, neutral prompt) på 16 faste spørgsmål i grupperne lokal / kontrol / kunde:* / bred. Perplexity og Gemini er udgået 22-09. Jev dømmer om målet anbefales og hvad vinderen fremhæves for. **Nej** bruges kun ved reelle resultater; login/blokering tæller som **utilgængelig**. Resultater kan variere efter tid og sted.

"""


def run_block(now: datetime, rows: list[dict[str, object]], summary: dict[str, dict[str, int]], jev_line: str = "") -> str:
    lines = [
        f"## {now:%Y-%m-%d %H:%M}",
        "",
        f"**Resultat:** {format_summary(summary)}",
        "",
        f"_Metode: ChatGPT via Codex CLI ({CODEX_MODEL}) med live websøgning, neutral prompt._",
        "",
        "| Gruppe | Fast prompt | Mål | Svar | Nævnt | Placering | Kilder/status |",
        "|---|---|---|---:|---:|---:|---|",
    ]
    for row in rows:
        answered = "ja" if row["status"] == "svar" else "utilgængelig"
        mentioned = "ja" if row["status"] == "svar" and row["mentioned"] else ("nej" if row["status"] == "svar" else "—")
        detail = row["sources"] if row["status"] == "svar" else row["reason"]
        lines.append(f"| {row.get('gruppe', 'lokal')} | {row['query']} | {row.get('maal', 'Kinly')} | {answered} | {mentioned} | {row['rank']} | {detail} |")
    marker = json.dumps(summary, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    if jev_line:
        lines += ["", jev_line]
    lines += ["", f"<!-- geo-summary:{marker} -->", ""]
    return "\n".join(lines)


def previous_summary(text: str) -> dict[str, dict[str, int]] | None:
    matches = SUMMARY_RE.findall(text)
    return json.loads(matches[-1]) if matches else None


def changed_files() -> set[str]:
    return {
        line[3:]
        for line in run("git", "status", "--porcelain", "--untracked-files=all").stdout.splitlines()
        if line.strip()
    }


def save(rows: list[dict[str, object]], now: datetime, jev_line: str = "") -> tuple[dict[str, dict[str, int]], bool]:
    # 21-09: andres ugemte ændringer i vaulten må ikke blokere (14 dages tavse
    # fejl), men de må heller ikke committes med. Vi pull'er først (autostash),
    # måler delta, og committer KUN vores egen fil — aldrig git add -A herfra.
    run("git", "pull", "--rebase", "--autostash", "origin", "master")

    expected = str(LOG.relative_to(ROOT))
    before = changed_files()
    if expected in before:
        raise RuntimeError("geo-log.md har ugemte ændringer i forvejen; springer over")

    original = LOG.read_text(encoding="utf-8") if LOG.exists() else ""
    summary = summarize(rows)
    text = original or document_header(now.date().isoformat())
    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text(text.rstrip() + "\n\n" + run_block(now, rows, summary, jev_line), encoding="utf-8")

    nye = changed_files() - before
    if nye != {expected}:
        if original:
            LOG.write_text(original, encoding="utf-8")
        else:
            LOG.unlink(missing_ok=True)
        raise RuntimeError(f"Uventede repo-ændringer: {', '.join(sorted(nye)) or 'ingen'}")

    run("git", "add", expected)
    run("git", "commit", "-m", f"hermes: GEO-citation-loop {now:%Y-%m-%d} [skip vercel]")
    run("git", "pull", "--rebase", "--autostash", "origin", "master")
    run("git", "push", "origin", "master")
    return summary, previous_summary(original) != summary


def self_test() -> None:
    chat = "#### ChatGPT said:\n1. **Webko**\n2. **Kinly – Herning** fra kinly.dk\nChatGPT is AI"
    answer, reason = extract_answer("chatgpt", QUERIES[0], chat)
    assert not reason and rank_of(answer) == "2" and "kinly.dk" in source_domains(answer)
    assert source_domains("5.0 bl.a https%3A%2F%2Fwebkowebko.dk apps.mapbox.com") == "webko.dk"
    answer, reason = extract_answer("perplexity", QUERIES[0], "1. Kinly webbureau i Herning https://kinly.dk/\nLokale kodede hjemmesider til små virksomheder.\n2. Webko https://webko.dk/")
    assert not reason and rank_of(answer) == "1"
    answer, _ = extract_answer("gemini", QUERIES[0], "Sig hej til Gemini")
    assert not answer
    sample = {"chatgpt": {"svar": 5, "kinly": 1}}
    assert previous_summary("<!-- geo-summary:" + json.dumps(sample) + " -->") == sample
    assert "gemini" not in PLATFORMS
    assert rank_of("1. Klart Studio\n2. VIDA Skønhedsklinik – vida-klinik.dk", next(x[3] for x in QUERY_SET if x[0] == "kunde:VIDA")) == "2"
    s = summarize([{"platform": "chatgpt", "gruppe": "kunde:VIDA", "maal": "VIDA", "status": "svar", "mentioned": True},
                   {"platform": "chatgpt", "gruppe": "bred", "maal": "Kinly", "status": "svar", "mentioned": False}])
    assert s["chatgpt"] == {"svar": 1, "kinly": 0} and s["grupper"]["kunde:VIDA"] == {"svar": 1, "naevnt": 1}
    assert rank_of("1. [Kinly](https://kinly.dk) - webbureau") == "1"
    dead = [{"platform": p, "status": "utilgængelig", "mentioned": False} for p in PLATFORMS]
    assert not any(summarize(dead)[p]["svar"] for p in PLATFORMS)
    print("self-test ok")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    now = datetime.now(ZoneInfo("Europe/Copenhagen"))
    rows = measure()
    summary = summarize(rows)
    if args.dry_run:
        print(run_block(now, rows, summary, jev_judge(rows)))
        return
    # 22-09: 21/9 blev to rækker med 0 svar committet som "måling" — det er
    # et nedbrud, ikke data. Intet svar fra nogen platform = fejl, ingen log.
    if not any(summary[p]["svar"] for p in PLATFORMS):
        reasons = sorted({str(r["reason"]) for r in rows if r["reason"]})
        print(f"🚨 GEO-citation-loop: ingen platform svarede ({'; '.join(reasons)[:200]})")
        raise SystemExit(1)
    try:
        summary, changed = save(rows, now, jev_judge(rows))
    except Exception as exc:
        print(f"🚨 GEO-citation-loop fejlede: {exc}")
        raise SystemExit(1)
    if changed:
        print("GEO-citation ændret: " + format_summary(summary))


if __name__ == "__main__":
    main()
