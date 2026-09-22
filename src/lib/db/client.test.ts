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
