// HQ-forsidens tal — alt læses fra Postgres i få forespørgsler. KV-kilder
// (kinly.dk-henvendelser) og Hermes hentes af siden selv og må fejle uden at
// vælte resten.
import "server-only";
import { and, eq, gt, gte, inArray, ne, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, invoice, outreach, subscriptionPlan } from "../db/schema.ts";
import { invoiceTotal, isOverdue, type Invoice, type Subscription } from "../invoices.ts";
import { listMyDay, type MyDayItem } from "./tasks.ts";

export const FUNNEL = ["ny", "kontaktet", "svaret", "interesseret", "kunde"] as const;
export type FunnelStage = (typeof FUNNEL)[number];

// Kladder der venter på et menneske (samme statusser som /approve viser som åbne).
const OPEN_DRAFT = ["pending", "edited"];
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

function itemState(item: MyDayItem, today: string): StepState {
  // En aftale uden næste skridt overhovedet "mangler" — adskilt fra en opgave/aftale
  // der bare ikke har en dato endnu (også "mangler", men har en tekst at vise).
  if (item.kind === "deal" && !item.title) return "mangler";
  return stepState(item.due, today);
}

/**
 * HQ's næste-skridt-tabel: samme kilde som /opgaver (tasks.ts#listMyDay), ikke en
 * egen forespørgsel. `me` (den indloggede person) sorteres øverst blandt de
 * forfaldne/i dag-opgaver, resten følger den almindelige forfald-rækkefølge.
 */
export async function getHqSummary(db: Db, today: string, me?: string | null): Promise<HqSummary> {
  const n = sql<number>`count(*)::int`;
  const leadRows = and(gt(company.rowNo, 0), eq(company.archived, false));

  const [[drafts], [replies], funnelRows, invRows, subRows, items] = await Promise.all([
    db.select({ n }).from(outreach).where(inArray(outreach.status, OPEN_DRAFT)),
    // Ubehandlet svar: der er svaret, men ingen har flyttet leadet videre endnu.
    db.select({ n }).from(company).where(and(leadRows, eq(company.emailStatus, "replied"), inArray(company.leadStatus, ["new", "called"]))),
    db.select({ stage: company.lifecycle, n }).from(company).where(leadRows).groupBy(company.lifecycle),
    db.select({ data: invoice.data }).from(invoice).where(inArray(invoice.status, UNPAID)),
    db.select({ data: subscriptionPlan.data }).from(subscriptionPlan),
    listMyDay(db, { today }),
  ]);

  const counts = new Map(funnelRows.map((r) => [r.stage, r.n]));

  const steps: NextStep[] = items
    .map((it) => ({
      companyId: it.companyId,
      company: it.company,
      what: it.context,
      step: it.title,
      owner: it.owner,
      due: it.due,
      state: itemState(it, today),
    }))
    .sort((a, b) => {
      const aMine = me && a.owner === me && (a.state === "forfalden" || a.due === today) ? 0 : 1;
      const bMine = me && b.owner === me && (b.state === "forfalden" || b.due === today) ? 0 : 1;
      return aMine - bMine || ORDER[a.state] - ORDER[b.state] || (a.due || "9999").localeCompare(b.due || "9999");
    });

  const invoices = invRows.map((r) => r.data as Invoice);
  const subs = subRows.map((r) => r.data as Subscription).filter((s) => s.active);

  return {
    kpi: {
      draftsPending: drafts.n,
      newReplies: replies.n,
      overdueNextSteps: items.filter((it) => it.bucket === "forfalden" || (it.kind === "deal" && !it.title)).length,
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

// Seneste menneskelige handling pr. person, seneste 7 dage (check-ins fra
// Hermes logges med actor=lucas/charlie og type=checkin, se agent-log.ts —
// de tælles med her uden ekstra filter). Ældre end 7 dage regnes som ingen
// aktivitet, så kortet ikke viser en månedsgammel note som "seneste".
async function teamNow(db: Db): Promise<HqSummary["team"]> {
  const people = ["lucas", "charlie"] as const;
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  return Promise.all(
    people.map(async (person) => {
      const [row] = await db
        .select({ summary: activity.summary, at: activity.at })
        .from(activity)
        .where(and(eq(activity.actor, person), ne(activity.type, "invoice"), gte(activity.at, cutoff)))
        .orderBy(sql`${activity.at} desc`)
        .limit(1);
      return { person, summary: row?.summary ?? "", at: row?.at ? row.at.toISOString() : null };
    }),
  );
}

