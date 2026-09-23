// Opgaver — den daglige arbejdsløkke (Min dag/Alle/Klaret på /opgaver, og
// HQ's næste-skridt-tabel). Samler to kilder i én liste: åbne rækker i
// `task`-tabellen og aftalers næste skridt (åbne faser). Alle skrivninger
// logger hvem der gjorde hvad i `activity`, samme mønster som deals.ts.
import "server-only";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, deal, task } from "../db/schema.ts";
// DealInputError genbruges som opgavers input-fejl (ikke en ny klasse) — hq/api.ts's
// hqWrite() kender allerede den type og svarer 400 med beskeden. api.ts selv importerer
// "next/server" og må ikke importeres herfra (knækker node:test-kørslen uden Next's bundler).
import { DealInputError, normalizeStage, updateDeal, type DealPatch } from "./deals.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuidOrThrow(v: unknown, label: string): string {
  if (typeof v !== "string" || !UUID.test(v)) throw new DealInputError(`ugyldigt ${label}`);
  return v;
}

export type Owner = "lucas" | "charlie";
export type DueBucket = "forfalden" | "i_dag" | "kommende" | "uden_dato";

export interface MyDayItem {
  id: string; // task.id, eller "deal:<aftale-id>" for et næste skridt
  kind: "task" | "deal";
  title: string; // opgavetekst / næste skridt — "" kun for en aftale uden næste skridt
  context: string; // aftalens titel, eller "Opgave"
  companyId: string | null;
  company: string;
  owner: string;
  due: string; // YYYY-MM-DD eller ""
  note: string;
  important: boolean;
  bucket: DueBucket;
}

// Åbne faser for den daglige opgaveløkke. "leveret" tæller med (der er ofte
// stadig et næste skridt efter levering) — kun "betalt"/"tabt" er lukket.
const OPEN_DEAL_STAGES = new Set(["tilbud", "aftalt", "i_gang", "leveret"]);
const BUCKET_ORDER: Record<DueBucket, number> = { forfalden: 0, i_dag: 1, kommende: 2, uden_dato: 3 };

export function dueBucket(due: string, today: string): DueBucket {
  if (!due) return "uden_dato";
  if (due < today) return "forfalden";
  if (due === today) return "i_dag";
  return "kommende";
}

function sortItems(items: MyDayItem[]): MyDayItem[] {
  return items.sort((a, b) => Number(b.important) - Number(a.important) || BUCKET_ORDER[a.bucket] - BUCKET_ORDER[b.bucket] || (a.due || "9999").localeCompare(b.due || "9999"));
}

/** Samlet arbejdsløkke: åbne opgaver + aftalers næste skridt, nyeste/mest presserende først. */
export async function listMyDay(db: Db, opts: { owner?: Owner; today: string }): Promise<MyDayItem[]> {
  // Sekventielt (ikke Promise.all) — lokal pglite tåler kun 1 samtidig forbindelse
  // (fælles-regel #23); getHqSummary() kalder denne funktion fra sin egen
  // Promise.all, så to samtidige forespørgsler herinde ovenpå det er for meget.
  const taskRows = await db
    .select({ id: task.id, companyId: task.companyId, clientName: task.clientName, title: task.title, due: task.due, owner: task.owner, note: task.note, important: task.important })
    .from(task)
    .where(opts.owner ? and(isNull(task.doneAt), eq(task.owner, opts.owner)) : isNull(task.doneAt));
  const dealRows = await db
    .select({ id: deal.id, companyId: deal.companyId, company: company.name, dealTitle: deal.title, step: deal.nextStep, due: deal.nextStepDue, owner: deal.owner, stage: deal.stage })
    .from(deal)
    .innerJoin(company, and(eq(company.id, deal.companyId), eq(company.archived, false)))
    .where(opts.owner ? eq(deal.owner, opts.owner) : undefined);

  const items: MyDayItem[] = [
    ...taskRows.map((t) => ({
      id: t.id,
      kind: "task" as const,
      title: t.title,
      context: "Opgave",
      companyId: t.companyId,
      company: t.clientName,
      owner: t.owner,
      due: t.due,
      note: t.note,
      important: t.important,
      bucket: dueBucket(t.due, opts.today),
    })),
    ...dealRows
      // Kun aftaler med et næste skridt er en opgave (et klaret skridt må ikke blive en tom linje).
      .filter((d) => OPEN_DEAL_STAGES.has(normalizeStage(d.stage)) && (d.step ?? "").trim() !== "")
      .map((d) => ({
        id: `deal:${d.id}`,
        kind: "deal" as const,
        title: d.step ?? "",
        context: d.dealTitle || "Aftale",
        companyId: d.companyId,
        company: d.company,
        owner: d.owner,
        due: d.due ?? "",
        note: "",
        important: false,
        bucket: dueBucket(d.due ?? "", opts.today),
      })),
  ];
  return sortItems(items);
}

export interface DoneItem { id: string; title: string; companyId: string | null; company: string; owner: string; doneAt: string }

/** Seneste klarede opgaver. Kun `task`-rækker — et klaret næste skridt bliver til en aktivitet, ikke en varig post (se patchDealNextStep). */
export async function listDone(db: Db, opts: { owner?: Owner; limit?: number }): Promise<DoneItem[]> {
  const rows = await db
    .select({ id: task.id, title: task.title, companyId: task.companyId, clientName: task.clientName, owner: task.owner, doneAt: task.doneAt })
    .from(task)
    .where(opts.owner ? and(isNotNull(task.doneAt), eq(task.owner, opts.owner)) : isNotNull(task.doneAt))
    .orderBy(desc(task.doneAt))
    .limit(opts.limit ?? 50);
  return rows.map((r) => ({ id: r.id, title: r.title, companyId: r.companyId, company: r.clientName, owner: r.owner, doneAt: r.doneAt!.toISOString() }));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function validTitle(v: unknown): string {
  if (typeof v !== "string") throw new DealInputError("titel skal være tekst");
  const t = v.trim();
  if (!t || t.length > 200) throw new DealInputError("titel skal være 1-200 tegn");
  return t;
}
function validDue(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) throw new DealInputError("dato skal være ÅÅÅÅ-MM-DD");
  return v;
}
function validOwner(v: unknown): Owner {
  if (v !== "lucas" && v !== "charlie") throw new DealInputError("ejer skal være lucas eller charlie");
  return v;
}

export interface CreateTaskInput { companyId?: unknown; dealId?: unknown; owner?: unknown; title?: unknown; due?: unknown }

export async function createTask(db: Db, p: CreateTaskInput) {
  const title = validTitle(p.title);
  const due = validDue(p.due);
  const owner = validOwner(p.owner);
  let companyId: string | null = null;
  let clientName = "";
  if (p.companyId) {
    companyId = uuidOrThrow(p.companyId, "virksomheds-id");
    const [c] = await db.select({ id: company.id, name: company.name }).from(company).where(eq(company.id, companyId));
    if (!c) throw new DealInputError("virksomheden findes ikke");
    clientName = c.name;
  }
  const dealId = p.dealId ? uuidOrThrow(p.dealId, "aftale-id") : null;
  const [t] = await db.insert(task).values({ companyId, dealId, clientName, owner, title, due }).returning();
  return t;
}

export interface TaskPatch { done?: unknown; due?: unknown; title?: unknown; owner?: unknown; note?: unknown; important?: unknown }

function validNote(v: unknown): string {
  if (typeof v !== "string" || v.length > 4000) throw new DealInputError("note skal være højst 4000 tegn");
  return v.trim();
}

export function validateTaskPatch(p: TaskPatch): Partial<typeof task.$inferInsert> {
  if (p.done !== undefined && p.done !== true) throw new DealInputError("done skal være true");
  const fields: Partial<typeof task.$inferInsert> = {};
  if (p.due !== undefined) fields.due = validDue(p.due);
  if (p.title !== undefined) fields.title = validTitle(p.title);
  if (p.owner !== undefined) fields.owner = validOwner(p.owner);
  if (p.note !== undefined) fields.note = validNote(p.note);
  if (p.important !== undefined) {
    if (typeof p.important !== "boolean") throw new DealInputError("vigtig skal være true eller false");
    fields.important = p.important;
  }
  if (p.done !== true && Object.keys(fields).length === 0) throw new DealInputError("intet at opdatere");
  return fields;
}

/** Afslutter en opgave: sæt `doneAt` + log en aktivitet (type "opgave"). */
export async function completeTask(db: Db, id: string, actor: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(task).where(eq(task.id, id));
    if (!before) throw new DealInputError("opgaven findes ikke");
    const doneAt = new Date();
    const legacy = before.data && typeof before.data === "object" && !Array.isArray(before.data) ? before.data as Record<string, unknown> : null;
    const [after] = await tx.update(task).set({ doneAt, ...(legacy ? { data: { ...legacy, done: true, doneAt: doneAt.toISOString() } } : {}) }).where(eq(task.id, id)).returning();
    await tx.insert(activity).values({ companyId: before.companyId, dealId: before.dealId, actor, type: "opgave", summary: `Opgave klaret: ${before.title}` });
    return after;
  });
}

export async function patchTask(db: Db, id: string, p: TaskPatch, actor: string) {
  const fields = validateTaskPatch(p);
  if (p.done === true) return completeTask(db, id, actor);
  const [before] = await db.select({ data: task.data }).from(task).where(eq(task.id, id));
  if (!before) throw new DealInputError("opgaven findes ikke");
  if (before.data && typeof before.data === "object" && !Array.isArray(before.data)) {
    fields.data = { ...(before.data as Record<string, unknown>), ...(fields.title !== undefined ? { title: fields.title } : {}), ...(fields.due !== undefined ? { due: fields.due } : {}) };
  }
  const [after] = await db.update(task).set(fields).where(eq(task.id, id)).returning();
  if (!after) throw new DealInputError("opgaven findes ikke");
  return after;
}

/** Samme fire felter på en aftales næste skridt — genbruger updateDeal i stedet for at duplikere dens validering/aktivitetslog. */
export async function patchDealNextStep(db: Db, dealId: string, p: TaskPatch, actor: string) {
  if (p.note !== undefined || p.important !== undefined) throw new DealInputError("aftalens næste skridt har ikke note eller vigtig");
  validateTaskPatch(p);
  if (p.done === true) {
    const [before] = await db.select({ title: deal.title, nextStep: deal.nextStep, companyId: deal.companyId }).from(deal).where(eq(deal.id, dealId));
    if (!before) throw new DealInputError("aftalen findes ikke");
    const after = await updateDeal(db, dealId, { nextStep: "", nextStepDue: "" }, actor);
    await db.insert(activity).values({ companyId: before.companyId, dealId, actor, type: "opgave", summary: `Næste skridt klaret: ${before.nextStep ?? ""}` });
    return after;
  }
  const patch: DealPatch = {};
  if (p.due !== undefined) patch.nextStepDue = p.due;
  if (p.title !== undefined) patch.nextStep = p.title;
  if (p.owner !== undefined) patch.owner = p.owner;
  return updateDeal(db, dealId, patch, actor);
}

export async function deleteHqTask(db: Db, id: string, actor: string) {
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(task).where(eq(task.id, id));
    if (!before) throw new DealInputError("opgaven findes ikke");
    await tx.delete(task).where(eq(task.id, id));
    await tx.insert(activity).values({ companyId: before.companyId, dealId: before.dealId, actor, type: "opgave", summary: `Opgave slettet: ${before.title}` });
  });
}
