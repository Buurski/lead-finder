#!/usr/bin/env python3
"""Deterministisk graf-generator i Kinly-stil til blogindlæg.

Input: en JSON-spec (fil eller stdin), se `SPEC_HELP` nedenfor.
Output: <out-prefix>.png + .webp (1600x1000, desktop) og
        <out-prefix>-mobile.png + .webp (1080x1350, letterboxed).

Kun Pillow (ingen matplotlib) — VPS'en har hverken PIL eller matplotlib
installeret i dag (tjekket via ssh 2026-09-26). `pip install pillow` er
UUNDGÅELIGT: uden et rasterizer-bibliotek kan stdlib ikke tegne rundede
rektangler eller loade TrueType-fonte. Se rapporten for install-kommandoen.

Fontene (Archivo, Space Grotesk — begge Google Fonts / OFL) er vendoret i
kinly_graf_assets/fonts/ som TTF (konverteret fra kinly-blog-wt's woff2,
licens tillader det). kinly-logo.png er en rasteriseret udgave af
public/brand/kinly-wordmark.svg (samme farver/geometri som det rigtige logo).

Brug:
    python3 kinly_graf.py spec.json /tmp/graf-mit-slug
    python3 kinly_graf.py --selftest        # ét hurtigt "virker det" tjek

Spec (JSON):
{
  "type": "bars" | "barh" | "compare" | "stat",
  "title": "<= 60 tegn",
  "subtitle": "valgfri undertitel",
  "bars": [
    {"label": "...", "sublabel": "valgfri", "value": 15, "unit": "%", "highlight": true}
  ],
  "source": "Kilde: ...",   // PÅKRÆVET
  "note": "valgfri lille note under kilden"
}
"bars"/"stat" kræver 1 søjle for "stat"; "compare" kræver præcis 2; "bars"/"barh" 1-6.
"""
from __future__ import annotations

import io
import json
import os
import sys
from dataclasses import dataclass, field

from PIL import Image, ImageDraw, ImageFont

ASSETS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "kinly_graf_assets")
FONT_DIR = os.path.join(ASSETS, "fonts")
LOGO_PATH = os.path.join(ASSETS, "kinly-logo.png")

# ─── Kinly design-tokens (kopieret fra kinly-blog-wt/src/styles/globals.css,
#     Ember-systemet — hold i sync hvis paletten ændrer sig dér) ───
PAPER = "#faf6ef"
SURFACE = "#f3ede2"
INK = "#191713"
MID = "#55504a"
FADED = "#8a847b"
EMBER = "#d4500f"

W, H = 1600, 1000
MOBILE_W, MOBILE_H = 1080, 1350
MARGIN = 90

VALID_TYPES = ("bars", "barh", "compare", "stat")


class SpecError(ValueError):
    pass


# ─── Validering ───

def validate_spec(spec: dict) -> list[str]:
    errors: list[str] = []
    if not isinstance(spec, dict):
        return ["spec skal være et JSON-objekt"]

    t = spec.get("type")
    if t not in VALID_TYPES:
        errors.append(f"type skal være en af {VALID_TYPES}, fik {t!r}")

    title = spec.get("title")
    if not isinstance(title, str) or not title.strip():
        errors.append("title mangler")
    elif len(title) > 60:
        errors.append(f"title er {len(title)} tegn — max 60")

    subtitle = spec.get("subtitle")
    if subtitle is not None and not isinstance(subtitle, str):
        errors.append("subtitle skal være tekst")

    source = spec.get("source")
    if not isinstance(source, str) or not source.strip():
        errors.append("source mangler — påkrævet, afvises uden")

    note = spec.get("note")
    if note is not None and not isinstance(note, str):
        errors.append("note skal være tekst")

    bars = spec.get("bars")
    if not isinstance(bars, list) or not bars:
        errors.append("bars mangler eller er tom")
        bars = []
    if len(bars) > 6:
        errors.append(f"{len(bars)} søjler — max 6")
    if t == "compare" and len(bars) != 2:
        errors.append("type compare kræver præcis 2 søjler")
    if t == "stat" and len(bars) != 1:
        errors.append("type stat kræver præcis 1 søjle")

    for i, b in enumerate(bars):
        if not isinstance(b, dict):
            errors.append(f"søjle {i + 1}: skal være et objekt")
            continue
        if not isinstance(b.get("label"), str) or not b["label"].strip():
            errors.append(f"søjle {i + 1}: label mangler")
        val = b.get("value")
        if isinstance(val, bool) or not isinstance(val, (int, float)):
            errors.append(f"søjle {i + 1}: value skal være et tal, fik {val!r}")
        if b.get("sublabel") is not None and not isinstance(b["sublabel"], str):
            errors.append(f"søjle {i + 1}: sublabel skal være tekst")
        if b.get("unit") is not None and not isinstance(b["unit"], str):
            errors.append(f"søjle {i + 1}: unit skal være tekst")
        if b.get("highlight") is not None and not isinstance(b["highlight"], bool):
            errors.append(f"søjle {i + 1}: highlight skal være true/false")

    return errors


# ─── Dansk talformat: "15 %", "4,5 kunder" ───

def format_number(bar: dict) -> str:
    value = bar["value"]
    if float(value) == int(value):
        num = str(int(value))
    else:
        num = f"{value:.1f}".replace(".", ",")
    unit = bar.get("unit") or ""
    if unit == "%":
        return f"{num} %"
    if unit:
        return f"{num} {unit}"
    return num


# ─── Font-hjælper ───

_FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def font(name: str, size: int) -> ImageFont.FreeTypeFont:
    key = (name, size)
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(os.path.join(FONT_DIR, name), size)
    return _FONT_CACHE[key]


def text_width(draw: ImageDraw.ImageDraw, text: str, f: ImageFont.FreeTypeFont) -> int:
    return int(draw.textlength(text, font=f))


def fit_lines(draw: ImageDraw.ImageDraw, text: str, font_name: str, start_size: int,
              max_width: int, min_size: int = 14, max_lines: int = 2) -> tuple[ImageFont.FreeTypeFont, list[str]]:
    """Ordombrydning der krymper skriftstørrelsen indtil teksten passer på
    max_lines linjer inden for max_width. ponytail: greedy wrap, ingen
    hyphenation — passer fint til korte overskrifter/labels."""
    size = start_size
    words = text.split()
    while size >= min_size:
        f = font(font_name, size)
        lines: list[str] = []
        cur = ""
        for w in words:
            trial = f"{cur} {w}".strip()
            if text_width(draw, trial, f) <= max_width or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        if len(lines) <= max_lines and all(text_width(draw, ln, f) <= max_width for ln in lines):
            return f, lines
        size -= 2
    return font(font_name, min_size), lines[:max_lines] if lines else [text]


def rrect(draw: ImageDraw.ImageDraw, box, radius: int, fill: str) -> None:
    draw.rounded_rectangle(box, radius=radius, fill=fill)


# ─── Grundlayout: baggrund, titel, logo, kilde, bundstreg ───

def draw_header_footer(img: Image.Image, draw: ImageDraw.ImageDraw, spec: dict) -> int:
    """Tegner baggrund, titel/undertitel, logo og footer. Returnerer y hvor
    grafens indhold må starte."""
    draw.rectangle([0, 0, W, H], fill=PAPER)

    title_font, title_lines = fit_lines(draw, spec["title"], "spacegrotesk-500.ttf", 50, W - 2 * MARGIN - 380)
    y = 72
    line_h = int(title_font.size * 1.12)
    for ln in title_lines:
        draw.text((MARGIN, y), ln, font=title_font, fill=INK)
        y += line_h
    content_top = y + 10

    subtitle = spec.get("subtitle")
    if subtitle:
        sub_font, sub_lines = fit_lines(draw, subtitle, "archivo-400.ttf", 25, W - 2 * MARGIN - 380, min_size=16)
        for ln in sub_lines:
            draw.text((MARGIN, content_top), ln, font=sub_font, fill=MID)
            content_top += int(sub_font.size * 1.35)
        content_top += 14
    else:
        content_top += 24

    # Logo top-right (vendoret PNG, ægte alpha).
    try:
        logo = Image.open(LOGO_PATH).convert("RGBA")
        logo_w = 220
        logo_h = int(logo.height * (logo_w / logo.width))
        logo = logo.resize((logo_w, logo_h), Image.LANCZOS)
        img.paste(logo, (W - MARGIN - logo_w, 78), logo)
    except FileNotFoundError:
        pass  # ponytail: manglende logo-asset må aldrig vælte grafgenereringen

    # Footer: kilde nederst til venstre + evt. note, orange bundstreg.
    rule_h = 14
    draw.rectangle([0, H - rule_h, W, H], fill=EMBER)

    footer_y = H - rule_h - 40
    source_font = font("archivo-400.ttf", 20)
    source_text = spec["source"]
    if not source_text.lower().startswith("kilde"):
        source_text = f"Kilde: {source_text}"
    note = spec.get("note")
    if note:
        draw.text((MARGIN, footer_y - 26), source_text, font=source_font, fill=FADED)
        draw.text((MARGIN, footer_y), note, font=font("archivo-400.ttf", 18), fill=FADED)
    else:
        draw.text((MARGIN, footer_y), source_text, font=source_font, fill=FADED)

    return content_top


# ─── "bars" / "compare": lodrette søjler med stort tal ovenpå ───

def render_bars_vertical(draw: ImageDraw.ImageDraw, spec: dict, content_top: int) -> None:
    bars = spec["bars"]
    n = len(bars)
    usable_w = W - 2 * MARGIN
    gap = 90 if n <= 3 else 50
    bar_w = min(300, int((usable_w - gap * (n - 1)) / n))
    total_w = bar_w * n + gap * (n - 1)
    start_x = MARGIN + (usable_w - total_w) // 2

    floor_y = H - 14 - 120  # over footeren
    max_bar_h = floor_y - content_top - 130  # plads til tal ovenpå
    max_value = max(float(b["value"]) for b in bars) or 1

    label_font = font("archivo-400.ttf", 30)
    sublabel_font = font("archivo-400.ttf", 20)

    for i, b in enumerate(bars):
        x = start_x + i * (bar_w + gap)
        bar_h = max(12, int(max_bar_h * (float(b["value"]) / max_value)))
        bar_top = floor_y - bar_h
        color = EMBER if b.get("highlight") else FADED
        rrect(draw, [x, bar_top, x + bar_w, floor_y], radius=6, fill=color)

        num_text = format_number(b)
        num_font, num_lines = fit_lines(draw, num_text, "spacegrotesk-700.ttf", 78, bar_w + gap - 10, min_size=36, max_lines=1)
        num_color = EMBER if b.get("highlight") else INK
        nw = text_width(draw, num_lines[0], num_font)
        draw.text((x + bar_w / 2 - nw / 2, bar_top - num_font.size - 22), num_lines[0], font=num_font, fill=num_color)

        lf, llines = fit_lines(draw, b["label"], "archivo-400.ttf", 30, bar_w + gap - 10, min_size=18, max_lines=2)
        ly = floor_y + 22
        for ln in llines:
            lw = text_width(draw, ln, lf)
            draw.text((x + bar_w / 2 - lw / 2, ly), ln, font=lf, fill=INK)
            ly += int(lf.size * 1.25)

        sub = b.get("sublabel")
        if sub:
            sf, slines = fit_lines(draw, sub, "archivo-400.ttf", 20, bar_w + gap - 10, min_size=14, max_lines=1)
            sw = text_width(draw, slines[0], sf)
            draw.text((x + bar_w / 2 - sw / 2, ly + 4), slines[0], font=sf, fill=FADED)


# ─── "barh": vandrette søjler med spor (Kinly "pris er ikke værdi"-stil) ───

def render_bars_horizontal(draw: ImageDraw.ImageDraw, spec: dict, content_top: int) -> None:
    bars = spec["bars"]
    n = len(bars)
    track_x0 = MARGIN
    track_x1 = W - MARGIN
    track_w = track_x1 - track_x0
    max_value = max(float(b["value"]) for b in bars) or 1

    available_h = (H - 14 - 60) - content_top
    row_h = min(100, int(available_h / n) - 30)
    row_gap = int((available_h - row_h * n) / max(1, n))
    y = content_top + row_gap // 2

    label_font = font("archivo-400.ttf", 26)
    num_font = font("spacegrotesk-700.ttf", 40)
    radius = int(row_h * 0.28)  # rundet rektangel, ikke en pille — matcher referencen

    for b in bars:
        rrect(draw, [track_x0, y, track_x1, y + row_h], radius=radius, fill=SURFACE)
        frac = max(0.03, float(b["value"]) / max_value)
        fill_w = max(int(row_h * 0.9), int(track_w * frac))
        color = EMBER if b.get("highlight") else FADED
        rrect(draw, [track_x0, y, track_x0 + fill_w, y + row_h], radius=radius, fill=color)

        num_text = format_number(b)
        nw = text_width(draw, num_text, num_font)
        label = b["label"]
        caption_below = None

        if fill_w >= nw + 60 and frac > 0.35:
            # Tal passer inde i den fyldte bjælke — sæt det til højre inde i den, lys tekst.
            # Labelen er typisk for lang til at stå inde i bjælken, så den bliver en billedtekst under.
            tx = track_x0 + fill_w - nw - 24
            draw.text((tx, y + row_h / 2 - num_font.size / 2), num_text, font=num_font, fill=PAPER)
            caption_below = label
        else:
            # Bjælken er for smal — tal + label uden for, til højre for bjælken.
            tx = track_x0 + fill_w + 24
            draw.text((tx, y + row_h / 2 - num_font.size / 2), num_text, font=num_font, fill=color)
            draw.text((tx + nw + 20, y + row_h / 2 - label_font.size / 2), label, font=label_font, fill=INK)

        y += row_h + 16

        if caption_below:
            cf, clines = fit_lines(draw, caption_below, "archivo-400.ttf", 24, track_w, min_size=16, max_lines=2)
            for ln in clines:
                draw.text((track_x0, y), ln, font=cf, fill=INK)
                y += int(cf.size * 1.3)

        sub = b.get("sublabel")
        if sub:
            draw.text((track_x0, y + 4), sub, font=font("archivo-400.ttf", 22), fill=FADED)
            y += 36

        y += row_gap


# ─── "stat": ét stort tal ───

def render_stat(draw: ImageDraw.ImageDraw, spec: dict, content_top: int) -> None:
    b = spec["bars"][0]
    center_y = content_top + (H - 14 - content_top) / 2

    num_text = format_number(b)
    num_font, num_lines = fit_lines(draw, num_text, "spacegrotesk-700.ttf", 220, W - 2 * MARGIN, min_size=80, max_lines=1)
    nw = text_width(draw, num_lines[0], num_font)
    ny = center_y - num_font.size * 0.75
    draw.text((W / 2 - nw / 2, ny), num_lines[0], font=num_font, fill=EMBER)

    lf, llines = fit_lines(draw, b["label"], "archivo-400.ttf", 36, W - 2 * MARGIN, min_size=22, max_lines=2)
    ly = ny + num_font.size + 24
    for ln in llines:
        lw = text_width(draw, ln, lf)
        draw.text((W / 2 - lw / 2, ly), ln, font=lf, fill=INK)
        ly += int(lf.size * 1.3)

    sub = b.get("sublabel")
    if sub:
        sf, slines = fit_lines(draw, sub, "archivo-400.ttf", 22, W - 2 * MARGIN, min_size=16, max_lines=2)
        for ln in slines:
            sw = text_width(draw, ln, sf)
            draw.text((W / 2 - sw / 2, ly + 6), ln, font=sf, fill=FADED)
            ly += int(sf.size * 1.3)


RENDERERS = {
    "bars": render_bars_vertical,
    "compare": render_bars_vertical,
    "barh": render_bars_horizontal,
    "stat": render_stat,
}


# ─── Sammensætning ───

def render(spec: dict) -> Image.Image:
    img = Image.new("RGB", (W, H), PAPER)
    draw = ImageDraw.Draw(img)
    content_top = draw_header_footer(img, draw, spec)
    RENDERERS[spec["type"]](draw, spec, content_top)
    return img


def render_mobile(desktop: Image.Image) -> Image.Image:
    """1080x1350 mobil-variant. ponytail: letterboxed skalering af desktop-
    layoutet i stedet for en selvstændig responsiv reflow — passer på alle 4
    grafik-typer uden fire ekstra layout-funktioner. Opgrader til rigtig
    reflow (større tekst, søjler stablet) hvis mobil-visningerne skal bære
    mere vægt end et delt billede i en blogartikel."""
    scale = MOBILE_W / W
    resized = desktop.resize((MOBILE_W, int(H * scale)), Image.LANCZOS)
    canvas = Image.new("RGB", (MOBILE_W, MOBILE_H), PAPER)
    y = (MOBILE_H - resized.height) // 2
    canvas.paste(resized, (0, y))
    return canvas


def generate(spec: dict, out_prefix: str) -> dict:
    errors = validate_spec(spec)
    if errors:
        return {"ok": False, "errors": errors}

    desktop = render(spec)
    mobile = render_mobile(desktop)

    files = {}
    png_path = f"{out_prefix}.png"
    webp_path = f"{out_prefix}.webp"
    mobile_png_path = f"{out_prefix}-mobile.png"
    mobile_webp_path = f"{out_prefix}-mobile.webp"

    desktop.save(png_path, "PNG", optimize=True)
    desktop.save(webp_path, "WEBP", quality=90)
    mobile.save(mobile_png_path, "PNG", optimize=True)
    mobile.save(mobile_webp_path, "WEBP", quality=90)

    files = {"png": png_path, "webp": webp_path, "mobile_png": mobile_png_path, "mobile_webp": mobile_webp_path}
    return {"ok": True, "files": files}


def _selftest() -> None:
    """ponytail: ét runnable check — ikke en testsuite. Kører alle 4 typer
    gennem generate() og fejler hårdt (assert) hvis noget går galt."""
    import tempfile

    spec_bars = {
        "type": "bars", "title": "Testgraf søjler", "subtitle": "Selvtjek",
        "source": "Kilde: selftest",
        "bars": [
            {"label": "Uden", "sublabel": "test a", "value": 15, "unit": "%", "highlight": True},
            {"label": "Med", "sublabel": "test b", "value": 8, "unit": "%"},
        ],
    }
    spec_barh = {
        "type": "barh", "title": "Testgraf vandret", "source": "Kilde: selftest",
        "bars": [
            {"label": "Kvalitet", "value": 4, "unit": "%", "highlight": True},
            {"label": "Alt andet", "value": 96, "unit": "%", "sublabel": "resten"},
        ],
    }
    spec_stat = {
        "type": "stat", "title": "Testgraf stat", "source": "Kilde: selftest",
        "bars": [{"label": "kunder mistet", "value": 23, "unit": "%", "sublabel": "pr. år"}],
    }
    spec_compare = {
        "type": "compare", "title": "Testgraf compare", "source": "Kilde: selftest",
        "bars": [{"label": "A", "value": 60, "highlight": True}, {"label": "B", "value": 40}],
    }

    bad = generate({"type": "bars", "title": "x" * 90, "bars": [], "source": ""}, "/tmp/should-not-exist")
    assert bad["ok"] is False and bad["errors"], "ugyldig spec skal afvises med fejl"

    with tempfile.TemporaryDirectory() as tmp:
        for name, spec in [("bars", spec_bars), ("barh", spec_barh), ("stat", spec_stat), ("compare", spec_compare)]:
            res = generate(spec, os.path.join(tmp, name))
            assert res["ok"], f"{name}: {res}"
            for path in res["files"].values():
                assert os.path.exists(path) and os.path.getsize(path) > 1000, path
            with Image.open(res["files"]["png"]) as im:
                assert im.size == (W, H)
            with Image.open(res["files"]["mobile_png"]) as im:
                assert im.size == (MOBILE_W, MOBILE_H)

    assert format_number({"value": 15, "unit": "%"}) == "15 %"
    assert format_number({"value": 4.5, "unit": "kunder"}) == "4,5 kunder"
    assert format_number({"value": 100}) == "100"
    print("selftest OK")


def main() -> None:
    if "--selftest" in sys.argv:
        _selftest()
        return

    if len(sys.argv) < 3:
        print("brug: kinly_graf.py <spec.json|-> <out-prefix>", file=sys.stderr)
        sys.exit(2)

    spec_arg, out_prefix = sys.argv[1], sys.argv[2]
    raw = sys.stdin.read() if spec_arg == "-" else open(spec_arg, encoding="utf-8").read()
    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as e:
        print(json.dumps({"ok": False, "errors": [f"ugyldig JSON: {e}"]}, ensure_ascii=False))
        sys.exit(1)

    result = generate(spec, out_prefix)
    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result["ok"] else 1)


if __name__ == "__main__":
    main()
