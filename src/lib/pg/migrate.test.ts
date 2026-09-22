import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { company, counter, deal, site } from "../db/schema.ts";
import type { Client, Lead } from "../sheets.ts";
import { applyMigration, countTarget, lifecycleFor, planMigration, type MigrationSource } from "./migrate.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const lead = (id: number, name: string, extra: Partial<Lead> = {}): Lead => ({
  id: String(id), name, branch: "frisør", phone: "", city: "Herning", score: 50, source: "places",
  website: "", websiteStatus: "none", status: "new", notes: "", lastUpdated: "", websiteQualityTier: "",
  enrichedInfo: "", email: "", emailSentAt: "", emailOpenedAt: "", emailClickedAt: "", emailStatus: "",
  followupSentAt: "", reviewsCount: 12, callbackDate: "", skipReason: "", ...extra,
});

const client = (id: number, name: string, extra: Partial<Client> = {}): Client => ({
  id: String(id), name, branch: "klinik", phone: "", briefFilled: true, projectFolder: "vida",
  websiteStatus: "live", monthlyFee: "299", setupFee: "4997", stage: "live", wonDate: "2026-06-01",
  expectedClose: "", source: "outreach", owner: "lucas", package: "standard", lostDate: "", ...extra,
});

const source = (): MigrationSource => ({
  leads: [
    lead(2, "VIDA Skønhedsklinik", { status: "client", email: "hej@vida.dk" }),
    lead(3, "Salon Artec", { email: "a@b.dk", emailStatus: "replied" }),
    lead(5, "Salon Artec", { email: "A@b.dk" }),
  ],
  clients: [client(2, "Vida"), client(3, "Jernbanecafeen")],
  queue: [],
  invoices: [{ number: "007", clientName: "Vida", recipient: { name: "Vida" }, issueDate: "2026-09-01", dueDate: "2026-09-15", lines: [{ description: "Hjemmesidepas", amount: 299 }], vatRate: 0, status: "sendt", payerType: "cvr" }],
  invoiceCounter: 9,
  subscriptions: [],
  contacts: [{ id: "c1", clientName: "Vida", name: "Lene", role: "ejer", email: "", phone: "", channel: "", note: "", updatedAt: "2026-09-01" }],
  activities: [{ id: "a1", clientName: "Vida", at: "2026-09-01T10:00:00Z", type: "note", text: "Hej", actor: "lucas" }],
  tasks: [],
});

test("livsfase udledes af status og mail-status", () => {
  assert.equal(lifecycleFor({ status: "new", emailStatus: "replied", emailSentAt: "x" }), "svaret");
  assert.equal(lifecycleFor({ status: "new", emailStatus: "sent", emailSentAt: "x" }), "kontaktet");
  assert.equal(lifecycleFor({ status: "client", emailStatus: "", emailSentAt: "" }), "kunde");
  assert.equal(lifecycleFor({ status: "skip", emailStatus: "replied", emailSentAt: "" }), "ikke_egnet");
});

test("plan finder email- og navn+by-dubletter uden at skrive", async () => {
  const r = planMigration(source());
  assert.deepEqual(r.duplicates.email.map((g) => g.rowNos), [[3, 5]]);
  assert.deepEqual(r.duplicates.nameCity.map((g) => g.rowNos), [[3, 5]]);
  assert.equal(r.clientsMatchedToLead, 1);
  assert.deepEqual(r.clientsWithoutLead, ["Jernbanecafeen"]);
  assert.deepEqual(await countTarget(db), { leads: 0, clients: 0, queue: 0, invoices: 0, subscriptions: 0, contacts: 0, tasks: 0, activities: 0 });
});

test("apply er idempotent og kobler klient til sin lead-række", async () => {
  const first = await applyMigration(db, source());
  assert.deepEqual(first.mismatches, []);
  const second = await applyMigration(db, source());
  assert.deepEqual(second.mismatches, []);
  assert.deepEqual(second.target, first.target);
  assert.equal(first.target?.leads, 3); // Jernbanecafeen (ingen lead-række) er ikke et lead
  const [jb] = await db.select().from(company).where(eq(company.clientNo, 3));
  assert.equal(jb.rowNo, -1);

  const [vida] = await db.select().from(company).where(eq(company.clientNo, 2));
  assert.equal(vida.rowNo, 2);
  assert.equal(vida.lifecycle, "kunde");
  const deals = await db.select().from(deal).where(eq(deal.companyId, vida.id));
  assert.equal(deals.length, 1);
  assert.equal(deals[0].monthlyFeeRaw, "299");
  const sites = await db.select().from(site).where(eq(site.companyId, vida.id));
  assert.equal(sites.length, 1);

  const [svaret] = await db.select().from(company).where(eq(company.rowNo, 3));
  assert.equal(svaret.lifecycle, "svaret");
});

test("fakturatæller sættes til max(tæller, højeste nummer) og sænkes aldrig", async () => {
  await applyMigration(db, source());
  let [c] = await db.select().from(counter).where(eq(counter.name, "invoice"));
  assert.equal(c.value, 9);
  await applyMigration(db, { ...source(), invoiceCounter: 2 });
  [c] = await db.select().from(counter).where(eq(counter.name, "invoice"));
  assert.equal(c.value, 9);
});

test("tvetydigt navne-match kobles ikke — klienten bliver sin egen virksomhed", async () => {
  const src = source();
  src.leads.push(lead(9, "VIDA Skønhedsklinik", { status: "client" })); // to leads med status client
  const r = await applyMigration(db, src);
  assert.deepEqual(r.mismatches, []);
  const [vida] = await db.select().from(company).where(eq(company.clientNo, 2));
  assert.ok(vida.rowNo < 0);
});
