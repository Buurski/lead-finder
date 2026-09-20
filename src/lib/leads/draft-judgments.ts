// draft-judgments.ts — Jev judges pending outreach DRAFTS (not the leads
// themselves; that's site-judgments.ts). OBSERVES ONLY: Jev never sends,
// edits or rejects a draft, it only scores. The /approve UI uses the score
// to rank drafts and flag "send ikke" — Lucas still clicks every send.
//
// Policy (score/flags) is code, not model output, same split as
// site-judgments.ts. Tone criteria are a compressed version of
// KnowledgeOS/context/brand-og-tone.md + forbidden-phrases.md (council
// 2026-09-20): varm/jordnær/ærlig, anerkend håndværket først, nem vej ud,
// intet corporate-sprog, ingen em-dash, ingen pris.

import { store } from "../store.ts";
import { jevAsk, noul, score, type JevAnswers, type JevQuestion } from "../jev.ts";
import type { QueueDraft } from "../queue.ts";

export const DRAFT_QUESTIONS: Record<string, JevQuestion> = {
  demo_matcher_branche: {
    type: "noul",
    instructions:
      "Passer `demoer` til `lead.branch` (samme branchefamilie: skønhed/mad/håndværk/professionel/auto/service)?",
  },
  konkret_observation: {
    type: "noul",
    instructions:
      "Nævner `tekst` noget konkret om netop denne virksomhed (deres side, anmeldelser, by, ydelse) frem for generisk pitch?",
  },
  lyder_som_lucas: {
    type: "score",
    instructions:
      "Hvor godt matcher `tekst` Lucas' stemme: afslappet, personlig, ærlig, jordnær, som en kort besked (ikke et formelt brev), anerkender kundens håndværk FØRST, giver en nem vej ud ('ingen pres')? Straf corporate-sprog, buzzwords, salgspres og lange sætninger.",
    criteria: [
      "Corporate/robot: buzzwords, lange sætninger, salgspres",
      "Neutral, hverken varm eller corporate",
      "Kort og jordnær, men mangler den nemme vej ud eller anerkendelse først",
      "Ærlig, varm, kort, anerkender kundens arbejde først, giver en nem vej ud",
    ],
  },
  naevner_pris: {
    type: "noul",
    instructions: "Nævner `tekst` eller `emne` en pris, kr-beløb eller rabat?",
  },
  fejl_i_fakta: {
    type: "noul",
    instructions:
      "Er der en tydelig faktafejl: forkert by, forkert branche, forkert firmanavn i `tekst`/`emne` i forhold til `lead`?",
  },
  emne_appel: {
    type: "score",
    instructions: "Hvor godt fungerer `emne` som emnelinje?",
    criteria: [
      "Spam-agtigt eller tomt",
      "Generisk",
      "Personligt og konkret",
      "Personligt, konkret og nysgerrighedsvækkende uden clickbait",
    ],
  },
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(\+45\s?)?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\b/g;
const MAX_TEXT_CHARS = 3000;

function redact(text: string): string {
  return text.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[tlf]").slice(0, MAX_TEXT_CHARS);
}

/** State sent to Jev. No recipient email is ever included. */
export function draftState(d: QueueDraft) {
  return {
    lead: { name: d.name, branch: d.branch, city: d.city },
    demoer: d.demoPair.map((demo) => ({ navn: demo.label })),
    emne: redact(d.subject || ""),
    tekst: redact(d.body || ""),
  };
}

export interface DraftJudgment {
  demoMatcherBranche: number; // P(yes), 0..1
  konkretObservation: number; // P(yes), 0..1
  lyderSomLucas: number; // 0..3
  naevnerPris: number; // P(yes), 0..1
  fejlIFakta: number; // P(yes), 0..1
  emneAppel: number; // 0..3
}

const inRange = (v: number | undefined, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

export function toDraftJudgment(a: JevAnswers | undefined): DraftJudgment | null {
  const demoMatcherBranche = noul(a, "demo_matcher_branche");
  const konkretObservation = noul(a, "konkret_observation");
  const lyderSomLucas = score(a, "lyder_som_lucas");
  const naevnerPris = noul(a, "naevner_pris");
  const fejlIFakta = noul(a, "fejl_i_fakta");
  const emneAppel = score(a, "emne_appel");
  if (
    !inRange(demoMatcherBranche, 1) ||
    !inRange(konkretObservation, 1) ||
    !inRange(lyderSomLucas, 3) ||
    !inRange(naevnerPris, 1) ||
    !inRange(fejlIFakta, 1) ||
    !inRange(emneAppel, 3)
  ) {
    return null;
  }
  return {
    demoMatcherBranche: demoMatcherBranche as number,
    konkretObservation: konkretObservation as number,
    lyderSomLucas: lyderSomLucas as number,
    naevnerPris: naevnerPris as number,
    fejlIFakta: fejlIFakta as number,
    emneAppel: emneAppel as number,
  };
}

export interface DraftQuality {
  score: number; // 0..100
  flags: string[]; // Danish, one per applied rule/threshold
}

/**
 * How good is this draft to send, given what Jev saw? Deterministic policy
 * (council 2026-09-20):
 *   base            50
 *   demo match      +20 if ≥0.6 else −20
 *   konkret         +15 if ≥0.6 else −10
 *   tone            lyderSomLucas (0..3) × 10 → 0..30
 *   pris nævnt      −40, flag "nævner pris" if ≥0.5
 *   faktafejl       −50, flag "faktafejl" if ≥0.5
 *   emne-appel      + emneAppel (0..3) × 5
 *   clamp 0..100; flag "send ikke" if score < 40
 */
export function draftQuality(j: DraftJudgment): DraftQuality {
  const flags: string[] = [];
  let s = 50;
  s += j.demoMatcherBranche >= 0.6 ? 20 : -20;
  s += j.konkretObservation >= 0.6 ? 15 : -10;
  s += j.lyderSomLucas * 10;
  if (j.naevnerPris >= 0.5) { s -= 40; flags.push("nævner pris"); }
  if (j.fejlIFakta >= 0.5) { s -= 50; flags.push("faktafejl"); }
  s += j.emneAppel * 5;
  s = Math.max(0, Math.min(100, Math.round(s)));
  if (s < 40) flags.push("send ikke");
  return { score: s, flags };
}

export interface DraftShadow {
  draftId: string;
  leadId: string;
  quality: number | null;
  flags: string[];
  judgment: DraftJudgment | null;
  answers?: unknown;
  model: string | null;
  judgedAt: string;
  error?: string;
}

export const DRAFT_PREFIX = "jev-draft/";
const LOG_KEY = "jev-draft-log";

export async function loadDraftShadow(): Promise<DraftShadow[]> {
  const keys = await store.list(DRAFT_PREFIX);
  const recs = await Promise.all(keys.map((k) => store.get<DraftShadow>(k)));
  return recs.filter((r): r is DraftShadow => !!r);
}

export async function saveDraftShadow(rec: DraftShadow): Promise<void> {
  // Append-only log FIRST (audit source of truth, same order as jev-shadow.ts):
  // if the put then fails, the draft simply has no current record and is
  // re-judged next run instead of leaving an unlogged visible record.
  await store.append(LOG_KEY, rec);
  await store.put(DRAFT_PREFIX + rec.draftId, rec);
}

export async function judgeDraft(d: QueueDraft): Promise<DraftShadow> {
  const base = { draftId: d.id, leadId: d.leadId, judgedAt: new Date().toISOString() };
  const result = await jevAsk(draftState(d), DRAFT_QUESTIONS, { timeoutMs: 15_000 });
  const judgment = toDraftJudgment(result?.answers);
  if (!judgment) {
    return { ...base, quality: null, flags: [], judgment: null, model: result?.model ?? null, error: "no-judgment" };
  }
  const q = draftQuality(judgment);
  return {
    ...base,
    answers: result?.answers ?? null,
    quality: q.score,
    flags: q.flags,
    judgment,
    model: result?.model ?? null,
  };
}
