import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";
import { PhaseError, setPhase } from "./phase.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

test("fase sættes via lead_status, livsfasen følger, og skiftet logges på tidslinjen; noter røres ikke", async () => {
  const [c] = await db.insert(company).values({ rowNo: 7, name: "Salon Lux", notes: "ring efter kl. 14" }).returning();
  const r = await setPhase(db, c.id, "interesseret", "lucas");
  assert.equal(r.lifecycle, "interesseret");
  assert.equal(r.stopDrafts, false);
  const [after] = await db.select().from(company).where(eq(company.id, c.id));
  assert.equal(after.leadStatus, "interested");
  assert.equal(after.notes, "ring efter kl. 14");
  const [a] = await db.select().from(activity);
  assert.equal(a.type, "fase");
  assert.match(a.summary, /interesseret/);
  assert.equal((await setPhase(db, c.id, "tabt", "lucas")).stopDrafts, true);
});

test("kunder, ukendte faser og prototype-nøgler afvises", async () => {
  const [kunde] = await db.insert(company).values({ rowNo: -1, clientNo: 3, name: "KT VVS" }).returning();
  await assert.rejects(setPhase(db, kunde.id, "tabt", "lucas"), PhaseError);
  const [c] = await db.insert(company).values({ rowNo: 8, name: "X" }).returning();
  for (const bad of ["kunde", "constructor", "toString", 1, null]) await assert.rejects(setPhase(db, c.id, bad, "lucas"), PhaseError);
});
