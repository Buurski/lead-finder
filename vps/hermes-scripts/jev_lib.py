"""Shared helpers for hermes cron monitor scripts: Jev API client + page fetch.

Standard library only. Never print the API key. All state under ~/.hermes/jev/.
"""
import json
import os
import re
import ssl
import time
import urllib.error
import urllib.request
import concurrent.futures as cf

JEV_URL = "https://api.typesafe.ai/v1/systemone"
UA = "Mozilla/5.0 (X11; Linux x86_64) KinlyJevMonitor/0.1"

EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# Danish phone numbers: 8 digits, optionally grouped/spaced, optional +45.
PHONE_RE = re.compile(r"(?:\+45\s?)?\b\d(?:[\s.-]?\d){7}\b")


def load_key():
    """Read TYPESAFE_API_KEY from env, else ~/.hermes/.env, else credentials.env."""
    key = os.environ.get("TYPESAFE_API_KEY")
    if key:
        return key.strip()
    for env_path in (os.path.expanduser("~/.hermes/.env"), os.path.expanduser("~/.hermes/credentials.env")):
        try:
            with open(env_path, encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line.startswith("TYPESAFE_API_KEY="):
                        key = line.split("=", 1)[1].strip().strip('"').strip("'")
                        if key:
                            return key
        except OSError:
            pass
    return None


JEV_MODEL = "jev-1.13.0"


def ask(state, questions, model=JEV_MODEL, timeout=30, retries=2):
    """POST to pinned Jev model. Returns dict, or None on failure."""
    if model != JEV_MODEL:
        raise ValueError(f"mail jobs require pinned {JEV_MODEL}")
    key = load_key()
    if not key:
        return None
    body = json.dumps({"state": state, "model": model, "questions": questions}, ensure_ascii=False).encode()
    req = urllib.request.Request(
        JEV_URL, data=body, method="POST",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
    )
    for i in range(retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code in (429, 500, 502, 503, 504) and i < retries:
                time.sleep(2 * (i + 1))
                continue
            return None
        except Exception:
            if i < retries:
                time.sleep(1)
                continue
            return None
    return None


def ask_many(items, qfn, workers=5, model=JEV_MODEL):
    """items: list of states. qfn(state)->questions. Returns list of (state, result|None)."""
    with cf.ThreadPoolExecutor(workers) as ex:
        futs = [ex.submit(ask, s, qfn(s), model) for s in items]
        return [(s, f.result()) for s, f in zip(items, futs)]


def a(res, qid):
    """Compact answer accessor: score/noul rounded to 2dp, choice as 'name(conf)'."""
    if not res:
        return "?"
    ans = res.get("answers", {}).get(qid, {})
    t = ans.get("type")
    if t == "noul":
        return round(ans["noul"], 2)
    if t == "choice":
        return f'{ans["choice"]}({ans["confidence"]:.2f})'
    if t == "score":
        return round(ans["score"], 2)
    return "?"


# ponytail: no cert verification because the VPS may lack an up to date CA bundle;
# upgrade to ssl.create_default_context() once the VPS trust store is confirmed sane.
_SSL_CTX = ssl._create_unverified_context()


JINA_URL = "https://r.jina.ai/"  # ekstern læser til sites der blokerer vores server-fetch
JINA_TIMEOUT = 45


def _get_raw(url, timeout, headers=None):
    req = urllib.request.Request(url, headers=headers or {"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=timeout, context=_SSL_CTX) as r:
        return r.read(400000).decode(r.headers.get_content_charset() or "utf-8", "ignore")


def fetch_page_text(url, timeout=12, cap=6000):
    """Fetch url, strip tags/emails/phones, return dict or None on failure.

    Direkte fetch først; ved fejl ét forsøg via r.jina.ai (fx Simply.com-WAF 454/455
    og Vercel-challenges svarer kun JS-klienter, men 200 via ekstern læser).

    Keys: text, title, has_viewport_meta, https, booking_keyword_found, copyright_years.
    """
    try:
        raw = _get_raw(url, timeout)
    except Exception:
        # ponytail: én fallback-kilde uden retry-kæde — udvid hvis jina også blokeres.
        try:
            raw = _get_raw(JINA_URL + url, JINA_TIMEOUT,
                           headers={"User-Agent": UA, "X-Return-Format": "html"})
        except Exception:
            return None
        if "<" not in raw:
            return None

    has_viewport = bool(re.search(r'name=["\']viewport', raw, re.I))
    has_https = url.startswith("https")
    booking = bool(re.search(
        r"book|booking|bestil tid|online tidsbestilling|onlinebooking|planway|easypractice|terapeutbooking|fresha",
        raw, re.I,
    ))
    title_m = re.search(r"<title[^>]*>(.*?)</title>", raw, re.I | re.S)
    title = title_m.group(1).strip() if title_m else ""

    txt = re.sub(r"<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", raw, flags=re.S | re.I)
    txt = re.sub(r"<[^>]+>", " ", txt)
    import html as _html
    txt = _html.unescape(re.sub(r"\s+", " ", txt)).strip()
    txt = EMAIL_RE.sub("[email]", txt)
    txt = PHONE_RE.sub("[tlf]", txt)
    txt = txt[:cap]

    copyright_years = sorted(set(re.findall(r"(?:©|&copy;|copyright)\D{0,15}((?:19|20)\d\d)", raw, re.I)))[-3:]

    return {
        "text": txt,
        "title": title,
        "has_viewport_meta": has_viewport,
        "https": has_https,
        "booking_keyword_found": booking,
        "copyright_years": copyright_years,
    }


def atomic_write_json(path, obj):
    """Write JSON atomically: tmp file + os.replace. Keys sorted for stable diffs."""
    path = os.path.expanduser(str(path))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, sort_keys=True, indent=0)
    os.replace(tmp, path)


def load_json(path, default):
    path = os.path.expanduser(str(path))
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return default


def demo():
    """ponytail self-check: no network, just verifies regex/atomic-write/accessor logic."""
    assert EMAIL_RE.sub("[email]", "kontakt: lucas@kinly.dk") == "kontakt: [email]"
    assert PHONE_RE.sub("[tlf]", "ring 12 34 56 78 nu") == "ring [tlf] nu"
    assert a(None, "x") == "?"
    assert a({"answers": {"x": {"type": "noul", "noul": 0.4567}}}, "x") == 0.46
    assert a({"answers": {"x": {"type": "score", "score": 2.0}}}, "x") == 2.0
    assert a({"answers": {"x": {"type": "choice", "choice": "foo", "confidence": 0.8}}}, "x") == "foo(0.80)"
    import tempfile
    d = tempfile.mkdtemp()
    p = os.path.join(d, "sub", "test.json")
    atomic_write_json(p, {"b": 1, "a": 2})
    assert load_json(p, None) == {"a": 2, "b": 1}
    assert load_json(os.path.join(d, "missing.json"), "default") == "default"
    print("jev_lib: OK")


if __name__ == "__main__":
    demo()
