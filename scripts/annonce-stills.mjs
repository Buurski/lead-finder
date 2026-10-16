// Annonce-stills til Facebook/Instagram: HTML/CSS -> PNG (Playwright), bygget af RIGTIGE skærmbilleder og fotos.
// Ingen AI-billeder, intet kald til Meta. Kører lokalt:  node scripts/annonce-stills.mjs
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
  ikast: { fil: `${V}wiki/kunder/ikast-autoservice.md:13`, fakta: "Aktiv kunde, live på ikastautoservice.dk, kodet side, synlig reference" },
  ikastFoer: { fil: `${V}wiki/kunder/ikast-autoservice.md:72`, fakta: "autoservice.nu er det gamle site og navn, stadig online" },
  vida: { fil: `${V}wiki/kunder/vida-klinik.md:57`, fakta: "VIDA-siden er bygget, deployet og forsiden godkendt af Lene" },
  vidaKosmetik: { fil: `${V}wiki/kunder/vida-klinik.md:111`, fakta: "Markedsføringsregler for kosmetiske behandlinger er ikke tjekket" },
};

const KUNDE_IKAST = "Kunde-ja mangler: Ikast AutoService (Allan) skal sige ja til skærmbillede, navn og medarbejderfoto i en annonce.";
const LIVE_IKAST = `Skærmbilledet er taget live ${DATO}. Tjek at forsiden ikke er ændret, før annoncen går live.`;

// ---------------------------------------------------------------- stills: 7 motiver i 6 test-celler (K1-K6)
const STILLS = [
  {
    slug: "demo-forst-ikast",
    skabelon: "desktop",
    test_celle: "K6",
    koncept: "Se forsiden før du betaler",
    anbefalet_start: true,
    kunde: "Ikast AutoService",
    meta: {
      overskrift: "Se din nye forside før du betaler",
      primaer_tekst: "Du får en gratis demo af din nye hjemmeside, før du betaler. Kodet fra bunden af Lucas i Herning.",
      beskrivelse: "Forside fra 3.997 kr. ekskl. moms.",
      cta: "Få tilbud",
    },
    still: {
      mærke: "Eksempel fra Kinly",
      by: "Ikast",
      overskrift: "Se din nye forside før du betaler",
      adresse: "ikastautoservice.dk",
      billede: { fil: "ikast-live-desktop.png" },
      billedtekst: `Eksempel på en færdig side: ikastautoservice.dk, skærmbillede ${DATO}`,
      punkter: ["Gratis demo før betaling", "Kodet fra bunden", "Du ejer den 100 %"],
    },
    fakta: [FAKTA.pris, FAKTA.moms, FAKTA.ejer, FAKTA.ikast, FAKTA.lucas],
    kilder: ["public/annoncer/kilde/ikast-live-desktop.png (live ikastautoservice.dk, 16/10-2026)"],
    advarsler: [KUNDE_IKAST, LIVE_IKAST, "Billedteksten siger 'Eksempel', så stillen ikke ligner kundens egen demo."],
  },
  {
    slug: "ikast-foer-efter",
    skabelon: "foerEfter",
    test_celle: "K2",
    koncept: "Før og efter",
    anbefalet_start: true,
    kunde: "Ikast AutoService",
    meta: {
      overskrift: "Før og efter. Samme værksted.",
      primaer_tekst: "Ikast AutoService før og efter. Samme værksted, ny hjemmeside fra Kinly. Kunden ejer den 100 %.",
      beskrivelse: "Få en gratis demo, før du betaler.",
      cta: "Få tilbud",
    },
    still: {
      mærke: "Kinly · Ikast AutoService",
      overskrift: "Før og efter. Samme værksted.",
      sidetekst: "Ny hjemmeside, kodet fra bunden. Kunden ejer den 100 %.",
      foer: { fil: "ikast-gammel-mobil.webp" },
      efter: { fil: "ikast-live-phone.png" },
      billedtekst: `Før: det gamle site. Efter: ikastautoservice.dk, skærmbilleder af mobilvisning, ${DATO}.`,
    },
    fakta: [FAKTA.ikast, FAKTA.ikastFoer, FAKTA.ejer],
    kilder: [
      "public/annoncer/kilde/ikast-gammel-mobil.webp (Kinlys eget case-billede: kinly-site/public/img/cases/ikast-autoservice-foer-mobil.webp)",
      "public/annoncer/kilde/ikast-live-phone.png (live ikastautoservice.dk, 16/10-2026)",
    ],
    advarsler: [
      KUNDE_IKAST,
      LIVE_IKAST,
      "Før-billedet viser autoservice.nu, den gamle platform (logo synligt). Det er Kinlys eget case-billede, men tjek at I er trygge ved at vise det i en annonce.",
      "Ingen hastighedstal i stillen: de er ikke målt. Mål PageSpeed før og efter, hvis der skal tal på.",
    ],
  },
  {
    slug: "pris-3997",
    skabelon: "pris",
    test_celle: "K3",
    koncept: "Prisen på farve",
    anbefalet_start: true,
    kunde: "Ikast AutoService og VIDA",
    meta: {
      overskrift: "Ny hjemmeside fra 3.997 kr. ekskl. moms",
      primaer_tekst: "Kodet fra bunden, ikke en skabelon. Du ejer den 100 %, og du ser en gratis demo, før du betaler.",
      beskrivelse: "Forside fra 3.997 kr. ekskl. moms.",
      cta: "Få tilbud",
    },
    still: {
      mærke: "Ny hjemmeside fra",
      pris: "3.997",
      enhed: "kr. ekskl. moms",
      udsagn: "Du ejer den. Kodet fra bunden, ikke en skabelon.",
      strimmel: [{ fil: "ikast-live-phone.png" }, { fil: "vida-live-phone.png" }, { fil: "ikast-live-phone-ydelser.png" }],
    },
    fakta: [FAKTA.pris, FAKTA.moms, FAKTA.ejer, FAKTA.ikast, FAKTA.vida],
    kilder: [
      "public/annoncer/kilde/ikast-live-phone.png (live ikastautoservice.dk, 16/10-2026)",
      "public/annoncer/kilde/vida-live-phone.png (live vida-klinik.dk, 16/10-2026)",
      "public/annoncer/kilde/ikast-live-phone-ydelser.png (live ikastautoservice.dk, 16/10-2026)",
    ],
    advarsler: [
      "Strimlen viser forsider fra Ikast AutoService og VIDA: begge skal sige ja (VIDA: Lene).",
      "Kosmetisk klinik: markedsføringsregler er ikke tjekket (vault vida-klinik.md:111). Stillen viser kun VIDAs forside, ingen behandlinger.",
      "Prisen er den ægte startpris fra kinly.dk. Vis den aldrig ved siden af Wix eller andre billige abonnementer (fakta.md:13).",
    ],
  },
  {
    slug: "noter-det-vi-ikke-goer",
    skabelon: "noter",
    test_celle: "K4",
    koncept: "Det vi ikke gør (noter-look)",
    anbefalet_start: false,
    kunde: null,
    meta: {
      overskrift: "Det vi ikke gør",
      primaer_tekst: "Ingen WordPress, ingen skabeloner, ingen binding på driften. Du ejer koden 100 %, og du får prisen på skrift først.",
      beskrivelse: "Forside fra 3.997 kr. ekskl. moms.",
      cta: "Læs mere",
    },
    still: {
      dato: "16. okt. 2026",
      overskrift: "Det vi ikke gør",
      nej: ["WordPress", "Skabeloner", "Binding på driften", "Regning før du har godkendt siden"],
      ja_overskrift: "Det du får",
      ja: ["Kodet fra bunden til dig", "Gratis demo før du betaler", "Du ejer koden 100 %", "Pris på skrift, før du siger ja"],
      fodnote: "Forside fra 3.997 kr. ekskl. moms.",
    },
    fakta: [FAKTA.wp, FAKTA.ejer, FAKTA.binding, FAKTA.regning, FAKTA.skrift, FAKTA.pris, FAKTA.moms],
    kilder: [],
    advarsler: [
      "Reserve-koncept: tages i brug, hvis et af de fem andre taber efter 7 til 10 dage.",
      "'Binding på driften' gælder Hjemmesidepasset (priser.md:27 og :47). Ret teksten, hvis tilbuddet ændrer sig.",
    ],
  },
  {
    slug: "lucas-herning",
    skabelon: "team",
    test_celle: "K5",
    koncept: "Personen bag",
    anbefalet_start: true,
    kunde: null,
    meta: {
      overskrift: "Bygget af Lucas, fra Herning",
      primaer_tekst: "Ikke et bureau med kontor og ansatte. Det er bare mig, til en fair pris. Du ejer 100 % af koden.",
      beskrivelse: "Gratis demo, før du betaler.",
      cta: "Send besked",
    },
    still: {
      mærke: "Kinly · Herning",
      overskrift: "Bygget af Lucas, fra Herning",
      udsagn: "Ikke et bureau med kontor og ansatte. Det er bare mig, til en fair pris.",
      punkter: ["Kodet fra bunden", "Du ejer 100 % af koden", "Gratis demo før du betaler"],
      foto: { fil: "lucas.jpg", alt: "Lucas Buur" },
    },
    fakta: [FAKTA.lucas, FAKTA.bareMig, FAKTA.ejer, FAKTA.pris],
    kilder: ["public/annoncer/kilde/lucas.jpg (kinly-site/public/img/team/lucasnew.jpg, Lucas' eget portræt)"],
    advarsler: ["Charlie er ikke med. Skal han med på billedet eller i teksten, kræver det hans skriftlige ja først."],
  },
  {
    slug: "ikast-mobil",
    skabelon: "mobil",
    test_celle: "K1",
    koncept: "Kundeside på mobil",
    anbefalet_start: true,
    kunde: "Ikast AutoService",
    meta: {
      overskrift: "Sådan ser den ud på mobilen",
      primaer_tekst: "Ikast AutoService har fået en ny hjemmeside fra Kinly. Kodet fra bunden, ikke en skabelon.",
      beskrivelse: "Forside fra 3.997 kr. ekskl. moms.",
      cta: "Læs mere",
    },
    still: {
      mærke: "Kinly · Ikast AutoService",
      overskrift: "Sådan ser den ud på mobilen",
      sted: "Autoværksted i Ikast",
      underlinje: "Forside fra 3.997 kr. ekskl. moms. Gratis demo før betaling.",
      billede: { fil: "ikast-live-phone.png", billedtekst: `Skærmbillede af ikastautoservice.dk, ${DATO}` },
    },
    fakta: [FAKTA.ikast, FAKTA.pris, FAKTA.moms, FAKTA.ejer],
    kilder: ["public/annoncer/kilde/ikast-live-phone.png (live ikastautoservice.dk, 16/10-2026)"],
    advarsler: [KUNDE_IKAST, LIVE_IKAST],
  },
  {
    slug: "vida-mobil",
    skabelon: "mobil",
    test_celle: "K1",
    koncept: "Kundeside på mobil",
    anbefalet_start: false,
    kunde: "VIDA",
    meta: {
      overskrift: "Hjemmeside til en skønhedsklinik",
      primaer_tekst: "VIDA har fået en ny hjemmeside fra Kinly. Kodet fra bunden, ikke en skabelon, og kunden ejer den 100 %.",
      beskrivelse: "Forside fra 3.997 kr. ekskl. moms.",
      cta: "Læs mere",
    },
    still: {
      mærke: "Kinly · VIDA",
      overskrift: "Hjemmeside til en klinik",
      sted: "Skønhedsklinik i Gl. Hasseris",
      underlinje: "Forside fra 3.997 kr. ekskl. moms. Gratis demo før betaling.",
      billede: { fil: "vida-live-phone.png", billedtekst: `Skærmbillede af vida-klinik.dk, ${DATO}` },
    },
    fakta: [FAKTA.vida, FAKTA.pris, FAKTA.moms, FAKTA.ejer],
    kilder: ["public/annoncer/kilde/vida-live-phone.png (live vida-klinik.dk, 16/10-2026)"],
    advarsler: [
      "Kunde-ja mangler: VIDA (Lene) skal sige ja til skærmbillede og navn i en annonce.",
      "Kosmetisk klinik: markedsføringsregler for kosmetiske behandlinger er ikke tjekket (vault vida-klinik.md:111). Stillen viser kun forsiden, ingen behandlinger eller før/efter.",
      "Ikke med i anbefalet startsæt: Ikast-versionen dækker K1, og VIDA venter på ja og tjek af reglerne.",
    ],
  },
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
    const page = await browser.newPage({ viewport: { width: f.w, height: f.h }, deviceScaleFactor: 1 });
    await page.setContent(tpl(s.still, f), { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    const file = `${s.slug}-${f.key}.png`;
    await page.screenshot({ path: path.join(OUT, file), clip: { x: 0, y: 0, width: f.w, height: f.h } });
    await page.close();
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
