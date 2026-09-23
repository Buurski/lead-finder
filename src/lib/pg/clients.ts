// Postgres-udgave af klient-funktionerne i sheets.ts (fase 1, bag DATA_BACKEND=pg).
// En "klient" er ikke sin egen tabel — det er en company-række med clientNo sat
// (lifecycle='kunde'), koblet til dens primære deal (isPrimary=true) og dens
// site. Client.id = String(clientNo), samme tal som Clients-fanens rækkenummer
// var i sheets.ts.
import { and, asc, eq, isNotNull, max, min, sql } from "drizzle-orm";
import { getDb, type Db } from "../db/client.ts";
import { company, deal, site, subscriptionPlan } from "../db/schema.ts";
import { canonicalClientName } from "../client-alias.ts";
import type { Client, ClientDealPatch, Lead } from "../sheets.ts";

type CompanyRow = typeof company.$inferSelect;
type DealRow = typeof deal.$inferSelect;
type SiteRow = typeof site.$inferSelect;

// select/insert/update er strukturelt ens på Db og på tx inde i en
// db.transaction(...) — så helperne herunder kan bruges begge steder.
type Queryable = Pick<Db, "select" | "insert" | "update" | "execute">;

function toClient(c: CompanyRow, d: DealRow | undefined, s: SiteRow | undefined, planMrr = 0): Client {
  return {
    planMrr,
    id: String(c.clientNo),
    name: c.name,
    branch: c.branch,
    phone: c.phone,
    briefFilled: c.briefFilled,
    projectFolder: s?.projectFolder ?? "",
    websiteStatus: (s?.status ?? "demo") as Client["websiteStatus"],
    monthlyFee: d?.monthlyFeeRaw ?? "",
    setupFee: d?.setupFeeRaw ?? "",
    stage: d?.stage ?? "",
    wonDate: d?.wonAt ?? "",
    expectedClose: d?.expectedClose ?? "",
    source: d?.source ?? "",
    owner: d?.owner ?? "",
    package: d?.package ?? "",
    lostDate: d?.lostAt ?? "",
  };
}

export async function getClients(): Promise<Client[]> {
  const db = getDb();
  const companies = await db
    .select()
    .from(company)
    .where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false)))
    .orderBy(asc(company.clientNo));
  // MRR = aktive abonnementer (det der faktureres) — samme kilde som HQ.
  const plans = await db.select({ companyId: subscriptionPlan.companyId, data: subscriptionPlan.data }).from(subscriptionPlan);
  const planMrr = new Map<string, number>();
  for (const p of plans) {
    const sub = p.data as { active?: boolean; lines?: Array<{ amount?: number }> };
    if (!p.companyId || !sub.active) continue;
    planMrr.set(p.companyId, (planMrr.get(p.companyId) ?? 0) + (sub.lines ?? []).reduce((a, l) => a + (Number(l.amount) || 0), 0));
  }
  const out: Client[] = [];
  for (const c of companies) {
    const [d] = await db.select().from(deal).where(and(eq(deal.companyId, c.id), eq(deal.isPrimary, true)));
    const [s] = await db.select().from(site).where(eq(site.companyId, c.id));
    out.push(toClient(c, d, s, planMrr.get(c.id) ?? 0));
  }
  return out;
}

async function nextClientNo(db: Queryable): Promise<number> {
  const [{ value }] = await db.select({ value: max(company.clientNo) }).from(company);
  return (value ?? 1) + 1;
}

// Kunder uden lead-række får negativt row_no (−1, −2, …): de kan aldrig støde
// sammen med Sheets-rækkenumre og vises ikke i getLeads().
async function nextNonLeadRowNo(db: Queryable): Promise<number> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext('company_row_no'))`);
  const [{ value }] = await db.select({ value: min(company.rowNo) }).from(company);
  return Math.min(value ?? 0, 0) - 1;
}

async function companyByClientNo(db: Queryable, clientId: string): Promise<{ id: string } | undefined> {
  if (!/^\d+$/.test(clientId)) throw new Error(`bad client id: ${clientId}`);
  const row = Number(clientId);
  if (!Number.isSafeInteger(row) || row < 2) throw new Error(`bad client id: ${clientId}`);
  return (await db.select({ id: company.id }).from(company).where(eq(company.clientNo, row)))[0];
}

// Opdaterer (eller opretter) den primære deal for en company — kun de felter
// der er givet. Mirror af sheets.ts' updateClientFees/updateClientDeal, der
// hver især kun skriver deres egne kolonner og lader resten af rækken stå.
async function upsertDealPatch(db: Queryable, companyId: string, patch: Record<string, string | undefined>): Promise<void> {
  const values = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Record<
    string,
    string
  >;
  if (Object.keys(values).length === 0) return;
  const [d] = await db.select({ id: deal.id }).from(deal).where(and(eq(deal.companyId, companyId), eq(deal.isPrimary, true)));
  if (d) await db.update(deal).set({ ...values, updatedAt: new Date() }).where(eq(deal.id, d.id));
  else await db.insert(deal).values({ companyId, isPrimary: true, ...values });
}

export async function addClient(lead: Lead): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    let [c] = await tx.select().from(company).where(eq(company.rowNo, Number(lead.id)));
    if (!c) {
      [c] = await tx
        .insert(company)
        .values({
          rowNo: await nextNonLeadRowNo(tx),
          name: lead.name,
          branch: lead.branch,
          phone: lead.phone,
          city: lead.city,
          score: lead.score,
          source: lead.source,
          website: lead.website,
          websiteStatus: lead.websiteStatus,
          leadStatus: lead.status,
          notes: lead.notes,
          lastUpdated: lead.lastUpdated,
          websiteQualityTier: lead.websiteQualityTier,
          enrichedInfo: lead.enrichedInfo,
          email: lead.email,
          reviewsCount: lead.reviewsCount,
          callbackDate: lead.callbackDate,
          skipReason: lead.skipReason ?? "",
        })
        .returning();
    }
    // Allerede kunde → gen-aktivér, men opret aldrig ekstra deal/site eller nyt kundenummer.
    if (c.clientNo !== null) {
      await tx.update(company).set({ clientRemoved: false, lifecycle: "kunde", updatedAt: new Date() }).where(eq(company.id, c.id));
      return;
    }
    const clientNo = await nextClientNo(tx);
    await tx
      .update(company)
      .set({ clientNo, lifecycle: "kunde", name: lead.name, branch: lead.branch, phone: lead.phone, updatedAt: new Date() })
      .where(eq(company.id, c.id));
    await tx.insert(deal).values({ companyId: c.id, isPrimary: true, stage: "", setupFeeRaw: "", monthlyFeeRaw: "" }).onConflictDoNothing();
    const [s] = await tx.select({ id: site.id }).from(site).where(eq(site.companyId, c.id));
    if (!s) await tx.insert(site).values({ companyId: c.id, status: "demo", projectFolder: "" });
  });
}

export async function addClientManual(f: {
  name: string; branch?: string; phone?: string; monthlyFee?: string; setupFee?: string;
}): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    const clientNo = await nextClientNo(tx);
    const [c] = await tx
      .insert(company)
      .values({
        rowNo: await nextNonLeadRowNo(tx),
        clientNo,
        lifecycle: "kunde",
        name: f.name,
        branch: f.branch ?? "",
        phone: f.phone ?? "",
        briefFilled: false,
      })
      .returning();
    await tx.insert(deal).values({ companyId: c.id, isPrimary: true, stage: "", setupFeeRaw: f.setupFee ?? "", monthlyFeeRaw: f.monthlyFee ?? "" });
    await tx.insert(site).values({ companyId: c.id, status: "demo", projectFolder: "" });
  });
}

// Matcher via canonicalClientName (plan-krav, skarpere end sheets.ts' rå
// case-insensitive strengmatch), og kun blandt rækker der ER kunder — et lead
// med samme navn må ikke unlinkes ved en fejl.
export async function removeClient(name: string): Promise<{ removed: boolean }> {
  const target = canonicalClientName(name);
  if (!target) return { removed: false };
  const db = getDb();
  const clients = await db
    .select()
    .from(company)
    .where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false)));
  const c = clients.find((r) => canonicalClientName(r.name) === target);
  if (!c) return { removed: false };
  // clientNo beholdes (aldrig genbrug af Client.id) — markeres i stedet som fjernet.
  await db.update(company).set({ clientRemoved: true, lifecycle: "tabt", updatedAt: new Date() }).where(eq(company.id, c.id));
  return { removed: true };
}

export async function updateClientFees(clientId: string, monthlyFee: string, setupFee: string): Promise<void> {
  const db = getDb();
  const c = await companyByClientNo(db, clientId);
  if (!c) return;
  await upsertDealPatch(db, c.id, { monthlyFeeRaw: monthlyFee, setupFeeRaw: setupFee });
}

const DEAL_PATCH_FIELD: Record<keyof ClientDealPatch, string> = {
  monthlyFee: "monthlyFeeRaw",
  setupFee: "setupFeeRaw",
  stage: "stage",
  wonDate: "wonAt",
  expectedClose: "expectedClose",
  source: "source",
  owner: "owner",
  package: "package",
  lostDate: "lostAt",
};

export async function updateClientDeal(clientId: string, patch: ClientDealPatch): Promise<void> {
  const db = getDb();
  const c = await companyByClientNo(db, clientId);
  if (!c) return;
  const dealPatch = Object.fromEntries(
    (Object.keys(patch) as (keyof ClientDealPatch)[])
      .filter((k) => patch[k] !== undefined)
      .map((k) => [DEAL_PATCH_FIELD[k], patch[k]]),
  );
  await upsertDealPatch(db, c.id, dealPatch);
}

export async function updateClientFolder(rowIndex: number, folderPath: string): Promise<void> {
  const db = getDb();
  const [c] = await db.select({ id: company.id }).from(company).where(eq(company.clientNo, rowIndex + 2));
  if (!c) return;
  const [s] = await db.select({ id: site.id }).from(site).where(eq(site.companyId, c.id));
  if (s) await db.update(site).set({ projectFolder: folderPath }).where(eq(site.id, s.id));
  else await db.insert(site).values({ companyId: c.id, projectFolder: folderPath, status: "demo" });
}

export async function markBriefFilled(rowIndex: number): Promise<void> {
  await getDb()
    .update(company)
    .set({ briefFilled: true, updatedAt: new Date() })
    .where(eq(company.clientNo, rowIndex + 2));
}
