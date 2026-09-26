// demos.ts — demo-website routing (brief §9). Two demos per message; pick the
// two most relevant for the branch. Strip-safe (no enums) so the node engine
// can import it. URLs mirror src/lib/email.ts DEMO_URLS.

export interface Demo {
  label: string;
  url: string;
  /** Optional matching branche-side på kinly.dk (fx /hjemmeside-til-vvs/). */
  verticalUrl?: string;
}

// SINGLE SOURCE OF TRUTH for every demo-site URL. email.ts + messenger/compose.ts
// import from here so a URL only ever changes in one place (consolidated 2026-06-06).
export const DEMO_SITES = {
  underKlippen: "https://under-klippen.vercel.app/",
  zaytoon: "https://zaytoon-six.vercel.app/",
  denlillemaler: "https://denlillemaler.vercel.app/",
  ktvvs: "https://ktvvs.vercel.app/",
  buurfoto: "https://buurfoto.vercel.app/",
  streetcut: "https://streetcut.vercel.app/",
  salonArtec: "https://salon-artec.vercel.app/Salon%20Artec.html",
  // VIDA reference-projekt ligger på eget domæne siden 2026-06-17.
  vida: "https://vida-klinik.dk/",
  // Ikast AutoService — reel kunde på eget domæne (autoværksted), live 2026-07-07.
  ikastAutoservice: "https://ikastautoservice.dk/",
  vestfjends: "https://vestfjends.vercel.app/",
  midtadvokaterne: "https://midtadvokaterne-dttc.vercel.app/",
  // Rigtige kinly.dk case-sider (reelle kunder) — stærkere social proof end en
  // demo. Verificeret live i kinly.dk/sitemap.xml (2026-09-02).
  vidaCase: "https://kinly.dk/case/vida-klinik/",
  ikastCase: "https://kinly.dk/case/ikast-autoservice/",
  jernbanecafeenCase: "https://kinly.dk/case/jernbanecafeen/",
  lejEnKokCase: "https://kinly.dk/case/lej-en-kok/",
  // KT VVS-casen er live: 200 + i kinly.dk/sitemap.xml (verificeret med curl 26/9).
  ktvvsCase: "https://kinly.dk/case/kt-vvs/",
} as const;

const D = {
  underKlippen: { label: "Café / dansk", url: DEMO_SITES.underKlippen },
  zaytoon: { label: "Restaurant / takeaway", url: DEMO_SITES.zaytoon },
  denlillemaler: { label: "Maler / håndværk", url: DEMO_SITES.denlillemaler },
  ktvvs: { label: "VVS / el", url: DEMO_SITES.ktvvs },
  buurfoto: { label: "Fotograf", url: DEMO_SITES.buurfoto },
  streetcut: { label: "Barber", url: DEMO_SITES.streetcut },
  salonArtec: { label: "Salon / skønhed", url: DEMO_SITES.salonArtec },
  vida: { label: "Skønhedsklinik", url: DEMO_SITES.vida },
  ikastAutoservice: { label: "Autoværksted", url: DEMO_SITES.ikastAutoservice },
  vestfjends: { label: "Service / lokal", url: DEMO_SITES.vestfjends },
  midtadvokaterne: { label: "Advokat / rådgivning", url: DEMO_SITES.midtadvokaterne },
  vidaCase: { label: "Kunde: VIDA Klinik (skønhedsklinik)", url: DEMO_SITES.vidaCase },
  ikastCase: { label: "Kunde: Ikast AutoService (autoværksted)", url: DEMO_SITES.ikastCase },
  jernbanecafeenCase: { label: "Kunde: Jernbanecaféen (café)", url: DEMO_SITES.jernbanecafeenCase },
  lejEnKokCase: { label: "Kunde: Lej en Kok (catering/mad)", url: DEMO_SITES.lejEnKokCase },
  ktvvsCase: { label: "Kunde: KT VVS (VVS/el)", url: DEMO_SITES.ktvvsCase },
} as const;

// Catalog for the Studio grid — every demo we can show a lead, tagged by the
// branch family it best represents. Read-only; the engine still routes via
// pickDemoPair below.
export interface DemoEntry extends Demo {
  branch: "mad" | "skønhed" | "håndværk" | "foto" | "service" | "professionel";
}
export const DEMO_CATALOG: DemoEntry[] = [
  { ...D.underKlippen, branch: "mad" },
  { ...D.zaytoon, branch: "mad" },
  { ...D.salonArtec, branch: "skønhed" },
  { ...D.vida, branch: "skønhed" },
  { ...D.streetcut, branch: "skønhed" },
  { ...D.denlillemaler, branch: "håndværk" },
  { ...D.ktvvs, branch: "håndværk" },
  { ...D.ikastAutoservice, branch: "håndværk" },
  { ...D.buurfoto, branch: "foto" },
  // vestfjends.vercel.app svarer 404 (verificeret 2026-09-23) — fjernet fra
  // Studio-grid'et til den er oppe igen. pickDemos() bruger den stadig som
  // fallback for service/håndværk-mails; se rapport for det spor.
  { ...D.midtadvokaterne, branch: "professionel" },
];

const FOOD_INTL =
  /pizza|pizzeria|italia|sushi|kebab|shawarma|falafel|tapas|libanon|tyrk|grill|mexicansk|wok|asia|thai|indisk|kinesisk/i;
// \bbar\b / \bpub\b are word-bounded so they don't match "barber" / "republic" —
// and BARBER/BEAUTY are tested before FOOD anyway. Covers bars, grills, pubs,
// bodegas etc. that previously fell through to the service default demo.
const FOOD = /café|cafe|restaurant|bager|konditori|spise|køkken|bistro|brasserie|kro|smørrebrød|frokost|\bbar\b|\bpub\b|grill|bodega|vinbar|diner|steakhouse|burger|pølse|fastfood|takeaway|cafeteria|værtshus|spisested/i;
const BARBER = /barber|herrefrisør|herre ?frisør|herreklip/i;
// Skønhedsklinik (hud/kosmetolog/spa/laser/botox) → Vida-demoen (klinik-look),
// adskilt fra frisør/salon → Salon Artec. Tjekkes FØR BEAUTY.
const CLINIC = /hudplej|hudklinik|kosmetolog|skønhedsklinik|skonhedsklinik|laser|botox|filler|wax|wellness|spa\b|klinik|cosmetic|aesthet|microblading|vipper|vippe|fillers/i;
const BEAUTY = /frisør|frisor|salon|skønhed|skonhed|hud|negle|kosmetolog|wax|makeup|spa|klinik|beauty|hair/i;
const PHOTO = /fotograf|foto|photo/i;
const CRAFT_UTIL = /vvs|elektriker|el-|blikkenslager|mekaniker|smed|kloak|varme/i;
// Autoværksted/bilværksted (inkl. autoskade/pladeværksted) → Ikast AutoService (reel kunde).
const AUTO = /autoværksted|autovaerksted|autoservice|bilværksted|bilvaerksted|automekanik|autoskade|pladeværksted|dækcenter|daekcenter/i;
const CRAFT = /maler|tømrer|tomrer|snedker|murer|tag|tagdækker|håndværk|entreprenør|anlæg/i;
// Service/maintenance: vinduespudser, rengøring, handyman, gartner, flytte, etc.
// Without this branch, Pro Vindues Polering and similar fell to default = wrong demos.
const SERVICE_MAINT = /vindues|vindue|polering|pudser|rengør|rengoring|cleaning|servicemand|handyman|gartner|flytte|flytning|haveservice|service mand|viceværts?|nedrivning/i;
// Professionelle rådgivere (advokat/revisor/bogholder/mægler) → midtadvokaterne.
// Bevidst UDEN fysioterapeut/tandlæge o.l. — de er medicinsk-ekskluderet ved send.
const PROFESSIONAL = /advokat|jurist|jura|revisor|revision|bogholder|regnskab|ejendomsmægler|ejendomsmaegler|mægler|maegler|rådgiv|raadgiv|forsikring|finansiel/i;

// Returns the demos that best match the lead's branch. Most branches return
// 2 demos; CLINIC (skønhedsklinik) returns a single demo (vida-klinik.dk) per
// Lucas (2026-06-23) — lead-template shows a softer "Eksempel på en hjemmeside
// for en kunde"-framing for single-demo leads. Photo also pairs with a neutral
// one for visual variety.
// Rigtige kunder linkes via kinly.dk-casesiden (Lucas 23/9), aldrig direkte til
// kundens eget domæne. VIDA-casen er altid hovedpunktet for skønhed/klinik.
// Andre demos er supplement — rækkefølgen i array er den rækkefølge de vises i.
export function pickDemos(branch: string, name: string): Demo[] {
  switch (branchKind(branch, name)) {
    case "clinic": return [D.vidaCase, D.salonArtec];
    case "barber": return [D.salonArtec, D.streetcut];
    case "beauty": return [D.vidaCase, D.salonArtec];
    case "photo": return [D.buurfoto, D.underKlippen];
    case "foodIntl": return [D.zaytoon, D.underKlippen];
    case "food": return [D.jernbanecafeenCase, D.underKlippen];
    case "professional": return [D.midtadvokaterne, D.ikastCase];
    case "auto": return [D.ikastCase, D.ktvvs];
    case "craftUtility": return [D.ktvvs, D.denlillemaler];
    case "craft": return [D.ktvvs, D.denlillemaler];
    case "service": return [D.ktvvs, D.denlillemaler];
    // vestfjends.vercel.app er død (404, 23/9) — aldrig i en mail igen.
    default: return [D.ikastCase, D.underKlippen];
  }
}

// ---- Link-politik (Lucas 24/9) -------------------------------------------
// ÉT sted der bestemmer hvilke kinly.dk-links et prospekt-udkast bærer, så et
// trin eller en kanal ikke kan glemme dem. Tre roller, bevidst adskilt:
//   front   — https://kinly.dk/ (altid med, i hvert udkast)
//   case    — ægte matchende /case/... eller null. Null = branchen har ingen
//             case, og så er svaret fail-closed: ingen falsk reference.
//   branche — /hjemmeside-til-.../ eller null.
// Aldrig kundens eget domæne (Lucas 23/9).

export const KINLY_FRONT = "https://kinly.dk/";
// URL'en må slutte her: /case/... og /hjemmeside-til-... er ikke forsiden.
const KINLY_FRONT_LINK = /https:\/\/kinly\.dk\/(?=$|[\s<)"',;!?])/;

/** Er forsiden (https://kinly.dk/) med i teksten? Case- og branche-sider tæller ikke. */
export function hasKinlyFront(text: string): boolean {
  return KINLY_FRONT_LINK.test(text);
}

/**
 * Rigtige kunders egne sider — også når de (som KT VVS) kun findes som vores
 * preview. De må kun optræde via deres kinly.dk-case (Lucas 23/9). KT VVS'
 * preview er upubliceret, så den er ikke et linkbart "demo" i et udkast: casen
 * er privacy-reviewet, det er preview-linket ikke.
 */
const CUSTOMER_SITES = new Set<string>([DEMO_SITES.ktvvs, DEMO_SITES.vida, DEMO_SITES.ikastAutoservice]);

export type BranchKind =
  | "clinic" | "barber" | "beauty" | "photo" | "foodIntl" | "food"
  | "professional" | "auto" | "craftUtility" | "craft" | "service" | "other";

/** Første led i branch-routing. Samme rækkefølge som pickDemos altid har haft. */
export function branchKind(branch: string, name = ""): BranchKind {
  const t = `${name} ${branch}`.toLowerCase();
  if (CLINIC.test(t)) return "clinic";
  if (BARBER.test(t)) return "barber";
  if (BEAUTY.test(t)) return "beauty";
  if (PHOTO.test(t)) return "photo";
  if (FOOD_INTL.test(t)) return "foodIntl";
  if (FOOD.test(t)) return "food";
  if (PROFESSIONAL.test(t)) return "professional";
  if (AUTO.test(t)) return "auto";
  if (CRAFT_UTIL.test(t)) return "craftUtility";
  if (CRAFT.test(t)) return "craft";
  if (SERVICE_MAINT.test(t)) return "service";
  return "other";
}

/** Ægte kinly.dk-case pr. branch. Mangler branchen her, findes der ingen case. */
const CASE_FOR: Partial<Record<BranchKind, { url: string; label: string }>> = {
  clinic: { url: DEMO_SITES.vidaCase, label: "VIDA Klinik" },
  beauty: { url: DEMO_SITES.vidaCase, label: "VIDA Klinik" },
  food: { url: DEMO_SITES.jernbanecafeenCase, label: "Jernbanecaféen" },
  // foodIntl er samme spisested-familie som food; kun demo-stilen er en anden
  // (zaytoon/underKlippen). Danske restauranter med udenlandsk køkken (thai,
  // sushi, pizza) får derfor samme case — præcis som suggestMailLinks allerede
  // tilbyder den for FOOD_INTL-leads.
  foodIntl: { url: DEMO_SITES.jernbanecafeenCase, label: "Jernbanecaféen" },
  auto: { url: DEMO_SITES.ikastCase, label: "Ikast AutoService" },
  // KT VVS-casen er live (verificeret 26/9). Den gamle 404-antagelse fra 25/9
  // er død; uden denne post blev VVS-kladder fejlagtigt case_missing.
  craftUtility: { url: DEMO_SITES.ktvvsCase, label: "KT VVS" },
  // craft og service har bevidst ingen case: KT VVS er VVS/el, ikke maler eller
  // rengøring. Brancher uden ægte match forbliver case_missing (fail-closed).
  // photo og barber er også uden case — der findes ingen case-side for dem.
};

// Branche-sider på kinly.dk.
const VERTICAL_FOR: Partial<Record<BranchKind, string>> = {
  clinic: "https://kinly.dk/hjemmeside-til-skoenhedsklinik/",
  barber: "https://kinly.dk/hjemmeside-til-frisoer/",
  beauty: "https://kinly.dk/hjemmeside-til-skoenhedsklinik/",
  foodIntl: "https://kinly.dk/hjemmeside-til-restaurant-cafe/",
  food: "https://kinly.dk/hjemmeside-til-restaurant-cafe/",
  auto: "https://kinly.dk/hjemmeside-til-automekaniker/",
  craftUtility: "https://kinly.dk/hjemmeside-til-vvs/",
};

export function verticalPageFor(branch: string): string | null {
  return VERTICAL_FOR[branchKind(branch)] ?? null;
}

export interface ReferenceLinks {
  front: string;
  /** null = ingen ægte matchende case for branchen. */
  caseUrl: string | null;
  caseLabel: string | null;
  verticalUrl: string | null;
  /** true når branchen ingen case har — udkastet skal flagges, ikke pyntes. */
  caseMissing: boolean;
}

export function referenceLinks(branch: string, name = ""): ReferenceLinks {
  const kind = branchKind(branch, name);
  const found = CASE_FOR[kind];
  return {
    front: KINLY_FRONT,
    caseUrl: found?.url ?? null,
    caseLabel: found?.label ?? null,
    verticalUrl: VERTICAL_FOR[kind] ?? null,
    caseMissing: !found,
  };
}

/**
 * Link-linjerne et prospekt-udkast bærer, i visnings-rækkefølge: forside → case
 * (eller bedste demo når branchen ingen case har) → branche-side. Højst 3 links;
 * flere læser som spam. Formatet "→ url" er det textToHtml linker.
 */
export function referenceLines(branch: string, name = ""): string[] {
  const l = referenceLinks(branch, name);
  // Branchens primære demo ER dens reference. Er den en rigtig kundes egen side
  // (KT VVS-previewet), linkes der ingen: en anden branches demo ville være en
  // fremmed reference. Kladden flagges i stedet — caseMissing = true.
  // Demo-slot'et er KUN til demo-sites: en kinly.dk-URL er enten forsiden, en
  // case eller en branche-side og har sin egen rolle ovenfor. Uden ægte case
  // (fx ukendt branche, hvor pickDemos falder tilbage til Ikast-casen) er svaret
  // derfor fail-closed: intet case-link, ingen fremmed reference.
  const primary = pickDemos(branch, name)[0]?.url ?? null;
  const demoFallback =
    l.caseUrl || !primary || CUSTOMER_SITES.has(primary) || primary.startsWith(KINLY_FRONT) ? null : primary;
  const urls: string[] = [];
  for (const u of [l.front, l.caseUrl ?? demoFallback, l.verticalUrl]) {
    if (u && !urls.includes(u)) urls.push(u);
  }
  return urls.map((u) => `→ ${u}`);
}

/** Overskrift til link-blokken, så hver kanal ikke opfinder sin egen. */
export const REFERENCE_INTRO = "Her kan I se min egen side og et par eksempler:";

/**
 * Prospekt-udkastets link-krav. Tom liste = ok.
 * Gælder KUN prospekt-kladder — kundesvar deler validateDraft og må ikke kræve
 * salgscases. Kræver forsiden, den matchende case (når branchen har en) og
 * branche-siden (når den findes). Mangler et af dem, er udkastet ikke sendbart.
 */
export function missingReferenceLinks(body: string, branch: string, name = ""): string[] {
  const l = referenceLinks(branch, name);
  const issues: string[] = [];
  if (!hasKinlyFront(body)) issues.push(`mangler kinly.dk-forside (${l.front})`);
  if (l.caseUrl && !body.includes(l.caseUrl)) issues.push(`mangler case-link (${l.caseUrl})`);
  if (l.verticalUrl && !body.includes(l.verticalUrl)) issues.push(`mangler branche-side (${l.verticalUrl})`);
  return issues;
}

export interface ReferenceFix {
  body: string;
  /** De URL'er der blev tilføjet. Tom = kroppen havde dem alle i forvejen. */
  added: string[];
  /** true = branchen har ingen case; udkastet skal flagges, ikke pyntes. */
  caseMissing: boolean;
}

/**
 * Tilføjer de manglende link-linjer til en færdig prospekt-tekst. Bruges af
 * legacy-skabelonerne (email.ts) og af backfill af gamle kladder, så de følger
 * præcis samme politik som de nye udkast. Rører ikke teksten hvis intet mangler.
 */
export function withReferenceLinks(text: string, branch: string, name = ""): ReferenceFix {
  const l = referenceLinks(branch, name);
  const links = referenceLines(branch, name).map((line) => line.slice(2));
  const added = links.filter((u) => !(u === l.front ? hasKinlyFront(text) : text.includes(u)));
  if (added.length === 0) return { body: text, added: [], caseMissing: l.caseMissing };
  const block = [REFERENCE_INTRO, ...added.map((u) => `→ ${u}`)].join("\n");
  return { body: `${text.replace(/\s+$/, "")}\n\n${block}`, added, caseMissing: l.caseMissing };
}

// ---- Links i kolde mails (Lucas 23/9) ----------------------------------------
// Valgbare links i godkendelsen: kinly.dk-cases (rigtige kunder) først, så
// kinly.dk-branchesider, så levende demoer. Kun sider der svarer 200 (tjekket
// 23/9) — døde demoer (vestfjends) og kundernes egne domæner er med vilje ude.
export interface MailLink extends Demo {
  group: "Kinly-cases" | "Kinly-branchesider" | "Demoer";
}

export const MAIL_LINKS: MailLink[] = [
  { group: "Kinly-cases", ...D.vidaCase },
  { group: "Kinly-cases", ...D.ikastCase },
  { group: "Kinly-cases", ...D.jernbanecafeenCase },
  { group: "Kinly-cases", ...D.lejEnKokCase },
  { group: "Kinly-cases", ...D.ktvvsCase },
  { group: "Kinly-cases", label: "Alle projekter på kinly.dk", url: "https://kinly.dk/projekter/" },
  { group: "Kinly-branchesider", label: "Hjemmeside til skønhedsklinik", url: "https://kinly.dk/hjemmeside-til-skoenhedsklinik/" },
  { group: "Kinly-branchesider", label: "Hjemmeside til frisør", url: "https://kinly.dk/hjemmeside-til-frisoer/" },
  { group: "Kinly-branchesider", label: "Hjemmeside til restaurant/café", url: "https://kinly.dk/hjemmeside-til-restaurant-cafe/" },
  { group: "Kinly-branchesider", label: "Hjemmeside til VVS", url: "https://kinly.dk/hjemmeside-til-vvs/" },
  { group: "Kinly-branchesider", label: "Hjemmeside til automekaniker", url: "https://kinly.dk/hjemmeside-til-automekaniker/" },
  { group: "Demoer", ...D.underKlippen },
  { group: "Demoer", ...D.zaytoon },
  { group: "Demoer", ...D.salonArtec },
  { group: "Demoer", ...D.streetcut },
  { group: "Demoer", ...D.ktvvs },
  { group: "Demoer", ...D.denlillemaler },
  { group: "Demoer", ...D.buurfoto },
  { group: "Demoer", ...D.midtadvokaterne },
];

/** De bedste links til netop denne virksomhed, bedst først (max n): branchens
 *  demo-par, branchesiden, en passende case, og projektoversigten som fallback. */
export function suggestMailLinks(branch: string, name: string, n = 5): MailLink[] {
  const byUrl = new Map(MAIL_LINKS.map((l) => [l.url, l]));
  const t = `${name} ${branch}`.toLowerCase();
  const urls: string[] = [...pickDemos(branch, name).map((d) => d.url)];
  const vertical = verticalPageFor(`${branch} ${name}`);
  if (vertical) urls.push(vertical);
  if (FOOD.test(t) || FOOD_INTL.test(t)) urls.push(DEMO_SITES.jernbanecafeenCase, DEMO_SITES.lejEnKokCase);
  else if (CLINIC.test(t) || BEAUTY.test(t) || BARBER.test(t)) urls.push(DEMO_SITES.vidaCase);
  // VVS/el: casen er nu obligatorisk i kladden (CASE_FOR.craftUtility), så den
  // skal også kunne vælges/reparieres herfra — ellers kan gaten ikke lukkes i UI'et.
  // !AUTO: "mekaniker" rammer også automekanikere, men de routes til auto og har
  // Ikast-casen som deres (branchKind tjekker AUTO før CRAFT_UTIL).
  else if (CRAFT_UTIL.test(t) && !AUTO.test(t)) urls.push(DEMO_SITES.ktvvsCase);
  else urls.push(DEMO_SITES.ikastCase, DEMO_SITES.vidaCase);
  urls.push("https://kinly.dk/projekter/");
  const out: MailLink[] = [];
  for (const u of urls) {
    const l = byUrl.get(u);
    if (l && !out.includes(l)) out.push(l);
    if (out.length >= n) break;
  }
  return out;
}
