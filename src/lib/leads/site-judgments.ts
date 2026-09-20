// site-judgments.ts — the 7 Jev questions we ask about a prospect's homepage,
// and the deterministic "attractiveness" score built on top of the answers.
//
// Jev only judges; this file owns the policy. Weights are code, not model
// output, so Lucas can change a weight without re-running inference
// (council 2026-09-20). Questions are copied verbatim from the validated
// shadow harness (Workflows/jev-shadow/t3_sites.py, T3: sheet tier "old"
// scored 2.32 vs "modern" 1.60 on `redesign` without seeing the tier).
//
// PURE where possible: `attractiveness()` has no I/O so it is unit-testable.

import type { JevAnswers, JevQuestion } from "../jev.ts";
import { choice, noul, score } from "../jev.ts";
import type { PageText } from "../fetch-page.ts";

export const SITE_QUESTIONS: Record<string, JevQuestion> = {
  redesign: {
    type: "score",
    instructions:
      "Ud fra `forside_tekst` og `teknisk`: hvor meget trænger hjemmesiden til et redesign? Bemærk: manglende viewport-meta og gamle copyright-år er stærke tekniske signaler.",
    criteria: [
      "Moderne, ingen handling nødvendig",
      "Mindre poleringer",
      "Tydeligt dateret, kunde bør kontaktes",
      "Kritisk forældet eller næsten tom, oplagt salgsmulighed",
    ],
  },
  cta: {
    type: "score",
    instructions: "Hvor tydelig er handlingsopfordringen (ring, book, få tilbud) i `forside_tekst`?",
    criteria: ["Ingen synlig handling", "Handling findes men gemt/uklar", "Én tydelig handling", "Flere tydelige handlinger med hierarki"],
  },
  lokal: {
    type: "noul",
    instructions: "Nævner `forside_tekst` en konkret by eller et lokalområde firmaet betjener?",
  },
  dateret_sprog: {
    type: "noul",
    instructions:
      "Lyder `forside_tekst` dateret (fx 'Velkommen til vores hjemmeside', 'Klik her', lange selvcentrerede afsnit) frem for moderne og kundefokuseret?",
  },
  online_booking: {
    type: "noul",
    instructions: "Kan kunder booke tid eller bestille online direkte på siden, ud fra `forside_tekst` og `teknisk.booking_keyword_found`?",
  },
  eeat: {
    type: "choice",
    instructions: "Hvilke troværdighedssignaler viser `forside_tekst`?",
    criteria: {
      ingen: "Ingen synlige signaler",
      kontakt: "Kun kontaktinfo/adresse",
      navn_og_kontakt: "Ejer/medarbejdere navngivet + kontakt",
      fuld: "Navngivet + anmeldelser/cases/certificeringer/år i branchen",
    },
  },
  budget_signal: {
    type: "choice",
    instructions: "Hvilket budget-segment signalerer firmaet for en ny hjemmeside til 5-15.000 kr?",
    criteria: {
      lavt: "Enkeltmand, discount, hobby",
      middel: "Etableret lille firma",
      hoejt: "Flere ansatte, A/S/ApS, certificeringer, premium",
    },
  },
  // Lucas 2026-09-20: "Alchemist (Michelin) got 72 — that is not who we go after."
  // Size/prestige is a separate judgment from budget: a big brand has budget
  // but is not a Kinly customer.
  virksomhedstype: {
    type: "choice",
    instructions:
      "Hvilken type virksomhed er `firma` ud fra `forside_tekst` og `teknisk`? Vurdér størrelse og rækkevidde, ikke kvalitet.",
    criteria: {
      lokal_ejerledet: "Én adresse, ejer/indehaver synlig, kunder fra nærområdet, 1-15 ansatte",
      regional_flere_afdelinger: "Flere afdelinger/byer eller 15-50 ansatte, men stadig dansk mellemstor",
      stor_eller_landskendt: "Landsdækkende, kæde, koncern, A/S med mange ansatte, internationalt kendt brand, Michelin/awards på nationalt niveau, børsnoteret",
      offentlig_eller_forening: "Kommune, region, forening, uddannelse, NGO",
    },
  },
  ligner_kinlys_kunder: {
    type: "noul",
    instructions:
      "Ligner `firma` Kinlys typiske kunde? Kinly sælger kodede hjemmesider til 4-15.000 kr til små lokale ejerledede virksomheder i Danmark: frisører, klinikker, håndværkere, restauranter/caféer, små servicefirmaer. Ikke til kæder, koncerner, landskendte brands, offentlige eller virksomheder med egen marketingafdeling.",
    criteria: {
      true: "Lille lokal ejerledet forretning der selv beslutter og betaler for en hjemmeside",
      false: "For stor, for kendt, offentlig, eller har tydeligt bureau/marketingafdeling bag sig",
    },
  },
};

/** Below this the page was probably JavaScript-rendered and Jev would judge an empty shell. */
export const MIN_WORDS_FOR_JUDGMENT = 120;

/** State sent to Jev. Text is already redacted + capped by fetch-page.ts. */
export function siteState(page: PageText, lead: { name: string; branch: string }) {
  return {
    firma: lead.name,
    branche: lead.branch || "(ukendt)",
    teknisk: {
      title: page.title,
      has_viewport_meta: page.hasViewportMeta,
      https: page.https,
      generator: page.generator,
      booking_keyword_found: page.bookingKeywordFound,
      copyright_years: page.copyrightYears,
      word_count: page.wordCount,
    },
    forside_tekst: page.text,
  };
}

export interface SiteJudgment {
  redesign: number; // 0..3
  cta: number; // 0..3
  lokal: number; // P(yes)
  dateretSprog: number; // P(yes)
  onlineBooking: number; // P(yes)
  eeat: string;
  eeatConfidence: number;
  budget: "lavt" | "middel" | "hoejt" | "ukendt";
  budgetConfidence: number;
  virksomhedstype: "lokal_ejerledet" | "regional_flere_afdelinger" | "stor_eller_landskendt" | "offentlig_eller_forening" | "ukendt";
  virksomhedstypeConfidence: number;
  lignerKunde: number; // P(yes)
}

const EEAT_KEYS = new Set(Object.keys(SITE_QUESTIONS.eeat.criteria as Record<string, unknown>));
const BUDGET_KEYS = new Set(Object.keys(SITE_QUESTIONS.budget_signal.criteria as Record<string, unknown>));
const TYPE_KEYS = new Set(Object.keys(SITE_QUESTIONS.virksomhedstype.criteria as Record<string, unknown>));
const inRange = (v: number | undefined, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

/**
 * Null when any required answer is missing or out of range (Codex JEV-006):
 * Scores must sit on the declared 0..3 level scale, Nouls in 0..1, and Choice
 * values must be one of the declared option keys. Typed output guarantees the
 * shape, not that a proxy or a model change kept the ranges.
 */
export function toJudgment(a: JevAnswers | undefined): SiteJudgment | null {
  const redesign = score(a, "redesign");
  const cta = score(a, "cta");
  const lokal = noul(a, "lokal");
  const dateret = noul(a, "dateret_sprog");
  const booking = noul(a, "online_booking");
  const eeat = choice(a, "eeat");
  const budget = choice(a, "budget_signal");
  const vtype = choice(a, "virksomhedstype");
  const ligner = noul(a, "ligner_kinlys_kunder");
  if (!inRange(redesign, 3) || !inRange(cta, 3) || !inRange(lokal, 1) || !inRange(dateret, 1) || !inRange(booking, 1) || !inRange(ligner, 1)) return null;
  if (!eeat || !budget || !vtype || !EEAT_KEYS.has(eeat.choice) || !BUDGET_KEYS.has(budget.choice) || !TYPE_KEYS.has(vtype.choice)) return null;
  const b = budget.choice;
  const t = vtype.choice as SiteJudgment["virksomhedstype"];
  return {
    virksomhedstype: t,
    virksomhedstypeConfidence: vtype.confidence,
    lignerKunde: ligner as number,
    redesign: redesign as number,
    cta: cta as number,
    lokal: lokal as number,
    dateretSprog: dateret as number,
    onlineBooking: booking as number,
    eeat: eeat.choice,
    eeatConfidence: eeat.confidence,
    budget: b === "lavt" || b === "middel" || b === "hoejt" ? b : "ukendt",
    budgetConfidence: budget.confidence,
  };
}

export interface Attractiveness {
  score: number; // 0..100
  reasons: string[]; // Danish, one per applied rule, for the shadow UI
}

export interface LeadFacts {
  isChain: boolean;
  /** Google review count from the sheet (column T). Volume is a size signal. */
  reviewsCount?: number;
}

/**
 * How attractive is this lead for a 5-15k website sale, given what Jev saw
 * on the homepage? Deterministic policy (Lucas 2026-09-20: big chains,
 * national brands and already-good sites are NOT attractive even if the
 * sheet scores them high).
 *
 *   base            redesign 0..3 → 0..60   (the opportunity)
 *   budget          lavt −25 · middel 0 · hoejt +10 · ukendt 0
 *   no booking      +10 if P(booking) < 0.3 (a concrete thing to sell)
 *   dated language  +10 if P(dateret) ≥ 0.6
 *   chain           −40 (isChain from src/lib/chains.ts) — HQ decides, not the shop
 *   already modern  −30 if redesign < 1.0 — nothing to sell
 *   too big         −50 stor_eller_landskendt · −40 offentlig · −15 regional
 *   not our kind    −25 if P(ligner Kinlys kunde) < 0.4
 *   review volume   −20 if reviewsCount ≥ 400 (a national-scale business)
 *   clamp 0..100
 */
export function attractiveness(j: SiteJudgment, facts: LeadFacts | boolean): Attractiveness {
  const f: LeadFacts = typeof facts === "boolean" ? { isChain: facts } : facts;
  const reasons: string[] = [];
  let s = Math.round((Math.max(0, Math.min(3, j.redesign)) / 3) * 60);
  reasons.push(`redesign-behov ${j.redesign.toFixed(1)}/3 → ${s}`);
  if (j.budget === "lavt") { s -= 25; reasons.push("lavt budget-signal −25"); }
  else if (j.budget === "hoejt") { s += 10; reasons.push("højt budget-signal +10"); }
  if (j.onlineBooking < 0.3) { s += 10; reasons.push("ingen online booking +10"); }
  if (j.dateretSprog >= 0.6) { s += 10; reasons.push("dateret sprog +10"); }
  if (f.isChain) { s -= 40; reasons.push("kæde/franchise −40"); }
  if (j.redesign < 1.0) { s -= 30; reasons.push("allerede moderne −30"); }
  if (j.virksomhedstype === "stor_eller_landskendt") { s -= 50; reasons.push("stor/landskendt −50"); }
  else if (j.virksomhedstype === "offentlig_eller_forening") { s -= 40; reasons.push("offentlig/forening −40"); }
  else if (j.virksomhedstype === "regional_flere_afdelinger") { s -= 15; reasons.push("regional, flere afdelinger −15"); }
  if (j.lignerKunde < 0.4) { s -= 25; reasons.push(`ligner ikke Kinlys kunder (${Math.round(j.lignerKunde * 100)} %) −25`); }
  if ((f.reviewsCount ?? 0) >= 400) { s -= 20; reasons.push(`${f.reviewsCount} anmeldelser = stor volumen −20`); }
  s = Math.max(0, Math.min(100, s));
  return { score: s, reasons };
}
