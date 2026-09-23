import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";
import { AgentLogError, logAgentEntry } from "./agent-log.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
  await db.insert(company).values([
    { rowNo: -1, name: "KT VVS", clientNo: 1 },
    { rowNo: 5, name: "Salon Lux" }, // lead, ikke kunde
  ]);
});

test("session-post hæftes kun på entydig kunde", async () => {
  const a = await logAgentEntry(db, { actor: "claude", type: "session", summary: "færdig: ny forside", company: "kt vvs" });
  assert.ok(a.companyId);
  const b = await logAgentEntry(db, { actor: "codex", type: "session", summary: "review", company: "Salon Lux" });
  assert.equal(b.companyId, null);
  const c = await logAgentEntry(db, { actor: "hermes", type: "session", summary: "x", company: "%" });
  assert.equal(c.companyId, null);
  assert.equal((await db.select().from(activity)).length, 3);
});

test("afviser ukendt actor/type, check-in fra agent og for lang tekst", async () => {
  await assert.rejects(logAgentEntry(db, { actor: "root", type: "session", summary: "x" }), AgentLogError);
  await assert.rejects(logAgentEntry(db, { actor: "claude", type: "sql", summary: "x" }), AgentLogError);
  await assert.rejects(logAgentEntry(db, { actor: "hermes", type: "checkin", summary: "x" }), AgentLogError);
  await assert.rejects(logAgentEntry(db, { actor: "lucas", type: "checkin", summary: "x".repeat(1001) }), AgentLogError);
  assert.equal((await db.select().from(activity)).length, 0);
});
