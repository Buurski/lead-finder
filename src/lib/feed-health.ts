// feed-health.ts — er de daglige datafeeds i live?
//
// Baggrunden: `data/leadgen.json` i vaulten holdt op med at blive opdateret
// 6. juli 2026 og lå tør i 25 dage uden at nogen opdagede det. Imens kørte
// `ingest-leadgen` pligtskyldigt hver morgen og hentede den samme døde fil, og
// hele skærmen så normal ud. Et system der kan gå i stå UDEN at sige det er
// farligere end et der crasher.
//
// Derfor: hver feed har en forventet kadence, og alderen holdes op mod den.
// "Kan ikke læses" er sin egen tilstand — den må aldrig se ud som "frisk".

// VIGTIGT: denne fil må ikke importere vault.ts (node:fs) eller andet
// server-only. Den importeres fra MissionControl, som er en client component,
// og et enkelt fs-import her vælter hele siden med
// "the chunking context does not support external modules (request: node:fs)".
// Selve læsningen ligger derfor i deck.ts, som kun kører på serveren.

export type FeedStatus = "fresh" | "stale" | "dead" | "unknown";

export interface FeedHealth {
  key: string;
  label: string;
  /** Hvad der går i stå når denne feed dør — vises i klartekst. */
  feeds: string;
  path: string;
  status: FeedStatus;
  at: string | null;
  ageHours: number | null;
  expectEveryHours: number;
}

export interface FeedSpec {
  key: string;
  label: string;
  feeds: string;
  path: string;
  expectEveryHours: number;
}

// Kadencerne følger de faktiske planlagte kørsler (scheduler-arkitektur.md).
const FEEDS: FeedSpec[] = [
  { key: "leadgen", label: "Nye leads", feeds: "godkendelseskøen", path: "data/leadgen.json", expectEveryHours: 24 },
  { key: "inbox", label: "Indbakke-triage", feeds: "svar-siden", path: "data/inbox.json", expectEveryHours: 24 },
  { key: "messenger", label: "Messenger", feeds: "Messenger-emner", path: "data/messenger.json", expectEveryHours: 24 },
  { key: "omverden", label: "Omverden", feeds: "omverdens-kortet", path: "data/omverden.json", expectEveryHours: 24 },
];

const STALE_FACTOR = 2;          // over det dobbelte af kadencen = forsinket
const DEAD_HOURS = 24 * 7;       // en uge uden et pip = død, ikke forsinket

/** Ren klassificering — testes uden netværk. */
export function classifyFeed(spec: FeedSpec, at: string | null, nowMs: number): FeedHealth {
  const base = { ...spec, at, status: "unknown" as FeedStatus, ageHours: null as number | null };
  if (!at) return base; // ingen tidsstempel = vi ved det ikke, ikke "frisk"
  const ts = Date.parse(at);
  if (Number.isNaN(ts)) return base;

  const ageHours = Math.max(0, (nowMs - ts) / 3_600_000);
  const status: FeedStatus =
    ageHours > DEAD_HOURS ? "dead"
      : ageHours > spec.expectEveryHours * STALE_FACTOR ? "stale"
        : "fresh";
  return { ...spec, at, ageHours, status };
}

/** Tidsstemplet ligger som `at` (de fleste feeds) eller `generatedAt` (inbox). */
export function timestampOf(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  for (const k of ["at", "generatedAt", "date"]) {
    if (typeof o[k] === "string") return o[k] as string;
  }
  return null;
}

/** Specs eksporteres, så serveren kan hente dem uden at kende stierne. */
export const FEED_SPECS: readonly FeedSpec[] = FEEDS;

/** Én linje i klartekst: "Nye leads har ikke leveret i 25 dage." */
export function feedSentence(f: FeedHealth): string {
  if (f.status === "unknown") return `${f.label}: kunne ikke læses — status ukendt.`;
  const days = Math.floor((f.ageHours ?? 0) / 24);
  const age = days >= 1 ? `${days} ${days === 1 ? "dag" : "dage"}` : `${Math.round(f.ageHours ?? 0)} timer`;
  if (f.status === "dead") return `${f.label} har ikke leveret i ${age} — ${f.feeds} får ingen ny data.`;
  if (f.status === "stale") return `${f.label} er ${age} gammel (forventet hver dag).`;
  return `${f.label}: opdateret for ${age} siden.`;
}
