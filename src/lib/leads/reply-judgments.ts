// reply-judgments.ts — Jev suggests a NEXT ACTION on a warm reply.
// OBSERVES ONLY: Jev never sends, never changes lead status. It only
// suggests; Lucas clicks. Same split as site-judgments.ts / draft-judgments.ts:
// Jev answers typed questions, code owns the ranking/policy.
//
// Why this exists (owner, 2026-09-20): 23 warm replies sit unhandled — the
// bottleneck is deciding what to do next, not classifying. classifyReply()
// in reply.ts already gives a category; this adds "what should Lucas DO".
//
// Reply text source (found by grep, 2026-09-20): the Lead row (sheets.ts)
// has NO reply-body column — sync-replies.ts only stamps emailStatus=
// "replied" when an IMAP scan sees a matching From address, it never
// persists the body. The only place a body is ever written down is the
// inbox digest KV doc (inbox-digest.ts, key "inbox/digest", one row per
// leadId with a `snippet` + `suggestedReply`), populated by /api/replies'
// live IMAP fallback or a Cowork/Opus digest push. That digest is a single
// overwritten snapshot (not a per-lead history) and may not cover every
// replied lead — so this falls back to notes/subject when a lead isn't in
// it, per the task brief.

import { store } from "../store.ts";
import { jevAsk, choice, score, noul, type JevAnswers, type JevQuestion } from "../jev.ts";
import type { Lead } from "../sheets.ts";
import type { ReplyCategory } from "../reply.ts";

export const REPLY_QUESTIONS: Record<string, JevQuestion> = {
  naeste_skridt: {
    type: "choice",
    instructions: "Hvad er det rigtige næste skridt for Lucas givet leadets svar?",
    criteria: {
      ring_i_dag: "Varmt og konkret: de vil tale nu",
      skriv_kort_svar: "Spørgsmål eller lille tvivl der kan besvares på 3 linjer",
      send_udkast_eller_pris: "De beder om udkast, priser eller eksempler",
      vent_og_foelg_op: "Interesseret men ikke nu; sæt opfølgning om 2-4 uger",
      marker_kunde: "De har sagt ja",
      luk_haefligt: "Nej tak eller irrelevant; afslut pænt",
    },
  },
  haster: {
    type: "score",
    instructions: "Hvor hurtigt bør Lucas følge op på dette svar?",
    criteria: ["Kan vente en uge", "Inden for få dage", "I dag", "Nu, de venter aktivt"],
  },
  varme: {
    type: "score",
    instructions: "Hvor varmt/interesseret virker leadet ud fra svaret?",
    criteria: ["Kold/afvisende", "Neutral", "Lun, åben", "Varm, klar"],
  },
  spoergsmaal_der_skal_besvares: {
    type: "noul",
    instructions: "Stiller de et konkret spørgsmål der kræver svar?",
  },
};

const NAESTE_SKRIDT_KEYS = new Set(Object.keys(REPLY_QUESTIONS.naeste_skridt.criteria as Record<string, unknown>));
export type NaesteSkridt = "ring_i_dag" | "skriv_kort_svar" | "send_udkast_eller_pris" | "vent_og_foelg_op" | "marker_kunde" | "luk_haefligt";

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE_RE = /(\+45\s?)?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}\b/g;
const MAX_TEXT_CHARS = 2500;

function redact(text: string): string {
  return text.replace(EMAIL_RE, "[email]").replace(PHONE_RE, "[tlf]").slice(0, MAX_TEXT_CHARS);
}

export interface ReplyInfo {
  /** Full reply body, when found (inbox digest snippet — see file header). */
  bodyText?: string;
  /** Deterministic classification from reply.ts, when available. */
  category?: ReplyCategory;
  /** ISO date the reply arrived, when known. */
  repliedAt?: string;
}

function daysSince(iso: string | undefined, now: Date): number | null {
  if (!iso || !iso.trim()) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - d.getTime()) / 86_400_000));
}

/** State sent to Jev. No email/phone ever included (redacted). */
export function replyState(lead: Lead, info: ReplyInfo, now: Date = new Date()) {
  const dage = daysSince(info.repliedAt, now);
  const base = {
    lead: { name: lead.name, branch: lead.branch, city: lead.city, status: lead.status },
    kategori: info.category ?? null,
    dage_siden_svar: dage,
  };
  if (info.bodyText && info.bodyText.trim()) {
    return { ...base, svar_tekst: redact(info.bodyText) };
  }
  // Fallback (no stored body): subject/notes give Jev something to reason over.
  const bits = [lead.notes ? `Noter: ${lead.notes}` : "", lead.enrichedInfo ? `Info: ${lead.enrichedInfo}` : ""]
    .filter(Boolean)
    .join(" · ");
  return { ...base, svar_resume: redact(bits || "(ingen svar-tekst gemt — kun status/klassificering kendt)") };
}

export interface ReplyJudgment {
  action: NaesteSkridt;
  actionConfidence: number;
  haster: number; // 0..3
  varme: number; // 0..3
  spoergsmaal: number; // P(yes), 0..1
}

const inRange = (v: number | undefined, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= max;

/** Null when any required answer is missing or out of the declared range. */
export function toReplyJudgment(a: JevAnswers | undefined): ReplyJudgment | null {
  const action = choice(a, "naeste_skridt");
  const haster = score(a, "haster");
  const varme = score(a, "varme");
  const spoergsmaal = noul(a, "spoergsmaal_der_skal_besvares");
  if (!action || !NAESTE_SKRIDT_KEYS.has(action.choice)) return null;
  if (!inRange(haster, 3) || !inRange(varme, 3) || !inRange(spoergsmaal, 1)) return null;
  return {
    action: action.choice as NaesteSkridt,
    actionConfidence: action.confidence,
    haster: haster as number,
    varme: varme as number,
    spoergsmaal: spoergsmaal as number,
  };
}

export interface ReplyShadow {
  leadId: string;
  name: string;
  action: NaesteSkridt | null;
  actionConfidence: number | null;
  haster: number | null;
  varme: number | null;
  spoergsmaal: number | null;
  /** ISO date the reply arrived, when known (from the inbox digest). Null when unknown. */
  repliedAt: string | null;
  judgedAt: string;
  model: string | null;
  error?: string;
  answers?: JevAnswers | null;
}

export const REPLY_PREFIX = "jev-reply/";
const LOG_KEY = "jev-reply-log";

export async function loadReplyShadow(): Promise<ReplyShadow[]> {
  const keys = await store.list(REPLY_PREFIX);
  const recs = await Promise.all(keys.map((k) => store.get<ReplyShadow>(k)));
  return recs.filter((r): r is ReplyShadow => !!r);
}

export async function saveReplyShadow(rec: ReplyShadow): Promise<void> {
  // Append-only log FIRST (same order as jev-shadow.ts / draft-judgments.ts):
  // if the put then fails, the lead simply has no current record and is
  // re-judged next run instead of leaving an unlogged visible record.
  await store.append(LOG_KEY, rec);
  await store.put(REPLY_PREFIX + rec.leadId, rec);
}

export async function judgeReply(lead: Lead, info: ReplyInfo): Promise<ReplyShadow> {
  const base = {
    leadId: lead.id,
    name: lead.name,
    repliedAt: info.repliedAt ?? null,
    judgedAt: new Date().toISOString(),
  };
  const result = await jevAsk(replyState(lead, info), REPLY_QUESTIONS, { timeoutMs: 15_000 });
  const judgment = toReplyJudgment(result?.answers);
  if (!judgment) {
    return {
      ...base,
      action: null, actionConfidence: null, haster: null, varme: null, spoergsmaal: null,
      model: result?.model ?? null, error: "no-judgment",
    };
  }
  return {
    ...base,
    action: judgment.action,
    actionConfidence: judgment.actionConfidence,
    haster: judgment.haster,
    varme: judgment.varme,
    spoergsmaal: judgment.spoergsmaal,
    model: result?.model ?? null,
    answers: result?.answers ?? null,
  };
}
