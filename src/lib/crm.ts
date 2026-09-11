import "server-only";

import { getClients, type Client } from "./sheets.ts";
import { store } from "./store.ts";
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
 * Mutations are behind the existing proxy auth in production. The origin checks
 * still matter on previews/local browser sessions: cross-site forms must not
 * mutate CRM state. Server-to-server callers can use the proxy marker.
 */
export function assertCrmMutationRequest(req: Request): void {
  const marker = req.headers.get("x-command-center-auth");
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_BASIC_AUTH_USER && process.env.VERCEL_BASIC_AUTH_PASS && process.env.AUTH_SESSION_SECRET && marker !== "1") {
    throw new CrmInputError("CRM kræver en godkendt Command Center-session");
  }
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) throw new CrmInputError("cross-origin CRM-kald afvist");
  if (req.headers.get("sec-fetch-site") === "cross-site") throw new CrmInputError("cross-site CRM-kald afvist");
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
  const client = clients.find((item) => item.name === name);
  if (!client) throw new CrmInputError("kunden findes ikke i Clients");
  return client;
}

function id(prefix: string): string {
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
  await store.put(contactKey(client.name, contact.id), contact);
  return contact;
}

export async function deleteContact(clientName: string, contactId: string): Promise<void> {
  const client = await assertKnownClient(clientName);
  if (!/^[a-z0-9_-]{3,80}$/i.test(contactId)) throw new CrmInputError("kontakt-id er ugyldigt");
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
  const all = await store.readAll(ACTIVITY_KEY);
  return all
    .map(parseActivity)
    .filter((item): item is CrmActivity => Boolean(item && (knownName === undefined || item.clientName === knownName)))
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, Math.max(1, Math.min(limit, 200)));
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
  await store.append(ACTIVITY_KEY, activity);
  return activity;
}

function parseTask(value: unknown): CrmTask | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<CrmTask>;
  if (typeof item.id !== "string" || typeof item.clientName !== "string" || typeof item.title !== "string" || typeof item.due !== "string" || typeof item.done !== "boolean" || typeof item.at !== "string") return null;
  return { id: item.id, clientName: item.clientName, title: item.title, due: item.due, done: item.done, at: item.at, doneAt: item.doneAt, deletedAt: item.deletedAt };
}

function taskSort(a: CrmTask, b: CrmTask): number {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (!a.done && a.due !== b.due) return (a.due || "9999-99-99").localeCompare(b.due || "9999-99-99");
  return b.at.localeCompare(a.at);
}

export async function listTasks(clientName?: string): Promise<CrmTask[]> {
  const knownName = clientName === undefined ? undefined : (await assertKnownClient(clientName)).name;
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
  const key = taskKey(taskId);
  const existing = parseTask(await store.get<CrmTask>(key));
  if (!existing) throw new CrmInputError("opgave findes ikke");
  if (existing.clientName !== client.name) throw new CrmInputError("opgaven tilhører en anden kunde");
  await store.put(key, { ...existing, deletedAt: new Date().toISOString() });
}
