// Klient-sikker kopi af de faser og labels der er defineret i
// src/lib/hq/deals.ts (som har `server-only` og derfor ikke må importeres i en
// client component). Ren, statisk data — hold i sync med deals.ts manuelt hvis
// faserne nogensinde ændres.
export const DEAL_STAGES = ["tilbud", "aftalt", "i_gang", "leveret", "betalt", "tabt"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const STAGE_LABEL: Record<DealStage, string> = {
  tilbud: "Tilbud",
  aftalt: "Aftalt",
  i_gang: "I gang",
  leveret: "Leveret",
  betalt: "Betalt",
  tabt: "Tabt",
};

export function normalizeStage(raw: string): DealStage {
  const v = raw.trim().toLowerCase();
  return (DEAL_STAGES as readonly string[]).includes(v) ? (v as DealStage) : "tilbud";
}
