// Bro KV → Postgres for CRM-data som andre stadig skriver i KV efter cutover
// (22/9: Hermes-cron'en "crm-mail-sync" skriver Gmail-aktiviteter og opgaver
// direkte i KV via kv_helpers.py). Kun NYE poster indsættes (på legacy-id):
// en opgave der er rettet i CRM'et må aldrig overskrives af en gammel KV-kopi.
import "server-only";
import { isNotNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, contact, task } from "../db/schema.ts";
import { canonicalClientName } from "../client-alias.ts";
import type { CrmActivity, CrmContact, CrmTask } from "../crm.ts";

export interface KvCrm {
  activities: CrmActivity[];
  tasks: CrmTask[];
  contacts: CrmContact[];
}

export async function loadKvCrm(): Promise<KvCrm> {
  const { store } = await import("../store.ts");
  const docs = async <T>(prefix: string): Promise<T[]> => {
    const out: T[] = [];
    for (const key of await store.list(prefix)) {
      const v = await store.get<T>(key);
      if (v) out.push(v);
    }
    return out;
  };
  return {
    activities: ((await store.readAll("crm-activity")) as CrmActivity[]).filter((a) => a && a.id),
    tasks: (await docs<CrmTask>("crm/tasks/")).filter((t) => t.id && !t.deletedAt),
    contacts: (await docs<CrmContact & { deletedAt?: string }>("crm/contacts/")).filter((c) => c.id && !c.deletedAt),
  };
}

export async function bridgeKvCrm(db: Db, kv: KvCrm): Promise<{ activities: number; tasks: number; contacts: number }> {
  const clients = await db.select({ id: company.id, name: company.name }).from(company).where(isNotNull(company.clientNo));
  const companyFor = (name: string): string | null => {
    const hits = clients.filter((c) => canonicalClientName(c.name) === canonicalClientName(name));
    return hits.length === 1 ? hits[0].id : null;
  };

  let activities = 0;
  for (const a of kv.activities) {
    const r = await db
      .insert(activity)
      .values({ legacyId: a.id, companyId: companyFor(a.clientName), clientName: a.clientName, actor: a.actor ?? "system", type: a.type, summary: a.text ?? "", payload: a, at: new Date(a.at) })
      .onConflictDoNothing({ target: activity.legacyId })
      .returning({ id: activity.id });
    activities += r.length;
  }
  let tasks = 0;
  for (const t of kv.tasks) {
    const r = await db
      .insert(task)
      .values({ legacyId: t.id, companyId: companyFor(t.clientName), clientName: t.clientName, title: t.title, due: t.due ?? "", doneAt: t.doneAt ? new Date(t.doneAt) : null, data: t })
      .onConflictDoNothing({ target: task.legacyId })
      .returning({ id: task.id });
    tasks += r.length;
  }
  let contacts = 0;
  for (const c of kv.contacts) {
    const r = await db
      .insert(contact)
      .values({ legacyId: c.id, companyId: companyFor(c.clientName), clientName: c.clientName, name: c.name ?? "", email: c.email ?? "", phone: c.phone ?? "", role: c.role ?? "", data: c })
      .onConflictDoNothing({ target: contact.legacyId })
      .returning({ id: contact.id });
    contacts += r.length;
  }
  return { activities, tasks, contacts };
}
