import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, counter, invoice } from "../db/schema.ts";
import { BillingError, invoiceFromWork, unbilledWork } from "./billing.ts";

let db: Db;
let companyId: string;
let otherId: string;
const opts = { today: "2026-09-23", payerType: "privat" as const };
beforeEach(async () => {
  db = await freshTestDb();
  [{ id: companyId }, { id: otherId }] = await db
    .insert(company)
    .values([{ rowNo: -1, name: "KT VVS", clientNo: 1 }, { rowNo: 9, name: "Andet firma" }])
    .returning({ id: company.id });
  await db.insert(counter).values({ name: "invoice", value: 10 });
});

async function work(cid: string, summary: string, amount: number | null) {
  const [r] = await db.insert(activity).values({ companyId: cid, type: "arbejde", summary, billableDkk: amount }).returning({ id: activity.id });
  return r.id;
}

test("samler valgt arbejde til én kladde og stempler det", async () => {
  const a = await work(companyId, "Ny forside", 1500);
  const b = await work(companyId, "SEO-tekster", 800);
  await work(companyId, "Gratis rettelse", null);
  assert.equal((await unbilledWork(db, companyId)).length, 2);
  const inv = await invoiceFromWork(db, companyId, [a, b], opts);
  assert.equal(inv.number, "011");
  assert.equal(inv.status, "kladde");
  assert.equal(inv.dueDate, "2026-10-07");
  assert.deepEqual(inv.lines.map((l) => l.amount).sort(), [1500, 800].sort());
  const [row] = await db.select().from(invoice).where(eq(invoice.number, "011"));
  assert.equal(row.companyId, companyId);
  assert.equal((await unbilledWork(db, companyId)).length, 0);
});

test("to klik giver aldrig to fakturaer, og intet halvt", async () => {
  const a = await work(companyId, "Ny forside", 1500);
  const b = await work(companyId, "Logo", 500);
  await invoiceFromWork(db, companyId, [a], opts);
  await assert.rejects(invoiceFromWork(db, companyId, [a, b], opts), BillingError);
  // b er ikke stemplet og tælleren er ikke brugt af det afviste forsøg
  assert.equal((await unbilledWork(db, companyId)).length, 1);
  assert.equal((await db.select().from(invoice)).length, 1);
  const [c] = await db.select().from(counter).where(eq(counter.name, "invoice"));
  assert.equal(c.value, 11);
});

test("andre kunders arbejde og tom liste afvises", async () => {
  const x = await work(otherId, "Deres arbejde", 900);
  await assert.rejects(invoiceFromWork(db, companyId, [x], opts), BillingError);
  await assert.rejects(invoiceFromWork(db, companyId, [], opts), BillingError);
});
