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
  status: DraftStatus;
  source: string; // "daily-engine" | "write-to-x"
  createdAt: string;
  updatedAt: string;
  comboId?: string;      // tone-mixer combination id (Del 3) — for follow-up variation
  openerKind?: string;   // which opener kind was used (achievement/quote/...)
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

// Append new drafts (used by the engine COLLECT step). Returns the full queue.
// Dedupes by leadId: a lead that already has a PENDING draft is skipped, so a
// re-run of the engine never stacks duplicate cards for the same lead in the
// approval queue. (Approved/edited/rejected drafts don't block a fresh draft.)
export async function appendDrafts(newDrafts: QueueDraft[]): Promise<QueueDraft[]> {
  const existing = await readQueue();
  const pendingLeadIds = new Set(
    existing.filter((d) => d.status === "pending" && d.leadId).map((d) => d.leadId)
  );
  const seen = new Set<string>();
  const deduped = newDrafts.filter((d) => {
    if (!d.leadId) return true; // no leadId ⇒ can't dedupe, keep it
    if (pendingLeadIds.has(d.leadId) || seen.has(d.leadId)) return false;
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
  patch: { status?: DraftStatus; subject?: string; body?: string; demoPair?: Demo[] }
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
    updatedAt: new Date().toISOString(),
  };
  drafts[idx] = next;
  await writeQueue(drafts);
  return next;
}

export function newDraftId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
