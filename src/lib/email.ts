import nodemailer from "nodemailer";
import { DEMO_SITES } from "./demos.ts";

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  pool: true,
  maxConnections: 1,
  maxMessages: Infinity,
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

// URLs come from the single source of truth in demos.ts (DEMO_SITES); this map
// just shapes them for the email templates (food = [primary, secondary] etc.).
const DEMO_URLS = {
  food: [DEMO_SITES.underKlippen, DEMO_SITES.zaytoon],
  craft: DEMO_SITES.denlillemaler,
  craftUtility: DEMO_SITES.ktvvs,
  photo: DEMO_SITES.buurfoto,
  gallery: DEMO_SITES.buurfoto,
  professional: DEMO_SITES.midtadvokaterne,
  // Beauty demos — added 2026-05-20
  beautyBarber: DEMO_SITES.streetcut,
  beautySalon: DEMO_SITES.salonArtec,
} as const;

// vvs/elektriker/blikkenslager/mekaniker/smed get the ktvvs demo.
// tomrer/snedker/maler/murermester/tagdaekker get the denlillemaler demo.
const CRAFT_UTILITY_KEYWORDS = ["vvs", "elektriker", "blikkenslager", "mekaniker", "smed"];

// Beauty: per Lucas (2026-05-20) — always send BOTH demos to every beauty lead,
// no per-sub-branch specialisation. Salon-artec leads (broadest appeal), streetcut second.

function pickCraftDemo(branch: string): string {
  const b = branch.toLowerCase();
  if (CRAFT_UTILITY_KEYWORDS.some((k) => b.includes(k))) return DEMO_URLS.craftUtility;
  return DEMO_URLS.craft;
}

function pickFoodDemoOrder(name: string, branch: string): { primary: string; secondary: string } {
  const t = (name + " " + branch).toLowerCase();
  if (/pizza|pizzeria|italia|sushi|kebab|shawarma|falafel|tapas|libanon|tyrk|grill|mexicansk|wok|asia|thai|indisk|kinesisk/.test(t)) {
    return { primary: DEMO_URLS.food[1], secondary: DEMO_URLS.food[0] };
  }
  return { primary: DEMO_URLS.food[0], secondary: DEMO_URLS.food[1] };
}

function pickBeautyDemoOrder(): { primary: string; secondary: string } {
  return { primary: DEMO_URLS.beautySalon, secondary: DEMO_URLS.beautyBarber };
}

const BRANCH_GROUP_MAP: Record<string, string> = {
  // Craft/håndværk
  tømrer: "craft", maler: "craft", elektriker: "craft",
  vvs: "craft", blikkenslager: "craft", tagdæk: "craft", murermester: "craft",
  mekaniker: "craft", smed: "craft", snedker: "craft",
  // Service
  rengøringsvirksomhed: "service", vinduespudser: "service", anlægsgartner: "service",
  sundhed: "service", fitness: "service", træningscenter: "service",
  // Beauty — shorter keys catch all Google Places category variants
  skønhed: "beauty",        // skønhedsklinik, skønhedssalon, skønhedspleje, etc.
  frisør: "beauty",         // frisørsalon, frisørforretning, etc.
  hår: "beauty",            // hårklinik, hår og negle, hårstylist
  hair: "beauty",           // English: Hair by us, Hair salon
  negle: "beauty",          // negleklinik, neglepleje
  nails: "beauty",
  salon: "beauty",          // Salon No. 1, Salon Heidi — almost always beauty in DK context
  klip: "beauty",           // Klip&Cool, Klip og farve
  spa: "beauty",
  velvære: "beauty",
  wellness: "beauty",
  massage: "beauty",
  kosmetisk: "beauty",      // Kosmetisk klinik
  kosmetolog: "beauty",
  barbershop: "beauty", barbersalon: "beauty", barber: "beauty",
  solcenter: "beauty", solarium: "beauty",
  hudpleje: "beauty", hudklinik: "beauty",
  "body art": "beauty",
  // Gallery
  galleri: "gallery", kunstgalleri: "gallery", kunsthandel: "gallery",
  // Professional — shorter keys catch Google Places variants
  advokat: "professional", revisor: "professional",
  fysioterapi: "professional",  // catches both "fysioterapeut" and "fysioterapi"
  tand: "professional",         // catches "tandlæge" and "tandklinik"
  optiker: "professional", kiropraktor: "professional", apotek: "professional",
  læge: "professional",         // catches "Læge", "Lægeklinik", "Lægehus"
  psykolog: "professional",
  // Food — broader catches for Google Places categories
  restaurant: "food", café: "food", cafe: "food", bistro: "food", sushi: "food",
  kaffebar: "food", pizzeria: "food", burger: "food", smørrebrød: "food",
  // Photo — shorter "foto" catches fotostudie, fotoatelier, fotografiservice, etc.
  foto: "photo",
};

// Human-readable plural branch names for use in email copy
const BRANCH_DISPLAY: Record<string, string> = {
  tømrer: "tømrerfirmaer",
  maler: "malerfirmaer",
  elektriker: "elektrikerfirmaer",
  "vvs-installatør": "VVS-firmaer",
  blikkenslager: "blikkenslagerfirmaer",
  tagdækker: "tagdækkerfirmaer",
  murermester: "murerfirmaer",
  rengøringsvirksomhed: "rengøringsvirksomheder",
  vinduespudser: "vinduespoleringsvirksomheder",
  anlægsgartner: "anlægsgartnere",
  skønhedsklinik: "skønhedsklinikker",
  hudklinik: "hudklinikker",
  "negle & vippeextensions salon": "negle & vippeextensions saloner",
  skønhedssalon: "skønhedssaloner",
  negleklinik: "negleklinikker",
  kosmetolog: "kosmetologer",
  barbersalon: "barbersaloner",
  solcenter: "solcentre",
  hudpleje: "hudplejeklinikker",
  "body art": "body art studios",
  galleri: "gallerier",
  kunstgalleri: "kunstgallerier",
  kunsthandel: "kunsthandler",
  advokat: "advokatfirmaer",
  revisor: "revisionsfirmaer",
  fysioterapeut: "fysioterapiklinikker",
  tandlæge: "tandlægeklinikker",
  optiker: "optikerforretninger",
  restaurant: "restauranter",
  café: "caféer",
  fotograf: "fotografer",
  frisørsalon: "frisørsaloner",
};

const UNSUBSCRIBE_TEXT = `\n\n---\nØnsker du ikke at høre fra mig igen? Skriv blot tilbage, så fjerner jeg dig fra listen.`;
const UNSUBSCRIBE_HTML = `<br><br><hr style="border:none;border-top:1px solid #eee;margin:16px 0;"><p style="color:#999;font-size:12px;">Ønsker du ikke at høre fra mig igen? Skriv blot tilbage, så fjerner jeg dig fra listen.</p>`;

// Fallback for unknown branches


function getBranchDisplay(branch: string): string {
  const normalized = branch.toLowerCase().trim();
  for (const [key, display] of Object.entries(BRANCH_DISPLAY)) {
    if (normalized.includes(key)) return display;
  }
  return "virksomheder";
}

function getBranchGroup(branch: string): string {
  const normalized = branch.toLowerCase().trim();
  if (!normalized) return "service"; // generic safe fallback — neutral copy, no demo link mismatch
  for (const [key, group] of Object.entries(BRANCH_GROUP_MAP)) {
    if (normalized.includes(key)) return group;
  }
  // 2026-05-20: previously defaulted to "craft" which sent håndværker copy + craft demo
  // to advokat/fotograf/kaffebar leads. Now defaults to neutral "service" copy with no demo URL,
  // avoiding the embarrassing wrong-template sends Lucas had to apologise for on 19 May.
  return "service";
}

interface EmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface TemplateVars {
  name: string;
  branch: string;
  branchDisplay: string; // human-readable plural, e.g. "tømrerfirmaer"
  city: string;
  websiteStatus: string;      // "none" | "dead" | "old" | "ok"
  websiteQualityTier: string; // "modern" | "mediocre" | "old" | "dead" | ""
  daysSince: number;
}

function buildHtml(body: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.6; max-width: 520px;">
${body}
${UNSUBSCRIBE_HTML}
</body></html>`;
}

function websiteLine(v: TemplateVars): string {
  // Softened copy 2026-05-20: previous wording was called "fornærmende" / "flabet" by recipients.
  // Always frame as an offer/possibility — never imply their current site is bad.
  if (v.websiteStatus === "none")
    return "Jeg kan se I ikke har en hjemmeside endnu — der kunne ligge noget potentiale i en god lille en.";
  if (v.websiteQualityTier === "dead" || v.websiteStatus === "dead")
    // NB: never assert the site is broken/down. A "dead" tier can come from a fetch
    // that was bot-blocked rather than a genuinely dead site (Lucas got burned sending
    // "din hjemmeside har tekniske udfordringer" to businesses whose sites were fine).
    // Keep this purely as a neutral offer so a misclassification can't insult anyone.
    return "Jeg kiggede forbi jeres online tilstedeværelse — jeg sender bare et lille indspark hvis I på et tidspunkt overvejer en frisk hjemmeside.";
  if (v.websiteQualityTier === "old" || v.websiteStatus === "old")
    return "Jeg kiggede forbi jeres hjemmeside — den fungerer fint, men jeg tænker at en lille opdatering kunne give jer endnu mere ud af den.";
  if (v.websiteQualityTier === "mediocre")
    return "Jeg kiggede forbi jeres hjemmeside — den fungerer fint som den er. Jeg sender bare et lille indspark hvis I på et tidspunkt overvejer en frisk version.";
  return "Jeg kiggede forbi jeres hjemmeside — den ser fin ud. Jeg sender bare et lille indspark hvis I på et tidspunkt overvejer noget nyt.";
}

// Warm opener — compliments the business before any critique.
// (Danish written directly: the previous ASCII-digraph + .replace() trick was
// broken for food/service/default — the .replace bound only to the trailing
// string literal, so those branches shipped "stoedt paa"/"tilstedevaerelse"/
// "koerende" in real cold emails.)
function complimentLine(group: string, name: string, city: string): string {
  switch (group) {
    case "food":
      return "Jeg er stødt på " + name + " i " + city + " — det ser ud som et sted folk virkelig kommer for stemningen.";
    case "craft":
      return name + " ser ud til at have et solidt ry i " + city + " — det er tydeligt I står for kvalitetsarbejde.";
    case "beauty":
      // Dropped the dead "ser ud til at have bygget noget særligt op" opener
      // (OUTREACH_ANALYSIS: 30+ sends, 0 positives). Neutral, low-risk instead.
      return "Jeg blev nysgerrig på " + name + " i " + city + " og kom til at tænke på, hvordan en rolig, stilren side kunne klæde jer.";
    case "professional":
      return "I " + city + " kender folk " + name + " — det er tydeligt I har en stærk position.";
    case "gallery":
      return "Det visuelle udtryk hos " + name + " er stærkt — det fortjener at blive set af flere.";
    case "photo":
      return "Med det øje du har bag kameraet er der allerede meget at vise frem.";
    case "service":
      return name + " har en solid tilstedeværelse i " + city + ".";
    default:
      return name + " ser ud til at have noget godt kørende i " + city + ".";
  }
}

const TEMPLATES: Record<string, Record<"cold" | "followup", (v: TemplateVars) => EmailTemplate>> = {
  food: {
    cold: (v) => {
      const ws = websiteLine(v);
      const compliment = complimentLine("food", v.name, v.city);
      const demos = pickFoodDemoOrder(v.name, v.branch);
      const text = `Hej ${v.name},

${compliment}

${ws}

Jeg har lavet et par demo-hjemmesider til ${v.branchDisplay} som I kan kigge på:
→ ${demos.primary}
→ ${demos.secondary}

Det er kun demoer — den fulde version til ${v.name} ville selvfølgelig matche jeres stil, menu og farver helt.

Hvis det er noget I bare lige vil høre mere om, så skriv eller ring.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Lille idé til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>${compliment}</p>
<p>${ws}</p>
<p>Jeg har lavet et par demo-hjemmesider til ${v.branchDisplay} som I kan kigge på:<br>
→ <a href="${demos.primary}">${demos.primary}</a><br>
→ <a href="${demos.secondary}">${demos.secondary}</a></p>
<p>Det er kun demoer — den fulde version til <strong>${v.name}</strong> ville selvfølgelig matche jeres stil, menu og farver helt.</p>
<p>Hvis det er noget I bare lige vil høre mere om, så skriv eller ring.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
    followup: (v) => {
      const demos = pickFoodDemoOrder(v.name, v.branch);
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden. Jeg har faktisk tænkt lidt videre over hvordan en hjemmeside kunne se ud specifikt til ${v.name} — stemningen, jeres menu, farverne.

Demoerne til inspiration ligger her:
→ ${demos.primary}
→ ${demos.secondary}

Hvis I er nysgerrige, kan jeg lave en hurtig mockup med jeres egne billeder og farver — helt uforpligtende. Sig endelig til hvis det lyder interessant.

Og er det helt urealistisk lige nu, så er ét enkelt "nej tak" alt jeg har brug for — så lader jeg jer være.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Lille idé til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Lille opfølgning på min mail fra ${v.daysSince} dage siden. Jeg har faktisk tænkt lidt videre over hvordan en hjemmeside kunne se ud specifikt til <strong>${v.name}</strong> — stemningen, jeres menu, farverne.</p>
<p>Demoerne til inspiration ligger her:<br>
→ <a href="${demos.primary}">${demos.primary}</a><br>
→ <a href="${demos.secondary}">${demos.secondary}</a></p>
<p>Hvis I er nysgerrige, kan jeg lave en hurtig mockup med jeres egne billeder og farver — helt uforpligtende. Sig endelig til hvis det lyder interessant.</p>
<p>Og er det helt urealistisk lige nu, så er ét enkelt "nej tak" alt jeg har brug for — så lader jeg jer være.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
  },

  craft: {
    cold: (v) => {
      const ws = websiteLine(v);
      const compliment = complimentLine("craft", v.name, v.city);
      const demo = pickCraftDemo(v.branch);
      const text = `Hej ${v.name},

${compliment} Jeres arbejde taler for sig selv — hjemmesiden fortjener at gøre det samme.

${ws}

Jeg har lavet en demo-hjemmeside til ${v.branchDisplay} — se den her:
→ ${demo}

Den er kun en demo — en fuld version til ${v.name} ville selvfølgelig bære jeres egne projekter, farver og udtryk.

Hvis det er noget I bare vil høre lidt mere om, så skriv eller ring.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Lille idé til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>${compliment} Jeres arbejde taler for sig selv — hjemmesiden fortjener at gøre det samme.</p>
<p>${ws}</p>
<p>Jeg har lavet en demo-hjemmeside til ${v.branchDisplay} — se den her:<br>
→ <a href="${demo}">${demo}</a></p>
<p>Den er kun en demo — en fuld version til <strong>${v.name}</strong> ville selvfølgelig bære jeres egne projekter, farver og udtryk.</p>
<p>Hvis det er noget I bare vil høre lidt mere om, så skriv eller ring.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
    followup: (v) => {
      const demo = pickCraftDemo(v.branch);
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden. Jeg har faktisk overvejet hvordan en hjemmeside kunne fremhæve jeres egne projekter — det er der mange håndværkere der har god gavn af.

Demoen ligger her:
→ ${demo}

Hvis I er nysgerrige, kan jeg lave en hurtig skitse til ${v.name} med 2-3 af jeres egne projekter — helt uforpligtende. Sig endelig til hvis det lyder interessant.

Og er det ikke aktuelt nu, så er ét enkelt "nej tak" alt jeg har brug for — så lader jeg jer være.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Lille idé til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Lille opfølgning på min mail fra ${v.daysSince} dage siden. Jeg har faktisk overvejet hvordan en hjemmeside kunne fremhæve jeres egne projekter — det er der mange håndværkere der har god gavn af.</p>
<p>Demoen ligger her:<br>
→ <a href="${demo}">${demo}</a></p>
<p>Hvis I er nysgerrige, kan jeg lave en hurtig skitse til <strong>${v.name}</strong> med 2-3 af jeres egne projekter — helt uforpligtende. Sig endelig til hvis det lyder interessant.</p>
<p>Og er det ikke aktuelt nu, så er ét enkelt "nej tak" alt jeg har brug for — så lader jeg jer være.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
  },

  photo: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

Med det øje du har bag kameraet fortjener du en hjemmeside der viser det frem.

${ws}

Jeg har lavet en demo-hjemmeside til fotografer — se den her:
→ ${DEMO_URLS.photo}

Det er kun en demo, men jeg laver en fuld version der passer specifikt til dig — dit udtryk, dine billeder, din stil.

Ring eller skriv hvis du er nysgerrig.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Din hjemmeside, ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>Med det øje du har bag kameraet fortjener du en hjemmeside der viser det frem.</p>
<p>${ws}</p>
<p>Jeg har lavet en demo-hjemmeside til fotografer — se den her:<br>
→ <a href="${DEMO_URLS.photo}">${DEMO_URLS.photo}</a></p>
<p>Det er kun en demo, men jeg laver en fuld version der passer specifikt til dig — dit udtryk, dine billeder, din stil.</p>
<p>Ring eller skriv hvis du er nysgerrig.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden. En fotograf-hjemmeside skal vise dit eget arbejde frem — det er det jeg gerne vil hjælpe med.

Min demo til fotografer:
→ ${DEMO_URLS.photo}

Hvis du er nysgerrig, kan jeg lave en hurtig mockup med nogle af dine egne billeder — helt uforpligtende. Sig endelig til hvis det lyder interessant.

Og er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Lille idé til din hjemmeside, ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Lille opfølgning på min mail fra ${v.daysSince} dage siden. En fotograf-hjemmeside skal vise dit eget arbejde frem — det er det jeg gerne vil hjælpe med.</p>
<p>Min demo til fotografer:<br>
→ <a href="${DEMO_URLS.photo}">${DEMO_URLS.photo}</a></p>
<p>Hvis du er nysgerrig, kan jeg lave en hurtig mockup med nogle af dine egne billeder — helt uforpligtende. Sig endelig til hvis det lyder interessant.</p>
<p>Og er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
  },

  professional: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

I ${v.city} kender folk jer. Hjemmesiden burde de også gøre.

${ws}

Jeg har lavet en demo-hjemmeside til virksomheder som jeres — se den her:
→ ${DEMO_URLS.professional}

Det er kun en demo, men jeg laver en fuld version der passer specifikt til ${v.name}.

Ring eller skriv hvis du vil høre mere.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>I ${v.city} kender folk jer. Hjemmesiden burde de også gøre.</p>
<p>${ws}</p>
<p>Jeg har lavet en demo-hjemmeside til virksomheder som jeres — se den her:<br>
→ <a href="${DEMO_URLS.professional}">${DEMO_URLS.professional}</a></p>
<p>Det er kun en demo, men jeg laver en fuld version der passer specifikt til <strong>${v.name}</strong>.</p>
<p>Ring eller skriv hvis du vil høre mere.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden. For en virksomhed som jeres er hjemmesiden ofte det første kunder ser — og det første indtryk vejer tungt.

Demoen:
→ ${DEMO_URLS.professional}

Hvis I er nysgerrige, kan jeg lave en hurtig mockup tilpasset ${v.name} — helt uforpligtende. Sig endelig til hvis det lyder interessant.

Er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for — så respekterer jeg det.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Lille idé til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Lille opfølgning på min mail fra ${v.daysSince} dage siden. For en virksomhed som jeres er hjemmesiden ofte det første kunder ser — og det første indtryk vejer tungt.</p>
<p>Demoen:<br>
→ <a href="${DEMO_URLS.professional}">${DEMO_URLS.professional}</a></p>
<p>Hvis I er nysgerrige, kan jeg lave en hurtig mockup tilpasset <strong>${v.name}</strong> — helt uforpligtende. Sig endelig til hvis det lyder interessant.</p>
<p>Er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for — så respekterer jeg det.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
  },

  beauty: {
    cold: (v) => {
      const ws = websiteLine(v);
      const compliment = complimentLine("beauty", v.name, v.city);
      const demos = pickBeautyDemoOrder();
      const text = `Hej ${v.name},

${compliment}

${ws}

Jeg har lavet et par demo-hjemmesider til ${v.branchDisplay} — så I kan se hvordan det kunne se ud:
→ ${demos.primary}
→ ${demos.secondary}

Det er kun demoer — den fulde version til ${v.name} ville selvfølgelig matche jeres stil, behandlinger og farver helt.

Hvis det er noget I bare vil høre lidt mere om, så skriv eller ring.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Lille idé til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>${compliment}</p>
<p>${ws}</p>
<p>Jeg har lavet et par demo-hjemmesider til ${v.branchDisplay} — så I kan se hvordan det kunne se ud:<br>
→ <a href="${demos.primary}">${demos.primary}</a><br>
→ <a href="${demos.secondary}">${demos.secondary}</a></p>
<p>Det er kun demoer — den fulde version til <strong>${v.name}</strong> ville selvfølgelig matche jeres stil, behandlinger og farver helt.</p>
<p>Hvis det er noget I bare vil høre lidt mere om, så skriv eller ring.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
    followup: (v) => {
      const demos = pickBeautyDemoOrder();
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden. Jeg tænker stadig at noget visuelt der virkelig fremhæver ${v.name} kunne gøre en forskel for jeres bookings — særligt nu hvor folk googler alt før de bestiller tid.

Demoerne til inspiration ligger her:
→ ${demos.primary}
→ ${demos.secondary}

Hvis I er nysgerrige, kan jeg lave en hurtig mockup specifikt til jer med jeres egne billeder og behandlinger — helt uforpligtende. Sig endelig til hvis det lyder interessant.

Er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Lille idé til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Lille opfølgning på min mail fra ${v.daysSince} dage siden. Jeg tænker stadig at noget visuelt der virkelig fremhæver <strong>${v.name}</strong> kunne gøre en forskel for jeres bookings — særligt nu hvor folk googler alt før de bestiller tid.</p>
<p>Demoerne til inspiration ligger her:<br>
→ <a href="${demos.primary}">${demos.primary}</a><br>
→ <a href="${demos.secondary}">${demos.secondary}</a></p>
<p>Hvis I er nysgerrige, kan jeg lave en hurtig mockup specifikt til jer med jeres egne billeder og behandlinger — helt uforpligtende. Sig endelig til hvis det lyder interessant.</p>
<p>Er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
  },

  gallery: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

${ws}

Jeg har lavet en demo-hjemmeside til visuelle brands — se den her:
→ ${DEMO_URLS.gallery}

Det er en demo til en fotograf — men jeg laver selvfølgelig en version der passer specifikt til ${v.name} og jeres udtryk.

Ring eller skriv hvis I vil se hvad det kunne se ud som.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>${ws}</p>
<p>Jeg har lavet en demo-hjemmeside til visuelle brands — se den her:<br>
→ <a href="${DEMO_URLS.gallery}">${DEMO_URLS.gallery}</a></p>
<p>Det er en demo til en fotograf — men jeg laver selvfølgelig en version der passer specifikt til <strong>${v.name}</strong> og jeres udtryk.</p>
<p>Ring eller skriv hvis I vil se hvad det kunne se ud som.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for ${v.daysSince} dage siden om en hjemmeside til jer — tilbuddet gælder stadig.

Se min demo:
→ ${DEMO_URLS.gallery}

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Jeg sendte en mail for ${v.daysSince} dage siden om en hjemmeside til jer — tilbuddet gælder stadig.</p>
<p>Se min demo:<br>
→ <a href="${DEMO_URLS.gallery}">${DEMO_URLS.gallery}</a></p>
<p>Ring eller skriv.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
  },

  service: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

${ws}

Mange i ${v.city} søger lokale ${v.branchDisplay} online — en god hjemmeside er det første de ser.

Skriv eller ring hvis du vil se hvad jeg kan lave til jer.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>${ws}</p>
<p>Mange i ${v.city} søger lokale ${v.branchDisplay} online — en god hjemmeside er det første de ser.</p>
<p>Skriv eller ring hvis du vil se hvad jeg kan lave til jer.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Jeg sendte en mail for ${v.daysSince} dage siden om en hjemmeside til jer — tilbuddet gælder stadig.

Ring eller skriv.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Hjemmeside til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Jeg sendte en mail for ${v.daysSince} dage siden om en hjemmeside til jer — tilbuddet gælder stadig.</p>
<p>Ring eller skriv.</p>
<p>Lucas<br>+45 23 24 24 82</p>`),
      };
    },
  },
};

export function getEmailTemplate(
  branch: string,
  type: "cold" | "followup",
  vars: Omit<TemplateVars, "branchDisplay"> & { leadId: string }
): EmailTemplate {
  const group = getBranchGroup(branch);
  const template = TEMPLATES[group]?.[type] ?? TEMPLATES.craft[type];
  const branchDisplay = getBranchDisplay(branch);
  const result = template({ ...vars, branchDisplay });
  return { ...result, text: result.text + UNSUBSCRIBE_TEXT };
}

// Thrown when no template group resolves for a lead. The command-center email.ts
// uses a neutral "service" fallback (see getBranchGroup) so this is effectively a
// guard rather than a frequent path — but the Vercel send routes catch it to
// record skipReason="wrong_template" instead of sending mismatched copy.
export class NoMatchingTemplateError extends Error {
  readonly name = "NoMatchingTemplateError";
  // Explicit fields (not constructor parameter properties): keeps email.ts
  // strip-safe so Node's type-stripping can import it (the offline test harness
  // and any plain-node caller). Parameter properties are not strippable.
  readonly leadName: string;
  readonly branch: string;
  constructor(leadName: string, branch: string) {
    super(`No matching email template for name="${leadName}" branch="${branch}"`);
    this.leadName = leadName;
    this.branch = branch;
  }
}

/**
 * Pure render: resolves a lead's template WITHOUT calling Gmail, for the
 * enqueue-only Vercel send paths (SendQueue). Returns the exact bytes that
 * would be sent.
 */
export function buildLeadEmail(
  lead: { id: string; name: string; branch: string; city: string; websiteStatus: string; websiteQualityTier: string; emailSentAt: string },
  type: "cold" | "followup"
): { subject: string; text: string; html: string } {
  const daysSince = type === "followup" && lead.emailSentAt
    ? Math.round((Date.now() - new Date(lead.emailSentAt).getTime()) / (1000 * 60 * 60 * 24))
    : 7;
  const template = getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
    websiteStatus: lead.websiteStatus,
    websiteQualityTier: lead.websiteQualityTier,
    daysSince,
  });
  return { subject: template.subject, text: template.text, html: template.html };
}

export async function sendLeadEmail(
  lead: {
    id: string; name: string; branch: string; city: string; email: string;
    websiteStatus: string; websiteQualityTier: string; emailSentAt: string;
    // Del 3: the engine composes the email ONCE (tone-mixer) and persists it.
    // When present we send those exact bytes; the legacy templates are fallback.
    composedSubject?: string; composedBody?: string; composedHtml?: string;
  },
  type: "cold" | "followup"
): Promise<void> {
  let subject: string;
  let text: string;
  let html: string;

  if (type === "cold" && lead.composedBody) {
    // Compose-at-draft-time path — send the exact bytes the engine produced.
    subject = lead.composedSubject || `En idé til ${lead.name}`;
    text = lead.composedBody + UNSUBSCRIBE_TEXT;
    html = lead.composedHtml || lead.composedBody.replace(/\n/g, "<br>");
  } else {
    if (type === "cold") {
      console.warn(`[email] LEGACY template path for "${lead.name}" — no composedBody on the lead.`);
    }
    const daysSince = type === "followup" && lead.emailSentAt
      ? Math.round((Date.now() - new Date(lead.emailSentAt).getTime()) / (1000 * 60 * 60 * 24))
      : 7;
    const template = getEmailTemplate(lead.branch, type, {
      leadId: lead.id,
      name: lead.name,
      branch: lead.branch,
      city: lead.city,
      websiteStatus: lead.websiteStatus,
      websiteQualityTier: lead.websiteQualityTier,
      daysSince,
    });
    subject = template.subject;
    text = template.text;
    html = template.html;
  }

  await transporter.sendMail({
    from: `Lucas Buur <${process.env.GMAIL_USER}>`,
    to: lead.email,
    subject,
    text,
    html,
    headers: {
      // Gmail's 2024 bulk-sender guidelines: one-click List-Unsubscribe lifts deliverability
      // significantly and reduces the chance of a sender-side rate-limit (the 4.7.0 throttle
      // that hit on May 12 + May 19). The mailto address is Lucas's own — replies marked
      // "unsubscribe" should be auto-skipped by /api/email/sync-replies.
      "List-Unsubscribe": `<mailto:${process.env.GMAIL_USER}?subject=unsubscribe>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Entity-Ref-ID": lead.id,
    },
  });
}

export function previewEmailTemplate(
  lead: { id: string; name: string; branch: string; city: string; websiteStatus: string; websiteQualityTier: string; emailSentAt?: string },
  type: "cold" | "followup"
): EmailTemplate {
  const daysSince = type === "followup" && lead.emailSentAt
    ? Math.round((Date.now() - new Date(lead.emailSentAt).getTime()) / (1000 * 60 * 60 * 24))
    : 7;
  return getEmailTemplate(lead.branch, type, {
    leadId: lead.id,
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
    websiteStatus: lead.websiteStatus,
    websiteQualityTier: lead.websiteQualityTier,
    daysSince,
  });
}
