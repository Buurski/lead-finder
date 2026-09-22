import "server-only";

import { getClients, type Client } from "./sheets.ts";
import { store } from "./store.ts";
import { pgEnabled } from "./db/client.ts";
import { isCommandCenterRequest } from "./cc-auth.ts";
import { findClientByName } from "./client-alias.ts";
import { ACTIVITY_TYPES, type ActivityType, type CrmActivity, type CrmContact, type CrmTask } from "./crm-client.ts";

export { ACTIVITY_TYPES } from "./crm-client.ts";
export type { ActivityType, CrmActivity, CrmContact, CrmTask } from "./crm-client.ts";

const ACTIVITY_KEY = "crm-activity";
const CONTACT_PREFIX = "crm/contacts/";
const TASK_PREFIX = "crm/tasks/";

export class CrmInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrmInputError";
  }
}

/**
 * Mutations run behind the proxy auth. Når Command Center-auth er konfigureret
 * kræves proxyens HMAC-marker — den kan ikke forfalskes af en klient, fordi
 * proxyen stripper alle indgående kopier og kun udsteder sin egen. Derudover
 * skal browser-kald bære et eksplicit same-origin; kald uden Origin afvises.
 */
export async function assertCrmMutationRequest(req: Request): Promise<void> {
  const authConfigured = Boolean(process.env.VERCEL_BASIC_AUTH_USER && process.env.VERCEL_BASIC_AUTH_PASS && process.env.AUTH_SESSION_SECRET);
  if (authConfigured && !(await isCommandCenterRequest(req))) {
    throw new CrmInputError("CRM kræver en godkendt Command Center-session");
  }
  const origin = req.headers.get("origin");
  if (!origin) throw new CrmInputError("CRM-kald uden Origin afvist");
  if (origin.toLowerCase() !== expectedCrmOrigin(req).toLowerCase()) throw new CrmInputError("cross-origin CRM-kald afvist");
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new CrmInputError("cross-site CRM-kald afvist");
}

function expectedCrmOrigin(req: Request): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || new URL(req.url).host;
  const proto = req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || new URL(req.url).protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function encodedClientName(clientName: string): string {
  return encodeURIComponent(clientName);
}

export function validClientName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name) throw new CrmInputError("kunde mangler");
  return name;
}

export function validText(value: unknown, label: string, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new CrmInputError(`${label} mangler`);
  if (text.length > max) throw new CrmInputError(`${label} er for lang`);
  return text;
}

export function validOptionalText(value: unknown, max: number): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > max) throw new CrmInputError("feltet er for langt");
  return text;
}

export function validDate(value: unknown): string {
  const date = typeof value === "string" ? value.trim() : "";
  if (!date) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new CrmInputError("frist skal være en gyldig dato");
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new CrmInputError("frist skal være en gyldig dato");
  }
  return date;
}

export async function assertKnownClient(value: unknown): Promise<Client> {
  const name = validClientName(value);
  let clients: Client[];
  try {
    clients = await getClients();
  } catch {
    throw new CrmInputError("kundedata kunne ikke hentes fra Google Sheets");
  }
  const client = findClientByName(clients, name);
  if (!client) throw new CrmInputError("kunden findes ikke i Clients");
  return client;
}

export function id(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function contactKey(clientName: string, contactId: string): string {
  return `${CONTACT_PREFIX}${encodedClientName(clientName)}/${contactId}`;
}

function taskKey(taskId: string): string {
  return `${TASK_PREFIX}${taskId}`;
}

export async function listContacts(clientName: string): Promise<CrmContact[]> {
  const client = await assertKnownClient(clientName);
  if (pgEnabled()) return (await import("./pg/crm.ts")).listContacts(client.name);
  const keys = await store.list(`${CONTACT_PREFIX}${encodedClientName(client.name)}/`);
  const docs = await Promise.all(keys.map((key) => store.get<CrmContact>(key)));
  return docs
    .filter((contact): contact is CrmContact => Boolean(contact && contact.clientName === client.name && !contact.deletedAt))
    .sort((a, b) => a.name.localeCompare(b.name, "da"));
}

export async function saveContact(input: Partial<CrmContact>): Promise<CrmContact> {
  const client = await assertKnownClient(input.clientName);
  const contactId = typeof input.id === "string" && /^[a-z0-9_-]{3,80}$/i.test(input.id) ? input.id : id("contact");
  const contact: CrmContact = {
    id: contactId,
    clientName: client.name,
    name: validText(input.name, "navn", 120),
    role: validOptionalText(input.role, 120),
    email: validOptionalText(input.email, 160),
    phone: validOptionalText(input.phone, 60),
    channel: validOptionalText(input.channel, 60),
    note: validOptionalText(input.note, 500),
    updatedAt: new Date().toISOString(),
  };
  if (pgEnabled()) {
    await (await import("./pg/crm.ts")).saveContact(contact);
    return contact;
  }
  await store.put(contactKey(client.name, contact.id), contact);
  return contact;
}

export async function deleteContact(clientName: string, contactId: string): Promise<void> {
  const client = await assertKnownClient(clientName);
  if (!/^[a-z0-9_-]{3,80}$/i.test(contactId)) throw new CrmInputError("kontakt-id er ugyldigt");
  if (pgEnabled()) return (await import("./pg/crm.ts")).deleteContact(client.name, contactId);
  const key = contactKey(client.name, contactId);
  const existing = await store.get<CrmContact>(key);
  if (!existing || existing.clientName !== client.name) throw new CrmInputError("kontakt findes ikke");
  await store.put(key, { ...existing, deletedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
}

function parseActivity(value: unknown): CrmActivity | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CrmActivity>;
  if (typeof item.id !== "string" || typeof item.clientName !== "string" || typeof item.at !== "string" || typeof item.text !== "string" || typeof item.actor !== "string") return null;
  if (!ACTIVITY_TYPES.includes(item.type as ActivityType)) return null;
  return { id: item.id, clientName: item.clientName, at: item.at, type: item.type as ActivityType, text: item.text, actor: item.actor };
}

export async function listActivities(clientName?: string, limit = 60): Promise<CrmActivity[]> {
  const knownName = clientName === undefined ? undefined : (await assertKnownClient(clientName)).name;
  const clampedLimit = Math.max(1, Math.min(limit, 200));
  if (pgEnabled()) return (await import("./pg/crm.ts")).listActivities(knownName, clampedLimit);
  const all = await store.readAll(ACTIVITY_KEY);
  return all
    .map(parseActivity)
    .filter((item): item is CrmActivity => Boolean(item && (knownName === undefined || item.clientName === knownName)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, clampedLimit);
}

export async function addActivity(input: Partial<CrmActivity>): Promise<CrmActivity> {
  const client = await assertKnownClient(input.clientName);
  if (!ACTIVITY_TYPES.includes(input.type as ActivityType)) throw new CrmInputError("aktivitetstype er ugyldig");
  const activity: CrmActivity = {
    id: id("activity"),
    clientName: client.name,
    at: new Date().toISOString(),
    type: input.type as ActivityType,
    text: validText(input.text, "tekst", 500),
    actor: validOptionalText(input.actor, 80) || "teamet",
  };
  if (pgEnabled()) {
    await (await import("./pg/crm.ts")).addActivity(activity);
    return activity;
  }
  await store.append(ACTIVITY_KEY, activity);
  return activity;
}

/**
 * System-hændelse (fx "Faktura 009 oprettet som kladde"). Append-only med
 * per-dag-dedupe på eventKey, actor: "system", type: "invoice". Skriver KUN
 * for kendte kunder (ukendte navne flagges på /clients i stedet), og må aldrig
 * blokere den underliggende handling — kalderen .catch'er.
 * Council-krav 13/9: systemhændelser holdes adskilt fra menneskelig aktivitet.
 */
export async function appendSystemActivity(clientName: string, eventKey: string, text: string): Promise<void> {
  let client: Client;
  try {
    client = await assertKnownClient(clientName);
  } catch {
    return;
  }
  if (pgEnabled()) return (await import("./pg/crm.ts")).appendSystemActivity(client.name, eventKey, text);
  const actId = `sys_${eventKey}`;
  const all = await store.readAll(ACTIVITY_KEY);
  if (all.map(parseActivity).some((a) => a?.id === actId)) return;
  await store.append(ACTIVITY_KEY, {
    id: actId,
    clientName: client.name,
    at: new Date().toISOString(),
    type: "invoice",
    text: validText(text, "tekst", 500),
    actor: "system",
  } satisfies CrmActivity);
}

function parseTask(value: unknown): CrmTask | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CrmTask>;
  if (typeof item.id !== "string" || typeof item.clientName !== "string" || typeof item.title !== "string" || typeof item.due !== "string" || typeof item.done !== "boolean" || typeof item.at !== "string") return null;
  return { id: item.id, clientName: item.clientName, title: item.title, due: item.due, done: item.done, at: item.at, doneAt: item.doneAt, deletedAt: item.deletedAt };
}

export function taskSort(a: CrmTask, b: CrmTask): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (!a.done && a.due !== b.due) return (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99");
  return b.at.localeCompare(a.at);
}

export async function listTasks(clientName?: string): Promise<CrmTask[]> {
  const knownName = clientName === undefined ? undefined : (await assertKnownClient(clientName)).name;
  if (pgEnabled()) return (await import("./pg/crm.ts")).listTasks(knownName);
  const keys = await store.list(TASK_PREFIX);
  const docs = await Promise.all(keys.map((key) => store.get<CrmTask>(key)));
  return docs
    .map(parseTask)
    .filter((item): item is CrmTask => Boolean(item && !item.deletedAt && (knownName === undefined || item.clientName === knownName)))
    .sort(taskSort);
}

export async function saveTask(input: Partial<CrmTask>): Promise<CrmTask> {
  const client = await assertKnownClient(input.clientName);
  const taskId = typeof input.id === "string" && /^[a-z0-9_-]{3,80}$/i.test(input.id) ? input.id : id("task");
  if (pgEnabled()) return (await import("./pg/crm.ts")).saveTask(input, client.name, taskId);
  const existing = input.id ? parseTask(await store.get<CrmTask>(taskKey(taskId))) : null;
  if (existing && existing.clientName !== client.name) throw new CrmInputError("opgaven tilhører en anden kunde");
  const task: CrmTask = {
    id: taskId,
    clientName: client.name,
    title: validText(input.title, "opgavetitel", 180),
    due: validDate(input.due),
    done: typeof input.done === "boolean" ? input.done : existing?.done ?? false,
    at: existing?.at ?? new Date().toISOString(),
    doneAt: typeof input.done === "boolean" && input.done ? new Date().toISOString() : existing?.doneAt,
  };
  await store.put(taskKey(task.id), task);
  if (!existing) {
    await store.append(ACTIVITY_KEY, { id: id("activity"), clientName: client.name, at: new Date().toISOString(), type: "task", text: `Opgave oprettet: ${task.title}`, actor: "teamet" } satisfies CrmActivity);
  }
  return task;
}

export async function updateTask(taskId: string, clientName: unknown, done: boolean): Promise<CrmTask> {
  if (!/^[a-z0-9_-]{3,80}$/i.test(taskId)) throw new CrmInputError("opgave-id er ugyldigt");
  const client = await assertKnownClient(clientName);
  if (pgEnabled()) return (await import("./pg/crm.ts")).updateTask(taskId, client.name, done);
  const existing = parseTask(await store.get<CrmTask>(taskKey(taskId)));
  if (!existing || existing.deletedAt) throw new CrmInputError("opgave findes ikke");
  if (existing.clientName !== client.name) throw new CrmInputError("opgaven tilhører en anden kunde");
  const task = { ...existing, done, doneAt: done ? new Date().toISOString() : undefined };
  await store.put(taskKey(task.id), task);
  await store.append(ACTIVITY_KEY, { id: id("activity"), clientName: client.name, at: new Date().toISOString(), type: "task", text: done ? `Opgave færdig: ${task.title}` : `Opgave genåbnet: ${task.title}`, actor: "teamet" } satisfies CrmActivity);
  return task;
}

export async function deleteTask(taskId: string, clientName: unknown): Promise<void> {
  if (!/^[a-z0-9_-]{3,80}$/i.test(taskId)) throw new CrmInputError("opgave-id er ugyldigt");
  const client = await assertKnownClient(clientName);
  if (pgEnabled()) return (await import("./pg/crm.ts")).deleteTask(taskId, client.name);
  const key = taskKey(taskId);
  const existing = parseTask(await store.get<CrmTask>(key));
  if (!existing) throw new CrmInputError("opgave findes ikke");
  if (existing.clientName !== client.name) throw new CrmInputError("opgaven tilhører en anden kunde");
  await store.put(key, { ...existing, deletedAt: new Date().toISOString() });
}
