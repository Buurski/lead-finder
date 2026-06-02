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

import fs from "node:fs";
import path from "node:path";

import type { Demo } from "./demos.ts";

export type DraftStatus = "pending" | "approved" | "edited" | "rejected";

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
}

const QUEUE_DIR = path.join(process.cwd(), ".send_queue");
const QUEUE_FILE = path.join(QUEUE_DIR, "approval_queue.json");

export function queueFilePath(): string {
  return QUEUE_FILE;
}

export function readQueue(): QueueDraft[] {
  try {
    const raw = fs.readFileSync(QUEUE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as QueueDraft[]) : [];
  } catch {
    // Missing file / bad JSON -> empty queue (the engine creates it on first run).
    return [];
  }
}

export function writeQueue(drafts: QueueDraft[]): void {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  fs.writeFileSync(QUEUE_FILE, JSON.stringify(drafts, null, 2), "utf-8");
}

// Append new drafts (used by the engine COLLECT step). Returns the full queue.
export function appendDrafts(newDrafts: QueueDraft[]): QueueDraft[] {
  const existing = readQueue();
  const merged = [...existing, ...newDrafts];
  writeQueue(merged);
  return merged;
}

// Update one draft's status/body (used by /approve actions). Never sends mail —
// "approve" only marks the draft approved; real sending is a later layer.
export function updateDraft(
  id: string,
  patch: { status?: DraftStatus; subject?: string; body?: string }
): QueueDraft | null {
  const drafts = readQueue();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx === -1) return null;
  const next = {
    ...drafts[idx],
    ...(patch.status ? { status: patch.status } : {}),
    ...(patch.subject !== undefined ? { subject: patch.subject } : {}),
    ...(patch.body !== undefined ? { body: patch.body } : {}),
    updatedAt: new Date().toISOString(),
  };
  drafts[idx] = next;
  writeQueue(drafts);
  return next;
}

export function newDraftId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}
