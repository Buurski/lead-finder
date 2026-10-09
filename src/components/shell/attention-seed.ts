import type { AttentionItem } from "@/lib/hq/attention";

// HQ-forsiden har allerede regnet "kræver dig" på serveren. Den lægger listen her,
// så klokken i topbaren kan bruge den i stedet for at lave et ekstra /api/opmaerksomhed-kald
// (som kører hele getAttention en gang til). Kun i browseren; udløber efter 10 s.
let seed: { items: AttentionItem[]; at: number } | null = null;

export function seedAttention(items: AttentionItem[]): void {
  if (typeof window !== "undefined") seed = { items, at: Date.now() };
}

export function takeAttentionSeed(): AttentionItem[] | null {
  const s = seed;
  seed = null;
  return s && Date.now() - s.at < 10_000 ? s.items : null;
}
