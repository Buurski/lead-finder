// Aftale-faser: én kanonisk kilde. Ren data uden `server-only`, så både serveren
// (deals.ts re-eksporterer herfra) og klient-komponenter (components/virksomheder/
// dealStages.ts re-eksporterer herfra) bruger samme liste, labels og normalizeStage.
export const DEAL_STAGES = ["moede", "tilbud", "aftalt", "i_gang", "leveret", "betalt", "tabt"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const STAGE_LABEL: Record<DealStage, string> = {
  moede: "Møde",
  tilbud: "Tilbud",
  aftalt: "Aftalt",
  i_gang: "I gang",
  leveret: "Leveret",
  betalt: "Betalt",
  tabt: "Tabt",
};

// Gamle Client.stage-værdier fra Sheets → deal-faser.
const LEGACY: Record<string, DealStage> = {
  lead: "tilbud", contacted: "tilbud", engaged: "tilbud", concept: "tilbud", offer: "tilbud", negotiation: "tilbud",
  won: "aftalt", delivering: "i_gang", live: "leveret", lost: "tabt",
};

/**
 * Deal-fase for en rå værdi (ny fase, gammel Sheets-værdi eller tom). Ukendt/tom → "aftalt"
 * (eller udledt af site-status): det er hvad pipeline-tavlen og alle server-regler altid har
 * gjort, så eksisterende aftaler står i samme kolonne som før.
 */
export function normalizeStage(raw: string, websiteStatus = ""): DealStage {
  const v = raw.trim().toLowerCase();
  if ((DEAL_STAGES as readonly string[]).includes(v)) return v as DealStage;
  if (LEGACY[v]) return LEGACY[v];
  // Tom fase på en gammel kunde: udled af site-status som finance.ts gjorde.
  if (websiteStatus === "live") return "leveret";
  if (websiteStatus === "in progress") return "i_gang";
  return "aftalt";
}
