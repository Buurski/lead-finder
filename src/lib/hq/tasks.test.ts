import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, deal, task } from "../db/schema.ts";
import { DealInputError } from "./deals.ts";
import { completeTask, createTask, deleteHqTask, dueBucket, listDone, listMyDay, patchDealNextStep, patchTask, validateTaskPatch } from "./tasks.ts";

let db: Db;
let companyId: string;
const TODAY = "2026-09-23";

beforeEach(async () => {
  db = await freshTestDb();
  [{ id: companyId }] = await db.insert(company).values({ rowNo: 7, name: "Ikast AutoService" }).returning({ id: company.id });
});

test("dueBucket grupperer forfalden/i dag/kommende/uden dato", () => {
  assert.equal(dueBucket("", TODAY), "uden_dato");
  assert.equal(dueBucket("2026-09-01", TODAY), "forfalden");
  assert.equal(dueBucket(TODAY, TODAY), "i_dag");
  assert.equal(dueBucket("2026-12-01", TODAY), "kommende");
});

test("listMyDay samler åbne opgaver og aftalers næste skridt", async () => {
  await db.insert(task).values({ companyId, clientName: "Ikast AutoService", owner: "lucas", title: "Ring til kunden", due: "2026-09-20" });
  await db.insert(task).values({ companyId, clientName: "Ikast AutoService", owner: "charlie", title: "Send tilbud", due: "" });
  // Klaret opgave må ikke dukke op i den åbne liste.
  const [done] = await db.insert(task).values({ companyId, clientName: "Ikast AutoService", owner: "lucas", title: "Gammel", due: "2026-09-01", doneAt: new Date() }).returning();
  await db.insert(deal).values({ companyId, title: "Nyhedsbrev", stage: "i_gang", owner: "lucas", nextStep: "Send udkast", nextStepDue: TODAY });
  await db.insert(deal).values({ companyId, title: "Tabt aftale", stage: "tabt", owner: "lucas", nextStep: "Skulle ikke ses" });

  const items = await listMyDay(db, { today: TODAY });
  assert.equal(items.some((i) => i.id === done.id), false);
  assert.equal(items.some((i) => i.title === "Skulle ikke ses"), false);
  assert.deepEqual(
    items.map((i) => [i.kind, i.title, i.bucket]),
    [
      ["task", "Ring til kunden", "forfalden"],
      ["deal", "Send udkast", "i_dag"],
      ["task", "Send tilbud", "uden_dato"],
    ],
  );

  const lucasOnly = await listMyDay(db, { today: TODAY, owner: "lucas" });
  assert.deepEqual(lucasOnly.map((i) => i.title), ["Ring til kunden", "Send udkast"]);
});

test("opret, afslut og flyt en opgave logger en aktivitet", async () => {
  const t = await createTask(db, { companyId, owner: "lucas", title: "Ring til kunden", due: "2026-09-25" });
  assert.equal(t.owner, "lucas");

  const patched = await patchTask(db, t.id, { due: "2026-09-30" }, "lucas");
  assert.equal(patched.due, "2026-09-30");

  await completeTask(db, t.id, "charlie");
  const [after] = await db.select().from(task).where(eq(task.id, t.id));
  assert.ok(after.doneAt);
  const [log] = await db.select().from(activity).where(eq(activity.companyId, companyId));
  assert.deepEqual([log.actor, log.type, log.summary], ["charlie", "opgave", "Opgave klaret: Ring til kunden"]);

  const done = await listDone(db, {});
  assert.deepEqual(done.map((d) => d.id), [t.id]);
});

test("afslut en aftales næste skridt rydder feltet og logger en note", async () => {
  const [d] = await db.insert(deal).values({ companyId, title: "Nyhedsbrev", stage: "aftalt", owner: "lucas", nextStep: "Send udkast", nextStepDue: TODAY }).returning();
  const after = await patchDealNextStep(db, d.id, { done: true }, "lucas");
  assert.equal(after.nextStep, null);
  const [log] = await db.select().from(activity).where(eq(activity.dealId, d.id));
  assert.equal(log.summary, "Næste skridt klaret: Send udkast");
});

test("validering afviser rod", async () => {
  await assert.rejects(createTask(db, { owner: "lucas", title: "" }), DealInputError);
  await assert.rejects(createTask(db, { owner: "hacker", title: "Ring" }), /ejer/);
  await assert.rejects(createTask(db, { owner: "lucas", title: "Ring", due: "25/9" }), /ÅÅÅÅ-MM-DD/);
  const t = await createTask(db, { owner: "lucas", title: "Ring" });
  await assert.rejects(patchTask(db, t.id, {}, "lucas"), /intet at opdatere/);
});

test("PATCH validerer note, vigtig og dato", () => {
  assert.deepEqual(validateTaskPatch({ title: " Bestil kort ", due: "2026-09-24", owner: "charlie", note: " Allan ", important: true }), {
    title: "Bestil kort", due: "2026-09-24", owner: "charlie", note: "Allan", important: true,
  });
  assert.throws(() => validateTaskPatch({ important: "true" }), DealInputError);
  assert.throws(() => validateTaskPatch({ note: 42 }), DealInputError);
  assert.throws(() => validateTaskPatch({ due: "2026-02-30" }), DealInputError);
  assert.throws(() => validateTaskPatch({ owner: "allan" }), DealInputError);
  assert.throws(() => validateTaskPatch({ done: false }), DealInputError);
});

test("vigtige opgaver sorteres først og kan rettes og slettes", async () => {
  const first = await createTask(db, { owner: "lucas", title: "Almindelig", due: TODAY });
  const marked = await createTask(db, { owner: "lucas", title: "Bestil kort", due: "2026-10-01" });
  await patchTask(db, marked.id, { note: "Afventer verificering fra Allan", important: true, owner: "charlie" }, "lucas");
  const all = await listMyDay(db, { today: TODAY });
  assert.deepEqual(all.map((x) => x.id), [marked.id, first.id]);
  assert.equal(all[0].note, "Afventer verificering fra Allan");
  assert.deepEqual((await listMyDay(db, { today: TODAY, owner: "charlie" })).map((x) => x.id), [marked.id]);
  await deleteHqTask(db, marked.id, "lucas");
  assert.deepEqual((await listMyDay(db, { today: TODAY })).map((x) => x.id), [first.id]);
});
