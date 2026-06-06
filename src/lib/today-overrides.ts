// today-overrides.ts — lightweight, chat-driven overrides for "Hvad skal vi i dag".
//
// The app can't write Lucas's Obsidian vault (read-only token), so when he tells the
// chat "fjern Salon Artec fra i dag" / "jeg vil ikke have X her", we record the
// suppressed business name in KV. Mission Control's needs-you + pulse lists filter
// these out, so the chat genuinely changes what shows today — without touching the
// layout. A Cowork mirror-task can later reflect it into Obsidian. Strip-safe.

import { store } from "./store.ts";

const KEY = "today/suppressed";
const MAX = 200;

function nameKey(s: string): string {
  return (s || "").trim().toLowerCase();
}

export async function getSuppressed(): Promise<Set<string>> {
  try {
    const list = (await store.get<string[]>(KEY)) ?? [];
    return new Set(list.map(nameKey));
  } catch {
    return new Set();
  }
}

export async function addSuppressed(name: string): Promise<void> {
  const key = nameKey(name);
  if (!key) return;
  let list: string[] = [];
  try {
    list = (await store.get<string[]>(KEY)) ?? [];
  } catch {
    list = [];
  }
  if (!list.map(nameKey).includes(key)) list.push(key);
  await store.put(KEY, list.slice(-MAX));
}

export async function removeSuppressed(name: string): Promise<void> {
  const key = nameKey(name);
  let list: string[] = [];
  try {
    list = (await store.get<string[]>(KEY)) ?? [];
  } catch {
    list = [];
  }
  await store.put(KEY, list.filter((n) => nameKey(n) !== key));
}

/** True when a business name is currently suppressed from "today". */
export function isSuppressed(suppressed: Set<string>, name: string): boolean {
  return suppressed.has(nameKey(name));
}
