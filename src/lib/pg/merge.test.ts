import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, deal, invoice, site } from "../db/schema.ts";
import { mergeCompanies } from "./merge.ts";
import { getLeads } from "./leads.ts";
import { getClients } from "./clients.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

async function ktvvs() {
  const [lead] = await db.insert(company).values({ rowNo: 18, name: "KT VVS ApS", city: "Herning", email: "kt@ktvvs.dk", website: "ktvvs.dk", leadStatus: "called", lifecycle: "kontaktet", reviewsCount: 40 }).returning();
  const [client] = await db.insert(company).values({ rowNo: -1, clientNo: 3, name: "KT VVS", phone: "12345678", lifecycle: "kunde", briefFilled: true }).returning();
  await db.insert(deal).values({ companyId: client.id, isPrimary: true, title: "Hjemmeside", stage: "live", monthlyFeeRaw: "299" });
  await db.insert(site).values({ companyId: client.id, status: "live" });
  const inv = { number: "004", clientName: "KT VVS", recipient: { name: "KT VVS" }, issueDate: "2026-08-01", dueDate: "2026-08-15", lines: [{ description: "Site", amount: 4997 }], vatRate: 0, status: "betalt", payerType: "cvr" };
  await db.insert(invoice).values({ number: "004", companyId: client.id, clientName: "KT VVS", status: "betalt", issueDate: inv.issueDate, dueDate: inv.dueDate, data: inv });
  return { lead, client };
}

test("KT VVS: kunden flettes ind i lead-rækken — ét firma med kundenummer, deal, site og faktura", async () => {
  const { lead, client } = await ktvvs();
  await mergeCompanies(db, lead.id, client.id, "lucas");

  const [kept] = await db.select().from(company).where(eq(company.id, lead.id));
  assert.equal(kept.clientNo, 3);
  assert.equal(kept.lifecycle, "kunde");
  assert.equal(kept.phone, "12345678"); // udfyldt fra kunden
  assert.equal(kept.email, "kt@ktvvs.dk"); // bevaret
  assert.equal(kept.briefFilled, true);

  const [gone] = await db.select().from(company).where(eq(company.id, client.id));
  assert.equal(gone.archived, true);
  assert.equal(gone.lifecycle, "flettet");
  assert.equal(gone.clientNo, null);
  assert.equal(gone.rowNo, -1); // row_no bevares

  assert.equal((await db.select().from(deal).where(eq(deal.companyId, lead.id))).length, 1);
  assert.equal((await db.select().from(invoice).where(eq(invoice.companyId, lead.id))).length, 1);
  assert.equal((await db.select().from(site).where(eq(site.companyId, lead.id))).length, 1);
  const log = await db.select().from(activity).where(eq(activity.companyId, lead.id));
  assert.match(log[0].summary, /Flettet med KT VVS \(række -1\)/);

  // Gamle funktioner ser det rigtige: én kunde, og lead-rækken 18 lever stadig.
  assert.deepEqual((await getClients()).map((c) => [c.id, c.name]), [["3", "KT VVS"]]);
  assert.deepEqual((await getLeads()).map((l) => l.id), ["18"]);
});

test("to primære deals: keep's forbliver primær, drop's bliver almindelig", async () => {
  const [a] = await db.insert(company).values({ rowNo: 2, name: "A", clientNo: 2 }).returning();
  const [b] = await db.insert(company).values({ rowNo: 3, name: "A dublet" }).returning();
  await db.insert(deal).values([{ companyId: a.id, isPrimary: true, title: "keep" }, { companyId: b.id, isPrimary: true, title: "drop" }]);
  await mergeCompanies(db, a.id, b.id, "lucas");
  const deals = await db.select().from(deal).where(eq(deal.companyId, a.id));
  assert.deepEqual(deals.map((d) => [d.title, d.isPrimary]).sort(), [["drop", false], ["keep", true]]);
});

test("afviser: to kunder, samme id, og allerede flettet", async () => {
  const [a] = await db.insert(company).values({ rowNo: 2, name: "A", clientNo: 2 }).returning();
  const [b] = await db.insert(company).values({ rowNo: 3, name: "B", clientNo: 3 }).returning();
  const [c] = await db.insert(company).values({ rowNo: 4, name: "C" }).returning();
  await assert.rejects(mergeCompanies(db, a.id, b.id, "lucas"), /begge er kunder/);
  await assert.rejects(mergeCompanies(db, a.id, a.id, "lucas"), /sig selv/);
  await mergeCompanies(db, a.id, c.id, "lucas");
  await assert.rejects(mergeCompanies(db, a.id, c.id, "lucas"), /allerede flettet/);
});
