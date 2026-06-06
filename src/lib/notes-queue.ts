// notes-queue.ts — a KV-backed queue of "facts about reality" the app learns
// (a lead said no, a maybe-later, a chat note) that a Cowork mirror-task later
// writes into Obsidian. The app NEVER writes the vault directly (read-only token);
// it just records the note here. Strip-safe.

import { store } from "./store.ts";

export type NoteBucket = "said-no" | "maybe-later" | "interested" | "general" | "task-intent";

export interface PendingNote {
  at: string;        // ISO
  bucket: NoteBucket;
  text: string;
  leadId?: string;
  leadName?: string;
  mirrored?: boolean; // set true by the Cowork mirror-task after writing to Obsidian
}

const KEY = "obsidian/pending-notes";
const MAX = 500;

export async function queueNote(n: Omit<PendingNote, "at" | "mirrored">): Promise<void> {
  let list: PendingNote[] = [];
  try {
    list = (await store.get<PendingNote[]>(KEY)) ?? [];
  } catch {
    list = [];
  }
  list.push({ ...n, at: new Date().toISOString(), mirrored: false });
  await store.put(KEY, list.slice(-MAX));
}

export async function readNotes(opts: { onlyUnmirrored?: boolean } = {}): Promise<PendingNote[]> {
  let list: PendingNote[] = [];
  try {
    list = (await store.get<PendingNote[]>(KEY)) ?? [];
  } catch {
    list = [];
  }
  return opts.onlyUnmirrored ? list.filter((n) => !n.mirrored) : list;
}
