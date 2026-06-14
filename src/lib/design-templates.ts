// design-templates.ts — branch-level design DNA for the demo factory.
//
// One atomic template per branch family: typography, palette (OKLCH, warm and
// on-brand), the section order a strong site for that branch uses, inspiration,
// and anti-references (what makes the branch look cheap). The demo factory
// blends a template with per-customer recon to produce a personalised design.md
// and a static HTML demo. Source of truth in TS so it works on Vercel with no
// filesystem; `scripts/gen-design-docs.mjs` mirrors these to KnowledgeOS/wiki/
// design/*.md for human browsing in Memory.

export interface DesignTemplate {
  slug: string;
  label: string;
  aliases: string[]; // matched against branch text
  layout: "gallery" | "service" | "menu" | "booking" | "clinic" | "authority";
  typography: { display: string; body: string; note: string };
  palette: { bg: string; ink: string; accent: string; accentInk: string; note: string };
  sectionOrder: string[];
  inspiration: string[];
  antiReferences: string[];
}

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    slug: "frisor",
    label: "Frisør",
    aliases: ["frisør", "frisor", "hair", "klip", "barber", "herrefrisør"],
    layout: "booking",
    typography: { display: "Fraunces", body: "Plus Jakarta Sans", note: "Blødt serif-display + ren grotesk. Luft, ikke larm." },
    palette: { bg: "oklch(97% 0.012 70)", ink: "oklch(24% 0.02 60)", accent: "oklch(62% 0.09 25)", accentInk: "oklch(46% 0.09 25)", note: "Varm terrakotta-accent på creme." },
    sectionOrder: ["hero m. booking-CTA", "ydelser + prisniveau", "galleri (før/efter)", "om salonen", "anmeldelser", "find vej + åbningstider", "book nu"],
    inspiration: ["Rene, store billeder", "Booking øverst", "Tydelig prisliste uden at virke billig"],
    antiReferences: ["Stockfoto-modeller", "Glitter/gradient-tekst", "For mange skrifttyper", "Auto-afspillende musik"],
  },
  {
    slug: "restaurant",
    label: "Restaurant",
    aliases: ["restaurant", "café", "cafe", "bistro", "kro", "spise", "køkken", "takeaway", "pizza", "sushi"],
    layout: "menu",
    typography: { display: "Fraunces", body: "Inter", note: "Appetitvækkende display, neutral brødtekst til menu." },
    palette: { bg: "oklch(96% 0.014 60)", ink: "oklch(22% 0.02 50)", accent: "oklch(55% 0.11 35)", accentInk: "oklch(42% 0.11 35)", note: "Dyb, varm rød/rust — mad-venlig." },
    sectionOrder: ["hero m. stemningsbillede", "dagens / menu-uddrag", "book bord / bestil", "om stedet", "galleri", "anmeldelser", "find vej + åbningstider"],
    inspiration: ["Store madbilleder", "Menu i ét klik", "Book-bord tydeligt"],
    antiReferences: ["PDF-menu der skal downloades", "Mørk side der skjuler maden", "Comic Sans-agtig charme"],
  },
  {
    slug: "vvs",
    label: "VVS / el",
    aliases: ["vvs", "el-", "elektriker", "blikkenslager", "kloak", "varme", "smed"],
    layout: "service",
    typography: { display: "Plus Jakarta Sans", body: "Inter", note: "Robust, tillidsvækkende grotesk. Ingen pynt." },
    palette: { bg: "oklch(97% 0.008 240)", ink: "oklch(24% 0.02 250)", accent: "oklch(55% 0.11 235)", accentInk: "oklch(42% 0.11 235)", note: "Rolig håndværker-blå + neutral." },
    sectionOrder: ["hero m. ring-nu", "ydelser", "dækningsområde", "akut / vagt", "anmeldelser", "om firmaet", "kontakt"],
    inspiration: ["Telefonnummer øverst og klikbart", "Tydeligt dækningsområde", "Autoriseret-mærker"],
    antiReferences: ["Generiske clipart-værktøjer", "Lange tekstvægge", "Skjult telefonnummer"],
  },
  {
    slug: "salon",
    label: "Salon / skønhed",
    aliases: ["salon", "skønhed", "skonhed", "beauty", "spa", "wax", "makeup", "kosmetolog"],
    layout: "booking",
    typography: { display: "Fraunces", body: "Plus Jakarta Sans", note: "Elegant serif + luftig grotesk." },
    palette: { bg: "oklch(97% 0.012 350)", ink: "oklch(26% 0.02 340)", accent: "oklch(64% 0.08 350)", accentInk: "oklch(48% 0.08 350)", note: "Dæmpet rosa/mauve — feminin, ikke sukkersød." },
    sectionOrder: ["hero m. booking", "behandlinger + priser", "galleri", "produkter/brands", "om", "anmeldelser", "book"],
    inspiration: ["Rolig, dyr følelse", "Behandlingskort med priser", "Online booking"],
    antiReferences: ["Neonpink", "Glitter", "Over-retoucherede billeder", "For meget tekst"],
  },
  {
    slug: "hudpleje",
    label: "Hudpleje / klinik",
    aliases: ["hud", "hudpleje", "klinik", "negle", "fodterapi", "tatovering", "tandlæge"],
    layout: "clinic",
    typography: { display: "Fraunces", body: "Inter", note: "Klinisk-rolig: serif-tillid + neutral brødtekst." },
    palette: { bg: "oklch(98% 0.008 180)", ink: "oklch(24% 0.02 200)", accent: "oklch(58% 0.07 180)", accentInk: "oklch(44% 0.07 180)", note: "Klar, ren teal/grøn — hygiejne-signal uden at være kold." },
    sectionOrder: ["hero m. book-tid", "behandlinger", "før/efter", "om behandleren", "tryghed/certificering", "anmeldelser", "kontakt"],
    inspiration: ["Ro og renhed", "Tryghed (certificering)", "Tydelige behandlingsbeskrivelser"],
    antiReferences: ["Skræmmebilleder", "For klinisk/kold", "Stockfoto-hud"],
  },
  {
    slug: "foto",
    label: "Fotograf",
    aliases: ["fotograf", "foto", "photo", "film", "video"],
    layout: "gallery",
    typography: { display: "Fraunces", body: "Plus Jakarta Sans", note: "Lad billederne tale; typografi træder tilbage." },
    palette: { bg: "oklch(98% 0.004 90)", ink: "oklch(20% 0.01 90)", accent: "oklch(50% 0.02 90)", accentInk: "oklch(34% 0.02 90)", note: "Næsten neutral — galleriet er farven." },
    sectionOrder: ["fuldskærms-galleri", "om fotografen", "pakker/priser", "proces", "anmeldelser", "book session"],
    inspiration: ["Stort, stille galleri", "Minimal krom", "Billeder i fuld bredde"],
    antiReferences: ["Vandmærker overalt", "Tunge skygger/rammer", "Slideshow med overgange"],
  },
  {
    slug: "advokat",
    label: "Advokat / revisor",
    aliases: ["advokat", "revisor", "jurist", "rådgiv", "konsulent", "ejendomsmægler"],
    layout: "authority",
    typography: { display: "Fraunces", body: "Inter", note: "Seriøs serif + læsbar grotesk. Autoritet uden corporate-kulde." },
    palette: { bg: "oklch(97% 0.006 250)", ink: "oklch(22% 0.02 260)", accent: "oklch(45% 0.07 250)", accentInk: "oklch(36% 0.07 250)", note: "Dæmpet navy — troværdig, ikke kold." },
    sectionOrder: ["hero m. kontakt-CTA", "ydelsesområder", "om / profil", "proces & priser", "anmeldelser/cases", "kontakt + book møde"],
    inspiration: ["Klar specialisering", "Personlig profil (ikke ansigtsløs)", "Tydelig kontakt"],
    antiReferences: ["Stockfoto-håndtryk", "Jura-jargon", "Grå corporate-kedsomhed"],
  },
];

export function templateForBranch(branch: string): DesignTemplate {
  const t = (branch || "").toLowerCase();
  for (const tpl of DESIGN_TEMPLATES) {
    if (tpl.aliases.some((a) => t.includes(a))) return tpl;
  }
  return DESIGN_TEMPLATES[0]; // sensible default (frisør) — warm + generic enough
}

export function templateBySlug(slug: string): DesignTemplate | undefined {
  return DESIGN_TEMPLATES.find((t) => t.slug === slug);
}
