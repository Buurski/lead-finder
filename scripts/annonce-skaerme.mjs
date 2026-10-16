// Rigtige enhedsskærme til GPT-annoncerne: et live skærmbillede + iOS-statuslinje (9:41) + iOS 26 Safari-pille
// med domænet, eller et macOS Safari-vindue til laptoppen. Resultatet lægges ind i GPT-billedets magenta/grønne
// skærm af scripts/annonce-indsaet.py, så kundesiderne altid er ægte pixels.
//   node scripts/annonce-skaerme.mjs   -> public/annoncer/kilde/skaerm-*.png
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ROOT } from "./annonce-skabeloner.mjs";

const KILDE = path.join(ROOT, "public", "annoncer", "kilde");
const META = JSON.parse(fs.readFileSync(path.join(KILDE, "kilder.json"), "utf8"));
const uri = (f) => `data:image/png;base64,${fs.readFileSync(path.join(KILDE, f)).toString("base64")}`;
const lys = (c) => {
  const [r, g, b] = (c.match(/[\d.]+/g) || ["255", "255", "255"]).map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};
const domæne = (u) => new URL(u).hostname.replace(/^www\./, "");

export const SKÆRME = [
  { ud: "skaerm-ikast-top.png", fil: "ikast-16pro-top.png", type: "telefon" },
  { ud: "skaerm-ikast-ydelser.png", fil: "ikast-16pro-ydelser.png", type: "telefon" },
  { ud: "skaerm-vida-top.png", fil: "vida-16pro-top.png", type: "telefon" },
  { ud: "skaerm-vida-2.png", fil: "vida-16pro-2.png", type: "telefon" },
  { ud: "skaerm-ikast-gammel.png", fil: "ikast-gammel-16pro.png", type: "telefon" },
  { ud: "skaerm-ikast-side-daek.png", fil: "ikast-side-daek.png", type: "telefon" },
  { ud: "skaerm-ikast-side-tesla.png", fil: "ikast-side-tesla.png", type: "telefon" },
  { ud: "skaerm-ikast-side-laanebil.png", fil: "ikast-side-laanebil.png", type: "telefon" },
  { ud: "skaerm-vida-side-behandlinger.png", fil: "vida-side-behandlinger.png", type: "telefon" },
  { ud: "skaerm-vida-side-microneedling.png", fil: "vida-side-microneedling.png", type: "telefon" },
  { ud: "skaerm-vida-side-lashlift.png", fil: "vida-side-lashlift.png", type: "telefon" },
  { ud: "skaerm-ikast-lang-daek.png", fil: "ikast-lang-daek.png", type: "telefon", lang: true },
  { ud: "skaerm-ikast-lang-tesla.png", fil: "ikast-lang-tesla.png", type: "telefon", lang: true },
  { ud: "skaerm-vida-lang-lashlift.png", fil: "vida-lang-lashlift.png", type: "telefon", lang: true },
  { ud: "skaerm-vida-lang-microneedling.png", fil: "vida-lang-microneedling.png", type: "telefon", lang: true },
  { ud: "skaerm-kinly-side-automekaniker.png", fil: "kinly-side-automekaniker.png", type: "telefon" },
  { ud: "skaerm-kinly-side-herning.png", fil: "kinly-side-herning.png", type: "telefon" },
  { ud: "skaerm-kinly-side-oejenvipper.png", fil: "kinly-side-oejenvipper.png", type: "telefon" },
  { ud: "skaerm-kinly-lang-automekaniker.png", fil: "kinly-lang-automekaniker.png", type: "telefon", lang: true },
  { ud: "skaerm-kinly-lang-herning.png", fil: "kinly-lang-herning.png", type: "telefon", lang: true },
  { ud: "skaerm-kinly-side-hjem.png", fil: "kinly-side-hjem.png", type: "telefon" },
  { ud: "skaerm-kinly-lang-hjem.png", fil: "kinly-lang-hjem.png", type: "telefon", lang: true },
  { ud: "skaerm-kinly-side-priser.png", fil: "kinly-side-priser.png", type: "telefon" },
  { ud: "skaerm-kinly-laptop-hjem.png", fil: "kinly-desktop-hjem-2x.png", type: "laptop" },
  { ud: "skaerm-kinly-laptop.png", fil: "kinly-desktop-2x.png", type: "laptop" },
  { ud: "skaerm-ikast-laptop.png", fil: "ikast-desktop-2x.png", type: "laptop" },
  { ud: "skaerm-vida-laptop.png", fil: "vida-desktop-2x.png", type: "laptop" },
];

// iPhone 17 Pro: 402 x 874 pt. Statuslinje 62 pt (Dynamic Island-modeller), Safari-pille flyder over siden.
// lang: telefonen er beskåret af annoncens bund, så skærmen er højere og uden Safari-pille (den ville ligge under kanten).
const høj = (s) => (s.lang ? 62 + META[s.fil].hoej : 874);
function telefon(s) {
  const m = META[s.fil];
  const mørkTop = !lys(m.top);
  const mørkBund = !lys(m.bund);
  const fg = mørkTop ? "#fff" : "#000";
  const glas = mørkBund
    ? "background:rgba(44,44,48,.62);color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.28),inset 0 0 0 .5px rgba(255,255,255,.22)"
    : "background:rgba(255,255,255,.68);color:#111;box-shadow:0 6px 20px rgba(0,0,0,.16),inset 0 0 0 .5px rgba(255,255,255,.8)";
  const ikon = mørkBund ? "#fff" : "#111";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:402px;height:${høj(s)}px;overflow:hidden;background:${m.top};font-family:"Segoe UI",system-ui,sans-serif}
.status{position:absolute;left:0;top:0;width:402px;height:62px;background:${m.top};color:${fg}}
.tid{position:absolute;left:0;width:150px;top:20px;text-align:center;font-weight:600;font-size:17px;letter-spacing:-.2px}
.ikoner{position:absolute;right:30px;top:24px;display:flex;gap:6px;align-items:center}
.side{position:absolute;left:0;top:62px;width:402px}
.bar{position:absolute;left:12px;right:12px;bottom:28px;height:48px;display:flex;gap:8px}
.rund,.felt{border-radius:24px;backdrop-filter:blur(14px) saturate(1.8);-webkit-backdrop-filter:blur(14px) saturate(1.8);${glas};display:flex;align-items:center;justify-content:center}
.rund{width:48px;flex:none}
.felt{flex:1;font-size:16px;font-weight:600;letter-spacing:-.1px}
.hjem{position:absolute;left:134px;bottom:8px;width:134px;height:5px;border-radius:3px;background:${mørkBund ? "#fff" : "#000"};opacity:.9}
</style></head><body>
<div class="status"><div class="tid">9:41</div>
<div class="ikoner">
<svg width="18" height="12" viewBox="0 0 18 12"><g fill="${fg}"><rect x="0" y="8" width="3" height="4" rx=".8"/><rect x="5" y="5.5" width="3" height="6.5" rx=".8"/><rect x="10" y="3" width="3" height="9" rx=".8"/><rect x="15" y="0" width="3" height="12" rx=".8"/></g></svg>
<svg width="16" height="12" viewBox="0 0 16 12"><g fill="${fg}"><path d="M8 11.6l2.3-2.4a3.3 3.3 0 0 0-4.6 0z"/><path d="M3.4 6.9l1.5 1.5a4.4 4.4 0 0 1 6.2 0l1.5-1.5a6.5 6.5 0 0 0-9.2 0z"/><path d="M.9 4.4l1.5 1.5a8 8 0 0 1 11.2 0l1.5-1.5a10.1 10.1 0 0 0-14.2 0z"/></g></svg>
<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="${fg}" stroke-opacity=".4"/><rect x="2" y="2" width="20" height="9" rx="2.4" fill="${fg}"/><path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1z" fill="${fg}" fill-opacity=".45"/></svg>
</div></div>
<img class="side" src="${uri(s.fil)}" alt="">
${s.lang ? "" : `<div class="bar">
<div class="rund"><svg width="12" height="20" viewBox="0 0 12 20"><path d="M10 2L2 10l8 8" stroke="${ikon}" stroke-width="2.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>
<div class="felt">${domæne(m.url)}</div>
<div class="rund"><svg width="22" height="6" viewBox="0 0 22 6"><g fill="${ikon}"><circle cx="3" cy="3" r="2.4"/><circle cx="11" cy="3" r="2.4"/><circle cx="19" cy="3" r="2.4"/></g></svg></div>
</div>
<div class="hjem"></div>`}
</body></html>`;
}

// MacBook-skærm 1512 x 982 pt: macOS Safari i fuld skærm (lys værktøjslinje med domæne) over sidens skærmbillede.
function laptop(s) {
  const m = META[s.fil];
  return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:1512px;height:982px;overflow:hidden;background:#fff;font-family:"Segoe UI",system-ui,sans-serif}
.top{height:52px;background:#f6f5f4;border-bottom:1px solid #dcdad7;display:flex;align-items:center;padding:0 18px;gap:8px;position:relative}
.top i{width:12px;height:12px;border-radius:50%;display:block}
.url{position:absolute;left:50%;top:10px;transform:translateX(-50%);width:520px;height:32px;border-radius:9px;background:#e9e8e6;display:flex;align-items:center;justify-content:center;font-size:14px;color:#333;font-weight:500}
img{display:block;width:1512px}
</style></head><body>
<div class="top"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i><div class="url">${domæne(m.url)}</div></div>
<img src="${uri(s.fil)}" alt="">
</body></html>`;
}

const browser = await chromium.launch();
for (const s of SKÆRME) {
  const tlf = s.type === "telefon";
  const page = await browser.newPage({ viewport: tlf ? { width: 402, height: høj(s) } : { width: 1512, height: 982 }, deviceScaleFactor: tlf ? 3 : 2 });
  await page.setContent(tlf ? telefon(s) : laptop(s), { waitUntil: "load" });
  await page.screenshot({ path: path.join(KILDE, s.ud) });
  await page.close();
  console.log("ok", s.ud);
}
// Kinly-logoet som PNG med gennemsigtig baggrund, så indsaet.py kan lægge det ægte logo på (GPT tegner det aldrig selv)
for (const [ud, svg] of [["logo-moerk.png", "kinly-wordmark.svg"], ["logo-lys.png", "kinly-wordmark-lys.svg"]]) {
  const page = await browser.newPage({ viewport: { width: 600, height: 300 }, deviceScaleFactor: 1 });
  const src = `data:image/svg+xml;base64,${fs.readFileSync(path.join(KILDE, svg)).toString("base64")}`;
  await page.setContent(`<html><body style="margin:0;background:transparent"><img id="l" src="${src}" style="display:block;width:600px"></body></html>`);
  await page.locator("#l").screenshot({ path: path.join(KILDE, ud), omitBackground: true });
  await page.close();
  console.log("ok", ud);
}
// På ember-baggrund forsvinder de orange kvadrater, og de må aldrig skifte farve (kinly-site/docs/brand-logo.md).
// Så logoet står på en blæk-plade som annoncens CTA, med luft = i-prikkens højde hele vejen rundt.
{
  const page = await browser.newPage({ viewport: { width: 800, height: 400 }, deviceScaleFactor: 1 });
  const src = `data:image/svg+xml;base64,${fs.readFileSync(path.join(KILDE, "kinly-wordmark-lys.svg")).toString("base64")}`;
  await page.setContent(`<html><body style="margin:0;background:transparent"><div id="l" style="display:inline-block;background:#191713;border-radius:28px;padding:22px 34px 10px"><img src="${src}" style="display:block;width:480px"></div></body></html>`);
  await page.locator("#l").screenshot({ path: path.join(KILDE, "logo-paa-ember.png"), omitBackground: true });
  await page.close();
  console.log("ok", "logo-paa-ember.png");
}
await browser.close();
