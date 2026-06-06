// messenger/state.ts — which candidates Lucas has already DM'd or skipped.
// Stored in the KV/FS abstraction (not a local JSON like the old script) so the
// state is shared between the deployed app and any producer, and survives Vercel's
// ephemeral filesystem.

import { store } from "../store.ts";

export interface MessengerState {
  sent: Record<string, string>;    // leadId -> ISO timestamp
  skipped: Record<string, string>; // leadId -> ISO timestamp
}

const STATE_KEY = "messenger/state";

function empty(): MessengerState {
  return { sent: {}, skipped: {} };
}

export async function loadMessengerState(): Promise<MessengerState> {
  try {
    const s = await store.get<MessengerState>(STATE_KEY);
    if (!s || typeof s !== "object") return empty();
    return { sent: s.sent ?? {}, skipped: s.skipped ?? {} };
  } catch {
    return empty();
  }
}

async function save(s: MessengerState): Promise<void> {
  await store.put(STATE_KEY, s);
}

/** Mark a candidate sent or skipped. Idempotent. Returns the new state. */
export async function markMessenger(id: string, action: "sent" | "skip"): Promise<MessengerState> {
  const s = await loadMessengerState();
  const now = new Date().toISOString();
  if (action === "sent") {
    s.sent[id] = now;
    delete s.skipped[id];
  } else {
    s.skipped[id] = now;
    delete s.sent[id];
  }
  await save(s);
  return s;
}

/** Un-mark (move back to pending) — for an accidental click. */
export async function unmarkMessenger(id: string): Promise<MessengerState> {
  const s = await loadMessengerState();
  delete s.sent[id];
  delete s.skipped[id];
  await save(s);
  return s;
}

/** All ids that are sent or skipped (excluded from new candidate picks). */
export function handledIds(s: MessengerState): Set<string> {
  return new Set([...Object.keys(s.sent), ...Object.keys(s.skipped)]);
}
