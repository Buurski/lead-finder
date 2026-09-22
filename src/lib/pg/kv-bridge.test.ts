import { test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import { company, task } from "../db/schema.ts";
import { bridgeKvCrm } from "./kv-bridge.ts";

test("broen indsætter kun nye poster og overskriver aldrig en rettet opgave", async () => {
  const db = await freshTestDb();
  await db.insert(company).values({ rowNo: -1, clientNo: 2, name: "VIDA Skønhedsklinik", lifecycle: "kunde" });
  const kv = {
    activities: [{ id: "a1", clientName: "Vida", at: "2026-09-22T10:00:00Z", type: "email" as const, text: "Mail fra Lene", actor: "hermes" }],
    tasks: [{ id: "t1", clientName: "Vida", title: "Svar Lene", due: "2026-09-23", done: false, at: "2026-09-22T10:00:00Z" }],
    contacts: [],
  };
  assert.deepEqual(await bridgeKvCrm(db, kv), { activities: 1, tasks: 1, contacts: 0 });
  await db.update(task).set({ doneAt: new Date("2026-09-22T12:00:00Z") }).where(eq(task.legacyId, "t1"));
  assert.deepEqual(await bridgeKvCrm(db, kv), { activities: 0, tasks: 0, contacts: 0 });
  const [t] = await db.select().from(task).where(eq(task.legacyId, "t1"));
  assert.ok(t.doneAt, "rettet opgave må ikke nulstilles");
  assert.ok(t.companyId, "kobles til kunden via alias");
});
