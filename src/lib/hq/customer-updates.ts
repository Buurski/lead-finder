// Kundeopdateringer (spec §6): "Nu har vi lavet det her for jer". Samler kunde-
// synligt arbejde der ikke er fortalt om endnu til ÉN kladde. Kladden sendes
// aldrig herfra — Lucas/Charlie åbner den i Gmail og sender selv. Kladden er en
// activity (type "kundeopdatering") så den står i tidslinjen og kan følges.
import { and, desc, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, contact } from "../db/schema.ts";

export class UpdateError extends Error {}

export type UpdateStatus = "kladde" | "sendt" | "kasseret";
export interface UpdatePayload {
  status: UpdateStatus;
  subject: string;
  body: string;
  to: string;
  activityIds: string[];
}

export interface CustomerUpdate extends UpdatePayload {
  id: string;
  companyId: string;
  company: string;
  actor: string;
  at: string;
}

type Generate = (prompt: string, system: string) => Promise<string | null>;

const SYSTEM = `Du skriver en kort opdateringsmail på dansk fra Kinly (et lille webbureau) til en eksisterende kunde.
Regler: Du-form, varm og konkret, maks 110 ord. Start med "Hej <fornavn eller firmanavn>,". Fortæl hvad vi har lavet i almindelige ord (ikke teknisk jargon), og hvad det betyder for dem.
Ingen priser, ingen salg, ingen udråbstegn, ingen floskler ("spændende", "rejse", "løfte", "sømløs", "i en verden hvor"). Ingen underskrift — den tilføjes bagefter.
Svar KUN med mailens brødtekst.`;

function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** Deterministisk version når ingen model svarer — kedelig men korrekt. */
export function fallbackBody(greeting: string, items: string[]): string {
  const list = items.map((s) => `- ${s}`).join("\n");
  return `Hej ${greeting},\n\nEn kort opdatering på hvad vi har lavet for jer:\n\n${list}\n\nSig endelig til hvis noget skal justeres.`;
}

/** Kunde-synligt arbejde der endnu ikke er fortalt om. */
export async function untoldWork(db: Db, companyId: string) {
  return db
    .select({ id: activity.id, summary: activity.summary, at: activity.at })
    .from(activity)
    .where(
      and(
        eq(activity.companyId, companyId),
        eq(activity.type, "arbejde"),
        sql`coalesce((${activity.payload}->>'kundeSynlig')::boolean, false)`,
        sql`not (coalesce(${activity.payload}, '{}'::jsonb) ? 'updateId')`,
      ),
    )
    .orderBy(activity.at);
}

export async function draftCustomerUpdate(db: Db, companyId: string, actor: string, generate: Generate): Promise<CustomerUpdate> {
  const [co] = await db.select().from(company).where(eq(company.id, companyId));
  if (!co) throw new UpdateError("virksomheden findes ikke");
  const work = await untoldWork(db, companyId);
  if (!work.length) throw new UpdateError("intet kunde-synligt arbejde at fortælle om — log arbejde med 'kunde-synlig' først");

  const contacts = await db.select().from(contact).where(eq(contact.companyId, companyId));
  const main = contacts.find((c) => c.email) ?? contacts[0];
  const to = (main?.email || co.email || "").trim();
  const greeting = firstName(main?.name || "") || co.name;
  const items = work.map((w) => w.summary.trim()).filter(Boolean);

  const prompt = `Kunde: ${co.name}${co.branch ? ` (${co.branch})` : ""}\nHilsen til: ${greeting}\nDet har vi lavet:\n${items.map((s) => `- ${s}`).join("\n")}`;
  const ai = (await generate(prompt, SYSTEM).catch(() => null))?.trim();
  const body = ai && ai.length > 40 && ai.length < 2000 ? ai : fallbackBody(greeting, items);
  const payload: UpdatePayload = {
    status: "kladde",
    subject: `Opdatering fra Kinly: ${items[0].slice(0, 60)}`,
    body,
    to,
    activityIds: work.map((w) => w.id),
  };

  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(activity)
      .values({ companyId, clientName: co.name, actor, type: "kundeopdatering", summary: `Kundeopdatering (kladde): ${payload.subject}`, payload })
      .returning();
    // Arbejdet markeres som "fortalt" — en kasseret kladde frigiver det igen.
    await tx
      .update(activity)
      .set({ payload: sql`coalesce(${activity.payload}, '{}'::jsonb) || jsonb_build_object('updateId', ${row.id}::text)` })
      .where(sql`${activity.id} in (${sql.join(payload.activityIds.map((i) => sql`${i}::uuid`), sql`, `)})`);
    return { ...payload, id: row.id, companyId, company: co.name, actor, at: row.at.toISOString() };
  });
}

export async function listUpdates(db: Db, status: UpdateStatus = "kladde"): Promise<CustomerUpdate[]> {
  const rows = await db
    .select({ a: activity, name: company.name })
    .from(activity)
    .innerJoin(company, eq(company.id, activity.companyId))
    .where(and(eq(activity.type, "kundeopdatering"), sql`${activity.payload}->>'status' = ${status}`))
    .orderBy(desc(activity.at));
  return rows.map(({ a, name }) => ({ ...(a.payload as UpdatePayload), id: a.id, companyId: a.companyId!, company: name, actor: a.actor, at: a.at.toISOString() }));
}

/** Ret tekst, markér sendt, eller kassér (frigiver arbejdet til en ny kladde). */
export async function setUpdate(
  db: Db,
  id: string,
  change: { status?: UpdateStatus; subject?: string; body?: string; to?: string },
  actor: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.select().from(activity).where(and(eq(activity.id, id), eq(activity.type, "kundeopdatering"))).for("update");
    if (!row) throw new UpdateError("kladden findes ikke");
    const p = row.payload as UpdatePayload;
    if (p.status !== "kladde") throw new UpdateError("kun kladder kan ændres");
    const next: UpdatePayload = { ...p };
    for (const k of ["subject", "body", "to"] as const) {
      const v = change[k];
      if (v === undefined) continue;
      if (typeof v !== "string" || v.length > (k === "body" ? 5000 : 200)) throw new UpdateError(`${k} er ugyldig`);
      next[k] = v.trim();
    }
    if (change.status) {
      if (!["sendt", "kasseret"].includes(change.status)) throw new UpdateError("ugyldig status");
      next.status = change.status;
    }
    const summary = next.status === "sendt" ? `Kundeopdatering sendt af ${actor}: ${next.subject}` : next.status === "kasseret" ? `Kundeopdatering kasseret: ${next.subject}` : row.summary;
    await tx.update(activity).set({ payload: next, summary }).where(eq(activity.id, id));
    if (next.status === "kasseret" && p.activityIds.length) {
      await tx
        .update(activity)
        .set({ payload: sql`${activity.payload} - 'updateId'` })
        .where(sql`${activity.id} in (${sql.join(p.activityIds.map((i) => sql`${i}::uuid`), sql`, `)}) and ${activity.payload}->>'updateId' = ${id}`);
    }
  });
}
