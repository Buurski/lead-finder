// inbox-digest.ts — the shared model + storage for inbox triage.
//
// The "Svar" page no longer scans the whole inbox with AI on every page load
// (that burns Vercel API budget and is slow). Instead it reads a DIGEST artifact
// — a ranked list of messages that actually need a reply — produced once each
// morning. Two producers can fill it:
//
//   1. A local scheduled Claude/Cowork task (Opus 4.8 on Lucas's subscription —
//      free) reads Gmail, ranks importance, and POSTs the digest to
//      /api/inbox/digest. This is the preferred channel (same pattern as the
//      Messenger digest + daily brief).
//   2. A live fallback in /api/replies builds a partial digest from lead-matched
//      IMAP replies (deterministic) so the page is never empty before the first
//      scheduled run.
//
// The app just READS the digest and renders it ranked. Storage is the KV/FS
// abstraction so the local task and the deployed app share one source of truth.
//
// Strip-safe (no Next imports) so node tooling / a CLI producer can import it.

import { store } from "./store.ts";

export type InboxCategory =
  | "client"        // explicit yes / became a customer
  | "interested"
  | "question"
  | "objection"
  | "admin"         // real but operational (invoice, booking, supplier)
  | "personal"      // a real human who isn't a lead but wants something
  | "not-interested"
  | "newsletter"
  | "auto-reply"
  | "receipt"
  | "spam"
  | "other";

export interface InboxItem {
  id: string;            // gmail message/thread id, or a stable hash
  account: string;       // which inbox ("lucas" | "charlie" | the address)
  from: string;          // sender address
  fromName?: string;     // display name
  subject: string;
  snippet: string;       // short preview of the body
  date: string;          // ISO
  category: InboxCategory;
  importance: number;    // 0..100 — higher = reply sooner
  needsReply: boolean;   // surfaced at the top; false = noise, collapsed
  reason: string;        // 1 line: why it matters (or why it's noise)
  gmailLink?: string;    // deep link to open the thread in Gmail
  leadId?: string;       // CRM lead row id, when the sender matched a lead
  suggestedReply?: string; // optional pre-draft (when a lead matched)
  /** Kort dansk resumé af hele tråden — kun sat for højt rangerede mails
   *  (produceren har et fast token-loft, så ikke alle items får et). */
  threadSummary?: string;
  /** Antal mails i tråden, når threadSummary er sat. */
  threadCount?: number;
  /** Gmail-tråd-id (fra producenten) — så "Åbn i Gmail" kan åbne selve
   *  samtalen i stedet for en ny mail; et svar lander så i tråden. */
  threadId?: string;
}

export interface InboxDigest {
  generatedAt: string;       // ISO
  generatedBy: string;       // "cowork-opus" | "live-fallback" | "manual"
  account: string;           // "all" or a specific inbox
  items: InboxItem[];        // ranked, importance desc
  windowDays?: number;       // how far back it scanned
  note?: string;             // freeform (e.g. "12 scanned, 3 need reply")
}

const DIGEST_KEY = "inbox/digest";

// ---- noise heuristics (deterministic, pre-AI) ----------------------------
// Cheap filters so a producer can drop obvious non-actionable mail BEFORE
// spending a model call, and so the live fallback can collapse noise.
const NOISE_FROM = /(no-?reply|do-?not-?reply|noreply|newsletter|nyhedsbrev|notifications?|mailer-daemon|postmaster|info@(facebook|instagram|linkedin|google|apple|microsoft)|automated)/i;
const NOISE_SUBJECT = /(nyhedsbrev|newsletter|kvittering|receipt|ordrebekr|order confirmation|faktura|invoice|abonnement|unsubscribe|afmeld|udsalg|% rabat|black friday|tilbud denne uge|din kode|verify your|bekræft din e-?mail|password|kalenderinvitation)/i;

/** True when sender/subject look like bulk/automated/noise mail. */
export function isNoise(from: string, subject: string): boolean {
  return NOISE_FROM.test(from || "") || NOISE_SUBJECT.test(subject || "");
}

/** Map a category + lead-match into a deterministic 0–100 importance, used by
 *  the live fallback (the AI producer assigns its own). Lead replies that signal
 *  buying intent rank highest. */
export function scoreImportance(category: InboxCategory, isLead: boolean): number {
  const base: Record<InboxCategory, number> = {
    client: 98, interested: 90, question: 84, objection: 70, personal: 60,
    admin: 55, "not-interested": 30, other: 40, newsletter: 8, "auto-reply": 6,
    receipt: 5, spam: 2,
  };
  const b = base[category] ?? 40;
  return Math.min(100, isLead ? b + 5 : b);
}

/** Categories that always warrant Lucas's attention. */
export function isActionable(category: InboxCategory): boolean {
  return ["client", "interested", "question", "objection", "personal", "admin"].includes(category);
}

// ---- storage --------------------------------------------------------------
export async function saveDigest(d: InboxDigest): Promise<void> {
  await store.put(DIGEST_KEY, d);
}

// Én nøgle pr. lead (ingen delt map → to samtidige klik kan ikke overskrive hinanden).
const handledKey = (leadId: string) => `replies/handled/${leadId}`;

/** "Markér som besvaret": svar fra dette lead til og med `upTo` (det viste svars tidspunkt)
 * er håndteret. Overlever at oversigten bygges på ny; et NYERE svar dukker op igen. */
export async function markReplyHandled(leadId: string, upTo = new Date().toISOString()): Promise<void> {
  const prev = await store.get<string>(handledKey(leadId));
  if (!prev || !(Date.parse(prev) >= Date.parse(upTo))) await store.put(handledKey(leadId), upTo);
}

// Én delt map (itemId → tid) for "fjern meddelelsen" uanset lead/konto.
// ponytail: én nøgle; to samtidige fjern-klik kan i teorien overskrive hinanden — fint for et manuelt klik.
const HANDLED_ITEMS_KEY = "replies/handled-items";

/** "Fjern meddelelsen": meddelelsen skjules helt i alle visninger (overlever genbygning). */
export async function markItemHandled(itemId: string, upTo = new Date().toISOString()): Promise<void> {
  const clean = (itemId || "").trim();
  if (!clean) throw new Error("itemId mangler");
  const prev = (await store.get<Record<string, string>>(HANDLED_ITEMS_KEY)) ?? {};
  prev[clean] = upTo;
  await store.put(HANDLED_ITEMS_KEY, prev);
}

/** Påfør markeringerne på en oversigt — bruges af ALLE veje der returnerer en digest. */
export async function withHandled(d: InboxDigest): Promise<InboxDigest> {
  const ids = [...new Set(d.items.filter((i) => i.needsReply && i.leadId).map((i) => i.leadId!))];
  const [pairs, handledItems] = await Promise.all([
    Promise.all(ids.map(async (id) => [id, await store.get<string>(handledKey(id)).catch(() => null)] as const)),
    store.get<Record<string, string>>(HANDLED_ITEMS_KEY).catch(() => null),
  ]);
  const handled: Record<string, string> = {};
  for (const [id, at] of pairs) if (at) handled[id] = at;
  return applyHandled(d, handled, handledItems ?? {});
}

// Sammenlign som tidspunkter, ALDRIG som tekst: VPS-cronen skriver "…:17Z", HQ gemmer
// toISOString() "…:17.000Z", og "…17Z" <= "…17.000Z" er FALSK som streng ('Z' > '.').
// Det fik hvert "Svaret"/"Fjern"-klik til at dukke op igen efter genindlæsning (26/9).
function notAfter(date: string | undefined, upTo: string | undefined): boolean {
  if (!upTo) return false;
  const a = Date.parse(date || ""), b = Date.parse(upTo);
  if (Number.isNaN(b)) return false;
  return Number.isNaN(a) || a <= b; // dato-løst svar: markeringen gælder
}

/** Ren: slår behandlede svar fra (needsReply=false) og dropper "fjernede" meddelelser helt. */
export function applyHandled(d: InboxDigest, handled: Record<string, string>, handledItems: Record<string, string> = {}): InboxDigest {
  return {
    ...d,
    items: d.items
      .filter((i) => !notAfter(i.date, handledItems[i.id]))
      .map((i) => (i.needsReply && i.leadId && notAfter(i.date, handled[i.leadId]) ? { ...i, needsReply: false } : i)),
  };
}

export async function loadDigest(): Promise<InboxDigest | null> {
  try {
    const d = await store.get<InboxDigest>(DIGEST_KEY);
    // Normalisér ALTID ved læsning: producenter (fx VPS-cron) kan skrive direkte
    // i KV uden om normalizeDigest, og Svar-siden skal altid vise sorteret,
    // clampet data — ikke rå input.
    return d ? await withHandled(normalizeDigest(d)) : null;
  } catch {
    return null;
  }
}

export interface DigestSummary {
  total: number;
  needsReply: number;
  generatedAt: string | null;
  generatedBy: string | null;
  ageMinutes: number | null;
}

export function summarizeDigest(d: InboxDigest | null): DigestSummary {
  if (!d || !Array.isArray(d.items)) {
    return { total: 0, needsReply: 0, generatedAt: null, generatedBy: null, ageMinutes: null };
  }
  const at = Date.parse(d.generatedAt);
  return {
    total: d.items.length,
    needsReply: d.items.filter((i) => i.needsReply).length,
    generatedAt: d.generatedAt,
    generatedBy: d.generatedBy,
    ageMinutes: Number.isNaN(at) ? null : Math.round((Date.now() - at) / 60000),
  };
}

/** Sort items newest-importance-first and normalize. Defensive against a
 *  producer that posts partial/garbage items. */
export function normalizeDigest(raw: Partial<InboxDigest> | null, fallbackBy = "manual"): InboxDigest {
  const items: InboxItem[] = Array.isArray(raw?.items)
    ? raw!.items
        .filter((i): i is InboxItem => Boolean(i && typeof i === "object" && (i as InboxItem).from))
        .map((i) => ({
          id: String(i.id ?? `${i.from}-${i.date ?? ""}`),
          account: String(i.account ?? "all"),
          from: String(i.from),
          fromName: i.fromName ? String(i.fromName) : undefined,
          subject: String(i.subject ?? "(intet emne)"),
          snippet: String(i.snippet ?? "").slice(0, 400),
          date: String(i.date ?? new Date().toISOString()),
          category: (i.category ?? "other") as InboxCategory,
          importance: clamp0to100(i.importance),
          needsReply: Boolean(i.needsReply),
          reason: String(i.reason ?? "").slice(0, 200),
          gmailLink: i.gmailLink ? String(i.gmailLink) : undefined,
          leadId: i.leadId ? String(i.leadId) : undefined,
          suggestedReply: i.suggestedReply ? String(i.suggestedReply) : undefined,
          threadSummary: i.threadSummary ? String(i.threadSummary).slice(0, 600) : undefined,
          threadCount: typeof i.threadCount === "number" && i.threadCount > 0 ? Math.round(i.threadCount) : undefined,
          threadId: i.threadId ? String(i.threadId).slice(0, 200) : undefined,
        }))
        // Vigtighed først; ved samme vigtighed: nyeste først (rangering "væsentlighed/dato").
        .sort((a, b) => (b.importance - a.importance) || (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    : [];
  return {
    generatedAt: typeof raw?.generatedAt === "string" ? raw!.generatedAt : new Date().toISOString(),
    generatedBy: typeof raw?.generatedBy === "string" ? raw!.generatedBy : fallbackBy,
    account: typeof raw?.account === "string" ? raw!.account : "all",
    items,
    windowDays: typeof raw?.windowDays === "number" ? raw!.windowDays : undefined,
    note: typeof raw?.note === "string" ? raw!.note : undefined,
  };
}

function clamp0to100(v: unknown): number {
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isFinite(n)) return 40;
  return Math.min(100, Math.max(0, Math.round(n)));
}
