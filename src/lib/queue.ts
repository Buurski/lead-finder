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

import type { Demo } from "./demos.ts";
import type { SenderId } from "./senders.ts";

export type DraftStatus = "pending" | "approved" | "edited" | "rejected" | "sent";

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
  status: DraftStatus;
  source: string; // "daily-engine" | "write-to-x"
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
}

// The queue is the "queue" key in the store (FS: .send_queue/approval_queue.json;
// Vercel: KV). Async so it survives the ephemeral filesystem in production.
export async function readQueue(): Promise<QueueDraft[]> {
  try {
    const parsed = await store.get<QueueDraft[]>("queue");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function writeQueue(drafts: QueueDraft[]): Promise<void> {
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
export async function appendDrafts(
  newDrafts: QueueDraft[],
  now: number = Date.now(),
): Promise<QueueDraft[]> {
  const existing = await readQueue();
  const cutoff = now - REJECT_BLOCK_MS;
  const blockedLeadIds = new Set<string>();
  for (const d of existing) {
    if (!d.leadId) continue;
    if (d.status === "pending") {
      blockedLeadIds.add(d.leadId);
    } else if (d.status === "rejected" && rejectedAt(d) > cutoff) {
      blockedLeadIds.add(d.leadId);
    }
  }
  const seen = new Set<string>();
  const deduped = newDrafts.filter((d) => {
    if (!d.leadId) return true; // no leadId ⇒ can't dedupe, keep it
    if (blockedLeadIds.has(d.leadId) || seen.has(d.leadId)) return false;
    seen.add(d.leadId);
    return true;
  });
  const merged = [...existing, ...deduped];
  await writeQueue(merged);
  return merged;
}

// Update one draft's status/body (used by /approve actions). Never sends mail —
// "approve" only marks the draft approved; real sending is a later layer.
export async function updateDraft(
  id: string,
  patch: { status?: DraftStatus; subject?: string; body?: string; demoPair?: Demo[]; recipientEmail?: string; sender?: SenderId; sentBy?: SenderId }
): Promise<QueueDraft | null> {
  const drafts = await readQueue();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx === -1) return null;
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

export function newDraftId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
