// places-budget.ts — a per-day cap on Google Places queries so the auto-sweep (up
// to ~20 chunks × dozens of queries) can't quietly run up a bill or hit quota.
// Counts queries per Copenhagen day in the store; the scrape route checks before
// each chunk and the feed shows the remaining budget. Strip-safe.

import { store } from "./store.ts";
import { copenhagenNow } from "./settings.ts";

export const PLACES_DAILY_CAP = 1500;

const keyFor = (date: string) => `places/calls/${date}`;

export interface PlacesBudget {
  used: number;
  cap: number;
  remaining: number;
  date: string;
}

export async function getPlacesUsed(date = copenhagenNow().date): Promise<number> {
  try {
    return (await store.get<number>(keyFor(date))) ?? 0;
  } catch {
    return 0;
  }
}

/** Add n queries to today's tally; returns the new total. Best-effort (store
 *  failure just means the cap isn't enforced that call — never blocks scraping). */
export async function addPlacesCalls(n: number): Promise<number> {
  const date = copenhagenNow().date;
  const next = (await getPlacesUsed(date)) + Math.max(0, n);
  try {
    await store.put(keyFor(date), next);
  } catch { /* best-effort */ }
  return next;
}

export async function placesBudget(): Promise<PlacesBudget> {
  const date = copenhagenNow().date;
  const used = await getPlacesUsed(date);
  return { used, cap: PLACES_DAILY_CAP, remaining: Math.max(0, PLACES_DAILY_CAP - used), date };
}
