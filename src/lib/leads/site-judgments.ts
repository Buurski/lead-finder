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
  // Lucas 2026-09-21, Dangi Frisør-sagen: "sidste opslag på Facebook var i
  // 2022... virkelig ikke en attraktiv kunde". En forretning der er gået i stå
  // køber ikke en ny hjemmeside, uanset hvor meget siden trænger til én.
  aktiv_forretning: {
    type: "noul",
    instructions:
      "Virker forretningen aktiv og i drift lige nu, ud fra `forside_tekst` og `teknisk.copyright_years`? Tegn PÅ aktivitet: aktuelle åbningstider, priser, nyheder, kampagner, seneste copyright-år er i år eller sidste år. Tegn IMOD: seneste copyright-år er to eller flere år gammelt, 'siden er under opbygning', tom eller forladt side, ingen måde at kontakte dem på.",
  },
  // MÅLT 2026-09-21 mod Lucas' egne labels (61 "interested" mod 32
  // "skip/bad_fit", 81 med brugbar forside): AUC 0,765 — det klart stærkeste
  // enkeltsignal af ti afprøvede kandidater. De næstbedste lå på 0,61-0,66,
  // altså inden for to standardfejl af ren tilfældighed ved n=81, og overlapper
  // i forvejen `ligner_kinlys_kunder`. Derfor er kun denne ene taget med.
  investerer_i_udseende: {
    type: "noul",
    instructions:
      "Viser forretningen at den går op i sit ydre: egne fotos af lokalet eller arbejdet, gennemført grafik, tydeligt logo — frem for stockbilleder og standardopsætning?",
  },
  // Bureauer sælger selv det vi sælger. Navnet afslører dem ikke altid
  // ("Social Boost" gør, "Nord Consult" gør ikke), så Jev læser forsiden.
  saelger_selv_marketing: {
    type: "noul",
    instructions:
      "Sælger `firma` SELV markedsføring, webdesign, SEO, sociale medier, reklame eller kommunikation som ydelse — altså er de et bureau og dermed en konkurrent frem for en mulig kunde?",
  },
  ligner_kinlys_kunder: {
    type: "noul",
    instructions:
      "Ligner `firma` Kinlys typiske kunde? `kinly_kunder` er de virksomheder Kinly FAKTISK har solgt til — vurdér ligheden med dem, ikke med en generisk beskrivelse. Kinly sælger kodede hjemmesider til 4-15.000 kr til små lokale ejerledede virksomheder i Danmark: frisører, klinikker, håndværkere, restauranter/caféer, små servicefirmaer. Ikke til kæder, koncerner, landskendte brands, offentlige eller virksomheder med egen marketingafdeling.",
    criteria: {
      true: "Lille lokal ejerledet forretning der selv beslutter og betaler for en hjemmeside",
      false: "For stor, for kendt, offentlig, eller har tydeligt bureau/marketingafdeling bag sig",
    },
  },
};

/**
 * Below this the page was probably JavaScript-rendered and Jev would judge an
 * empty shell (Alchemist: 26 words). Real small sites sit at 80-150 words, so
 * the gate is 60; between 60 and 120 the judgment still runs but is marked thin.
 */
export const MIN_WORDS_FOR_JUDGMENT = 60;
export const THIN_WORDS = 120;

/**
 * Kinlys faktiske kunder, som de sendes til Jev. Lucas 2026-09-20: "kig nu på
 * de kunder vi har nu" — en konkret liste er et skarpere ICP-anker end en
 * generisk brancheopremsning. Kun navn + branche (offentligt kendt), aldrig
 * pris, telefon eller andet fra Clients-arket.
 */
export const MAX_ICP_EXAMPLES = 25;
export function icpExamples(clients: { name: string; branch: string }[]): string[] {
  return clients
    .filter((c) => c.name?.trim())
    .slice(0, MAX_ICP_EXAMPLES)
    .map((c) => (c.branch?.trim() ? `${c.name.trim()} (${c.branch.trim()})` : c.name.trim()));
}

/** State sent to Jev. Text is already redacted + capped by fetch-page.ts. */
export function siteState(
  page: PageText,
  lead: { name: string; branch: string },
  clients: { name: string; branch: string }[] = [],
) {
  return {
    firma: lead.name,
    branche: lead.branch || "(ukendt)",
    kinly_kunder: icpExamples(clients),
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
  /** P(forretningen er aktiv). Optional: poster gemt før 2026-09-21 har den ikke. */
  aktivForretning?: number;
  /** P(forretningen investerer i sit ydre). Optional, samme grund. */
  investererIUdseende?: number;
  /** P(firmaet selv sælger markedsføring/web) — konkurrent, ikke kunde. */
  saelgerSelvMarketing?: number;
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
  // Valgfri: et gammelt svarsæt uden spørgsmålet skal stadig kunne mappes.
  const aktiv = noul(a, "aktiv_forretning");
  const udseende = noul(a, "investerer_i_udseende");
  const bureau = noul(a, "saelger_selv_marketing");
  if (!inRange(redesign, 3) || !inRange(cta, 3) || !inRange(lokal, 1) || !inRange(dateret, 1) || !inRange(booking, 1) || !inRange(ligner, 1)) return null;
  if (!eeat || !budget || !vtype || !EEAT_KEYS.has(eeat.choice) || !BUDGET_KEYS.has(budget.choice) || !TYPE_KEYS.has(vtype.choice)) return null;
  const b = budget.choice;
  const t = vtype.choice as SiteJudgment["virksomhedstype"];
  return {
    virksomhedstype: t,
    virksomhedstypeConfidence: vtype.confidence,
    lignerKunde: ligner as number,
    ...(inRange(aktiv, 1) ? { aktivForretning: aktiv as number } : {}),
    ...(inRange(udseende, 1) ? { investererIUdseende: udseende as number } : {}),
    ...(inRange(bureau, 1) ? { saelgerSelvMarketing: bureau as number } : {}),
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
  /** Hovedstadsområdet — langt fra Herning (city-region.ts). */
  outOfTerritory?: boolean;
  /** Sælger selv markedsføring/web/SEO — konkurrent, ikke kunde. */
  isAgency?: boolean;
}

/**
 * Hvor attraktiv er dette lead for et hjemmesidesalg til 5-15.000 kr?
 *
 * OMSKREVET 2026-09-21 efter måling mod Lucas' egne labels (61 "interested"
 * mod 32 "skip/bad_fit", 82 med brugbar forside). Den gamle formel gav
 * `redesign` 0-60 point og dermed hovedvægten. Målingen viste at det var
 * forkert vej rundt:
 *
 *   redesign alene ............ AUC 0,260   (OMVENDT — dårlige sider er IKKE dem han vil have)
 *   gammel samlet formel ...... AUC 0,445   (ringere end et møntkast)
 *   reviewsCount alene ........ AUC 0,852
 *   lignerKunde alene ......... AUC 0,686
 *   NY formel (aktivitet x egnethed x gates) .. AUC 0,841
 *
 * Anmeldelsestallet er ikke bare selektionsbias: inden for det smalle
 * ark-score-bånd hvor begge labels findes (n=57, 28 mod 29) giver det stadig
 * AUC 0,778. Median: "interested" 61 anmeldelser, "bad_fit" 0. Det er også
 * den ærlige udgave af "rigtige saloner frem for enmands-barbere" — en rigtig
 * salon har et fodaftryk, en walk-in-stol har ingen.
 *
 *   score = 100 x aktivitet x egnethed x gates
 *     aktivitet = log10(anmeldelser+1)/2, loft 1 (0 anm. → 0, ~100 → 1)
 *     egnethed  = 0,55 + 0,45 x P(ligner Kinlys kunder)
 *     gates     = kæde 0,1 · bureau 0,05 · stor/landskendt 0,1 · offentlig 0,2
 *                 regional 0,85 · lavt budget 0,7 · højt budget 1,1
 *                 siden allerede god 0,35 · hovedstaden 0,6 · ikke i drift 0,5
 *
 * `redesign` er nu KUN en gate ("allerede god → næsten intet at sælge"), ikke
 * en drivende plusfaktor. Hver variant der gav den vægt igen målte lavere:
 * 0,7+0,3xredesign gav 0,579 og 0,55+0,45xredesign gav 0,559, mod 0,841 uden.
 */
export function attractiveness(j: SiteJudgment, facts: LeadFacts | boolean): Attractiveness {
  const f: LeadFacts = typeof facts === "boolean" ? { isChain: facts } : facts;
  const reasons: string[] = [];

  // 1) AKTIVITET — hvor stort et fodaftryk har forretningen? Klart stærkeste
  // enkeltsignal (AUC 0,852). Log-skala: 0 anmeldelser → 0, ~100 → 1.
  const anmeldelser = Number.isFinite(f.reviewsCount) ? Math.max(0, f.reviewsCount as number) : 0;
  const aktivitet = Math.min(1, Math.log10(anmeldelser + 1) / 2);
  reasons.push(`${anmeldelser} Google-anmeldelser → aktivitet ${aktivitet.toFixed(2)}`);

  // 2) EGNETHED — ligner de Kinlys kunder? (AUC 0,686)
  // Poster gemt før 2026-09-20 har ikke feltet; 0,5 = "ved det ikke", hverken
  // belønning eller straf. Uden dette guard gav en gammel post NaN.
  const ligner = Number.isFinite(j.lignerKunde) ? Math.max(0, Math.min(1, j.lignerKunde)) : 0.5;
  const egnethed = 0.55 + 0.45 * ligner;
  if (ligner < 0.4) reasons.push(`ligner ikke Kinlys kunder (${Math.round(ligner * 100)} %)`);

  // 3) GATES — Lucas' hårde regler. De er forretningspolitik, ikke statistik,
  // og ganges på til sidst så de ikke kan opvejes af et højt anmeldelsestal.
  let gate = 1;
  if (f.isChain) { gate *= 0.1; reasons.push("kæde/franchise"); }
  if (f.isAgency) { gate *= 0.05; reasons.push("bureau/konkurrent — sælger selv markedsføring"); }
  if (j.virksomhedstype === "stor_eller_landskendt") { gate *= 0.1; reasons.push("stor/landskendt"); }
  else if (j.virksomhedstype === "offentlig_eller_forening") { gate *= 0.2; reasons.push("offentlig/forening"); }
  else if (j.virksomhedstype === "regional_flere_afdelinger") { gate *= 0.85; reasons.push("regional, flere afdelinger"); }
  if (j.budget === "lavt") { gate *= 0.7; reasons.push("lavt budget-signal"); }
  else if (j.budget === "hoejt") { gate *= 1.1; }
  if (Number.isFinite(j.redesign) && j.redesign < 0.8) { gate *= 0.35; reasons.push("siden er allerede god — intet at sælge"); }
  if (f.outOfTerritory) { gate *= 0.6; reasons.push("hovedstadsområdet — langt fra Herning"); }
  if (typeof j.aktivForretning === "number" && j.aktivForretning < 0.25) {
    gate *= 0.5;
    reasons.push(`virker ikke i drift (${Math.round(j.aktivForretning * 100)} % aktiv)`);
  }

  const s = Math.max(0, Math.min(100, Math.round(100 * Math.min(1, gate) * aktivitet * egnethed)));
  return { score: s, reasons };
}

