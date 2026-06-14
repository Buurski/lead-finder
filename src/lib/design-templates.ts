// design-templates.ts — branch-level design DNA for the demo factory.
//
// One atomic template per branch family: typography, palette (OKLCH, warm and
// on-brand), the section order a strong site for that branch uses, inspiration,
// and anti-references (what makes the branch look cheap). The demo factory
// blends a template with per-customer recon to produce a personalised design.md
// and a static HTML demo. Source of truth in TS so it works on Vercel with no
// filesystem; `scripts/gen-design-docs.mjs` mirrors these to KnowledgeOS/wiki/
// design/*.md for human browsing in Memory.
//
// hexPalette mirrors the REAL sites Lucas built for each branch:
//   salon    → salon-artec        (#0c2a27 deep teal + #c9a35e gold)
//   hudpleje → vida               (#eae2d2 warm sand + #26170e dark brown)
//   vvs      → kt-vvs             (#1a3a5c navy + #ff8a7d coral)
//   foto     → buur-foto          (#f3eee5 cream + #9a7e4a muted gold)
//   advokat  → midtadvokaterne    (#1A2B45 navy + #C4973A amber)
//   restaurant → under-klippen   (#1a1208 warm brown + #c8a87a warm gold)
//   frisor   → street-cut         (#EFE8DA bone + #142235 navy)

export interface DesignTemplate {
  slug: string;
  label: string;
  aliases: string[]; // matched against branch text
  layout: "gallery" | "service" | "menu" | "booking" | "clinic" | "authority";
  typography: { display: string; body: string; note: string };
  palette: { bg: string; ink: string; accent: string; accentInk: string; note: string };
  // Hex equivalents of the real site palette — embedded literally in generated HTML
  // so tests (and Lucas's eyes) can verify concrete brand colours match the real sites.
  hexPalette: { bg: string; ink: string; accent: string };
  sectionOrder: string[];
  inspiration: string[];
  antiReferences: string[];
}

export const DESIGN_TEMPLATES: DesignTemplate[] = [
  {
    // Real site: street-cut — bone + navy, EB Garamond + Inter Tight
    // Urban barber: leaner / more masculine than salon. MUST differ from salon template.
    slug: "frisor",
    label: "Frisør",
    aliases: ["frisør", "frisor", "hair", "klip", "barber", "herrefrisør"],
    layout: "booking",
    typography: {
      display: "EB Garamond",
      body: "Inter Tight",
      note: "Urban antiqua-serif + condensed grotesk. Leaner and more masculine than Salon / Artec.",
    },
    palette: {
      bg: "oklch(95% 0.01 75)",
      ink: "oklch(16% 0.04 245)",
      accent: "oklch(42% 0.06 75)",
      accentInk: "oklch(32% 0.06 75)",
      note: "Bone bg (#EFE8DA) + deep navy ink (#142235) — urban, not feminine.",
    },
    hexPalette: { bg: "#EFE8DA", ink: "#142235", accent: "#A37A4F" },
    sectionOrder: [
      "hero m. booking-CTA",
      "ydelser + prisniveau",
      "galleri (før/efter)",
      "om salonen",
      "anmeldelser",
      "find vej + åbningstider",
      "book nu",
    ],
    inspiration: ["Rene, store billeder", "Booking øverst", "Tydelig prisliste uden at virke billig"],
    antiReferences: ["Stockfoto-modeller", "Glitter/gradient-tekst", "For mange skrifttyper", "Auto-afspillende musik"],
  },
  {
    // Real site: under-klippen — warm brown #1a1208 base + cream #f5f0ea + gold #c8a87a
    // Cormorant Garamond + Outfit, img-hero, warm non-cold palette.
    slug: "restaurant",
    label: "Restaurant",
    aliases: ["restaurant", "café", "cafe", "bistro", "kro", "spise", "køkken", "takeaway", "pizza", "sushi"],
    layout: "menu",
    typography: {
      display: "Cormorant Garamond",
      body: "Outfit",
      note: "Lyrical display serif + readable Outfit. Warm atmosphere, not cold.",
    },
    palette: {
      bg: "oklch(14% 0.03 55)",
      ink: "oklch(91% 0.014 75)",
      accent: "oklch(72% 0.09 70)",
      accentInk: "oklch(58% 0.09 70)",
      note: "Warm brown/near-black bg + cream ink + gold accent — like candlelight.",
    },
    hexPalette: { bg: "#1a1208", ink: "#e7ca93", accent: "#c8a87a" },
    sectionOrder: [
      "hero m. stemningsbillede",
      "dagens / menu-uddrag",
      "book bord / bestil",
      "om stedet",
      "galleri",
      "anmeldelser",
      "find vej + åbningstider",
    ],
    inspiration: ["Store madbilleder", "Menu i ét klik", "Book-bord tydeligt"],
    antiReferences: ["PDF-menu der skal downloades", "Mørk side der skjuler maden", "Comic Sans-agtig charme"],
  },
  {
    // Real site: kt-vvs — navy #1a3a5c + coral #ff8a7d, Bricolage Grotesque + Manrope
    // (KT-VVS uses Geist/JetBrains Mono but those aren't Google Fonts; Bricolage+Manrope match the spirit)
    slug: "vvs",
    label: "VVS / el",
    aliases: ["vvs", "el-", "elektriker", "blikkenslager", "kloak", "varme", "smed"],
    layout: "service",
    typography: {
      display: "Bricolage Grotesque",
      body: "Manrope",
      note: "Constructive display grotesk + Manrope. Authority and precision.",
    },
    palette: {
      bg: "oklch(97% 0.005 230)",
      ink: "oklch(24% 0.06 240)",
      accent: "oklch(70% 0.14 22)",
      accentInk: "oklch(54% 0.14 22)",
      note: "Light grey bg + navy ink (#1a3a5c) + coral accent (#ff8a7d).",
    },
    hexPalette: { bg: "#eef2f6", ink: "#1a3a5c", accent: "#ff8a7d" },
    sectionOrder: [
      "hero m. ring-nu",
      "ydelser",
      "dækningsområde",
      "akut / vagt",
      "anmeldelser",
      "om firmaet",
      "kontakt",
    ],
    inspiration: ["Telefonnummer øverst og klikbart", "Tydeligt dækningsområde", "Autoriseret-mærker"],
    antiReferences: ["Generiske clipart-værktøjer", "Lange tekstvægge", "Skjult telefonnummer"],
  },
  {
    // Real site: salon-artec — deep teal #0c2a27 + gold #c9a35e, Cormorant Garamond + DM Sans
    // "Hårhåndværk med hjerte." Pill buttons (border-radius:999px). Dark luxurious.
    // MUST look distinct from frisor: teal+gold vs bone+navy.
    slug: "salon",
    label: "Salon / skønhed",
    aliases: ["salon", "skønhed", "skonhed", "beauty", "spa", "wax", "makeup", "kosmetolog"],
    layout: "booking",
    typography: {
      display: "Cormorant Garamond",
      body: "DM Sans",
      note: "Artistic editorial serif + clean DM Sans. Warm premium feel.",
    },
    palette: {
      bg: "oklch(17% 0.04 170)",
      ink: "oklch(92% 0.012 75)",
      accent: "oklch(71% 0.09 72)",
      accentInk: "oklch(57% 0.09 72)",
      note: "Deep teal/forest bg (#0c2a27) + cream ink + gold accent (#c9a35e). Luxurious dark.",
    },
    hexPalette: { bg: "#0c2a27", ink: "#f7f1e6", accent: "#c9a35e" },
    sectionOrder: [
      "hero m. booking",
      "om salonen",
      "behandlinger + priser",
      "galleri",
      "anmeldelser",
      "book",
    ],
    inspiration: ["Rolig, dyr følelse", "Behandlingskort med priser", "Online booking"],
    antiReferences: ["Neonpink", "Glitter", "Over-retoucherede billeder", "For meget tekst"],
  },
  {
    // Real site: vida — warm sand #eae2d2 bg + dark brown #26170e ink, Cormorant Garamond + Manrope
    // Signature: warm-only palette, oversized gallery ("Glimt fra klinikken"), storytelling pause block.
    slug: "hudpleje",
    label: "Hudpleje / klinik",
    aliases: ["hud", "hudpleje", "klinik", "negle", "fodterapi", "tatovering", "tandlæge"],
    layout: "clinic",
    typography: {
      display: "Cormorant Garamond",
      body: "Manrope",
      note: "Warm editorial serif + light Manrope. No cold tones anywhere in the palette.",
    },
    palette: {
      bg: "oklch(91% 0.016 78)",
      ink: "oklch(19% 0.04 50)",
      accent: "oklch(52% 0.07 65)",
      accentInk: "oklch(40% 0.07 65)",
      note: "Warm sand bg (#eae2d2) + dark earth ink (#26170e) + warm earth accent.",
    },
    hexPalette: { bg: "#eae2d2", ink: "#26170e", accent: "#a07a1e" },
    sectionOrder: [
      "hero m. book-tid",
      "storytelling pause",
      "team",
      "behandlingsoversigt",
      "galleri (Glimt fra klinikken)",
      "brand story",
      "kontakt",
    ],
    inspiration: ["Ro og renhed", "Tryghed (certificering)", "Tydelige behandlingsbeskrivelser"],
    antiReferences: ["Skræmmebilleder", "For klinisk/kold", "Stockfoto-hud"],
  },
  {
    // Real site: buur-foto — cream #f3eee5 bg + muted gold #9a7e4a, Cormorant Garamond + Inter
    // Signature: quiet TEXT-led hero ABOVE full-bleed gallery. Minimal chrome.
    slug: "foto",
    label: "Fotograf",
    aliases: ["fotograf", "foto", "photo", "film", "video"],
    layout: "gallery",
    typography: {
      display: "Cormorant Garamond",
      body: "Inter",
      note: "Editorial serif + neutral Inter. Gallery is the colour; type steps back.",
    },
    palette: {
      bg: "oklch(96% 0.008 80)",
      ink: "oklch(18% 0.02 75)",
      accent: "oklch(54% 0.07 72)",
      accentInk: "oklch(40% 0.07 72)",
      note: "Cream bg (#f3eee5) + warm dark ink + muted gold accent (#9a7e4a).",
    },
    hexPalette: { bg: "#f3eee5", ink: "#1c1814", accent: "#9a7e4a" },
    sectionOrder: [
      "intro (stille teksthero)",
      "fuldskærms-galleri",
      "om fotografen",
      "pakker/priser",
      "book session",
    ],
    inspiration: ["Stort, stille galleri", "Minimal krom", "Billeder i fuld bredde"],
    antiReferences: ["Vandmærker overalt", "Tunge skygger/rammer", "Slideshow med overgange"],
  },
  {
    // Real site: midtadvokaterne — navy #1A2B45 + amber #C4973A, Playfair Display + Inter
    // "Serifen bærer firmaets historie; sans-serifen bærer klarheden."
    slug: "advokat",
    label: "Advokat / revisor",
    aliases: ["advokat", "revisor", "jurist", "rådgiv", "konsulent", "ejendomsmægler"],
    layout: "authority",
    typography: {
      display: "Playfair Display",
      body: "Inter",
      note: "Authority humanist serif + clear Inter. Trust without corporate coldness.",
    },
    palette: {
      bg: "oklch(97% 0.004 90)",
      ink: "oklch(19% 0.04 250)",
      accent: "oklch(63% 0.10 72)",
      accentInk: "oklch(47% 0.10 72)",
      note: "Warm off-white bg (#F7F4EF) + deep navy ink (#1A2B45) + amber accent (#C4973A).",
    },
    hexPalette: { bg: "#F7F4EF", ink: "#1A2B45", accent: "#C4973A" },
    sectionOrder: [
      "hero m. kontakt-CTA",
      "ydelsesområder",
      "mød din rådgiver",
      "proces & priser",
      "anmeldelser/cases",
      "kontakt + book møde",
    ],
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
