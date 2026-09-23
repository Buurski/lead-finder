// HQ-forsidens tal — alt læses fra Postgres i få forespørgsler. KV-kilder
// (kinly.dk-henvendelser) og Hermes hentes af siden selv og må fejle uden at
// vælte resten.
import "server-only";
import { and, asc, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, deal, invoice, outreach, subscriptionPlan, task } from "../db/schema.ts";
import { invoiceTotal, isOverdue, type Invoice, type Subscription } from "../invoices.ts";
import { normalizeStage } from "./deals.ts";

export const FUNNEL = ["ny", "kontaktet", "svaret", "interesseret", "kunde"] as const;
export type FunnelStage = (typeof FUNNEL)[number];

// Kladder der venter på et menneske (samme statusser som /approve viser som åbne).
const OPEN_DRAFT = ["pending", "edited"];
// Deal-faser der er afsluttede — de har ikke brug for et næste skridt.
const CLOSED_DEAL = new Set(["leveret", "betalt", "tabt"]);
const UNPAID = ["sendt", "forfalden", "rykket"];

export type StepState = "forfalden" | "snart" | "ok" | "mangler";

export interface NextStep {
  companyId: string | null;
  company: string;
  what: string; // deal-titel eller "Opgave"
  step: string;
  owner: string;
  due: string; // YYYY-MM-DD eller ""
  state: StepState;
}

export interface HqSummary {
  kpi: { draftsPending: number; newReplies: number; overdueNextSteps: number };
  funnel: Array<{ stage: FunnelStage; n: number }>;
  nextSteps: NextStep[];
  money: { mrr: number; outstanding: number; overdueCount: number };
  team: Array<{ person: "lucas" | "charlie"; summary: string; at: string | null }>;
}

export function stepState(due: string, today: string): StepState {
  if (!due) return "mangler";
  if (due < today) return "forfalden";
  // "snart" = i dag eller i morgen
  const t = new Date(`${today}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + 1);
  return due <= t.toISOString().slice(0, 10) ? "snart" : "ok";
}

const ORDER: Record<StepState, number> = { forfalden: 0, snart: 1, mangler: 2, ok: 3 };

export async function getHqSummary(db: Db, today: string): Promise<HqSummary> {
  const n = sql<number>`count(*)::int`;
  const leadRows = and(gt(company.rowNo, 0), eq(company.archived, false));

  const [[drafts], [replies], funnelRows, dealRows, taskRows, invRows, subRows] = await Promise.all([
    db.select({ n }).from(outreach).where(inArray(outreach.status, OPEN_DRAFT)),
    // Ubehandlet svar: der er svaret, men ingen har flyttet leadet videre endnu.
    db.select({ n }).from(company).where(and(leadRows, eq(company.emailStatus, "replied"), inArray(company.leadStatus, ["new", "called"]))),
    db.select({ stage: company.lifecycle, n }).from(company).where(leadRows).groupBy(company.lifecycle),
    db
      .select({ companyId: deal.companyId, company: company.name, title: deal.title, step: deal.nextStep, due: deal.nextStepDue, owner: deal.owner, stage: deal.stage })
      .from(deal)
      .innerJoin(company, and(eq(company.id, deal.companyId), eq(company.archived, false))),
    db
      .select({ companyId: task.companyId, clientName: task.clientName, title: task.title, due: task.due, owner: task.owner })
      .from(task)
      .where(isNull(task.doneAt))
      .orderBy(asc(task.due)),
    db.select({ data: invoice.data }).from(invoice).where(inArray(invoice.status, UNPAID)),
    db.select({ data: subscriptionPlan.data }).from(subscriptionPlan),
  ]);

  const counts = new Map(funnelRows.map((r) => [r.stage, r.n]));

  const steps: NextStep[] = [
    ...dealRows.filter((d) => !CLOSED_DEAL.has(normalizeStage(d.stage))).map((d) => ({
      companyId: d.companyId,
      company: d.company,
      what: d.title || "Aftale",
      step: d.step ?? "",
      owner: d.owner,
      due: d.due ?? "",
      state: d.step ? stepState(d.due ?? "", today) : ("mangler" as StepState),
    })),
    ...taskRows.map((t) => ({
      companyId: t.companyId,
      company: t.clientName,
      what: "Opgave",
      step: t.title,
      owner: t.owner,
      due: t.due,
      state: stepState(t.due, today),
    })),
  ].sort((a, b) => ORDER[a.state] - ORDER[b.state] || (a.due || "9999").localeCompare(b.due || "9999"));

  const invoices = invRows.map((r) => r.data as Invoice);
  const subs = subRows.map((r) => r.data as Subscription).filter((s) => s.active);

  return {
    kpi: {
      draftsPending: drafts.n,
      newReplies: replies.n,
      overdueNextSteps: steps.filter((s) => s.state === "forfalden" || !s.step.trim()).length,
    },
    funnel: FUNNEL.map((stage) => ({ stage, n: counts.get(stage) ?? 0 })),
    nextSteps: steps.slice(0, 8),
    money: {
      mrr: subs.reduce((sum, s) => sum + s.lines.reduce((a, l) => a + l.amount, 0), 0),
      outstanding: invoices.reduce((sum, i) => sum + invoiceTotal(i).total, 0),
      overdueCount: invoices.filter((i) => isOverdue(i, today)).length,
    },
    team: await teamNow(db),
  };
}

// Seneste menneskelige handling pr. person (check-ins kommer i fase 5).
async function teamNow(db: Db): Promise<HqSummary["team"]> {
  const people = ["lucas", "charlie"] as const;
  return Promise.all(
    people.map(async (person) => {
      const [row] = await db
        .select({ summary: activity.summary, at: activity.at })
        .from(activity)
        .where(and(eq(activity.actor, person), ne(activity.type, "invoice")))
        .orderBy(sql`${activity.at} desc`)
        .limit(1);
      return { person, summary: row?.summary ?? "", at: row?.at ? row.at.toISOString() : null };
    }),
  );
}

