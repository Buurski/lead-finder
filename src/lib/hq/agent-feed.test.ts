import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";
import { getAgentFeed } from "./agent-feed.ts";

let db: Db;
let companyId: string;
beforeEach(async () => {
  db = await freshTestDb();
  const [c] = await db.insert(company).values({ rowNo: -1, name: "KT VVS", clientNo: 1 }).returning({ id: company.id });
  companyId = c.id;
  await db.insert(activity).values([
    { actor: "claude", type: "session", summary: "færdig: ny forside", companyId },
    { actor: "hermes", type: "checkin", summary: "hermes-status" }, // actor=hermes matcher uden type-match
    { actor: "lucas", type: "checkin", summary: "arbejder på pipeline" }, // menneske — skal ikke med
    { actor: "system", type: "deploy", summary: "prod deploy" }, // type=deploy matcher uden agent-actor
    { actor: "lucas", type: "note", summary: "helt almindelig note" }, // hverken agent-actor eller agent-type
  ]);
});

test("henter kun agent-poster (session/deploy-type ELLER agent-aktør), nyeste først", async () => {
  const rows = await getAgentFeed(db);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.summary).sort(), ["færdig: ny forside", "hermes-status", "prod deploy"].sort());
  assert.ok(!rows.some((r) => r.summary === "arbejder på pipeline"));
  assert.ok(!rows.some((r) => r.summary === "helt almindelig note"));
});

test("kunde-navn med når companyId er sat", async () => {
  const rows = await getAgentFeed(db);
  const row = rows.find((r) => r.summary === "færdig: ny forside");
  assert.equal(row?.companyId, companyId);
  assert.equal(row?.companyName, "KT VVS");
  const noCompany = rows.find((r) => r.summary === "prod deploy");
  assert.equal(noCompany?.companyId, null);
});

test("respekterer limit", async () => {
  const rows = await getAgentFeed(db, 1);
  assert.equal(rows.length, 1);
});
