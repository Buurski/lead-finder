import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { company } from "../db/schema.ts";
import { createLeadCompany, CreateCompanyError } from "./create-company.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

test("opretter en virksomhed med negativt row_no", async () => {
  const { id } = await createLeadCompany(db, { name: "  KT VVS  ", city: "Ikast" });
  const [c] = await db.select().from(company).where(eq(company.id, id));
  assert.equal(c.name, "KT VVS");
  assert.equal(c.city, "Ikast");
  assert.ok(c.rowNo < 0, `forventede negativt row_no, fik ${c.rowNo}`);
  assert.equal(c.clientNo, null);
});

test("row_no falder for hver ny manuel virksomhed og kolliderer aldrig med et lead", async () => {
  await db.insert(company).values({ rowNo: 5, name: "Lead-række" });
  const a = await createLeadCompany(db, { name: "Første" });
  const b = await createLeadCompany(db, { name: "Anden" });
  const [ca] = await db.select({ rowNo: company.rowNo }).from(company).where(eq(company.id, a.id));
  const [cb] = await db.select({ rowNo: company.rowNo }).from(company).where(eq(company.id, b.id));
  assert.ok(ca.rowNo < 0 && cb.rowNo < 0);
  assert.notEqual(ca.rowNo, cb.rowNo);
});

test("tomt navn afvises", async () => {
  await assert.rejects(createLeadCompany(db, { name: "   " }), CreateCompanyError);
});
