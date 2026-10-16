// HTML/CSS-skabeloner til annonce-stills (Facebook/Instagram). Hver skabelon er en funktion
// (still, fmt) => HTML-streng, som scripts/annonce-stills.mjs renderer til PNG med Playwright.
// Ingen AI-billeder: kun rigtige skærmbilleder, rigtige fotos og tekst. Brand fra kinly-site
// (papir #faf6ef, blæk #191713, ember #d4500f, Archivo + Spline Sans Mono). Layoutet er med vilje
// venstrestillet, lidt tæt og uden gradienter, 3D, glans eller symmetri.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, "..");
const KILDE = path.join(ROOT, "public", "annoncer", "kilde");
const FONTER = path.join(ROOT, "public", "annoncer", "fonter");

const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const cache = new Map();
/** Fil til data-URI, så siden kan renderes uden filsystem-adgang fra browseren. */
function uri(file) {
  if (!cache.has(file)) {
    const b = fs.readFileSync(file);
    cache.set(file, `data:${MIME[path.extname(file)]};base64,${b.toString("base64")}`);
  }
  return cache.get(file);
}
const kilde = (n) => uri(path.join(KILDE, n));
const font = (n) => uri(path.join(FONTER, n));
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const FORMATS = [
  { key: "1080x1080", w: 1080, h: 1080, cls: "sq" },
  { key: "1080x1350", w: 1080, h: 1350, cls: "pt" },
];

const css = (fmt) => `
@font-face{font-family:Archivo;font-weight:400;src:url(${font("archivo-400.woff2")}) format("woff2")}
@font-face{font-family:Archivo;font-weight:700;src:url(${font("archivo-700.woff2")}) format("woff2")}
@font-face{font-family:Archivo;font-weight:800;src:url(${font("archivo-800.woff2")}) format("woff2")}
@font-face{font-family:Mono;font-weight:500;src:url(${font("spline-500.woff2")}) format("woff2")}
:root{--paper:#faf6ef;--surface:#f3ede2;--ink:#191713;--mid:#55504a;--ember:#d4500f;--ember-deep:#a63b05;--sand:#c8a97e;--hard:#e4d9c4}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${fmt.w}px;height:${fmt.h}px;overflow:hidden}
body{position:relative;font-family:Archivo,sans-serif;color:var(--ink);background:var(--paper);-webkit-font-smoothing:antialiased}
.mono{font-family:Mono,monospace;font-weight:500;text-transform:uppercase;letter-spacing:.09em;font-size:21px;line-height:1.3}
.abs{position:absolute}
h1{font-weight:800;letter-spacing:-.03em;line-height:.97;text-wrap:balance}
.logo{display:block;height:50px;width:auto}
.dash{display:inline-block;width:38px;height:4px;background:var(--ember);vertical-align:middle;margin-right:14px}
.phone{position:absolute;background:var(--ink);border-radius:60px;padding:14px;box-shadow:16px 16px 0 var(--hard)}
.phone .screen{width:100%;height:100%;border-radius:46px;overflow:hidden;background:#fff}
.phone .screen img{display:block;width:100%;height:100%;object-fit:cover}
.small{font-size:23px;line-height:1.35;color:var(--mid)}
.cap{font-size:16px;color:var(--mid);letter-spacing:.06em;line-height:1.35}
`;

const page = (fmt, body, extraCss = "") => `<!doctype html><html lang="da"><head><meta charset="utf-8"><style>${css(fmt)}${extraCss}</style></head><body class="${fmt.cls}">${body}</body></html>`;
const logo = (light = false) => `<img class="logo" alt="Kinly" src="${kilde(light ? "kinly-wordmark-lys.svg" : "kinly-wordmark.svg")}">`;

/** Telefonramme (14 px kant). Skærmens bredde og højde er givet, billedet beskæres fra toppen. */
function phone({ img, x, y, w, h, pos = "top" }) {
  return `<div class="phone" style="left:${x}px;top:${y}px;width:${w + 28}px;height:${h + 28}px"><div class="screen"><img src="${img}" style="object-position:50% ${pos}" alt=""></div></div>`;
}

// ------------------------------------------------------------------ a) rigtigt mobil-skærmbillede i telefonramme
export function mobil(s, fmt) {
  const sq = fmt.cls === "sq";
  const w = sq ? 372 : 420;
  const h = sq ? 760 : 850;
  const x = 1080 - 72 - (w + 28);
  const y = sq ? 112 : 400;
  return page(fmt, `
    <div class="abs mono" style="left:72px;top:64px;color:var(--mid)">${esc(s.mærke)}</div>
    <h1 class="abs" style="left:72px;top:150px;width:${sq ? 500 : 936}px;font-size:${sq ? 84 : 100}px">${esc(s.overskrift)}</h1>
    <div class="abs" style="left:72px;top:${sq ? 560 : 430}px;width:${sq ? 460 : 440}px">
      <p class="mono" style="color:var(--ink);display:flex"><span class="dash" style="flex:none;margin:.6em 14px 0 0"></span><span>${esc(s.sted)}</span></p>
      <p class="small" style="margin-top:22px">${esc(s.underlinje)}</p>
    </div>
    ${phone({ img: kilde(s.billede.fil), x, y, w, h, pos: s.billede.pos })}
    <p class="abs mono cap" style="left:72px;bottom:130px;width:${sq ? 420 : 400}px">${esc(s.billede.billedtekst)}</p>
    <div class="abs" style="left:72px;bottom:64px">${logo()}</div>
  `);
}

// ------------------------------------------------------------------ b) før/efter, to skærme med mærkat
export function foerEfter(s, fmt) {
  const sq = fmt.cls === "sq";
  const w = sq ? 250 : 330;
  const h = sq ? 440 : 600;
  const x1 = 72;
  const x2 = x1 + w + 28 + 44;
  const y1 = sq ? 430 : 530;
  const label = (t, x, y, color) => `<div class="abs mono" style="left:${x}px;top:${y}px;font-size:30px;color:${color}">${t}</div>`;
  const side = sq
    ? `<p class="abs small" style="left:${x2 + w + 28 + 52}px;top:${y1 + 46}px;width:${1080 - 72 - (x2 + w + 28 + 52)}px;font-size:25px;color:var(--ink)">${esc(s.sidetekst)}</p>`
    : `<p class="abs small" style="left:72px;top:380px;width:900px;font-size:32px;color:var(--ink)">${esc(s.sidetekst)}</p>`;
  return page(fmt, `
    <div class="abs mono" style="left:72px;top:64px;color:var(--mid)">${esc(s.mærke)}</div>
    <h1 class="abs" style="left:72px;top:140px;width:936px;font-size:${sq ? 78 : 104}px">${esc(s.overskrift)}</h1>
    ${side}
    ${label("Før", x1, y1 - 48, "var(--mid)")}
    ${phone({ img: kilde(s.foer.fil), x: x1, y: y1, w, h })}
    ${label("Efter", x2, y1 - 2, "var(--ember-deep)")}
    ${phone({ img: kilde(s.efter.fil), x: x2, y: y1 + 46, w, h })}
    <p class="abs mono cap" style="left:72px;bottom:64px;width:${sq ? 520 : 600}px">${esc(s.billedtekst)}</p>
    <div class="abs" style="right:72px;bottom:60px">${logo()}</div>
  `);
}

// ------------------------------------------------------------------ c) pris-anker på ren farve + strimmel af rigtige skærmbilleder
export function pris(s, fmt) {
  const sq = fmt.cls === "sq";
  const stripY = sq ? 700 : 850;
  const w = sq ? 270 : 290;
  return page(fmt, `
    <div class="abs mono" style="left:72px;top:64px;font-size:26px;color:var(--paper)">${esc(s.mærke)}</div>
    <div class="abs" style="right:72px;top:56px">${logo(true)}</div>
    <div class="abs" style="left:62px;top:${sq ? 116 : 150}px;font-weight:800;letter-spacing:-.05em;line-height:.9;font-size:${sq ? 270 : 320}px;color:var(--paper)">${esc(s.pris)}</div>
    <p class="abs" style="left:72px;top:${sq ? 372 : 462}px;font-weight:800;font-size:${sq ? 70 : 84}px;letter-spacing:-.02em;color:var(--paper)">${esc(s.enhed)}</p>
    <p class="abs" style="left:72px;top:${sq ? 474 : 590}px;width:${sq ? 700 : 820}px;font-weight:700;font-size:${sq ? 40 : 48}px;line-height:1.12;letter-spacing:-.01em;color:var(--paper)">${esc(s.udsagn)}</p>
    ${s.strimmel.map((t, i) => `<div class="abs" style="left:${72 + i * (w + 22)}px;top:${stripY + (i === 1 ? 34 : 0)}px;width:${w}px;height:${fmt.h - stripY}px;border:3px solid var(--ink);border-bottom:0;background:#fff;overflow:hidden;border-radius:26px 26px 0 0"><img src="${kilde(t.fil)}" style="display:block;width:100%;height:${Math.round(w * 2.164)}px;object-fit:cover;object-position:top" alt=""></div>`).join("")}
  `, `body{background:var(--ember)}`);
}

// ------------------------------------------------------------------ d) Notes-app/liste med ærlige fakta
const KRYDS = (c) => `<svg width="34" height="34" viewBox="0 0 24 24" style="flex:none;position:relative;top:4px"><path d="M5 5l14 14M19 5L5 19" stroke="${c}" stroke-width="3.4" fill="none"/></svg>`;
const HAK = (c) => `<svg width="34" height="34" viewBox="0 0 24 24" style="flex:none;position:relative;top:4px"><path d="M4 12.5l5 5L20 6.5" stroke="${c}" stroke-width="3.4" fill="none"/></svg>`;
export function noter(s, fmt) {
  const sq = fmt.cls === "sq";
  const f = sq ? 40 : 44;
  const row = (icon, t) => `<li style="display:flex;gap:22px;align-items:baseline;padding:${sq ? 10 : 15}px 0;border-bottom:1.5px solid rgba(25,23,19,.1);font-size:${f}px;font-weight:700;letter-spacing:-.01em;line-height:1.1">${icon}<span>${esc(t)}</span></li>`;
  return page(fmt, `
    <div class="abs" style="left:56px;top:${sq ? 56 : 80}px;width:968px;height:${fmt.h - (sq ? 112 : 160)}px;background:#fffdf8;border:2px solid var(--ink);border-radius:30px;padding:${sq ? 34 : 54}px ${sq ? 52 : 60}px;box-shadow:14px 14px 0 var(--hard);display:flex;flex-direction:column">
      <div style="display:flex;justify-content:space-between;align-items:baseline;color:var(--ember-deep);font-size:26px;font-weight:700"><span>‹ Noter</span><span class="mono" style="font-size:19px;color:var(--mid)">${esc(s.dato)}</span></div>
      <h1 style="font-size:${sq ? 78 : 92}px;margin-top:${sq ? 22 : 40}px">${esc(s.overskrift)}</h1>
      <ul style="list-style:none;margin-top:${sq ? 14 : 26}px">${s.nej.map((t) => row(KRYDS("#d4500f"), t)).join("")}</ul>
      <h2 style="font-size:${sq ? 48 : 58}px;font-weight:800;letter-spacing:-.02em;margin-top:${sq ? 24 : 44}px">${esc(s.ja_overskrift)}</h2>
      <ul style="list-style:none;margin-top:${sq ? 4 : 14}px">${s.ja.map((t) => row(HAK("#191713"), t)).join("")}</ul>
      <div style="margin-top:auto;display:flex;justify-content:space-between;align-items:flex-end;gap:24px"><p class="small" style="font-size:21px;max-width:600px">${esc(s.fodnote)}</p>${logo()}</div>
    </div>
  `);
}

// ------------------------------------------------------------------ e) desktop-skærmbillede i browser-ramme med by-navn
export function desktop(s, fmt) {
  const sq = fmt.cls === "sq";
  const frameW = 936;
  const barH = 58;
  const innerH = 511; // skærmbilledet beskæres lige under knapperne
  const frameY = sq ? 318 : 470;
  const frameBottom = frameY + barH + innerH + 4;
  return page(fmt, `
    <div class="abs mono" style="left:72px;top:64px;color:var(--mid)">${esc(s.mærke)}</div>
    <div class="abs mono" style="right:72px;top:56px;background:var(--ink);color:var(--paper);padding:9px 16px;border-radius:999px">${esc(s.by)}</div>
    <h1 class="abs" style="left:72px;top:130px;width:936px;font-size:${sq ? 76 : 102}px">${esc(s.overskrift)}</h1>
    <div class="abs" style="left:72px;top:${frameY}px;width:${frameW}px;border:2px solid var(--ink);border-radius:18px;background:#fff;overflow:hidden;box-shadow:14px 14px 0 var(--hard)">
      <div style="height:${barH}px;border-bottom:2px solid var(--ink);display:flex;align-items:center;gap:10px;padding:0 20px;background:var(--surface)">
        <i style="width:15px;height:15px;border-radius:50%;border:2px solid var(--ink)"></i><i style="width:15px;height:15px;border-radius:50%;border:2px solid var(--ink)"></i><i style="width:15px;height:15px;border-radius:50%;border:2px solid var(--ink)"></i>
        <span class="mono" style="margin-left:16px;flex:1;background:#fff;border:1.5px solid rgba(25,23,19,.25);border-radius:999px;padding:6px 18px;font-size:17px;letter-spacing:.04em;text-transform:none">${esc(s.adresse)}</span>
      </div>
      <img src="${kilde(s.billede.fil)}" style="display:block;width:100%;height:${innerH}px;object-fit:cover;object-position:top" alt="">
    </div>
    <p class="abs mono cap" style="left:72px;top:${frameBottom + 28}px;width:760px">${esc(s.billedtekst)}</p>
    ${sq ? "" : `<ul class="abs" style="left:72px;top:${frameBottom + 90}px;list-style:none;font-size:42px;font-weight:700;letter-spacing:-.01em;line-height:1.3">${s.punkter.map((t) => `<li><span class="dash"></span>${esc(t)}</li>`).join("")}</ul>`}
    <div class="abs" style="${sq ? "left:72px" : "right:72px"};bottom:60px">${logo()}</div>
  `);
}

// ------------------------------------------------------------------ f) team-kort med rigtigt foto
export function team(s, fmt) {
  const sq = fmt.cls === "sq";
  const photo = sq
    ? `<div class="abs" style="left:0;top:0;width:470px;height:1080px;overflow:hidden;background:var(--sand)"><img src="${kilde(s.foto.fil)}" style="display:block;width:100%;height:100%;object-fit:cover;object-position:50% 10%" alt="${esc(s.foto.alt)}"></div>`
    : `<div class="abs" style="left:0;top:0;width:1080px;height:760px;overflow:hidden;background:var(--sand)"><img src="${kilde(s.foto.fil)}" style="display:block;width:100%;height:100%;object-fit:cover;object-position:50% 15%" alt="${esc(s.foto.alt)}"></div>`;
  const tx = sq ? 520 : 72;
  return page(fmt, `
    ${photo}
    <div class="abs mono" style="left:${tx}px;top:${sq ? 64 : 790}px;color:var(--mid)">${esc(s.mærke)}</div>
    <h1 class="abs" style="left:${tx}px;top:${sq ? 120 : 830}px;width:${sq ? 488 : 936}px;font-size:${sq ? 76 : 84}px">${esc(s.overskrift)}</h1>
    <p class="abs" style="left:${tx}px;top:${sq ? 400 : 1010}px;width:${sq ? 470 : 900}px;font-size:${sq ? 34 : 36}px;font-weight:700;line-height:1.18;letter-spacing:-.01em">${esc(s.udsagn)}</p>
    <ul class="abs mono" style="left:${tx}px;top:${sq ? 600 : 1135}px;list-style:none;font-size:19px;line-height:1.9;color:var(--ink)">${s.punkter.map((t) => `<li><span class="dash" style="width:26px;margin-right:12px"></span>${esc(t)}</li>`).join("")}</ul>
    <div class="abs" style="right:72px;bottom:60px">${logo()}</div>
  `);
}

export const SKABELONER = { mobil, foerEfter, pris, noter, desktop, team };
