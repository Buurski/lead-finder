// Annonce-stills til Facebook/Instagram. GPT Image-annoncer med RIGTIGE skærmbilleder (se STILLS), eller HTML/CSS -> PNG
// via SKABELONER. Intet kald til Meta. Kører lokalt:  node scripts/annonce-stills.mjs
//   -> public/annoncer/<slug>-<format>.png  (1080x1080 og 1080x1350)
//   -> src/data/annoncer.json               (tekst, kilder, advarsler, test-celle pr. still)
// Kilde-skærmbilleder ligger i public/annoncer/kilde (taget live 16/10-2026). Tekst må kun bruge fakta med kilde (fil:linje).
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { FORMATS, ROOT, SKABELONER } from "./annonce-skabeloner.mjs";

const OUT = path.join(ROOT, "public", "annoncer");
const DATA = path.join(ROOT, "src", "data", "annoncer.json");
const DATO = "16. oktober 2026";

// ---------------------------------------------------------------- fakta (fil:linje i vaulten, læst 16/10-2026)
const V = "KnowledgeOS/";
const FAKTA = {
  pris: { fil: `${V}context/priser.md:21`, fakta: "Forside 3.997 kr engangsbeløb, designet og kodet fra bunden, gratis demo før betaling" },
  moms: { fil: `${V}context/priser.md:46`, fakta: "Alle priser er vejledende og ekskl. moms" },
  ejer: { fil: `${V}context/priser.md:25`, fakta: "Alle pakker er kodet til kunden (ingen skabelon), og kunden ejer koden 100 %" },
  binding: { fil: `${V}context/priser.md:47`, fakta: "Ingen binding, kan opsiges når som helst, koden ejes 100 %" },
  skrift: { fil: `${V}context/priser.md:48`, fakta: "Endelig pris bekræftes på skrift, før kunden siger ja" },
  regning: { fil: `${V}context/priser.md:49`, fakta: "Regningen kommer først, når siden er godkendt og klar" },
  wp: { fil: `${V}AGENTS.md:29`, fakta: "Kodede hjemmesider, ikke WordPress, kunden ejer 100 %" },
  lucas: { fil: `${V}AGENTS.md:25`, fakta: "Lucas Buur, 20, Herning, solo web-freelancer" },
  bareMig: { fil: `${V}context/brand-og-tone.md:18`, fakta: "Kernebudskab: bare mig, til en fair pris, ikke et bureau med kontor og ansatte" },
  undersider: { fil: `${V}context/priser.md:22`, fakta: "Forside + undersider 4.997 kr: op til 3 undersider + SEO indbygget på alle sider" },
  google: { fil: `${V}context/priser.md:21`, fakta: "Klar til Google og Maps fra dag ét" },
  ikast: { fil: `${V}wiki/kunder/ikast-autoservice.md:13`, fakta: "Aktiv kunde, live på ikastautoservice.dk, kodet side, synlig reference" },
  ikastFoer: { fil: `${V}wiki/kunder/ikast-autoservice.md:72`, fakta: "autoservice.nu er det gamle site og navn, stadig online" },
  vida: { fil: `${V}wiki/kunder/vida-klinik.md:57`, fakta: "VIDA-siden er bygget, deployet og forsiden godkendt af Lene" },
  vidaKosmetik: { fil: `${V}wiki/kunder/vida-klinik.md:111`, fakta: "Markedsføringsregler for kosmetiske behandlinger er ikke tjekket" },
};

const KUNDE_IKAST = "Kunde-ja mangler: Ikast AutoService (Allan) skal sige ja til skærmbillede, navn og medarbejderfoto i en annonce.";
const LIVE_IKAST = `Skærmbilledet er taget live ${DATO}. Tjek at forsiden ikke er ændret, før annoncen går live.`;

// ---------------------------------------------------------------- stills: GPT Image-annoncer (runde 2, 16/10-2026)
// Lucas 16/10: de HTML-byggede stills var for amatøragtige. Nu laver GPT Image (Codex) hele annoncen med nøglefarvede
// skærme, og scripts/annonce-indsaet.py lægger RIGTIGE skærmbilleder ind (live undersider).
// Hvert koncept findes med kinly.dk-skærme (kan bruges nu) og evt. med en kundes side (KRÆVER KUNDE-OK).
const AI = "Baggrund, hånd og enheder er lavet med GPT Image; skærmene er ægte skærmbilleder. Meta kan vise 'AI-info' på annoncen.";
const KINLY_SKÆRM = `Skærmene viser kinly.dk (Kinlys egne undersider), taget live ${DATO}. Forsidens enhedsrække viser små billeder af kundesider (Vida, Ikast) og KT VVS-demoen, som de står på kinly.dk.`;
const IKAST_SIDE = `Skærmen viser ikastautoservice.dk/service/daek/, taget live ${DATO}.`;
const gpt = (fil) => ({ "1080x1350": `gpt/${fil}` });
const META_HAAND = {
  overskrift: "Ny hjemmeside, kodet fra bunden",
  primaer_tekst: "Vi koder jeres hjemmeside fra bunden i Herning. I ser et gratis udkast, før I betaler, og siden er 100 % jeres.",
  beskrivelse: "Fra 3.997 kr. ekskl. moms.",
  cta: "Få tilbud",
};
const META_PRIS = {
  overskrift: "Ny hjemmeside, 3.997 kr. ekskl. moms",
  primaer_tekst: "Kodet fra bunden, ingen skabelon. I ser et gratis udkast, før I betaler. Prisen er ekskl. moms.",
  beskrivelse: "Endelig pris aftales på skrift.",
  cta: "Få tilbud",
};
const META_UDKAST = {
  overskrift: "Se jeres side, før I vælger os",
  primaer_tekst: "Vi bygger et rigtigt udkast af jeres nye hjemmeside. I siger ja eller nej bagefter. Fra 3.997 kr. ekskl. moms.",
  beskrivelse: "Gratis udkast før betaling.",
  cta: "Få tilbud",
};
const TEKST_HAAND = ["Ny hjemmeside, kodet fra bunden.", "Fra 3.997 kr. ekskl. moms", "Se jeres udkast", "Gratis demo, før I betaler", "Siden er 100 % jeres"];
const TEKST_PRIS = ["Ny hjemmeside", "3.997 kr.", "ekskl. moms. Kodet fra bunden."];
const TEKST_UDKAST = ["Se jeres side, før I vælger os.", "I ser et rigtigt udkast, før I siger ja.", "Se jeres udkast", "Fra 3.997 kr. ekskl. moms"];
const IKAST_FAKTA = [FAKTA.ikast];
const META_UNDERSIDER = {
  overskrift: "Én side pr. ydelse",
  primaer_tekst: "Hver ydelse får sin egen side med SEO indbygget, så kunderne lander det rigtige sted. Fra 4.997 kr. ekskl. moms.",
  beskrivelse: "Forside + undersider, kodet fra bunden.",
  cta: "Få tilbud",
};
const TEKST_UNDERSIDER_KINLY = ["Én side pr. ydelse.", "Klar til Google fra dag ét.", "Værksted", "Webbureau", "Vipper og bryn", "kinly.dk"];
const META_FOER = {
  overskrift: "Samme værksted. Ny hjemmeside.",
  primaer_tekst: "Ikast AutoService fik en ny hjemmeside, kodet fra bunden, med en side pr. ydelse og fast pris. Fra 3.997 kr. ekskl. moms.",
  beskrivelse: "Kodet af Kinly i Herning.",
  cta: "Få tilbud",
};
const TEKST_FOER = ["Samme værksted.", "Ny hjemmeside.", "Før", "Efter", "Ikast AutoService, Ikast"];
const TEKST_UNDERSIDER_IKAST =["Én side pr. ydelse.", "Klar til Google fra dag ét.", "Dæk", "Tesla-værksted", "Lånebil", "Ikast AutoService, kodet af Kinly"];

const STILLS = [
  { slug: "gpt-haand-kinly", skabelon: "gpt", gpt: gpt("haand-kinly.png"), test_celle: "K1", koncept: "Hånd med telefon (Booksy-format)", anbefalet_start: true, kunde: null,
    meta: META_HAAND, still: TEKST_HAAND, fakta: [FAKTA.pris, FAKTA.moms, FAKTA.ejer],
    kilder: ["public/annoncer/kilde/skaerm-kinly-side-hjem.png (live kinly.dk forside)"], advarsler: [AI, KINLY_SKÆRM] },
  { slug: "gpt-foer-efter-ikast", skabelon: "gpt", gpt: gpt("foer-efter-ikast.png"), test_celle: "K5", koncept: "Før og efter", anbefalet_start: false, kunde: "Ikast AutoService",
    meta: META_FOER, still: TEKST_FOER, fakta: [FAKTA.pris, FAKTA.moms, FAKTA.ikastFoer, ...IKAST_FAKTA],
    kilder: ["public/annoncer/kilde/skaerm-ikast-gammel.png (autoservice.nu) + skaerm-ikast-side-daek.png (live ikastautoservice.dk/service/daek/)"], advarsler: [KUNDE_IKAST, IKAST_SIDE, "Før-skærmen viser det gamle site autoservice.nu, som stadig er online.", AI] },
  { slug: "gpt-haand-ikast", skabelon: "gpt", gpt: gpt("haand-ikast.png"), test_celle: "K1", koncept: "Hånd med telefon (Booksy-format)", anbefalet_start: false, kunde: "Ikast AutoService",
    meta: META_HAAND, still: TEKST_HAAND, fakta: [FAKTA.pris, FAKTA.moms, FAKTA.ejer, ...IKAST_FAKTA],
    kilder: ["public/annoncer/kilde/skaerm-ikast-lang-daek.png (live ikastautoservice.dk/service/daek/)"], advarsler: [KUNDE_IKAST, IKAST_SIDE, AI] },
  { slug: "gpt-pris-kinly", skabelon: "gpt", gpt: gpt("pris-kinly.png"), test_celle: "K2", koncept: "Pris i mørk stil", anbefalet_start: true, kunde: null,
    meta: META_PRIS, still: TEKST_PRIS, fakta: [FAKTA.pris, FAKTA.moms, FAKTA.ejer, FAKTA.skrift],
    kilder: ["public/annoncer/kilde/skaerm-kinly-laptop-hjem.png + skaerm-kinly-side-hjem.png (live kinly.dk forside)"], advarsler: [AI, KINLY_SKÆRM] },
  { slug: "gpt-pris-ikast", skabelon: "gpt", gpt: gpt("pris-ikast.png"), test_celle: "K2", koncept: "Pris i mørk stil", anbefalet_start: false, kunde: "Ikast AutoService",
    meta: META_PRIS, still: TEKST_PRIS, fakta: [FAKTA.pris, FAKTA.moms, FAKTA.ejer, FAKTA.skrift, ...IKAST_FAKTA],
    kilder: ["public/annoncer/kilde/skaerm-ikast-laptop.png + skaerm-ikast-side-daek.png (live ikastautoservice.dk)"], advarsler: [KUNDE_IKAST, IKAST_SIDE, AI] },
  { slug: "gpt-udkast-kinly", skabelon: "gpt", gpt: gpt("udkast-kinly.png"), test_celle: "K3", koncept: "Se jeres side, før I vælger os", anbefalet_start: true, kunde: null,
    meta: META_UDKAST, still: TEKST_UDKAST, fakta: [FAKTA.pris, FAKTA.moms, FAKTA.regning],
    kilder: ["public/annoncer/kilde/skaerm-kinly-laptop-hjem.png + skaerm-kinly-side-hjem.png (live kinly.dk forside)"], advarsler: [AI, KINLY_SKÆRM] },
  { slug: "gpt-udkast-ikast", skabelon: "gpt", gpt: gpt("udkast-ikast.png"), test_celle: "K3", koncept: "Se jeres side, før I vælger os", anbefalet_start: false, kunde: "Ikast AutoService",
    meta: META_UDKAST, still: TEKST_UDKAST, fakta: [FAKTA.pris, FAKTA.moms, FAKTA.regning, ...IKAST_FAKTA],
    kilder: ["public/annoncer/kilde/skaerm-ikast-laptop.png + skaerm-ikast-side-daek.png (live ikastautoservice.dk)"], advarsler: [KUNDE_IKAST, IKAST_SIDE, AI] },
  { slug: "gpt-undersider-kinly", skabelon: "gpt", gpt: gpt("undersider-kinly.png"), test_celle: "K4", koncept: "Én side pr. ydelse", anbefalet_start: true, kunde: null,
    meta: META_UNDERSIDER, still: TEKST_UNDERSIDER_KINLY, fakta: [FAKTA.pris, FAKTA.undersider, FAKTA.google],
    kilder: ["public/annoncer/kilde/skaerm-kinly-side-automekaniker.png, -herning.png, -oejenvipper.png (live kinly.dk-undersider)"], advarsler: [AI, KINLY_SKÆRM] },
  { slug: "gpt-undersider-ikast", skabelon: "gpt", gpt: gpt("undersider-ikast.png"), test_celle: "K4", koncept: "Én side pr. ydelse", anbefalet_start: false, kunde: "Ikast AutoService",
    meta: META_UNDERSIDER, still: TEKST_UNDERSIDER_IKAST, fakta: [FAKTA.pris, FAKTA.undersider, FAKTA.google, ...IKAST_FAKTA],
    kilder: ["public/annoncer/kilde/skaerm-ikast-side-daek.png, -tesla.png, -laanebil.png (live ikastautoservice.dk)"], advarsler: [KUNDE_IKAST, `Skærmene viser tre Ikast-undersider, taget live ${DATO}.`, "Ikast har flere undersider end 4.997-pakkens 3. Teksten nævner pakkeprisen, ikke hvad Ikast har betalt.", AI] },
];

// ---------------------------------------------------------------- tekster i billedet (til tjek af pris/moms og tankestreger)
const SKIP = new Set(["fil", "alt"]);
function stillTekst(v) {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(stillTekst);
  if (v && typeof v === "object") return Object.entries(v).filter(([k]) => !SKIP.has(k)).flatMap(([, x]) => stillTekst(x));
  return [];
}

function tjek(s) {
  const m = s.meta;
  const fejl = [];
  if (m.overskrift.length > 40) fejl.push(`overskrift ${m.overskrift.length} tegn`);
  if (m.primaer_tekst.split("\n")[0].length > 125) fejl.push(`primær tekst ${m.primaer_tekst.length} tegn`);
  if (!["Få tilbud", "Send besked", "Læs mere"].includes(m.cta)) fejl.push(`cta ${m.cta}`);
  for (const t of [...Object.values(m), ...stillTekst(s.still)]) if (/[—–]|!/.test(t)) fejl.push(`tankestreg eller udråbstegn: ${t}`);
  if (fejl.length) throw new Error(`${s.slug}: ${fejl.join("; ")}`);
}

// ---------------------------------------------------------------- kør
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(path.dirname(DATA), { recursive: true });
const browser = await chromium.launch({ args: ["--disable-lcd-text"] }); // ren gråtone-kantudjævning, ingen farvekanter
const rows = [];
for (const s of STILLS) {
  tjek(s);
  const tpl = SKABELONER[s.skabelon];
  for (const f of FORMATS) {
    const file = `${s.slug}-${f.key}.png`;
    if (s.gpt) {
      // GPT Image-annonce: færdigt billede (rigtige skærme sat ind af annonce-indsaet.py), kun de formater der findes
      if (!s.gpt[f.key]) continue;
      fs.copyFileSync(path.join(OUT, s.gpt[f.key]), path.join(OUT, file));
    } else {
      const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
      await page.setContent(tpl(s.still, f), { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: f.w, height: f.h } });
      await page.close();
    }
    rows.push({
      id: `${s.slug}-${f.key}`,
      slug: s.slug,
      format: f.key,
      billede: `/annoncer/${file}`,
      overskrift: s.meta.overskrift,
      primaer_tekst: s.meta.primaer_tekst,
      beskrivelse: s.meta.beskrivelse,
      cta: s.meta.cta,
      still_tekst: stillTekst(s.still).join(" "),
      kilde_fakta: s.fakta,
      billede_kilder: s.kilder,
      kunde: s.kunde,
      kunde_ja: false,
      skabelon: s.skabelon,
      test_celle: s.test_celle,
      koncept: s.koncept,
      anbefalet_start: s.anbefalet_start,
      advarsler: s.advarsler,
    });
    console.log("ok", file, fs.statSync(path.join(OUT, file)).size, "bytes");
  }
}
await browser.close();
fs.writeFileSync(DATA, JSON.stringify(rows, null, 2) + "\n");
console.log(`skrev ${rows.length} stills til ${path.relative(ROOT, DATA)}`);
