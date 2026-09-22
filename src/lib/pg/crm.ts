// PG-udgave af CRM-kontakter/aktiviteter/opgaver (src/lib/crm.ts) bag DATA_BACKEND=pg.
// Felt-formatvalidering (validText/validDate/…) og klient-opslag
// (assertKnownClient, som bruger Sheets) bliver i crm.ts og sker FØR
// delegation hertil. Her ligger kun lager: eksistens/ejerskab-tjek der
// kræver en DB-læsning, plus persistens. `data`/`payload` jsonb gemmer
// hele det oprindelige CrmContact/CrmActivity/CrmTask-objekt loss-frit;
// typede kolonner findes kun til filtrering/joins (spec §3).
import "server-only";
import { desc, eq, isNotNull } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { activity, company, contact, task } from "../db/schema.ts";
import { canonicalClientName } from "../client-alias.ts";
import { CrmInputError, id, taskSort, validDate, validText, type CrmActivity, type CrmContact, type CrmTask } from "../crm.ts";

async function resolveCompanyId(clientName: string): Promise<string | null> {
  const db = getDb();
  const rows = await db.select({ id: company.id, name: company.name }).from(company).where(isNotNull(company.clientNo));
  const match = rows.find((r) => canonicalClientName(r.name) === canonicalClientName(clientName));
  return match?.id ?? null;
}

// --- contacts ---

export async function listContacts(clientName: string): Promise<CrmContact[]> {
  const db = getDb();
  const rows = await db.select().from(contact).where(eq(contact.clientName, clientName));
  return rows.map((r) => r.data as CrmContact).sort((a, b) => a.name.localeCompare(b.name, "da"));
}

export async function saveContact(contactDoc: CrmContact): Promise<void> {
  const db = getDb();
  const companyId = await resolveCompanyId(contactDoc.clientName);
  const row = {
    companyId,
    clientName: contactDoc.clientName,
    name: contactDoc.name,
    email: contactDoc.email,
    phone: contactDoc.phone,
    role: contactDoc.role,
    data: contactDoc,
  };
  await db
    .insert(contact)
    .values({ legacyId: contactDoc.id, ...row })
    .onConflictDoUpdate({ target: contact.legacyId, set: row });
}

export async function deleteContact(clientName: string, contactId: string): Promise<void> {
  const db = getDb();
  const [existing] = await db.select().from(contact).where(eq(contact.legacyId, contactId));
  if (!existing || existing.clientName !== clientName) throw new CrmInputError("kontakt findes ikke");
  await db.delete(contact).where(eq(contact.legacyId, contactId));
}

// --- activities ---

export async function listActivities(clientName: string | undefined, limit: number): Promise<CrmActivity[]> {
  const db = getDb();
  const rows =
    clientName === undefined
      ? await db.select().from(activity).orderBy(desc(activity.at)).limit(limit)
      : await db.select().from(activity).where(eq(activity.clientName, clientName)).orderBy(desc(activity.at)).limit(limit);
  return rows.map((r) => r.payload as CrmActivity);
}

export async function addActivity(activityDoc: CrmActivity): Promise<void> {
  const db = getDb();
  const companyId = await resolveCompanyId(activityDoc.clientName);
  await db.insert(activity).values({
    legacyId: activityDoc.id,
    companyId,
    clientName: activityDoc.clientName,
    actor: activityDoc.actor,
    type: activityDoc.type,
    summary: activityDoc.text,
    payload: activityDoc,
    at: new Date(activityDoc.at),
  });
}

export async function appendSystemActivity(clientName: string, eventKey: string, text: string): Promise<void> {
  const db = getDb();
  const actId = `sys_${eventKey}`;
  const [existing] = await db.select({ legacyId: activity.legacyId }).from(activity).where(eq(activity.legacyId, actId));
  if (existing) return;
  await addActivity({
    id: actId,
    clientName,
    at: new Date().toISOString(),
    type: "invoice",
    text: validText(text, "tekst", 500),
    actor: "system",
  });
}

// --- tasks ---

export async function listTasks(clientName: string | undefined): Promise<CrmTask[]> {
  const db = getDb();
  const rows = clientName === undefined ? await db.select().from(task) : await db.select().from(task).where(eq(task.clientName, clientName));
  return rows.map((r) => r.data as CrmTask).sort(taskSort);
}

export async function saveTask(input: Partial<CrmTask>, clientName: string, taskId: string): Promise<CrmTask> {
  const db = getDb();
  const [existingRow] = await db.select().from(task).where(eq(task.legacyId, taskId));
  const existing = existingRow?.data as CrmTask | undefined;
  if (existing && existing.clientName !== clientName) throw new CrmInputError("opgaven tilhører en anden kunde");
  const taskDoc: CrmTask = {
    id: taskId,
    clientName,
    title: validText(input.title, "opgavetitel", 180),
    due: validDate(input.due),
    done: typeof input.done === "boolean" ? input.done : (existing?.done ?? false),
    at: existing?.at ?? new Date().toISOString(),
    doneAt: typeof input.done === "boolean" && input.done ? new Date().toISOString() : existing?.doneAt,
  };
  const companyId = await resolveCompanyId(clientName);
  const row = {
    companyId,
    clientName,
    title: taskDoc.title,
    due: taskDoc.due,
    doneAt: taskDoc.doneAt ? new Date(taskDoc.doneAt) : null,
    data: taskDoc,
  };
  await db
    .insert(task)
    .values({ legacyId: taskId, ...row })
    .onConflictDoUpdate({ target: task.legacyId, set: row });
  if (!existing) {
    await addActivity({
      id: id("activity"),
      clientName,
      at: new Date().toISOString(),
      type: "task",
      text: `Opgave oprettet: ${taskDoc.title}`,
      actor: "teamet",
    });
  }
  return taskDoc;
}

export async function updateTask(taskId: string, clientName: string, done: boolean): Promise<CrmTask> {
  const db = getDb();
  const [existingRow] = await db.select().from(task).where(eq(task.legacyId, taskId));
  const existing = existingRow?.data as CrmTask | undefined;
  if (!existing || existing.deletedAt) throw new CrmInputError("opgave findes ikke");
  if (existing.clientName !== clientName) throw new CrmInputError("opgaven tilhører en anden kunde");
  const taskDoc: CrmTask = { ...existing, done, doneAt: done ? new Date().toISOString() : undefined };
  await db
    .update(task)
    .set({ data: taskDoc, doneAt: taskDoc.doneAt ? new Date(taskDoc.doneAt) : null })
    .where(eq(task.legacyId, taskId));
  await addActivity({
    id: id("activity"),
    clientName,
    at: new Date().toISOString(),
    type: "task",
    text: done ? `Opgave færdig: ${taskDoc.title}` : `Opgave genåbnet: ${taskDoc.title}`,
    actor: "teamet",
  });
  return taskDoc;
}

export async function deleteTask(taskId: string, clientName: string): Promise<void> {
  const db = getDb();
  const [existingRow] = await db.select().from(task).where(eq(task.legacyId, taskId));
  const existing = existingRow?.data as CrmTask | undefined;
  if (!existing) throw new CrmInputError("opgave findes ikke");
  if (existing.clientName !== clientName) throw new CrmInputError("opgaven tilhører en anden kunde");
  await db.delete(task).where(eq(task.legacyId, taskId));
}
