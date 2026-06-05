// deep-research-queue.ts — queue of leads that need deep research, processed
// by a Cowork session (or any Claude agent) instead of the paid Anthropic API.
//
// Design goals:
//   1. Queue persists in the storage abstraction (FS locally, KV on Vercel) so
//      it survives Vercel's ephemeral filesystem and is visible to both the
//      Command Center UI and the Cowork session.
//   2. Idempotent: enqueuing the same leadId twice is a no-op.
//   3. Cheap to read: the queue is one JSON blob, not one key per lead. Cowork
//      pulls it in one round-trip.
//   4. Results live separately keyed by leadId, so Cowork can write results
//      atomically without race-locking the queue.
//
// Storage layout:
//   key                                value
//   --------------------------------   --------------------------------
//   deep-research/queue                QueueEntry[]
//   deep-research/result/{leadId}      ResearchResult
//
// Strip-safe (no enums) so the node engine can import this directly.

import { store } from "./store.ts";

export type QueueStatus = "pending" | "in_progress" | "complete" | "failed";

export interface QueueEntry {
  leadId: string;
  name: string;
  branch: string;
  city: string;
  website?: string;
  email?: string;
  shallowScore: number;
  queuedAt: string;       // ISO timestamp
  status: QueueStatus;
  startedAt?: string;
  completedAt?: string;
  attemptCount: number;
  lastError?: string;
}

export interface ResearchResult {
  leadId: string;
  generatedAt: string;
  generatedBy: string;    // "cowork-session-xyz" | "api-haiku" | "manual"

  // The actual findings.
  websiteSummary?: string;          // 1-2 sentences
  designVerdict?: string;           // 1-2 sentences ("dated 2018 wordpress")
  achievementsFound?: string[];     // ["danmarksmester 2024", "kåret som årets..."]
  madeByBureau?: string | null;     // "wedo.dk" | null
  emailQualityTier?: "personal" | "kontakt" | "info" | "generic" | "noreply";
  reviewVelocity90d?: number;       // reviews in last 90 days
  lighthouseScoreMobile?: number;   // 0-100
  socialPresence?: string[];        // ["instagram:@xyz", "trustpilot:4.5"]
  pitchAngle?: string;              // 1 sentence: "lead with mobile-broken pitch"
  recommendedDemos?: [string, string]; // labels matching DEMO_CATALOG
  compositeScoreDelta?: number;     // adjustment to baseline score (-30 to +30)
  notes?: string;                   // freeform
}

// ------------------- QUEUE OPERATIONS -------------------

const QUEUE_KEY = "deep-research/queue";
const RESULT_PREFIX = "deep-research/result/";

export async function readQueue(): Promise<QueueEntry[]> {
  const q = await store.get<QueueEntry[]>(QUEUE_KEY);
  return Array.isArray(q) ? q : [];
}

async function writeQueue(q: QueueEntry[]): Promise<void> {
  await store.put(QUEUE_KEY, q);
}

// Add lead(s) to queue. Idempotent: existing entries are NOT duplicated.
// Returns the number of NEW entries added.
export async function enqueue(entries: Omit<QueueEntry, "queuedAt" | "status" | "attemptCount">[]): Promise<number> {
  const q = await readQueue();
  const seen = new Set(q.map((e) => e.leadId));
  let added = 0;
  for (const e of entries) {
    if (seen.has(e.leadId)) continue;
    q.push({
      ...e,
      queuedAt: new Date().toISOString(),
      status: "pending",
      attemptCount: 0,
    });
    seen.add(e.leadId);
    added++;
  }
  if (added > 0) await writeQueue(q);
  return added;
}

// Remove a lead from the queue (used after completion or cancellation).
export async function dequeue(leadId: string): Promise<boolean> {
  const q = await readQueue();
  const next = q.filter((e) => e.leadId !== leadId);
  if (next.length === q.length) return false;
  await writeQueue(next);
  return true;
}

// Mark a lead as in_progress / complete / failed. Updates timestamps.
export async function updateStatus(
  leadId: string,
  status: QueueStatus,
  lastError?: string,
): Promise<QueueEntry | null> {
  const q = await readQueue();
  const idx = q.findIndex((e) => e.leadId === leadId);
  if (idx < 0) return null;
  const entry = q[idx];
  entry.status = status;
  if (status === "in_progress" && !entry.startedAt) {
    entry.startedAt = new Date().toISOString();
    entry.attemptCount += 1;
  }
  if (status === "complete" || status === "failed") {
    entry.completedAt = new Date().toISOString();
  }
  if (lastError) entry.lastError = lastError;
  await writeQueue(q);
  return entry;
}

// Get the next N pending entries, sorted by shallow score descending so the
// best candidates get processed first if the batch runs out of budget.
export async function peekPending(n: number): Promise<QueueEntry[]> {
  const q = await readQueue();
  return q
    .filter((e) => e.status === "pending")
    .sort((a, b) => b.shallowScore - a.shallowScore)
    .slice(0, n);
}

// Queue summary for the UI ("12 pending, 3 in progress, 24 done").
export interface QueueSummary {
  total: number;
  pending: number;
  inProgress: number;
  complete: number;
  failed: number;
  oldestPendingAt: string | null;
}

export async function summary(): Promise<QueueSummary> {
  const q = await readQueue();
  const s: QueueSummary = {
    total: q.length,
    pending: 0,
    inProgress: 0,
    complete: 0,
    failed: 0,
    oldestPendingAt: null,
  };
  let oldest: string | null = null;
  for (const e of q) {
    if (e.status === "pending") {
      s.pending++;
      if (!oldest || e.queuedAt < oldest) oldest = e.queuedAt;
    } else if (e.status === "in_progress") s.inProgress++;
    else if (e.status === "complete") s.complete++;
    else if (e.status === "failed") s.failed++;
  }
  s.oldestPendingAt = oldest;
  return s;
}

// ------------------- RESULT OPERATIONS -------------------

export async function saveResult(result: ResearchResult): Promise<void> {
  await store.put(RESULT_PREFIX + result.leadId, result);
}

export async function loadResult(leadId: string): Promise<ResearchResult | null> {
  return store.get<ResearchResult>(RESULT_PREFIX + leadId);
}

// List all leadIds that have research results.
export async function listResultIds(): Promise<string[]> {
  const keys = await store.list(RESULT_PREFIX);
  return keys.map((k) => k.slice(RESULT_PREFIX.length));
}

// Garbage collect: remove queue entries older than maxAgeDays that are
// complete or failed. Pending stays forever (Lucas can review it).
export async function gc(maxAgeDays = 30): Promise<number> {
  const q = await readQueue();
  const cutoff = Date.now() - maxAgeDays * 86400_000;
  const next = q.filter((e) => {
    if (e.status === "pending" || e.status === "in_progress") return true;
    const t = e.completedAt ? new Date(e.completedAt).getTime() : Date.now();
    return t > cutoff;
  });
  const removed = q.length - next.length;
  if (removed > 0) await writeQueue(next);
  return removed;
}
