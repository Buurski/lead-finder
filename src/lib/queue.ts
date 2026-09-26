// queue.ts — the approval queue shared between the daily engine (writer, Del 4)
// and the /approve UI + API (reader/updater, Del 3). ONE schema, one file, so
// the two halves never drift.
//
// The queue is a JSON array at .send_queue/approval_queue.json (resolved from
// process.cwd()). .send_queue/ is gitignored (it holds runtime state + secrets),
// exactly like the existing send.mjs queue — so the file is created on first
// write and is never committed.
//
// Strip-safe (no enums/namespaces) so the node engine can import it directly.

import { store } from "./store.ts";
import { pgEnabled } from "./db/client.ts";
import { bizKey } from "./leads/suppress.ts";

import type { Demo } from "./demos.ts";
import { missingReferenceLinks } from "./demos.ts";
import type { SenderId } from "./senders.ts";

// "sending" = reserveret lige før SMTP (se reserveForSend). Kun send-ruten flytter den videre.
export type DraftStatus = "pending" | "approved" | "edited" | "rejected" | "sending" | "sent";

/**
 * Kastes når en prospekt-kladde skrives med en tekst der bryder link-politikken
 * (kinly.dk-forside + matchende case + branche-side, se demos.ts). Køen er
 * fail-closed: hellere afvise skrivningen end at gemme en kladde der ikke må
 * sendes. Kundesvar bruger ikke denne kø.
 */
export class LinkPolicyError extends Error {
  readonly issues: string[];
  constructor(issues: string[]) {
    super(`link-politik: ${issues.join("; ")}`);
    this.name = "LinkPolicyError";
    this.issues = issues;
  }
}

export interface QueueDraft {
  id: string;
  leadId: string;
  name: string;
  branch: string;
  city: string;
  hooks: string[];
  demoPair: Demo[];
  professionalism: string; // verdict reason, for context on the card
  subject: string;
  body: string;
  // Direct recipient email, set when the draft's lead has NO Sheets row (e.g. the
  // Cowork/leadgen ingest — those candidates never hit Sheets). The send route
  // prefers this over a Sheets lookup, so an ingest lead can actually be mailed
  // instead of being skipped with "lead ikke fundet"/"no email".
  recipientEmail?: string;
  // Forretningens egne data (2026-09-21). Motoren har dem fra Sheets-rækken,
  // men ingest-kladder (Cowork/leadgen) havde ingen — og uden website kunne
  // forretningen bag dem ALDRIG hentes og Jev-vurderes. Det var hullet hvor
  // de dårlige barbershop-kladder gemte sig. Udfyldes af motoren ved oprettelse
  // og bagudrettet af /api/queue-enrich.
  website?: string;
  reviewsCount?: number;
  /** Googles drift-status: OPERATIONAL | CLOSED_TEMPORARILY | CLOSED_PERMANENTLY. */
  businessStatus?: string;
  status: DraftStatus;
  source: string; // "daily-engine" | "write-to-x" | "opfoelgning"
  // Opfølgnings-sekvens (spec §11): 1 = første mail, 2.. = opfølgninger.
  step?: number;
  angle?: string;
  /** Sat når systemet selv stoppede kladden (fx "svar modtaget"). */
  stoppedReason?: string;
  createdAt: string;
  updatedAt: string;
  comboId?: string;      // tone-mixer combination id (Del 3) — for follow-up variation
  openerKind?: string;   // which opener kind was used (achievement/quote/...)
  // Hybrid sender allocation (2026-06-17): which Gmail identity sends this
  // draft. Set by the engine on draft creation; read by email.ts and
  // /approve/send to pick the right SMTP transport + From: header. Legacy
  // drafts without this field fall back to "lucas" at send time.
  sender?: SenderId;
  // Stamped with the identity that ACTUALLY sent the mail (audit + the UI's
  // "Sendt som X" line). Set by /approve/send on a successful send.
  sentBy?: SenderId;
  // Sat af GET /api/approve/queue (aldrig persisteret): kontakt-historik-badge.
  // Shape spejler ContactRecord i leads/contact-history.ts + seenBefore-flag.
  history?: {
    seenBefore: boolean;
    reason: string;
    lastContactAt?: string | null;
    daysSince?: number | null;
    replied?: "ja" | "nej" | "aldrig" | "ukendt";
    warmth?: "varm" | "lun" | "kold" | "død";
  };
}

// The queue is the "queue" key in the store (FS: .send_queue/approval_queue.json;
// Vercel: KV). Async so it survives the ephemeral filesystem in production.
export async function readQueue(): Promise<QueueDraft[]> {
  if (pgEnabled()) return (await import("./pg/queue.ts")).readQueue();
  try {
    const parsed = await store.get<QueueDraft[]>("queue");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeQueue(drafts: QueueDraft[]): Promise<void> {
  if (pgEnabled()) return (await import("./pg/queue.ts")).writeQueue(drafts);
  await store.put("queue", drafts);
}

// How long a recently rejected lead is blocked from re-appearing in the queue.
// Lucas's krav (2026-06-11): når jeg afviser en lead, må den IKKE dukke op igen
// på næste engine-run — 14 dage giver tid til at lead'en evt. forandrer sig
// (ny hjemmeside, nye anmeldelser) før vi prøver igen.
export const REJECT_BLOCK_MS = 14 * 24 * 60 * 60 * 1000;

function rejectedAt(d: QueueDraft): number {
  const t = d.updatedAt ?? d.createdAt;
  if (!t) return 0;
  const n = new Date(t).getTime();
  return Number.isFinite(n) ? n : 0;
}

// Append new drafts (used by the engine COLLECT step). Returns the full queue.
// Dedupes by leadId:
// - Lead med en PENDING draft → spring over (engine'en stable ikke dubletter).
// - Lead afvist inden for REJECT_BLOCK_MS → spring over (Lucas's afvis-respekt).
// - Lead approved/edited/sent → tillad nyt draft (måske ny follow-up runde).
// - Lead afvist for længe siden → tillad igen (verden ændrer sig).
//
// Cross-path dupe guard (2026-09-23): the in-app engine keys a draft by Sheets
// ROW NUMBER (leadId), the VPS lead-gen pipeline keys it by Google PLACE_ID —
// so the same business drafted by both paths never collides on leadId, and
// showed up twice in /godkendelse. Block a fresh cold-outreach draft when the
// business (normalized name+city, bizKey) already has an OPEN (pending/edited/
// approved) or SENT draft anywhere in the queue, regardless of leadId scheme.
// Follow-up drafts (source "opfoelgning") are exempt — they deliberately target
// an already-sent business (same leadId, later step); this guard would
// otherwise block every follow-up round.
export async function appendDrafts(
  newDrafts: QueueDraft[],
  now: number = Date.now(),
): Promise<QueueDraft[]> {
  const existing = await readQueue();
  const cutoff = now - REJECT_BLOCK_MS;
  const blockedLeadIds = new Set<string>();
  const OPEN_OR_SENT: ReadonlySet<DraftStatus> = new Set(["pending", "edited", "approved", "sending", "sent"]);
  const blockedBizKeys = new Set<string>();
  for (const d of existing) {
    if (d.leadId) {
      if (d.status === "pending") {
        blockedLeadIds.add(d.leadId);
      } else if (d.status === "rejected" && rejectedAt(d) > cutoff) {
        blockedLeadIds.add(d.leadId);
      }
    }
    if (OPEN_OR_SENT.has(d.status)) {
      const k = bizKey(d.name, d.city);
      if (k) blockedBizKeys.add(k);
    }
  }
  const seen = new Set<string>();
  const deduped: QueueDraft[] = [];
  for (const d of newDrafts) {
    const k = d.source !== "opfoelgning" ? bizKey(d.name, d.city) : "";
    if (k && blockedBizKeys.has(k)) continue;
    if (d.leadId && (blockedLeadIds.has(d.leadId) || seen.has(d.leadId))) continue;
    if (d.leadId) seen.add(d.leadId);
    // Fold this accepted draft's key back in so a duplicate WITHIN this same
    // batch (e.g. two ingest items for the same business under different
    // leadIds) is also caught, not just duplicates against the existing queue.
    if (k) blockedBizKeys.add(k);
    deduped.push(d);
  }
  // Link-politik (Lucas 24/9): en kladde uden kinly.dk-forside/matchende case
  // lægges IKKE i køen. Fail-closed — hellere tabe kladden her end at den står
  // sendbar i /godkendelse uden links. Rettes ét sted: demos.ts.
  const compliant = deduped.filter((d) => {
    const issues = missingReferenceLinks(d.body ?? "", d.branch ?? "", d.name ?? "");
    if (issues.length) {
      console.warn(JSON.stringify({ evt: "queue.draft_skipped_link_policy", id: d.id, issues }));
      return false;
    }
    return true;
  });
  const merged = [...existing, ...compliant];
  await writeQueue(merged);
  return merged;
}

// Update one draft's status/body (used by /approve actions). Never sends mail —
// "approve" only marks the draft approved; real sending is a later layer.
export async function updateDraft(
  id: string,
  patch: { status?: DraftStatus; subject?: string; body?: string; demoPair?: Demo[]; recipientEmail?: string; sender?: SenderId; sentBy?: SenderId; website?: string; reviewsCount?: number; businessStatus?: string }
): Promise<QueueDraft | null> {
  if (pgEnabled()) {
    // Ét betinget række-UPDATE: to samtidige redigeringer kan ikke overskrive hinanden
    // med et forældet hel-kø-snapshot, og endelige kladder (sendt/sending) røres ikke (Sol 25/9).
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<QueueDraft>;
    return (await import("./pg/queue.ts")).updateDraftRow(id, clean, new Date().toISOString());
  }
  const drafts = await readQueue();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  // Link-politik (Lucas 24/9): enhver skrivning der ÆNDRER teksten skal stadig
  // leve op til kravene. Status-/mail-opdateringer (sent, recipientEmail) rører
  // ikke body og går uhindret igennem, så gamle kladder ikke låser uden grund.
  if (patch.body !== undefined) {
    const issues = missingReferenceLinks(patch.body, drafts[idx].branch ?? "", drafts[idx].name ?? "");
    if (issues.length) throw new LinkPolicyError(issues);
  }
  const next = {
    ...drafts[idx],
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
    ...(patch.body !== undefined ? { body: patch.body } : {}),
    ...(patch.demoPair !== undefined ? { demoPair: patch.demoPair } : {}),
    ...(patch.recipientEmail !== undefined ? { recipientEmail: patch.recipientEmail } : {}),
    ...(patch.sender !== undefined ? { sender: patch.sender } : {}),
    ...(patch.sentBy !== undefined ? { sentBy: patch.sentBy } : {}),
    updatedAt: new Date().toISOString(),
  };
  drafts[idx] = next;
  await writeQueue(drafts);
  return next;
}

// Atomisk send-reservation (pg). KV-udgaven (kun lokal/test uden pg) er
// læs-ændr-skriv og dermed ikke atomisk — prod kører pg.
export async function reserveForSend(id: string, recipientEmail: string, expectedUpdatedAt: string): Promise<QueueDraft | null> {
  const now = new Date().toISOString();
  if (pgEnabled()) return (await import("./pg/queue.ts")).reserveForSend(id, recipientEmail, expectedUpdatedAt, now);
  const drafts = await readQueue();
  const d = drafts.find((x) => x.id === id);
  if (!d || (d.status !== "approved" && d.status !== "edited") || (d.updatedAt ?? "") !== expectedUpdatedAt) return null;
  Object.assign(d, { status: "sending", recipientEmail, updatedAt: now });
  await writeQueue(drafts);
  return d;
}

export async function finishSend(id: string, result: "sent" | "approved", sentBy: SenderId | null): Promise<boolean> {
  const now = new Date().toISOString();
  if (pgEnabled()) return (await import("./pg/queue.ts")).finishSend(id, result, sentBy, now);
  const drafts = await readQueue();
  const d = drafts.find((x) => x.id === id);
  if (!d || d.status !== "sending") return false;
  Object.assign(d, { status: result, updatedAt: now }, result === "sent" && sentBy ? { sentBy } : {});
  await writeQueue(drafts);
  return true;
}

export function newDraftId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
