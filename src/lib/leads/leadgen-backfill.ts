const BACKFILL_SOURCES = new Set(["leadgen-ingest", "cowork-leadgen", "places-direct"]);

export function isLeadgenBackfillSource(source: string | undefined): boolean {
  return source !== undefined && BACKFILL_SOURCES.has(source);
}
