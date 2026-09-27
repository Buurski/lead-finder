// messenger/compose.ts — branch→demo routing + the Messenger DM drafts. Ported
// 1:1 from the live local digest script so in-app drafts match what's been sent.
// Pure + deterministic. Humble "hobby salgselev" tone, branch-matched demo link,
// no price/kr, no hard CTA, ends "Mvh, Lucas".

export type MsgGroup = "beauty" | "food" | "photo" | "craftUtility" | "craft" | "service";

// Demo-site URLs from the single source of truth in demos.ts (DEMO_SITES), mapped
// to the messenger branch buckets.
import { DEMO_SITES, KINLY_FRONT, customerSiteLinks, hasKinlyFront } from "../demos.ts";

const DEMO_URLS = {
  beautyBarber: DEMO_SITES.streetcut,
  beautySalon: DEMO_SITES.salonArtec,
  beautyClinic: DEMO_SITES.vidaCase,
  foodInter: DEMO_SITES.zaytoon,
  foodCafe: DEMO_SITES.jernbanecafeenCase,
  photo: DEMO_SITES.buurfoto,
  // VVS/el: KT VVS er en rigtig kunde. DM'en linker casen på kinly.dk — aldrig
  // kundens eget preview/domæne (demos.ts#CUSTOMER_SITES, Lucas 23/9).
  craftUtility: DEMO_SITES.ktvvsCase,
  craft: DEMO_SITES.denlillemaler,
  service: DEMO_SITES.ikastCase,
};

// Massage/kropsterapi har ingen demo der ligner — Salon Artec er en frisørsalon.
// Samme greb som fitness: projektoversigten er vores eget arbejde, ikke en
// fremmed branches case. NB: samme streng står i demos.ts (D.projekter); hold
// dem i takt indtil værterne udledes fra én kilde.
const MASSAGE = /massage|kropsterapi/i;
const PROJEKTER = "https://kinly.dk/projekter/";

export function branchGroupFor(branch: string, name: string): MsgGroup {
  const b = `${branch || ""} ${name || ""}`.toLowerCase();
  // Massage har ingen egen MsgGroup; gruppen er kun intern (kvote og reservelabel
  // i select.ts/UI'et), mens demo-link og visningsnavn styres i de to næste funktioner.
  if (MASSAGE.test(b)) return "service";
  if (/frisør|skønhed|hud|negle|nail|barber|kosmet|salon|hår|hair|wellness|spa|massage|solcenter/.test(b)) return "beauty";
  if (/restaurant|café|cafe|kaffe|pizza|pizzeria|bistro|brasseri|gastropub|\bbar\b|grill|sushi|kebab|burger|kro|spise|wok|thai|kinesisk|tyrk|indisk|mexicansk|shawarma|falafel|libanon|bager|pub|kiosk|takeaway|cafeteria|fastfood/.test(b)) return "food";
  if (/foto|photo|photograph/.test(b)) return "photo";
  if (/vvs|elektri|blik|smed|mekan/.test(b)) return "craftUtility";
  if (/mal\b|maler|tøm|tømrer|mur|murer|tag|håndværk|carpenter|painter/.test(b)) return "craft";
  return "service";
}

export function demoUrlFor(group: MsgGroup, branch: string, name: string): string {
  const b = `${branch || ""} ${name || ""}`.toLowerCase();
  if (MASSAGE.test(b)) return PROJEKTER;
  if (group === "beauty") {
    if (/barber|herrefr/.test(b)) return DEMO_URLS.beautyBarber;
    // Skønhedsklinik (hud/kosmetolog/spa/laser) → Vida; frisør/salon → Salon Artec.
    if (/hudplej|hudklinik|kosmetolog|skønhedsklinik|laser|botox|filler|wax|wellness|spa\b|klinik|aesthet|microblading|vippe/.test(b)) return DEMO_URLS.beautyClinic;
    return DEMO_URLS.beautySalon;
  }
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
  if (MASSAGE.test(b)) return "massageklinik";
  if (group === "beauty") {
    if (/barber/.test(b)) return "barbersalon";
    if (/negl|nail/.test(b)) return "negleklinik";
    // "klinik" med, så visningsnavnet følger demoUrlFor's klinik-gren: en skønhedsklinik blev ellers kaldt "frisørsalon" i udkastet.
    if (/hud|spa|kosmet|klinik/.test(b)) return "hudklinik";
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

// Pattern-kroppene er UDEN underskrift — buildMessengerDraft sætter selv
// "Mvh, {afsender}" på til sidst (Bundle G: post-generation signatur-injection,
// samme princip som draft.ts). Bemærk: kroppene indeholder "salgselev" (Lucas'
// differentiator), så Messenger-drafts er Lucas-only indtil der findes
// Charlie-varianter af teksterne.
function demoClause(branchDisp: string, demoUrl: string): string {
  return demoUrl === PROJEKTER
    ? `her er noget af det jeg selv har bygget: ${demoUrl}`
    : `her er et eksempel jeg selv har bygget til en ${branchDisp}: ${demoUrl}`;
}

function patternA(reviews: number, branchDisp: string, demoUrl: string): string {
  return `Hej! Så lige jeres FB-side med ${reviews} anmeldelser. det er ikke noget der bare sker. Lagde dog mærke til at I ikke har en rigtig hjemmeside endnu, og det er lidt synd når I har bygget så stærk en kundekreds op. Jeg laver hjemmesider ved siden af min salgselev-plads, apprentice-niveau, men med meget omhu i hver enkelt. Sådan kan jeres hjemmeside se ud — ${demoClause(branchDisp, demoUrl)}. Skriv hvis du vil se mere :)`;
}
function patternB(city: string, branchDisp: string, demoUrl: string): string {
  return `Hej! Sad og kiggede på ${city}-området, og faldt over jeres ${branchDisp}. det ser virkelig solidt ud. Bare overrasket over at der ikke ligger en rigtig hjemmeside bag, kun Facebook. Jeg laver hjemmesider ved siden af min salgselev-plads, så det er hobby-niveau, ikke pro. Sådan kan jeres hjemmeside se ud — ${demoClause(branchDisp, demoUrl)}. Helt uforpligtende selvfølgelig :)`;
}
function patternC(reviews: number, branchDisp: string, demoUrl: string): string {
  return `Hej! Hurtigt spørgsmål. jeg så jeres FB-side med ${reviews} anmeldelser, så det må give jer mange bookings. Tænkte over om I har overvejet en rigtig hjemmeside, eller om Facebook bare gør jobbet? Jeg laver dem som hobby ved siden af min salgselev-plads, så jeg er stadig under oplæring. Sådan kan jeres hjemmeside se ud — ${demoClause(branchDisp, demoUrl)}. Skriv hvis du vil se mere :)`;
}

/** Signaturnavn pr. afsender. Bevidst kort fornavn for Lucas (uændret output
 *  ift. før Bundle G) og fuldt navn for Charlie, jf. formatSignature-closing. */
function messengerSignatureName(sender: "lucas" | "charlie"): string {
  return sender === "lucas" ? "Lucas" : "Charlie Nielsen";
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

export function buildMessengerDraft(
  lead: MessengerDraftInput,
  sender: "lucas" | "charlie" = "lucas",
): MessengerDraft {
  const group = branchGroupFor(lead.branch, lead.name);
  const demoUrl = demoUrlFor(group, lead.branch, lead.name);
  const branchDisp = branchDisplayFor(group, lead.branch, lead.name);
  const body =
    lead.pattern === "A" ? patternA(lead.reviews, branchDisp, demoUrl)
    : lead.pattern === "B" ? patternB(lead.city, branchDisp, demoUrl)
    : patternC(lead.reviews, branchDisp, demoUrl);
  // Link-politik (Lucas 24/9): også DM'en bærer kinly.dk-forsiden. Demo-/case-
  // linket ovenfor kommer fra DEMO_SITES (samme kilde som mail-politikken), og
  // her bruges demoUrlFor-grupperingen — DM'en er kort, så der er plads til én
  // reference ud over eksemplet.
  const text = `${body}\n\nMin egen side: ${KINLY_FRONT}\n\nMvh, ${messengerSignatureName(sender)}`;
  return { text, pattern: lead.pattern, demoUrl, branchDisp, group };
}

/** Mirror of the script's validateDraft — guards tone/price/CTA/signature/link. */
export function validateMessengerDraft(text: string, sender: "lucas" | "charlie" = "lucas"): string[] {
  const issues: string[] = [];
  if (text.length > 650) issues.push(`too long (${text.length} chars)`);
  if (/\d+\s*k(?:r|R)\b|\d+\.\d{3}\s*kr|alt\s+inklusiv|\bfra\s+\d|prisvenlig/.test(text)) issues.push("contains price/kr");
  if (/skriv\s+bare|send\s+(?:mig\s+)?mockup|svar\s+ja|\b200\+\s*kund/i.test(text)) issues.push("hard-sell CTA");
  if (!hasKinlyFront(text)) issues.push("mangler kinly.dk-link");
  // 26/9: kundens egen side må aldrig stå i en DM — kun via kinly.dk-casen.
  for (const u of customerSiteLinks(text)) issues.push(`kunde-link: ${u} — brug kinly.dk-casen`);
  if (!text.endsWith(`Mvh, ${messengerSignatureName(sender)}`)) issues.push("missing signature");
  return issues;
}
