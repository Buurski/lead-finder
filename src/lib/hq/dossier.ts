// Kunde-mappen: alt hvad CRM'et ved om én virksomhed, samlet ét sted. Bruges af
// profilsiden og som kontekst-pakke til Hermes (så Hermes ikke selv skal slå op).
// Postgres er facit for tal; vault-noterne (wiki/kunder) er facit for viden.
import "server-only";
import { desc, eq, inArray, isNull, and } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, contact, deal, invoice, site, task } from "../db/schema.ts";
import { invoiceTotal, isOverdue, type Invoice } from "../invoices.ts";

export interface DossierNote {
  path: string;
  title: string;
  body: string;
  crmId?: string;
}

export interface Dossier {
  company: typeof company.$inferSelect;
  deals: Array<typeof deal.$inferSelect>;
  contacts: Array<typeof contact.$inferSelect>;
  activities: Array<typeof activity.$inferSelect>;
  openTasks: Array<typeof task.$inferSelect>;
  invoices: Invoice[];
  balance: { unpaid: number; overdue: number };
  site: typeof site.$inferSelect | null;
  notes: DossierNote[];
}

const STOP = new Set(["aps", "a/s", "as", "ivs", "salon", "frisør", "frisor", "cafe", "café", "restaurant", "klinik", "og", "the", "hos", "by", "v"]);

function fold(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "aa");
}

/** Navnets kendetegnende ord (til match mod vault-filnavne). */
export function nameTokens(name: string): string[] {
  return fold(name).split(/[^a-z0-9]+/).filter((t) => t && !STOP.has(t));
}

// ponytail: navne-match mod filnavne er en heuristik (ingen crm_id i noterne endnu);
// en note med `crm_id: <uuid>` i frontmatter overtrumfer altid matchet.
export function noteMatches(companyName: string, notePath: string): boolean {
  const file = fold(notePath.split("/").pop() ?? "").replace(/\.md$/, "").replace(/^kunde-info-/, "");
  const compactFile = file.replace(/[^a-z0-9]/g, "");
  const tokens = nameTokens(companyName);
  if (!tokens.length) return false;
  if (compactFile.includes(tokens.join(""))) return true;
  // Første ord alene kun når det er langt/kendetegnende nok (fx "vida", "zaytoon").
  return tokens[0].length >= 4 && file.split("-").includes(tokens[0]);
}

export function pickNotes(companyId: string, companyName: string, all: DossierNote[]): DossierNote[] {
  const pinned = all.filter((n) => n.crmId === companyId);
  return pinned.length ? pinned : all.filter((n) => !n.crmId && noteMatches(companyName, n.path));
}

export async function getDossier(
  db: Db,
  companyId: string,
  opts: { today: string; notes?: DossierNote[]; loadNotes?: (companyName: string) => Promise<DossierNote[]> },
): Promise<Dossier | null> {
  const [c] = await db.select().from(company).where(eq(company.id, companyId));
  if (!c) return null;
  const [deals, contacts, activities, openTasks, invRows, [s]] = await Promise.all([
    db.select().from(deal).where(eq(deal.companyId, companyId)).orderBy(desc(deal.updatedAt)),
    db.select().from(contact).where(eq(contact.companyId, companyId)),
    db.select().from(activity).where(eq(activity.companyId, companyId)).orderBy(desc(activity.at)).limit(20),
    db.select().from(task).where(and(eq(task.companyId, companyId), isNull(task.doneAt))),
    db.select({ data: invoice.data }).from(invoice).where(eq(invoice.companyId, companyId)),
    db.select().from(site).where(eq(site.companyId, companyId)).limit(1),
  ]);
  const notes = pickNotes(companyId, c.name, opts.notes ?? (opts.loadNotes ? await opts.loadNotes(c.name).catch(() => []) : []));
  return assembleDossier(c, { deals, contacts, activities, openTasks, invRows, site: s ?? null }, notes, opts.today);
}

function assembleDossier(
  c: typeof company.$inferSelect,
  p: { deals: Dossier["deals"]; contacts: Dossier["contacts"]; activities: Dossier["activities"]; openTasks: Dossier["openTasks"]; invRows: Array<{ data: unknown }>; site: Dossier["site"] },
  notes: DossierNote[],
  today: string,
): Dossier {
  const invoices = p.invRows.map((r) => r.data as Invoice).sort((a, b) => (a.number < b.number ? 1 : -1));
  const open = invoices.filter((i) => ["sendt", "forfalden", "rykket"].includes(i.status));
  return {
    company: c,
    deals: p.deals,
    contacts: p.contacts,
    activities: p.activities,
    openTasks: p.openTasks,
    invoices,
    balance: {
      unpaid: open.reduce((sum, i) => sum + invoiceTotal(i).total, 0),
      overdue: open.filter((i) => isOverdue(i, today)).reduce((sum, i) => sum + invoiceTotal(i).total, 0),
    },
    site: p.site,
    notes,
  };
}

/**
 * Samme Dossier som getDossier, men for mange virksomheder (rækkerne er allerede hentet) i
 * ét hug: 6 forespørgsler uanset antal (i stedet for 7 pr. virksomhed). Uden vault-noter (notes = []) — til
 * attention/oversigter, ikke profilsiden.
 */
export async function getDossiers(db: Db, cs: Array<typeof company.$inferSelect>, opts: { today: string }): Promise<Dossier[]> {
  if (!cs.length) return [];
  const companyIds = cs.map((c) => c.id);
  const by = <T extends { companyId: string | null }>(rows: T[]) => {
    const m = new Map<string, T[]>();
    for (const r of rows) if (r.companyId) m.set(r.companyId, [...(m.get(r.companyId) ?? []), r]);
    return m;
  };
  const deals = by(await db.select().from(deal).where(inArray(deal.companyId, companyIds)).orderBy(desc(deal.updatedAt)));
  const contacts = by(await db.select().from(contact).where(inArray(contact.companyId, companyIds)));
  // ponytail: henter alle aktiviteter for de valgte kunder og skærer til 20 pr. kunde i JS —
  // window-funktion (row_number) hvis kunder får tusindvis af aktiviteter.
  const acts = by(await db.select().from(activity).where(inArray(activity.companyId, companyIds)).orderBy(desc(activity.at)));
  const tasks = by(await db.select().from(task).where(and(inArray(task.companyId, companyIds), isNull(task.doneAt))));
  const invs = by(await db.select({ companyId: invoice.companyId, data: invoice.data }).from(invoice).where(inArray(invoice.companyId, companyIds)));
  const sites = by(await db.select().from(site).where(inArray(site.companyId, companyIds)));
  return cs.map((c) =>
    assembleDossier(c, {
      deals: deals.get(c.id) ?? [],
      contacts: contacts.get(c.id) ?? [],
      activities: (acts.get(c.id) ?? []).slice(0, 20),
      openTasks: tasks.get(c.id) ?? [],
      invRows: invs.get(c.id) ?? [],
      site: sites.get(c.id)?.[0] ?? null,
    }, [], opts.today),
  );
}

const kr = (n: number) => `${n.toLocaleString("da-DK")} kr`;

/**
 * Kompakt tekstudgave til Hermes (maks `limit` tegn). Tal først (facit),
 * derefter tidslinje, til sidst vault-viden — så en afkortning rammer det
 * mindst vigtige.
 */
export function dossierText(d: Dossier, limit = 12_000): string {
  const c = d.company;
  const lines: string[] = [
    `# ${c.name}`,
    `Livsfase: ${c.lifecycle}${c.clientNo !== null ? " (kunde)" : ""} · Branche: ${c.branch || "–"} · By: ${c.city || "–"}`,
    `Web: ${c.website || "–"} · Mail: ${c.email || "–"} · Tlf: ${c.phone || "–"}`,
    d.site ? `Site: ${d.site.status}${d.site.domain ? ` · ${d.site.domain}` : ""}${d.site.cmsUrl ? ` · CMS ${d.site.cmsUrl}` : ""}` : "Site: –",
    `Økonomi: ubetalt ${kr(d.balance.unpaid)}, heraf forfaldent ${kr(d.balance.overdue)}`,
    "",
    "## Aftaler",
    ...(d.deals.length
      ? d.deals.map((x) => `- ${x.title || "Aftale"} · fase ${x.stage || "–"}${x.monthlyFeeRaw ? ` · ${x.monthlyFeeRaw} kr/md` : ""}${x.nextStep ? ` · næste: ${x.nextStep} (${x.nextStepDue || "ingen dato"})` : ""}`)
      : ["- ingen"]),
    "## Fakturaer",
    ...(d.invoices.length ? d.invoices.map((i) => `- ${i.number} · ${kr(invoiceTotal(i).total)} · ${i.status} · forfald ${i.dueDate}`) : ["- ingen"]),
    "## Kontakter",
    ...(d.contacts.length ? d.contacts.map((x) => `- ${x.name}${x.role ? ` (${x.role})` : ""} ${x.email} ${x.phone}`.trim()) : ["- ingen"]),
    "## Åbne opgaver",
    ...(d.openTasks.length ? d.openTasks.map((t) => `- ${t.title}${t.due ? ` (${t.due})` : ""}`) : ["- ingen"]),
    "## Seneste hændelser",
    ...(d.activities.length ? d.activities.map((a) => `- ${a.at.toISOString().slice(0, 10)} ${a.actor}: ${a.summary}`) : ["- ingen"]),
    "## Kundeviden (vault)",
    ...d.notes.map((n) => `### ${n.title} (${n.path})\n${n.body}`),
  ];
  const text = lines.join("\n");
  return text.length <= limit ? text : text.slice(0, limit - 20) + "\n…[afkortet]";
}
