import { test } from "node:test";
import assert from "node:assert/strict";
import { leadRowIndex } from "./lead-row.ts";
import { freshTestDb } from "./db/test-db.ts";
import { company } from "./db/schema.ts";
import { getLeads } from "./pg/leads.ts";

test("rowIndex kommer fra lead.id, ikke fra positionen", () => {
  assert.equal(leadRowIndex({ id: "2" }), 0);
  assert.equal(leadRowIndex({ id: "740" }), 738);
  assert.throws(() => leadRowIndex({ id: "" }));
  assert.throws(() => leadRowIndex({ id: "-1" }));
});

test("regression: med et arkiveret hul peger positionen forkert — lead.id rigtigt", async () => {
  await freshTestDb();
  const db = (await import("./db/client.ts")).getDb();
  await db.insert(company).values([
    { rowNo: 2, name: "A" },
    { rowNo: 3, name: "Arkiveret", archived: true },
    { rowNo: 4, name: "C" },
  ]);
  const leads = await getLeads();
  const c = leads.find((l) => l.name === "C")!;
  assert.equal(leads.indexOf(c), 1); // positionen ville give rowIndex 1 → række 3 (forkert)
  assert.equal(leadRowIndex(c), 2); // rigtigt: række 4
});
