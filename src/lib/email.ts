import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
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

const DEMO_URLS = {
  food: [
    "https://under-klippen.vercel.app/",
    "https://zaytoon-six.vercel.app/",
  ],
  craft: "https://denlillemaler.vercel.app/",
  craftUtility: "https://ktvvs.vercel.app/",
  photo: "https://buurfoto.vercel.app/",
  gallery: "https://buurfoto.vercel.app/",
  professional: "https://midtadvokaterne-dttc.vercel.app/",
} as const;

// vvs/elektriker/blikkenslager/mekaniker/smed get the ktvvs demo.
// tomrer/snedker/maler/murermester/tagdaekker get the denlillemaler demo.
const CRAFT_UTILITY_KEYWORDS = ["vvs", "elektriker", "blikkenslager", "mekaniker", "smed"];

function pickCraftDemo(branchOrName: string): string {
  const b = branchOrName.toLowerCase();
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
  fysioterap: "professional",   // catches both "fysioterapeut" og "fysioterapi"
  tand: "professional",         // catches "tandlæge" and "tandklinik"
  optiker: "professional", kiropraktor: "professional", apotek: "professional",
  læge: "professional",         // catches "Læge", "Lægeklinik", "Lægehus"
  psykolog: "professional",
  // Food — broader catches for Google Places categories
  restaurant: "food", café: "food", cafe: "food", bistro: "food", sushi: "food",
  kaffebar: "food", pizzeria: "food", burger: "food", smørrebrød: "food",
  // Additional food branches seen in Google Places
  gastropub: "food", gourmet: "food", brasseri: "food", brasserie: "food",
  pizza: "food", grill: "food", spisested: "food", spisehus: "food",
  bar: "food", vinbar: "food", catering: "food", selskabslokale: "food",
  asiat: "food", takeaway: "food",
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
  for (const [key, group] of Object.entries(BRANCH_GROUP_MAP)) {
    if (normalized.includes(key)) return group;
  }
  return "craft";
}

// Name-keyword overrides — checked FIRST because Google Places branch fields are
// often wrong (e.g. "Pasfoto Holstebro" is classified as "Tjenester", "Münchow Foto"
// as "Elektronikbutik"). When the lead name strongly implies a category, trust
// the name over the branch field. Only fall back to getBranchGroup() if the name
// doesn't disambiguate.
const NAME_OVERRIDES: Array<[RegExp, string]> = [
  // Photographers — strongest signal in the name (very few false positives)
  [/foto|photo|fotograf/i, "photo"],
  // Professional services
  [/advokat/i, "professional"],
  [/fysioterap|fysioklinik|fysklinik|fysio-fat|fysio\.dk/i, "professional"],
  [/kiropraktor/i, "professional"],
  [/manuel terapi|zoneterapi/i, "professional"],
  [/tandlæge|tandklinik|tandlægeklinik/i, "professional"],
  [/optiker/i, "professional"],
  [/psykolog/i, "professional"],
  [/lægeklinik|lægehus|læge center/i, "professional"],
  // Craft / håndværk
  [/\bvvs\b|blikkenslager/i, "craft"],
  [/\bmaler\b|malerfirma/i, "craft"],
  [/tømrer|snedker\b|murer/i, "craft"],
  [/elinstallat|elektrik/i, "craft"],
  // Food
  [/restaurant|ristorante|trattoria|osteria|caf[eé]\b|kaffebar|pizzeria|pizza\b|bistro|sushi|smørrebrød|spise|catering|gastropub|gourmet|brasseri|brasserie|kro\b|kroen|gastrobar|burger\b|grill\b|cocktail|wine bar|vinbar|tapas|bagel|kantine/i, "food"],
  // Gallery
  [/\bgalleri\b|kunstgalleri/i, "gallery"],
  // Beauty (name-based — branch-based usually handles this fine)
  [/frisørsalon|barbershop|barbersalon|negleklinik|hudpleje\b/i, "beauty"],
];

// Picks the template group using NAME first, then BRANCH as fallback.
// This fixes cases where Google Places assigns a generic branch like
// "Tjenester" or "Elektronikbutik" that doesn't match the actual business type.
function pickGroup(name: string, branch: string): string {
  const n = (name || "").toLowerCase();
  for (const [pattern, group] of NAME_OVERRIDES) {
    if (pattern.test(n)) return group;
  }
  return getBranchGroup(branch);
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
  trackingPixelUrl: string;
  websiteStatus: string;      // "none" | "dead" | "old" | "ok"
  websiteQualityTier: string; // "modern" | "mediocre" | "old" | "dead" | ""
  daysSince: number;
}

function buildHtml(body: string, trackingPixelUrl: string): string {
  return `<!DOCTYPE html>
<html><body style="font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.6; max-width: 520px;">
${body}
${UNSUBSCRIBE_HTML}
<br><br>
<img src="${trackingPixelUrl}" width="1" height="1" style="display:none;" />
</body></html>`;
}

function websiteLine(v: TemplateVars): string {
  if (v.websiteStatus === "none")
    return "Jeg kan se I ikke har en hjemmeside endnu — der ligger måske noget potentiale gemt der.";
  if (v.websiteQualityTier === "dead" || v.websiteStatus === "dead")
    return "Jeg kiggede forbi jeres hjemmeside — der ser ud til at være nogle tekniske udfordringer på den. Ærgerligt, fordi jeres arbejde sagtens fortjener bedre online.";
  if (v.websiteQualityTier === "old" || v.websiteStatus === "old")
    return "Jeg kiggede forbi jeres hjemmeside — den fungerer, men den er nok et par år bagud designmæssigt. En frisk version kunne fremhæve jer endnu bedre.";
  if (v.websiteQualityTier === "mediocre")
    return "Jeg kiggede forbi jeres hjemmeside — den fungerer fint, men jeg tænker I fortjener et førstehåndsindtryk online der matcher kvaliteten af jeres arbejde.";
  return "Jeg kiggede forbi jeres hjemmeside — den fungerer, men der kunne være endnu mere at hente ud af den.";
}

// Warm opener — compliments the business before any critique
function complimentLine(group: string, name: string, city: string): string {
  switch (group) {
    case "food":
      return "Jeg er stødt på " + name + " i " + city + " — det ser ud som et sted folk virkelig kommer for stemningen.";
    case "craft":
      return name + " ser ud til at have et solidt ry i " + city + " — det er tydeligt I står for kvalitetsarbejde.";
    case "beauty":
      return name + " ser ud til at have bygget noget særligt op i " + city + ".";
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
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const demos = pickFoodDemoOrder(v.name, v.branch);
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden. Jeg har faktisk tænkt lidt videre over hvordan en hjemmeside kunne se ud specifikt til ${v.name} — stemningen, jeres menu, farverne.

Demoerne til inspiration ligger her:
→ ${demos.primary}
→ ${demos.secondary}

Hvis I er nysgerrige, kan jeg lave en hurtig mockup med jeres egne billeder og farver — helt uforpligtende. Skriv bare "ja" eller "send mockup" tilbage.

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
<p>Hvis I er nysgerrige, kan jeg lave en hurtig mockup med jeres egne billeder og farver — helt uforpligtende. Skriv bare "ja" eller "send mockup" tilbage.</p>
<p>Og er det helt urealistisk lige nu, så er ét enkelt "nej tak" alt jeg har brug for — så lader jeg jer være.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
  },

  craft: {
    cold: (v) => {
      const ws = websiteLine(v);
      const compliment = complimentLine("craft", v.name, v.city);
      // For pickCraftDemo: check BOTH name and branch for vvs/elektriker keywords
      const demo = pickCraftDemo(v.name + " " + v.branch);
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
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const demo = pickCraftDemo(v.name + " " + v.branch);
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden. Jeg har faktisk overvejet hvordan en hjemmeside kunne fremhæve jeres egne projekter — det er der mange håndværkere der har god gavn af.

Demoen ligger her:
→ ${demo}

Hvis I er nysgerrige, kan jeg lave en hurtig skitse til ${v.name} med 2-3 af jeres egne projekter — helt uforpligtende. Skriv bare "ja" eller "send skitse" tilbage.

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
<p>Hvis I er nysgerrige, kan jeg lave en hurtig skitse til <strong>${v.name}</strong> med 2-3 af jeres egne projekter — helt uforpligtende. Skriv bare "ja" eller "send skitse" tilbage.</p>
<p>Og er det ikke aktuelt nu, så er ét enkelt "nej tak" alt jeg har brug for — så lader jeg jer være.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
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
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden. En fotograf-hjemmeside skal vise dit eget arbejde frem — det er det jeg gerne vil hjælpe med.

Min demo til fotografer:
→ ${DEMO_URLS.photo}

Hvis du er nysgerrig, kan jeg lave en hurtig mockup med nogle af dine egne billeder — helt uforpligtende. Skriv bare "ja" eller "send mockup" tilbage.

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
<p>Hvis du er nysgerrig, kan jeg lave en hurtig mockup med nogle af dine egne billeder — helt uforpligtende. Skriv bare "ja" eller "send mockup" tilbage.</p>
<p>Og er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
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
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden. For en virksomhed som jeres er hjemmesiden ofte det første kunder ser — og det første indtryk vejer tungt.

Demoen:
→ ${DEMO_URLS.professional}

Hvis I er nysgerrige, kan jeg lave en hurtig mockup tilpasset ${v.name} — helt uforpligtende. Skriv bare "ja" tilbage.

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
<p>Hvis I er nysgerrige, kan jeg lave en hurtig mockup tilpasset <strong>${v.name}</strong> — helt uforpligtende. Skriv bare "ja" tilbage.</p>
<p>Er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for — så respekterer jeg det.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
  },

  beauty: {
    cold: (v) => {
      const ws = websiteLine(v);
      const text = `Hej ${v.name},

${ws}

Mange søger lokale ${v.branchDisplay} online — en professionel hjemmeside er det første de ser.

Ring eller skriv hvis du vil se hvad jeg kan lave til jer.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Hjemmeside til ${v.name}?`,
        text,
        html: buildHtml(`
<p>Hej ${v.name},</p>
<p>${ws}</p>
<p>Mange søger lokale ${v.branchDisplay} online — en professionel hjemmeside er det første de ser.</p>
<p>Ring eller skriv hvis du vil se hvad jeg kan lave til jer.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
    followup: (v) => {
      const text = `Hej igen ${v.name},

Lille opfølgning på min mail fra ${v.daysSince} dage siden om en hjemmeside til jer. Tænker stadig at noget visuelt der virkelig fremhæver ${v.name} kunne gøre en forskel for jeres bookings.

Hvis I er nysgerrige, kan jeg lave en hurtig mockup specifikt til jer — helt uforpligtende. Skriv bare "ja" tilbage.

Er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for.

Lucas
+45 23 24 24 82`;
      return {
        subject: `Re: Lille idé til ${v.name}`,
        text,
        html: buildHtml(`
<p>Hej igen ${v.name},</p>
<p>Lille opfølgning på min mail fra ${v.daysSince} dage siden om en hjemmeside til jer. Tænker stadig at noget visuelt der virkelig fremhæver <strong>${v.name}</strong> kunne gøre en forskel for jeres bookings.</p>
<p>Hvis I er nysgerrige, kan jeg lave en hurtig mockup specifikt til jer — helt uforpligtende. Skriv bare "ja" tilbage.</p>
<p>Er det ikke aktuelt nu, så er ét "nej tak" alt jeg har brug for.</p>
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
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
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
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
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
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
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
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
<p>Lucas<br>+45 23 24 24 82</p>`, v.trackingPixelUrl),
      };
    },
  },
};

function getAppUrl(): string {
  if (process.env.APP_URL && !process.env.APP_URL.includes("localhost")) return process.env.APP_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.APP_URL ?? "http://localhost:3000";
}

export function buildTrackingPixelUrl(leadId: string): string {
  return `${getAppUrl()}/api/email/track/open/${leadId}`;
}

export function buildTrackedClickUrl(leadId: string, destination: string): string {
  return `${getAppUrl()}/api/email/track/click/${leadId}?url=${encodeURIComponent(destination)}`;
}

export function getEmailTemplate(
  branch: string,
  type: "cold" | "followup",
  vars: Omit<TemplateVars, "trackingPixelUrl" | "branchDisplay"> & { leadId: string }
): EmailTemplate {
  // Name-first routing: if the lead name clearly implies a category, use that.
  // Only fall back to branch-based routing when name doesn't disambiguate.
  const group = pickGroup(vars.name, branch);
  const template = TEMPLATES[group]?.[type] ?? TEMPLATES.craft[type];
  const trackingPixelUrl = buildTrackingPixelUrl(vars.leadId);
  const branchDisplay = getBranchDisplay(branch);
  const result = template({ ...vars, trackingPixelUrl, branchDisplay });
  return { ...result, text: result.text + UNSUBSCRIBE_TEXT };
}

export async function sendLeadEmail(
  lead: { id: string; name: string; branch: string; city: string; email: string; websiteStatus: string; websiteQualityTier: string; emailSentAt: string },
  type: "cold" | "followup"
): Promise<void> {
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
  await transporter.sendMail({
    from: `Lucas Buur <${process.env.GMAIL_USER}>`,
    to: lead.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
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
