// Postgres-udgave af lead-funktionerne i sheets.ts (fase 1, bag DATA_BACKEND=pg).
// rowIndex <=> row_no = rowIndex + 2 — samme regel som overalt ellers i
// kodebasen — og Lead.id = String(row_no). En "sletning" sætter archived=true
// (+ lifecycle='ikke_egnet') i stedet for at fjerne rækken, så row_no aldrig
// genbruges af appendLeads.
import { and, asc, eq, gt, inArray, max, sql } from "drizzle-orm";
import { getDb } from "../db/client.ts";
import { company } from "../db/schema.ts";
import type { Lead, LeadStatus, SkipReason, WebsiteQualityTier } from "../sheets.ts";

type CompanyRow = typeof company.$inferSelect;

const toRowNo = (rowIndex: number) => rowIndex + 2;
const byRow = (rowNo: number) => eq(company.rowNo, rowNo);

function toLead(r: CompanyRow): Lead {
  return {
    id: String(r.rowNo),
    name: r.name,
    branch: r.branch,
    phone: r.phone,
    city: r.city,
    score: r.score,
    source: r.source,
    website: r.website,
    websiteStatus: r.websiteStatus as Lead["websiteStatus"],
    status: r.leadStatus as LeadStatus,
    notes: r.notes,
    lastUpdated: r.lastUpdated,
    websiteQualityTier: r.websiteQualityTier as WebsiteQualityTier,
    enrichedInfo: r.enrichedInfo,
    email: r.email,
    emailSentAt: r.emailSentAt,
    emailOpenedAt: r.emailOpenedAt,
    emailClickedAt: r.emailClickedAt,
    emailStatus: r.emailStatus,
    followupSentAt: r.followupSentAt,
    reviewsCount: r.reviewsCount,
    callbackDate: r.callbackDate,
    skipReason: r.skipReason as SkipReason,
  };
}

// row_no > 0 = en rigtig lead-række (Sheets-rækkenummer). Kunder uden lead-række
// har NEGATIVT row_no: de kan aldrig kollidere med nye Sheets-rækker før cutover,
// og de vises ikke som leads (det gjorde de heller ikke i Sheets).
export async function getLeads(): Promise<Lead[]> {
  const rows = await getDb()
    .select()
    .from(company)
    .where(and(eq(company.archived, false), gt(company.rowNo, 0)))
    .orderBy(asc(company.rowNo));
  return rows.map(toLead);
}

export async function updateLeadStatus(rowIndex: number, status: LeadStatus, notes?: string): Promise<void> {
  // Spejler sheets.ts: notes nulstilles til "" når den ikke sendes med — i
  // modsætning til batchSetLeadStatus, der lader notes stå urørt.
  await getDb()
    .update(company)
    .set({ leadStatus: status, notes: notes ?? "", lastUpdated: new Date().toISOString(), updatedAt: new Date() })
    .where(byRow(toRowNo(rowIndex)));
}

// Tildeler row_no = max(row_no)+1, +2, … i én transaktion. Advisory-lock'et
// serialiserer samtidige appends (fx to scrape-kørsler i samme sekund), så to
// kald aldrig kan læse samme max(row_no) og kollidere på den unikke kolonne.
export async function appendLeads(leads: Omit<Lead, "id">[]): Promise<void> {
  if (leads.length === 0) return;
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('company_row_no'))`);
    const [{ value }] = await tx.select({ value: max(company.rowNo) }).from(company);
    let nextRowNo = (value ?? 1) + 1;
    await tx.insert(company).values(
      leads.map((l) => ({
        rowNo: nextRowNo++,
        name: l.name,
        branch: l.branch,
        phone: l.phone,
        city: l.city,
        score: l.score,
        source: l.source,
        website: l.website,
        websiteStatus: l.websiteStatus,
        leadStatus: l.status,
        notes: l.notes,
        lastUpdated: l.lastUpdated,
        websiteQualityTier: l.websiteQualityTier ?? "",
        enrichedInfo: l.enrichedInfo ?? "",
        email: l.email ?? "",
        reviewsCount: l.reviewsCount ?? 0,
        skipReason: l.skipReason ?? "",
        // emailSentAt/emailOpenedAt/emailClickedAt/emailStatus/followupSentAt/
        // callbackDate er tomme ved scrape-tid ligesom i sheets.ts — kolonnernes
        // egne default("") dækker dem.
      })),
    );
  });
}

export async function getLeadNames(): Promise<string[]> {
  const rows = await getDb()
    .select({ name: company.name })
    .from(company)
    .where(and(eq(company.archived, false), gt(company.rowNo, 0)))
    .orderBy(asc(company.rowNo));
  return rows.map((r) => r.name);
}

export async function getLeadPhones(): Promise<string[]> {
  const rows = await getDb()
    .select({ phone: company.phone })
    .from(company)
    .where(and(eq(company.archived, false), gt(company.rowNo, 0)))
    .orderBy(asc(company.rowNo));
  return rows.map((r) => r.phone).filter(Boolean);
}

export async function saveEnrichedInfo(rowIndex: number, info: string): Promise<void> {
  await getDb()
    .update(company)
    .set({ enrichedInfo: info, updatedAt: new Date() })
    .where(byRow(toRowNo(rowIndex)));
}

export async function batchUpdateLeadVerifications(
  updates: Array<{ rowIndex: number; qualityTier: WebsiteQualityTier; adjustedScore: number; email?: string }>,
): Promise<void> {
  if (updates.length === 0) return;
  const db = getDb();
  for (const u of updates) {
    const set: { score: number; websiteQualityTier: string; email?: string; updatedAt: Date } = {
      score: u.adjustedScore,
      websiteQualityTier: u.qualityTier,
      updatedAt: new Date(),
    };
    if (u.email) set.email = u.email;
    await db.update(company).set(set).where(byRow(toRowNo(u.rowIndex)));
  }
}

// Rører KUN status/lastUpdated/skipReason — se kommentaren på funktionen i
// sheets.ts: batchSetLeadStatus lader notes stå urørt (i modsætning til
// updateLeadStatus, der nulstiller den).
export async function batchSetLeadStatus(
  updates: Array<{ rowIndex: number; status: LeadStatus; skipReason?: string }>,
): Promise<void> {
  if (updates.length === 0) return;
  const db = getDb();
  const now = new Date();
  for (const u of updates) {
    await db
      .update(company)
      .set({ leadStatus: u.status, lastUpdated: now.toISOString(), skipReason: u.skipReason ?? "", updatedAt: now })
      .where(byRow(toRowNo(u.rowIndex)));
  }
}

export async function saveLeadEmail(rowIndex: number, email: string): Promise<void> {
  await getDb()
    .update(company)
    .set({ email, updatedAt: new Date() })
    .where(byRow(toRowNo(rowIndex)));
}

export async function batchSaveEmails(updates: Array<{ rowIndex: number; email: string }>): Promise<void> {
  for (const u of updates) await saveLeadEmail(u.rowIndex, u.email);
}

type EmailFields = {
  emailSentAt?: string;
  emailOpenedAt?: string;
  emailClickedAt?: string;
  emailStatus?: string;
  followupSentAt?: string;
};

export async function updateLeadEmailStatus(rowIndex: number, fields: EmailFields): Promise<void> {
  // Kun-hvis-angivet: sheets.ts skriver kun de celler der er sat i fields.
  if (Object.values(fields).every((v) => v === undefined)) return;
  await getDb()
    .update(company)
    .set({ ...fields, updatedAt: new Date() })
    .where(byRow(toRowNo(rowIndex)));
}

// Bulk-variant (spejler sheets.ts): sendt-mappe-scannen kan matche 100+ rækker
// på én gang.
export async function updateLeadEmailStatusBulk(
  entries: Array<{ rowIndex: number; fields: { emailSentAt?: string; emailStatus?: string; followupSentAt?: string } }>,
): Promise<void> {
  for (const e of entries) await updateLeadEmailStatus(e.rowIndex, e.fields);
}

export async function updateCallbackDate(rowIndex: number, date: string): Promise<void> {
  await getDb()
    .update(company)
    .set({ callbackDate: date, updatedAt: new Date() })
    .where(byRow(toRowNo(rowIndex)));
}

export async function updateLeadSkipReason(rowIndex: number, reason: SkipReason): Promise<void> {
  await getDb()
    .update(company)
    .set({ skipReason: reason, updatedAt: new Date() })
    .where(byRow(toRowNo(rowIndex)));
}

export async function updateLeadWebsiteStatus(
  rowIndex: number,
  websiteStatus: Lead["websiteStatus"],
  qualityTier: WebsiteQualityTier,
): Promise<void> {
  await getDb()
    .update(company)
    .set({ websiteStatus, websiteQualityTier: qualityTier, updatedAt: new Date() })
    .where(byRow(toRowNo(rowIndex)));
}

// Sletter ikke — sætter archived=true + lifecycle='ikke_egnet'. row_no bevares
// for altid, så det aldrig kan genbruges af appendLeads.
export async function deleteLeadRows(sheetRowNumbers: number[]): Promise<void> {
  const rowNos = [...new Set(sheetRowNumbers.filter((n) => Number.isInteger(n) && n >= 2))];
  if (rowNos.length === 0) return;
  await getDb()
    .update(company)
    .set({ archived: true, lifecycle: "ikke_egnet", updatedAt: new Date() })
    .where(inArray(company.rowNo, rowNos));
}

// I sheets.ts kopieres rækkerne først til "Dead Leads"-fanen (recoverable),
// derefter slettes de fra Leads. I PG ER archived=true den recoverable
// tilstand, så der er intet separat arkiv at kopiere til — reason bruges ikke
// til andet end at matche signaturen.
export async function moveLeadsToDeadLeads(leads: Lead[], _reason: string): Promise<{ moved: number }> {
  if (leads.length === 0) return { moved: 0 };
  await deleteLeadRows(leads.map((l) => parseInt(l.id, 10)));
  return { moved: leads.length };
}

// Samme Dead-Leads-erstatning som moveLeadsToDeadLeads: i Sheets ender
// toArchive i "Dead Leads" og toDelete forsvinder helt; i PG bliver begge dele
// bare archived=true — kun returværdien holder på forskellen mellem dem.
export async function purgeAndArchiveLeads(
  toDelete: Lead[],
  toArchive: Lead[],
  _archiveReason: string,
): Promise<{ deleted: number; archived: number }> {
  await deleteLeadRows([...toDelete, ...toArchive].map((l) => parseInt(l.id, 10)));
  return { deleted: toDelete.length, archived: toArchive.length };
}
