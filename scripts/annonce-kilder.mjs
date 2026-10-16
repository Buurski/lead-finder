// Tager de rigtige skærmbilleder, som annonce-stills bygger på (live kundesider, ingen AI).
// iPhone 16 Pro: 402 x 874 pt. Statuslinjen (54 pt) tegnes af skabelonen, så siden fotograferes i 402 x 820 @3x.
//   node scripts/annonce-kilder.mjs            -> public/annoncer/kilde/*.png + kilder.json (topfarve, dato)
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";
import { ROOT } from "./annonce-skabeloner.mjs";

const KILDE = path.join(ROOT, "public", "annoncer", "kilde");
const UA = devices["iPhone 15 Pro"].userAgent;

// scroll: px fra toppen (CSS-px), eller en CSS-vælger der rulles til toppen
const SKUD = [
  { fil: "ikast-16pro-top.png", url: "https://ikastautoservice.dk/", scroll: 0 },
  { fil: "ikast-16pro-ydelser.png", url: "https://ikastautoservice.dk/", scroll: 820 },
  { fil: "vida-16pro-top.png", url: "https://vida-klinik.dk/", scroll: 0 },
  { fil: "vida-16pro-2.png", url: "https://vida-klinik.dk/", scroll: 760 },
  { fil: "ikast-gammel-16pro.png", url: "https://autoservice.nu/", scroll: 0 },
  { fil: "ikast-side-daek.png", url: "https://ikastautoservice.dk/service/daek/", scroll: 0 },
  { fil: "ikast-side-tesla.png", url: "https://ikastautoservice.dk/service/tesla-vaerksted/", scroll: 0 },
  { fil: "ikast-side-laanebil.png", url: "https://ikastautoservice.dk/laanebil/", scroll: 0 },
  { fil: "vida-side-behandlinger.png", url: "https://vida-klinik.dk/behandlinger.html", scroll: 0 },
  { fil: "vida-side-microneedling.png", url: "https://vida-klinik.dk/microneedling.html", scroll: 0 },
  { fil: "vida-side-lashlift.png", url: "https://vida-klinik.dk/lash-lift.html", scroll: 0 },
  // lange skud til telefoner, der er beskåret af annoncens bund: siden fortsætter under kanten, ingen Safari-bjælke
  { fil: "ikast-lang-daek.png", url: "https://ikastautoservice.dk/service/daek/", scroll: 0, hoej: 1300 },
  { fil: "ikast-lang-tesla.png", url: "https://ikastautoservice.dk/service/tesla-vaerksted/", scroll: 0, hoej: 1300 },
  { fil: "vida-lang-lashlift.png", url: "https://vida-klinik.dk/lash-lift.html", scroll: 0, hoej: 1300 },
  { fil: "vida-lang-microneedling.png", url: "https://vida-klinik.dk/microneedling.html", scroll: 0, hoej: 1300 },
  // kinly.dk egne undersider: varianter uden kundesider, som kan bruges uden kunde-OK
  { fil: "kinly-side-automekaniker.png", url: "https://kinly.dk/automekaniker-herning/", scroll: 0 },
  { fil: "kinly-side-herning.png", url: "https://kinly.dk/webbureau-herning/", scroll: 0 },
  { fil: "kinly-side-oejenvipper.png", url: "https://kinly.dk/oejenvipper-herning/", scroll: 0 },
  { fil: "kinly-lang-automekaniker.png", url: "https://kinly.dk/automekaniker-herning/", scroll: 0, hoej: 1300 },
  { fil: "kinly-lang-herning.png", url: "https://kinly.dk/webbureau-herning/", scroll: 0, hoej: 1300 },
  { fil: "kinly-side-hjem.png", url: "https://kinly.dk/", scroll: 0 },
  { fil: "kinly-lang-hjem.png", url: "https://kinly.dk/", scroll: 0, hoej: 1300 },
  { fil: "kinly-side-priser.png", url: "https://kinly.dk/", scroll: 2100 },
  { fil: "kinly-desktop-hjem-2x.png", url: "https://kinly.dk/", scroll: 0, desktop: true },
  { fil: "kinly-desktop-2x.png", url: "https://kinly.dk/webbureau-herning/", scroll: 0, desktop: true },
  { fil: "ikast-desktop-2x.png", url: "https://ikastautoservice.dk/", scroll: 0, desktop: true },
  { fil: "vida-desktop-2x.png", url: "https://vida-klinik.dk/", scroll: 0, desktop: true },
];

/** Sidens farve i en given højde (statuslinje øverst, Safari-pillen nederst), fra nærmeste element med baggrund. */
const farve = (y) => {
  let el = document.elementFromPoint(200, y);
  while (el) {
    const c = getComputedStyle(el).backgroundColor;
    if (c && c !== "rgba(0, 0, 0, 0)" && c !== "transparent") return c;
    el = el.parentElement;
  }
  return "rgb(255, 255, 255)";
};

const meta = fs.existsSync(path.join(KILDE, "kilder.json")) ? JSON.parse(fs.readFileSync(path.join(KILDE, "kilder.json"), "utf8")) : {};
const kun = process.argv.slice(2);
const browser = await chromium.launch();
for (const s of SKUD.filter((s) => !kun.length || kun.includes(s.fil))) {
  const ctx = await browser.newContext(
    s.desktop
      ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
      : { viewport: { width: 402, height: s.hoej || 820 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, userAgent: UA },
  );
  const page = await ctx.newPage();
  await page.goto(s.url, { waitUntil: "networkidle", timeout: 60000 });
  await page.evaluate(() => document.fonts.ready);
  // cookie-banner: vælg altid nej (mest privatlivsvenlige valg), så det ikke kommer med på billedet
  const nej = page.locator("button, a, [role=button]").filter({ hasText: /^\s*(nej tak|afvis)\s*$/i });
  await nej.first().click({ timeout: 5000 }).catch(() => console.log("  (ingen cookie-banner)", s.fil));
  if (s.scroll) {
    // lazy-billeder og scroll-animationer: rul ned til stedet i små skridt, som en rigtig bruger
    await page.evaluate(async (to) => {
      for (let y = 0; y <= to; y += 200) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 120)); }
      window.scrollTo(0, to);
    }, s.scroll);
  }
  await page.waitForTimeout(2000);
  const top = await page.evaluate(farve, 2);
  const bund = await page.evaluate(farve, s.desktop ? 890 : (s.hoej || 820) - 10);
  await page.screenshot({ path: path.join(KILDE, s.fil) });
  meta[s.fil] = { url: s.url, scroll: s.scroll, hoej: s.hoej, top, bund, taget: new Date().toISOString().slice(0, 10) };
  console.log("ok", s.fil, top, bund);
  await ctx.close();
}
await browser.close();
fs.writeFileSync(path.join(KILDE, "kilder.json"), JSON.stringify(meta, null, 2) + "\n");
