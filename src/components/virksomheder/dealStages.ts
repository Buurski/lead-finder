// Klient-sikker adgang til aftale-faserne (deals.ts har `server-only` og må ikke
// importeres i en client component). Selve definitionen bor ét sted: lib/hq/deal-stages.ts.
export { DEAL_STAGES, STAGE_LABEL, normalizeStage, type DealStage } from "../../lib/hq/deal-stages.ts";
