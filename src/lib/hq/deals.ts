// Aftaler (deals): én virksomhed kan have flere på én gang (site leveret +
// nyhedsbrev i gang + hjemmesidepas). Hver ændring skriver en hændelse i
// tidslinjen med hvem der gjorde det.
import "server-only";
import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, deal, task } from "../db/schema.ts";
import { copenhagenNow } from "../settings.ts";

import { DEAL_STAGES, STAGE_LABEL, normalizeStage, type DealStage } from "./deal-stages.ts";
export { DEAL_STAGES, STAGE_LABEL, normalizeStage, type DealStage };

export class DealInputError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function text(v: unknown, label: string, max: number, required = false): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new DealInputError(`${label} skal være tekst`);
  const t = v.trim();
  if (required && !t) throw new DealInputError(`${label} mangler`);
  if (t.length > max) throw new DealInputError(`${label} er for lang`);
  return t;
}

function amount(v: unknown, label: string): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new DealInputError(`${label} skal være et beløb`);
  return Math.round(n);
}

export interface DealPatch {
  title?: unknown;
  stage?: unknown;
  valueDkk?: unknown;
  mrrDkk?: unknown;
  owner?: unknown;
  nextStep?: unknown;
  nextStepDue?: unknown;
}

function validPatch(p: DealPatch) {
  const out: Partial<typeof deal.$inferInsert> = {};
  const title = text(p.title, "Titel", 120);
  if (title !== undefined) out.title = title;
  if (p.stage !== undefined) {
    if (typeof p.stage !== "string" || !(DEAL_STAGES as readonly string[]).includes(p.stage)) throw new DealInputError("ukendt fase");
    out.stage = p.stage;
  }
  const value = amount(p.valueDkk, "Værdi");
  if (value !== undefined) out.valueDkk = value;
  const mrr = amount(p.mrrDkk, "Månedspris");
  if (mrr !== undefined) out.mrrDkk = mrr;
  if (p.owner !== undefined) {
    if (p.owner !== "lucas" && p.owner !== "charlie" && p.owner !== "") throw new DealInputError("ejer skal være lucas eller charlie");
    out.owner = p.owner;
  }
  const step = text(p.nextStep, "Næste skridt", 200);
  if (step !== undefined) out.nextStep = step || null;
  if (p.nextStepDue !== undefined) {
    if (p.nextStepDue !== "" && p.nextStepDue !== null && (typeof p.nextStepDue !== "string" || !DATE.test(p.nextStepDue))) {
      throw new DealInputError("dato skal være ÅÅÅÅ-MM-DD");
    }
    out.nextStepDue = (p.nextStepDue as string) || null;
  }
  return out;
}

export async function createDeal(db: Db, companyId: string, p: DealPatch, actor: string) {
  // Uden ejer vises aftalens næste skridt ikke i nogens "Min dag" (E2E 26/9) — opretteren ejer den.
  const fields = validPatch({ stage: "tilbud", ...(actor === "lucas" || actor === "charlie" ? { owner: actor } : {}), ...p });
  if (!fields.title) throw new DealInputError("Titel mangler");
  return db.transaction(async (tx) => {
    const [c] = await tx.select({ id: company.id }).from(company).where(eq(company.id, companyId));
    if (!c) throw new DealInputError("virksomheden findes ikke");
    const [d] = await tx.insert(deal).values({ companyId, ...fields }).returning();
    await tx.insert(activity).values({ companyId, dealId: d.id, actor, type: "fase", summary: `Ny aftale: ${d.title} (${STAGE_LABEL[d.stage as DealStage] ?? d.stage})` });
    return d;
  });
}

export async function updateDeal(db: Db, dealId: string, p: DealPatch, actor: string) {
  const fields = validPatch(p);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(deal).where(eq(deal.id, dealId)).for("update");
    if (!before) throw new DealInputError("aftalen findes ikke");
    const [after] = await tx.update(deal).set({ ...fields, updatedAt: new Date() }).where(eq(deal.id, dealId)).returning();
    const changes: string[] = [];
    if (fields.stage && fields.stage !== before.stage) {
      changes.push(`${STAGE_LABEL[normalizeStage(before.stage)]} → ${STAGE_LABEL[fields.stage as DealStage]}`);
      if (fields.stage === "aftalt" && !before.wonAt) await tx.update(deal).set({ wonAt: new Date().toISOString().slice(0, 10) }).where(eq(deal.id, dealId));
      if (fields.stage === "tabt" && !before.lostAt) await tx.update(deal).set({ lostAt: new Date().toISOString().slice(0, 10) }).where(eq(deal.id, dealId));
    }
    if (fields.nextStep !== undefined && fields.nextStep !== before.nextStep && fields.nextStep) {
      changes.push(`næste skridt: ${fields.nextStep}${fields.nextStepDue ? ` (${fields.nextStepDue})` : ""}`);
    }
    if (changes.length) {
      await tx.insert(activity).values({ companyId: before.companyId, dealId, actor, type: "fase", summary: `${after.title || "Aftale"}: ${changes.join(", ")}` });
    }
    if (fields.stage === "tilbud" && normalizeStage(before.stage) === "moede") await quoteFollowUps(tx as unknown as Db, after);
    return after;
  });
}

/** Møde → Tilbud: opgaverne "Send tilbud" (+2 dage) og "Følg op" (+5 dage), ejet af aftalens ejer.
 * Ingen dubletter: hver type tjekkes for sig, og kun de typer uden åben opgave oprettes. */
async function quoteFollowUps(tx: Db, d: typeof deal.$inferSelect) {
  const open = await tx.select({ kind: sql<string>`${task.data}->>'kind'` }).from(task)
    .where(and(isNull(task.doneAt), sql`${task.data}->>'dealId' = ${d.id}`, sql`${task.data}->>'kind' in ('tilbud-send', 'tilbud-foelg')`));
  const has = new Set(open.map((r) => r.kind));
  const [c] = await tx.select({ name: company.name }).from(company).where(eq(company.id, d.companyId));
  const name = c?.name || "kunden";
  const owner = d.owner === "charlie" ? "charlie" : "lucas";
  const [y, m, day] = copenhagenNow().date.split("-").map(Number);
  const plus = (n: number) => new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
  const base = { companyId: d.companyId, dealId: d.id, clientName: name, owner };
  const rows = [
    { ...base, title: `Send tilbud til ${name}`, due: plus(2), data: { kind: "tilbud-send", dealId: d.id } },
    { ...base, title: `Følg op på tilbud til ${name}`, due: plus(5), data: { kind: "tilbud-foelg", dealId: d.id } },
  ].filter((r) => !has.has(r.data.kind));
  if (rows.length) await tx.insert(task).values(rows);
}

/**
 * Sletter en aftale. Afvises hvis den er betalt, eller hvis fakturerede
 * aktiviteter peger på den (schema-relationen: activity.deal_id +
 * invoiced_at) — begge ville miste regnskabssporet. Aktivitets-/opgave-rækker
 * der peger på aftalen mister kun deal-id'et, ikke sig selv.
 */
export async function deleteDeal(db: Db, dealId: string, actor: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(deal).where(eq(deal.id, dealId)).for("update");
    if (!before) throw new DealInputError("aftalen findes ikke");
    if (normalizeStage(before.stage) === "betalt") throw new DealInputError("en betalt aftale kan ikke slettes");
    const [invoiced] = await tx.select({ id: activity.id }).from(activity)
      .where(and(eq(activity.dealId, dealId), isNotNull(activity.invoicedAt)));
    if (invoiced) throw new DealInputError("aftalen har fakturerede aktiviteter og kan ikke slettes");
    await tx.update(activity).set({ dealId: null }).where(eq(activity.dealId, dealId));
    await tx.update(task).set({ dealId: null }).where(eq(task.dealId, dealId));
    await tx.delete(deal).where(eq(deal.id, dealId));
    await tx.insert(activity).values({ companyId: before.companyId, actor, type: "fase", summary: `Aftale slettet: ${before.title || "Aftale"}`,
      // Regnskabssporet: hvad aftalen var værd, da den blev slettet (Opus-council 26/9).
      payload: { dealId, title: before.title, stage: before.stage, valueDkk: before.valueDkk, mrrDkk: before.mrrDkk } });
    return { id: dealId };
  });
}

export interface PipelineCard {
  id: string;
  companyId: string;
  company: string;
  title: string;
  stage: DealStage;
  owner: string;
  valueDkk: number | null;
  mrrDkk: number | null;
  nextStep: string | null;
  nextStepDue: string | null;
  updatedAt: string;
}

export async function listPipeline(db: Db): Promise<PipelineCard[]> {
  const rows = await db
    .select({ d: deal, company: company.name })
    .from(deal)
    .innerJoin(company, and(eq(company.id, deal.companyId), eq(company.archived, false)))
    .orderBy(asc(deal.nextStepDue));
  return rows.map(({ d, company: name }) => ({
    id: d.id,
    companyId: d.companyId,
    company: name,
    title: d.title || d.package || "Aftale",
    stage: normalizeStage(d.stage),
    owner: d.owner,
    valueDkk: d.valueDkk ?? (Number(d.setupFeeRaw) || null),
    mrrDkk: d.mrrDkk ?? (Number(d.monthlyFeeRaw) || null),
    nextStep: d.nextStep,
    nextStepDue: d.nextStepDue,
    updatedAt: d.updatedAt.toISOString(),
  }));
}
