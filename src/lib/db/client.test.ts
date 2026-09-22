import { test } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "./test-db.ts";
import { company } from "./schema.ts";

test("skema kan oprette og læse en virksomhed med fast row_no", async () => {
  const db = await freshTestDb();
  await db.insert(company).values({ rowNo: 7, name: "Salon Artec", city: "Herning" });
  const rows = await db.select().from(company);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].rowNo, 7);
  assert.equal(rows[0].lifecycle, "ny");
  assert.equal(rows[0].email, "");
});

test("row_no er unik", async () => {
  const db = await freshTestDb();
  await db.insert(company).values({ rowNo: 3, name: "A" });
  await assert.rejects(db.insert(company).values({ rowNo: 3, name: "B" }));
});

test("livsfasen følger status automatisk (trigger)", async () => {
  const db = await freshTestDb();
  const { eq } = await import("drizzle-orm");
  await db.insert(company).values({ rowNo: 9, name: "X" });
  const life = async () => (await db.select().from(company).where(eq(company.rowNo, 9)))[0].lifecycle;
  assert.equal(await life(), "ny");
  await db.update(company).set({ emailSentAt: "2026-09-01" }).where(eq(company.rowNo, 9));
  assert.equal(await life(), "kontaktet");
  await db.update(company).set({ emailStatus: "replied" }).where(eq(company.rowNo, 9));
  assert.equal(await life(), "svaret");
  await db.update(company).set({ leadStatus: "not-interested" }).where(eq(company.rowNo, 9));
  assert.equal(await life(), "tabt");
  await db.update(company).set({ clientNo: 7 }).where(eq(company.rowNo, 9));
  assert.equal(await life(), "kunde");
  await db.update(company).set({ archived: true, lifecycle: "flettet", clientNo: null }).where(eq(company.rowNo, 9));
  assert.equal(await life(), "flettet");
});
