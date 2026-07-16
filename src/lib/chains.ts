// Trade words that indicate a local business, not the JYSK furniture chain
const JYSK_TRADE_WORDS = ["tømrer", "el ", "elteknik", "vvs", "byg", "service", "anlæg", "gartner", "rengøring", "kloak", "tagpap", "vinduespudsning", "polering", "hjemmepleje", "maler", "murer", "bogføring", "revision", "teknik", "auto", "fysio", "care"];

const CHAIN_EXACT = [
  "lidl", "aldi", "zara", "ikea", "matas", "stark", "shell", "subway",
  "bone's", "bones", "flammen", "sticks'n'sushi", "cofoco", "sunset boulevard",
  "joe & the juice", "joe and the juice", "espresso house", "baresso",
  "pizza hut", "domino's", "papa john's",
  "kfc", "taco bell", "wendy's",
];

const CHAIN_CONTAINS = [
  // Optics
  "synoptik", "profiloptik", "specsavers", "fielmann", "louis nielsen",
  // Electronics
  "elgiganten", "power electronics", "power (elektronik", "harold nyborg",
  // Fast food / cafes
  "mcdonalds", "mcdonald's", "mcdonald", "burger king", "7-eleven", "starbucks",
  "domino", "pizza king", "wingstop", "wagamama", "hereford beefstouw",
  "lagkagehuset", "riccos kaffebar", "the union kitchen",
  "sticks n sushi", "sunset blvd",
  // Grocery / retail
  "rema 1000", "bilka", "føtex", "kvickly", "normal store", "normal a/s",
  "søstrene grene", "flying tiger", "tiger stores", "h&m",
  "sportsmaster", "intersport",
  // DIY / building
  "silvan", "xl-byg", "bauhaus", "jem & fix",
  // Fuel
  "circle k", "q8 energie", "ok benzin",
  // Kitchen
  "kvik køkken",
  // Fitness
  "fitness world", "sats fitness",
  // Department stores / retail chains (salling handled separately below to avoid surname false-positives)
  "imerco",
  // Veterinary chains
  "anicura", "evidensia",
  // Professional services chains
  "deloitte", "pwc", "kpmg", "ernst & young", "bdo revision",
  // Paint stores chains
  "colorama",
  // Global commercial services
  "cbre",
  // Restaurant chains
  "pincho nation",
  // Frisør/beauty chains (2026-07-16 — listen var HELT tom for frisør-kæder)
  "zenz organic", "frisør stender", "stender frisør",
];

// Short/ambiguous tokens that must match as a whole word — substring matching
// would over-match (e.g. "coop" inside "Scoop Is", "Coop" the grocery chain is real).
const CHAIN_WORDS = ["coop"];

// Kæder hvor navnet er ét almindeligt ord — matches kun når HELE navnet er
// præcis dét ord. "PARK" (frisørkæden) må ikke ramme "Park Bio" / "Hotel
// Park" / "Restaurant Parken" (falske positive, jf. chain-detection-pitfalls).
const CHAIN_FULLNAME = ["park"];

export function isChain(name: string, extra?: string[]): boolean {
  const lower = name.toLowerCase();
  // Apostrophe-insensitive haystack: collapse straight ('), curly (’), backtick (`)
  // and acute (´) apostrophes so "Bone's" / "Bone’s" / "Bones" all match the
  // CHAIN_EXACT entry "bones". Without this the \b word-boundary match never fires
  // for the apostrophe spellings and the chain slips through (the original Bone's miss).
  const stripApos = (str: string) => str.replace(/[’'`´]/g, "");
  const norm = stripApos(lower);
  // JYSK furniture chain: match "jysk" only when NOT preceded/followed by a trade/service word
  if (/\bjysk\b/.test(lower) && !JYSK_TRADE_WORDS.some(w => lower.includes(w))) return true;
  // Netto supermarket: match "netto" as standalone word, NOT when preceded by trade words (e.g. "VVS Netto")
  if (/\bnetto\b/.test(lower) && !JYSK_TRADE_WORDS.some(w => lower.includes(w))) return true;
  // Salling department store: match "salling" only when NOT combined with trade/profession words
  if (/\bsalling\b/.test(lower) && !JYSK_TRADE_WORDS.some(w => lower.includes(w)) && !/v\/|aps|a\/s|i\/s/.test(lower)) return true;
  for (const w of CHAIN_WORDS) {
    if (new RegExp(`\\b${w}\\b`).test(norm)) return true;
  }
  if (CHAIN_FULLNAME.includes(norm.trim())) return true;
  for (const chain of CHAIN_EXACT) {
    const c = stripApos(chain.toLowerCase());
    if (new RegExp(`\\b${c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(norm)) return true;
  }
  const containsList = extra ? [...CHAIN_CONTAINS, ...extra] : CHAIN_CONTAINS;
  return containsList.some((chain) => norm.includes(stripApos(chain.toLowerCase())));
}

// High-confidence public-sector name tokens. Deliberately narrow — only tokens
// that essentially never appear in private business names or Danish street
// addresses (so "Rådhusgade" / "Caféministeriet" are NOT matched). Validated
// against all 8,459 live leads: 11 matches, 0 false positives. Used to keep
// municipalities, regional hospitals and other public bodies out of outreach.
const PUBLIC_SECTOR_NAME = /\bkommunen?\b|borgerservice|jobcenter|\br\u00e5dhuset\b|skattestyrelsen|skatteforvaltning|statsforvaltning|udbetaling danmark|regionshospital|universitetshospital|\bsygehus(et)?\b|folkebibliotek|hovedbibliotek|stadsbibliotek/i;

export function isPublicSector(name: string): boolean {
  return PUBLIC_SECTOR_NAME.test(name || "");
}
