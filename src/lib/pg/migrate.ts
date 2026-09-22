// Flytning Sheets + KV → Postgres (fase 1, Task 8). Kører på serveren (KV-
// nøglerne er sensitive og kan ikke hentes lokalt) via /api/admin/migrate-pg.
//
// Idempotent: alt upsertes på de gamle nøgler (lead-rækkenummer, klient-
// rækkenummer, fakturanummer, legacy-id'er), så to kørsler giver samme tilstand.
// Intet slettes i kilderne. Dubletter rapporteres — de lægges ALDRIG sammen her.
import "server-only";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, contact, deal, invoice, outreach, site, subscriptionPlan, task } from "../db/schema.ts";
import { canonicalClientName } from "../client-alias.ts";
import type { Client, Lead, LeadStatus } from "../sheets.ts";
import type { QueueDraft } from "../queue.ts";
import type { Invoice, Subscription } from "../invoices.ts";
import type { CrmActivity, CrmContact, CrmTask } from "../crm.ts";

export interface MigrationSource {
  leads: Lead[];
  clients: Client[];
  queue: QueueDraft[];
  invoices: Invoice[];
  invoiceCounter: number;
  subscriptions: Subscription[];
  contacts: CrmContact[];
  activities: CrmActivity[];
  tasks: CrmTask[];
}

export interface DuplicateGroup {
  key: string;
  rowNos: number[];
  names: string[];
}

export interface MigrationReport {
  source: Record<keyof MigrationSource, number>;
  target?: Record<string, number>;
  duplicates: { email: DuplicateGroup[]; nameCity: DuplicateGroup[] };
  clientsMatchedToLead: number;
  clientsWithoutLead: string[];
  mismatches: string[];
}

const LIFECYCLE: Record<LeadStatus, string> = {
  new: "ny",
  called: "kontaktet",
  interested: "interesseret",
  client: "kunde",
  skip: "ikke_egnet",
  "not-interested": "tabt",
};

export function lifecycleFor(lead: Pick<Lead, "status" | "emailStatus" | "emailSentAt">): string {
  const base = LIFECYCLE[lead.status] ?? "ny";
  if (base !== "ny" && base !== "kontaktet") return base;
  if (lead.emailStatus === "replied") return "svaret";
  if (lead.emailSentAt || lead.emailStatus === "sent") return "kontaktet";
  return base;
}

function norm(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function groups(leads: Lead[], keyOf: (l: Lead) => string): DuplicateGroup[] {
  const by = new Map<string, Lead[]>();
  for (const l of leads) {
    const k = keyOf(l);
    if (!k) continue;
    by.set(k, [...(by.get(k) ?? []), l]);
  }
  return [...by.entries()]
    .filter(([, ls]) => ls.length > 1)
    .map(([key, ls]) => ({ key, rowNos: ls.map((l) => Number(l.id)), names: ls.map((l) => l.name) }));
}

export function planMigration(src: MigrationSource): MigrationReport {
  const { matches, orphans } = matchClients(src);
  return {
    source: {
      leads: src.leads.length,
      clients: src.clients.length,
      queue: src.queue.length,
      invoices: src.invoices.length,
      invoiceCounter: src.invoiceCounter,
      subscriptions: src.subscriptions.length,
      contacts: src.contacts.length,
      activities: src.activities.length,
      tasks: src.tasks.length,
    },
    duplicates: {
      email: groups(src.leads, (l) => l.email.trim().toLowerCase()),
      nameCity: groups(src.leads, (l) => (l.name ? `${norm(l.name)}|${norm(l.city)}` : "")),
    },
    clientsMatchedToLead: matches.size,
    clientsWithoutLead: orphans.map((c) => c.name),
    mismatches: [],
  };
}

// Klient → lead-række via alias-normaliseret navn. En lead med status "client"
// vinder over andre navnebrødre; ellers første match. Ingen match = ny virksomhed.
function matchClients(src: MigrationSource): { matches: Map<string, number>; orphans: Client[] } {
  const matches = new Map<string, number>(); // client.id → lead rowNo
  const taken = new Set<number>();
  const orphans: Client[] = [];
  for (const c of src.clients) {
    const want = canonicalClientName(c.name);
    const candidates = src.leads.filter((l) => canonicalClientName(l.name) === want && !taken.has(Number(l.id)));
    const pick = candidates.find((l) => l.status === "client") ?? candidates[0];
    if (pick) {
      matches.set(c.id, Number(pick.id));
      taken.add(Number(pick.id));
    } else orphans.push(c);
  }
  return { matches, orphans };
}

function leadColumns(l: Lead) {
  return {
    name: l.name,
    branch: l.branch,
    phone: l.phone,
    city: l.city,
    score: Number.isFinite(l.score) ? Math.round(l.score) : 0,
    source: l.source,
    website: l.website,
    websiteStatus: l.websiteStatus || "none",
    leadStatus: l.status || "new",
    notes: l.notes,
    lastUpdated: l.lastUpdated,
    websiteQualityTier: l.websiteQualityTier ?? "",
    enrichedInfo: l.enrichedInfo,
    email: l.email,
    emailSentAt: l.emailSentAt,
    emailOpenedAt: l.emailOpenedAt,
    emailClickedAt: l.emailClickedAt,
    emailStatus: l.emailStatus,
    followupSentAt: l.followupSentAt,
    reviewsCount: Number.isFinite(l.reviewsCount) ? Math.round(l.reviewsCount) : 0,
    callbackDate: l.callbackDate,
    skipReason: l.skipReason ?? "",
    lifecycle: lifecycleFor(l),
    archived: false,
    updatedAt: new Date(),
  };
}

const BATCH = 400;

export async function applyMigration(db: Db, src: MigrationSource): Promise<MigrationReport> {
  const report = planMigration(src);
  const { matches, orphans } = matchClients(src);

  await db.transaction(async (tx) => {
    // 1. Leads → company (upsert på row_no).
    for (let i = 0; i < src.leads.length; i += BATCH) {
      const rows = src.leads.slice(i, i + BATCH).map((l) => ({ rowNo: Number(l.id), ...leadColumns(l) }));
      await tx
        .insert(company)
        .values(rows)
        .onConflictDoUpdate({
          target: company.rowNo,
          set: Object.fromEntries(
            Object.keys(leadColumns(src.leads[0])).map((k) => [k, sql.raw(`excluded.${snake(k)}`)]),
          ),
        });
    }

    // 2. Klienter → company.clientNo + primær deal + site.
    const clientCompanyId = new Map<string, string>();
    for (const c of src.clients) {
      const clientNo = Number(c.id);
      const [byNo] = await tx.select({ id: company.id }).from(company).where(eq(company.clientNo, clientNo));
      let companyId = byNo?.id;
      if (!companyId && matches.has(c.id)) {
        const [byRow] = await tx.select({ id: company.id }).from(company).where(eq(company.rowNo, matches.get(c.id)!));
        companyId = byRow?.id;
      }
      const clientCols = { clientNo, name: c.name, branch: c.branch, phone: c.phone, briefFilled: c.briefFilled, lifecycle: "kunde", updatedAt: new Date() };
      if (companyId) {
        await tx.update(company).set(clientCols).where(eq(company.id, companyId));
      } else {
        const [{ max }] = await tx.select({ max: sql<number>`coalesce(max(${company.rowNo}), 1)` }).from(company);
        const [created] = await tx.insert(company).values({ rowNo: Number(max) + 1, ...clientCols }).returning({ id: company.id });
        companyId = created.id;
      }
      clientCompanyId.set(c.id, companyId);

      const dealCols = {
        stage: c.stage,
        wonAt: c.wonDate,
        expectedClose: c.expectedClose,
        source: c.source,
        owner: c.owner,
        package: c.package,
        lostAt: c.lostDate,
        setupFeeRaw: c.setupFee,
        monthlyFeeRaw: c.monthlyFee,
        title: c.package || "Hjemmeside",
        updatedAt: new Date(),
      };
      const [primary] = await tx.select({ id: deal.id }).from(deal).where(and(eq(deal.companyId, companyId), eq(deal.isPrimary, true)));
      if (primary) await tx.update(deal).set(dealCols).where(eq(deal.id, primary.id));
      else await tx.insert(deal).values({ companyId, isPrimary: true, ...dealCols });

      const siteCols = { status: c.websiteStatus || "demo", projectFolder: c.projectFolder };
      const [s] = await tx.select({ id: site.id }).from(site).where(eq(site.companyId, companyId));
      if (s) await tx.update(site).set(siteCols).where(eq(site.id, s.id));
      else await tx.insert(site).values({ companyId, ...siteCols });
    }
    void orphans;

    const companyForName = (name: string): string | null => {
      const want = canonicalClientName(name);
      const c = src.clients.find((x) => canonicalClientName(x.name) === want);
      return c ? clientCompanyId.get(c.id) ?? null : null;
    };

    // 3. Kladde-kø (fuld erstatning = samme semantik som writeQueue).
    const ids = src.queue.map((d) => d.id);
    if (ids.length) await tx.delete(outreach).where(sql`${outreach.id} not in (${sql.join(ids.map((i) => sql`${i}`), sql`, `)})`);
    else await tx.delete(outreach);
    for (let i = 0; i < src.queue.length; i += BATCH) {
      const rows = src.queue.slice(i, i + BATCH).map((d) => ({
        id: d.id,
        companyRowNo: /^\d+$/.test(d.leadId) ? Number(d.leadId) : null,
        status: d.status,
        sender: d.sender ?? null,
        sentBy: d.sentBy ?? null,
        draft: d,
        createdAt: d.createdAt ?? "",
        updatedAt: d.updatedAt ?? "",
      }));
      await tx.insert(outreach).values(rows).onConflictDoUpdate({
        target: outreach.id,
        set: {
          companyRowNo: sql.raw("excluded.company_row_no"),
          status: sql.raw("excluded.status"),
          sender: sql.raw("excluded.sender"),
          sentBy: sql.raw("excluded.sent_by"),
          draft: sql.raw("excluded.draft"),
          createdAt: sql.raw("excluded.created_at"),
          updatedAt: sql.raw("excluded.updated_at"),
        },
      });
    }

    // 4. Fakturaer + tæller (aldrig lavere end højeste eksisterende nummer).
    for (const inv of src.invoices) {
      const cols = { companyId: companyForName(inv.clientName), clientName: inv.clientName, status: inv.status, issueDate: inv.issueDate, dueDate: inv.dueDate, data: inv };
      await tx.insert(invoice).values({ number: inv.number, ...cols }).onConflictDoUpdate({ target: invoice.number, set: cols });
    }
    const highest = Math.max(src.invoiceCounter, ...src.invoices.map((i) => parseInt(i.number, 10) || 0), 0);
    await tx.execute(sql`insert into counter (name, value) values ('invoice', ${highest})
      on conflict (name) do update set value = greatest(counter.value, ${highest})`);

    // 5. Kundeabonnementer (fuld erstatning).
    await tx.delete(subscriptionPlan);
    if (src.subscriptions.length) {
      await tx.insert(subscriptionPlan).values(
        src.subscriptions.map((s, i) => ({ clientName: s.clientName, companyId: companyForName(s.clientName), position: i, data: s })),
      );
    }

    // 6. CRM: kontakter, opgaver, aktiviteter — upsert på legacy-id, ingen sideeffekter.
    for (const c of src.contacts) {
      const cols = { companyId: companyForName(c.clientName), clientName: c.clientName, name: c.name ?? "", email: c.email ?? "", phone: c.phone ?? "", role: c.role ?? "", data: c };
      await tx.insert(contact).values({ legacyId: c.id, ...cols }).onConflictDoUpdate({ target: contact.legacyId, set: cols });
    }
    for (const t of src.tasks) {
      const cols = { companyId: companyForName(t.clientName), clientName: t.clientName, title: t.title, due: t.due ?? "", doneAt: t.doneAt ? new Date(t.doneAt) : null, data: t };
      await tx.insert(task).values({ legacyId: t.id, ...cols }).onConflictDoUpdate({ target: task.legacyId, set: cols });
    }
    for (let i = 0; i < src.activities.length; i += BATCH) {
      const rows = src.activities.slice(i, i + BATCH).map((a) => ({
        legacyId: a.id,
        companyId: companyForName(a.clientName),
        clientName: a.clientName,
        actor: a.actor ?? "system",
        type: a.type,
        summary: a.text ?? "",
        payload: a,
        at: new Date(a.at),
      }));
      await tx.insert(activity).values(rows).onConflictDoNothing({ target: activity.legacyId });
    }
  });

  report.target = await countTarget(db);
  report.mismatches = compareCounts(report);
  return report;
}

function snake(k: string): string {
  return k.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export async function countTarget(db: Db): Promise<Record<string, number>> {
  const one = async (q: Promise<Array<{ n: number }>>) => Number((await q)[0]?.n ?? 0);
  const n = sql<number>`count(*)`;
  return {
    leads: await one(db.select({ n }).from(company).where(sql`${company.rowNo} is not null and not ${company.archived}`)),
    clients: await one(db.select({ n }).from(company).where(sql`${company.clientNo} is not null`)),
    queue: await one(db.select({ n }).from(outreach)),
    invoices: await one(db.select({ n }).from(invoice)),
    subscriptions: await one(db.select({ n }).from(subscriptionPlan)),
    contacts: await one(db.select({ n }).from(contact)),
    tasks: await one(db.select({ n }).from(task)),
    activities: await one(db.select({ n }).from(activity)),
  };
}

// Kilde ↔ mål. Leads kan være FLERE i målet (klienter uden lead-række bliver
// nye virksomheder); aktiviteter kan være flere (skrevet i PG efter første kørsel).
function compareCounts(r: MigrationReport): string[] {
  const t = r.target ?? {};
  const out: string[] = [];
  const exact: Array<keyof MigrationReport["source"]> = ["clients", "queue", "invoices", "subscriptions", "contacts", "tasks"];
  for (const k of exact) if ((t[k] ?? -1) !== r.source[k]) out.push(`${k}: kilde ${r.source[k]} ≠ PG ${t[k]}`);
  if ((t.leads ?? 0) < r.source.leads) out.push(`leads: kilde ${r.source.leads} > PG ${t.leads}`);
  if ((t.activities ?? 0) < r.source.activities) out.push(`activities: kilde ${r.source.activities} > PG ${t.activities}`);
  return out;
}


// Læser kilderne (Sheets + KV). Kræver at appen IKKE kører på PG endnu —
// ellers ville de gamle funktioner læse fra PG og migreringen kopiere sig selv.
// Kilderne ændres ikke: de er selv backuppen indtil cutover.
export async function loadSource(): Promise<MigrationSource> {
  const { pgEnabled } = await import("../db/client.ts");
  if (pgEnabled()) throw new Error("DATA_BACKEND=pg — migrering skal køre mod Sheets/KV-kilderne");
  const { getLeads, getClients } = await import("../sheets.ts");
  const { readQueue } = await import("../queue.ts");
  const { listInvoices, getSubscriptions } = await import("../invoices.ts");
  const { store } = await import("../store.ts");

  const docs = async <T>(prefix: string): Promise<T[]> => {
    const out: T[] = [];
    for (const key of await store.list(prefix)) {
      const v = await store.get<T>(key);
      if (v) out.push(v);
    }
    return out;
  };

  const [leads, clients, queue, invoices, subscriptions] = await Promise.all([
    getLeads(),
    getClients(),
    readQueue(),
    listInvoices(),
    getSubscriptions(),
  ]);
  const contacts = (await docs<CrmContact & { deletedAt?: string }>("crm/contacts/")).filter((c) => !c.deletedAt);
  const tasks = (await docs<CrmTask>("crm/tasks/")).filter((t) => !t.deletedAt);
  const activities = (await store.readAll("crm-activity")) as CrmActivity[];
  const invoiceCounter = (await store.get<number>("invoice-counter/all")) ?? 0;
  return { leads, clients, queue, invoices, invoiceCounter, subscriptions, contacts, activities, tasks };
}
