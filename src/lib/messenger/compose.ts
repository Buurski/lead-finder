// messenger/compose.ts — branch→demo routing + the Messenger DM drafts. Ported
// 1:1 from the live local digest script so in-app drafts match what's been sent.
// Pure + deterministic. Humble "hobby salgselev" tone, branch-matched demo link,
// no price/kr, no hard CTA, ends "Mvh, Lucas".

export type MsgGroup = "beauty" | "food" | "photo" | "craftUtility" | "craft" | "service";

// The specific deployed demo sites the digest links to (kept identical so the
// branch→demo mapping is consistent with prior outreach).
const DEMO_URLS = {
  beautyBarber: "https://streetcut.vercel.app/",
  beautySalon: "https://salon-artec.vercel.app/Salon%20Artec.html",
  foodInter: "https://zaytoon-six.vercel.app/",
  foodCafe: "https://under-klippen.vercel.app/",
  photo: "https://buurfoto.vercel.app/",
  craftUtility: "https://ktvvs.vercel.app/",
  craft: "https://denlillemaler.vercel.app/",
  service: "https://vestfjends.vercel.app/",
};

export function branchGroupFor(branch: string, name: string): MsgGroup {
  const b = `${branch || ""} ${name || ""}`.toLowerCase();
  if (/frisør|skønhed|hud|negle|nail|barber|kosmet|salon|hår|hair|wellness|spa|massage|solcenter/.test(b)) return "beauty";
  if (/restaurant|café|cafe|kaffe|pizza|pizzeria|bistro|brasseri|gastropub|\bbar\b|grill|sushi|kebab|burger|kro|spise|wok|thai|kinesisk|tyrk|indisk|mexicansk|shawarma|falafel|libanon|bager|pub|kiosk|takeaway|cafeteria|fastfood/.test(b)) return "food";
  if (/foto|photo|photograph/.test(b)) return "photo";
  if (/vvs|elektri|blik|smed|mekan/.test(b)) return "craftUtility";
  if (/mal\b|maler|tøm|tømrer|mur|murer|tag|håndværk|carpenter|painter/.test(b)) return "craft";
  return "service";
}

export function demoUrlFor(group: MsgGroup, branch: string, name: string): string {
  const b = `${branch || ""} ${name || ""}`.toLowerCase();
  if (group === "beauty") return /barber|herrefr/.test(b) ? DEMO_URLS.beautyBarber : DEMO_URLS.beautySalon;
  if (group === "food") {
    if (/café|cafe|kaffe/.test(b)) return DEMO_URLS.foodCafe;
    return /pizza|sushi|kebab|grill|wok|thai|kinesisk|tyrk|libanon|indisk|mexicansk|shawarma|falafel/.test(b)
      ? DEMO_URLS.foodInter : DEMO_URLS.foodCafe;
  }
  if (group === "photo") return DEMO_URLS.photo;
  if (group === "craftUtility") return DEMO_URLS.craftUtility;
  if (group === "craft") return DEMO_URLS.craft;
  return DEMO_URLS.service;
}

export function branchDisplayFor(group: MsgGroup, branch: string, name: string): string {
  const b = `${branch || ""} ${name || ""}`.toLowerCase();
  if (group === "beauty") {
    if (/barber/.test(b)) return "barbersalon";
    if (/negl|nail/.test(b)) return "negleklinik";
    if (/hud|spa|kosmet/.test(b)) return "hudklinik";
    return "frisørsalon";
  }
  if (group === "food") {
    if (/pizza/.test(b)) return "pizzeria";
    if (/café|cafe|kaffe/.test(b)) return "café";
    if (/bager/.test(b)) return "bageri";
    if (/pub|brasseri/.test(b)) return "pub";
    if (/kiosk/.test(b)) return "kiosk";
    if (/grill|fastfood/.test(b)) return "grillbar";
    if (/bar\b/.test(b)) return "bar";
    return "restaurant";
  }
  if (group === "photo") return "fotograf";
  if (group === "craftUtility") {
    if (/vvs/.test(b)) return "VVS-firma";
    if (/elek/.test(b)) return "elektriker";
    return "håndværker";
  }
  if (group === "craft") {
    if (/mal/.test(b)) return "maler";
    if (/tøm/.test(b)) return "tømrer";
    if (/mur/.test(b)) return "murer";
    if (/tag/.test(b)) return "tagdækker";
    return "håndværker";
  }
  return "lokal virksomhed";
}

function patternA(reviews: number, branchDisp: string, demoUrl: string): string {
  return `Hej! Så lige jeres FB-side med ${reviews} anmeldelser — det er ikke noget der bare sker. Lagde dog mærke til at I ikke har en rigtig hjemmeside endnu, og det er lidt synd når I har bygget så stærk en kundekreds op. Jeg laver hjemmesider ved siden af min salgselev-plads — apprentice-niveau, men med meget omhu i hver enkelt. Her er et eksempel jeg lavede til en anden ${branchDisp} — ${demoUrl}. Skriv hvis du vil se mere :)\n\nMvh, Lucas`;
}
function patternB(city: string, branchDisp: string, demoUrl: string): string {
  return `Hej! Sad og kiggede på ${city}-området, og faldt over jeres ${branchDisp} — det ser virkelig solidt ud. Bare overrasket over at der ikke ligger en rigtig hjemmeside bag, kun Facebook. Jeg laver hjemmesider ved siden af min salgselev-plads, så det er hobby-niveau, ikke pro. Her er et eksempel jeg lavede til en anden ${branchDisp} — ${demoUrl}. Helt uforpligtende selvfølgelig :)\n\nMvh, Lucas`;
}
function patternC(reviews: number, branchDisp: string, demoUrl: string): string {
  return `Hej! Hurtigt spørgsmål — jeg så jeres FB-side med ${reviews} anmeldelser, så det må give jer mange bookings. Tænkte over om I har overvejet en rigtig hjemmeside, eller om Facebook bare gør jobbet? Jeg laver dem som hobby ved siden af min salgselev-plads, så jeg er stadig under oplæring. Her er et eksempel jeg lavede til en anden ${branchDisp} — ${demoUrl}. Skriv hvis du vil se mere :)\n\nMvh, Lucas`;
}

export const MSG_PATTERNS = ["A", "B", "C"] as const;
export type MsgPattern = (typeof MSG_PATTERNS)[number];

export interface MessengerDraftInput {
  name: string;
  branch: string;
  city: string;
  reviews: number;
  pattern: MsgPattern;
}

export interface MessengerDraft {
  text: string;
  pattern: MsgPattern;
  demoUrl: string;
  branchDisp: string;
  group: MsgGroup;
}

export function buildMessengerDraft(lead: MessengerDraftInput): MessengerDraft {
  const group = branchGroupFor(lead.branch, lead.name);
  const demoUrl = demoUrlFor(group, lead.branch, lead.name);
  const branchDisp = branchDisplayFor(group, lead.branch, lead.name);
  const text =
    lead.pattern === "A" ? patternA(lead.reviews, branchDisp, demoUrl)
    : lead.pattern === "B" ? patternB(lead.city, branchDisp, demoUrl)
    : patternC(lead.reviews, branchDisp, demoUrl);
  return { text, pattern: lead.pattern, demoUrl, branchDisp, group };
}

/** Mirror of the script's validateDraft — guards tone/price/CTA/signature. */
export function validateMessengerDraft(text: string): string[] {
  const issues: string[] = [];
  if (text.length > 650) issues.push(`too long (${text.length} chars)`);
  if (/\d+\s*k(?:r|R)\b|\d+\.\d{3}\s*kr|alt\s+inklusiv|\bfra\s+\d|prisvenlig/.test(text)) issues.push("contains price/kr");
  if (/skriv\s+bare|send\s+(?:mig\s+)?mockup|svar\s+ja|\b200\+\s*kund/i.test(text)) issues.push("hard-sell CTA");
  if (!text.endsWith("Mvh, Lucas")) issues.push("missing signature");
  return issues;
}
