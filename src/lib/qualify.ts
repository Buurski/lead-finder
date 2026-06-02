// qualify.ts — professional lead qualification (brief §6).
//
// Two layers:
//   1. A fast regex pre-filter (`hardDrop`) that rejects the obviously-wrong
//      profiles Lucas does NOT want: cheap-shop keywords and personal-first-name
//      shops ("Frisør Adnan", "Hos Jonas", "Sharwan Barbershop").
//   2. `isProfessionalEnough(lead)` — combines the hard drops with positive
//      brand/premium/establishment signals and the lead's own score/reviews/
//      website tier to decide whether this is an established business that can
//      realistically afford a 5-15k website.
//
// Kept strip-safe (no enums/namespaces/decorators) so it can be imported
// directly by the plain-node engine CLI via Node's type-stripping.

// Structural subset of Lead — avoids coupling qualify.ts to sheets.ts so the
// node engine can import this without dragging in googleapis. A real `Lead`
// (from sheets.ts) satisfies this shape.
export interface QualifyLead {
  name: string;
  branch: string;
  score: number;
  website: string;
  websiteStatus: string;
  websiteQualityTier: string;
  reviewsCount: number;
}

export interface QualifyVerdict {
  ok: boolean;
  reason: string;
}

// Branch prefixes stripped before deciding whether the residue is a bare
// personal name. "Frisør Adnan" -> "Adnan".
const BRANCH_PREFIX =
  /^(frisør|frisor|salon|saloon|barber(?:shop)?|hos|klinik(?:ken)?|herre ?frisør|dame ?frisør|hair ?by|by|studio hos)\s+/i;

// Cheap / low-budget signals — these never get targeted (brief §6 HARD DROP).
const CHEAP_KEYWORDS =
  /\b(billig|billige|quick|express|discount|hurtig|low[\s-]?cost|10\s*min|herreklip|cut\s*&\s*go|drop[\s-]?in|kun\s*\d+|\d+\s*kr\b)/i;

// Brand-name / premium markers that *rescue* a lead and signal real budget.
const BRAND_WORDS =
  /\b(studio|lounge|koncept|concept|house|huset|atelier|salonen|gallery|galleri|klinik|clinic|spa|kompagni|company|co\.?|gruppen|group|haus)\b/i;

const PREMIUM_SERVICES =
  /\b(balayage|extensions?|keratin|bryllup|bridal|makeup[\s-]?artist|make[\s-]?up|hudpleje|kosmetolog|hudterapeut|microblading|wax|behandling(?:er)?|botox|filler|laser|negletekn|spa)\b/i;

// Professional branches that, per CLAUDE.md, require a high score to be worth
// approaching at all.
const PRO_BRANCHES =
  /\b(advokat|revisor|fysioterapeut|tandlæge|tandlaege|optiker|kiropraktor|psykolog)\b/i;

const PRO_MIN_SCORE = 70;

// Common Danish given names that, when they are the *entire* residue after the
// branch prefix, mark a personal-name shop. We do not need an exhaustive list:
// the structural test (single capitalised token, optional possessive 's, no
// brand word) does most of the work; this list just hardens the obvious cases.
const COMMON_FIRST_NAMES = new Set(
  [
    "adnan", "jonas", "walid", "sharwan", "ali", "ahmed", "mohammed", "mohamed",
    "hassan", "omar", "ibrahim", "yusuf", "mehmet", "mads", "anne", "mette",
    "louise", "camilla", "sofie", "maria", "jan", "lars", "peter", "thomas",
    "michael", "martin", "henrik", "kim", "tina", "pia", "lone", "bo", "rasmus",
  ].map((n) => n.toLowerCase())
);

function stripBranchPrefix(name: string): string {
  let n = name.trim();
  // Strip possibly-repeated prefixes ("Salon Hos Jonas" -> "Jonas").
  let prev = "";
  while (prev !== n) {
    prev = n;
    n = n.replace(BRANCH_PREFIX, "").trim();
  }
  return n;
}

// Is the (prefix-stripped) residue a bare personal name with no brand marker?
function isBarePersonalName(residue: string): boolean {
  if (!residue) return false;
  // Strip a Danish possessive ("Walids" -> "Walid", "Bo's" -> "Bo").
  const tokens = residue
    .replace(/[''`]s\b/gi, "")
    .replace(/s\b/i, (m, off) => (off === residue.length - 1 ? "" : m))
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;
  if (BRAND_WORDS.test(residue)) return false;
  // One token, looks like a name (alphabetic) -> personal-name shop.
  if (tokens.length === 1) {
    const t = tokens[0].toLowerCase().replace(/[^a-zæøåüäö]/gi, "");
    if (!t) return false;
    if (COMMON_FIRST_NAMES.has(t)) return true;
    // Generic structural test: a single capitalised alphabetic word with no
    // brand marker is almost always a personal name in this dataset.
    return /^[a-zæøå]{2,}$/i.test(t);
  }
  // Two tokens that are both plausibly a person's name ("Jonas Hansen").
  if (tokens.length === 2 && tokens.every((t) => /^[A-ZÆØÅ][a-zæøå]+$/.test(t))) {
    return COMMON_FIRST_NAMES.has(tokens[0].toLowerCase());
  }
  return false;
}

// Layer 1: fast regex pre-filter. Returns the reason it should be dropped, or
// null if it survives the cheap checks.
export function hardDrop(name: string): string | null {
  if (!name || !name.trim()) return "empty name";
  if (CHEAP_KEYWORDS.test(name)) return "cheap/low-budget keyword in name";
  const residue = stripBranchPrefix(name);
  if (isBarePersonalName(residue)) return `personal-name shop ("${residue}")`;
  return null;
}

// Positive signals (used to rescue borderline establishment cases).
export function favorSignals(name: string): string[] {
  const hits: string[] = [];
  if (BRAND_WORDS.test(name)) hits.push("brand-name");
  if (PREMIUM_SERVICES.test(name)) hits.push("premium-service");
  return hits;
}

// Layer 2: full professional gate.
export function isProfessionalEnough(lead: QualifyLead): QualifyVerdict {
  const name = lead.name ?? "";

  const drop = hardDrop(name);
  const signals = favorSignals(name);

  // A hard cheap/personal drop can only be rescued by a clear brand/premium
  // signal *and* real establishment proof (reviews + decent score).
  if (drop) {
    const established = lead.reviewsCount >= 40 && lead.score >= 55;
    if (signals.length > 0 && established) {
      return {
        ok: true,
        reason: `rescued ${drop} via ${signals.join("+")} + ${lead.reviewsCount} reviews / score ${lead.score}`,
      };
    }
    return { ok: false, reason: drop };
  }

  // Professional branches need a high score to be worth the effort.
  if (PRO_BRANCHES.test(name) || PRO_BRANCHES.test(lead.branch)) {
    if (lead.score < PRO_MIN_SCORE) {
      return { ok: false, reason: `pro branch below score ${PRO_MIN_SCORE} (got ${lead.score})` };
    }
  }

  // Establishment signals: a business with real review volume and a non-modern
  // site (room to upgrade) is the sweet spot. A brand-new modern site is a poor
  // target; "modern" tier is effectively blocked elsewhere by quality bonus.
  const establishment: string[] = [];
  if (lead.reviewsCount >= 80) establishment.push(`${lead.reviewsCount} reviews`);
  else if (lead.reviewsCount >= 30) establishment.push(`${lead.reviewsCount} reviews`);
  if (lead.score >= 70) establishment.push(`score ${lead.score}`);
  if (["old", "mediocre", "dead"].includes(lead.websiteQualityTier)) {
    establishment.push(`${lead.websiteQualityTier} site (room to upgrade)`);
  }
  if (lead.websiteStatus === "none") establishment.push("no website yet");

  // Need at least some establishment proof OR a positive brand/premium signal.
  if (establishment.length === 0 && signals.length === 0) {
    return { ok: false, reason: `thin profile (score ${lead.score}, ${lead.reviewsCount} reviews, tier "${lead.websiteQualityTier}")` };
  }

  const why = [...signals, ...establishment].join(", ");
  return { ok: true, reason: why || "passes professional gate" };
}
