// Delt mellem PipelineBoard, DealCard og NewDealDialog (fase 2 Task 5).
import type { DealStage, PipelineCard } from "@/lib/hq/deals";

export type Owner = "" | "lucas" | "charlie";
export const OWNER_LABEL: Record<Owner, string> = { "": "ingen ejer", lucas: "Lucas", charlie: "Charlie" };
export const STALE_EXEMPT = new Set(["betalt", "tabt"]);

export interface StageInfo {
  stage: DealStage;
  label: string;
}

// Spejler stepState() i src/lib/hq/summary.ts — den fil har "server-only" og
// kan ikke importeres herfra, så logikken (6 linjer, stabil) er duplikeret.
export type StepState = "forfalden" | "snart" | "ok" | "mangler";
// Nogle migrerede rækker har rod i next_step_due (ikke ÅÅÅÅ-MM-DD) — den slags
// tælles som "mangler" i stedet for at fremvise "Invalid Date" på kortet.
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export function stepState(due: string, today: string): StepState {
  if (!due || !DATE.test(due)) return "mangler";
  if (due < today) return "forfalden";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return due <= t.toISOString().slice(0, 10) ? "snart" : "ok";
}

export function formatDue(due: string, today: string): string {
  if (!due || !DATE.test(due)) return "";
  if (due === today) return "I dag";
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  if (due === t.toISOString().slice(0, 10)) return "I morgen";
  return new Date(`${due}T00:00:00Z`).toLocaleDateString("da-DK", { day: "2-digit", month: "short" });
}

export function formatKr(n: number): string {
  return `${n.toLocaleString("da-DK")} kr`;
}

export function colSum(cards: PipelineCard[]): string {
  const mrr = cards.reduce((s, c) => s + (c.mrrDkk || 0), 0);
  const value = cards.reduce((s, c) => s + (c.valueDkk || 0), 0);
  const parts = [mrr ? `${formatKr(mrr)}/md` : "", value ? formatKr(value) : ""].filter(Boolean);
  return parts.length ? parts.join(" + ") : "–";
}

export function staleDays(updatedAt: string, today: string): number {
  const upd = new Date(updatedAt);
  const now = new Date(`${today}T00:00:00Z`);
  const updUtc = Date.UTC(upd.getUTCFullYear(), upd.getUTCMonth(), upd.getUTCDate());
  return Math.floor((now.getTime() - updUtc) / 86_400_000);
}

/** companyId → antal aftaler i det viste board (ponytail: tæller kun de
 * kort der er i det aktuelle filter — ejer-filter kan derfor undertælle en
 * kundes fulde aftaletal; upgrade til uafhængigt API-kald hvis det generer). */
export function dealCountsByCompany(cards: PipelineCard[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cards) m.set(c.companyId, (m.get(c.companyId) ?? 0) + 1);
  return m;
}
