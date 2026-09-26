import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, deal } from "../db/schema.ts";
import { createDeal, DealInputError, deleteDeal, listPipeline, normalizeStage, updateDeal } from "./deals.ts";

let db: Db;
let companyId: string;
beforeEach(async () => {
  db = await freshTestDb();
  [{ id: companyId }] = await db.insert(company).values({ rowNo: 7, name: "Ikast AutoService" }).returning({ id: company.id });
});

test("gamle Sheets-faser oversættes", () => {
  assert.equal(normalizeStage("won"), "aftalt");
  assert.equal(normalizeStage("delivering"), "i_gang");
  assert.equal(normalizeStage("live"), "leveret");
  assert.equal(normalizeStage("offer"), "tilbud");
  assert.equal(normalizeStage("", "live"), "leveret");
  assert.equal(normalizeStage("i_gang"), "i_gang");
});

test("opret og flyt en aftale logger hvem der gjorde hvad", async () => {
  const d = await createDeal(db, companyId, { title: "Nyhedsbrev", mrrDkk: "299" }, "lucas");
  assert.equal(d.stage, "tilbud");
  assert.equal(d.mrrDkk, 299);
  await updateDeal(db, d.id, { stage: "aftalt", nextStep: "Send første udkast", nextStepDue: "2026-09-25" }, "charlie");
  const [after] = await db.select().from(deal).where(eq(deal.id, d.id));
  assert.equal(after.stage, "aftalt");
  assert.ok(after.wonAt);
  const log = (await db.select().from(activity).where(eq(activity.companyId, companyId))).map((a) => [a.actor, a.summary]);
  assert.deepEqual(log, [
    ["lucas", "Ny aftale: Nyhedsbrev (Tilbud)"],
    ["charlie", "Nyhedsbrev: Tilbud → Aftalt, næste skridt: Send første udkast (2026-09-25)"],
  ]);
});

test("validering afviser rod", async () => {
  await assert.rejects(createDeal(db, companyId, { title: "" }, "lucas"), DealInputError);
  const d = await createDeal(db, companyId, { title: "Site" }, "lucas");
  await assert.rejects(updateDeal(db, d.id, { stage: "vundet" }, "lucas"), /ukendt fase/);
  await assert.rejects(updateDeal(db, d.id, { nextStepDue: "25/9" }, "lucas"), /ÅÅÅÅ-MM-DD/);
  await assert.rejects(updateDeal(db, d.id, { mrrDkk: "abc" }, "lucas"), /beløb/);
  await assert.rejects(updateDeal(db, d.id, { owner: "hacker" }, "lucas"), /ejer/);
});

test("pipeline viser gamle rå-beløb og normaliserede faser", async () => {
  await db.insert(deal).values({ companyId, stage: "live", setupFeeRaw: "4997", monthlyFeeRaw: "299", package: "standard" });
  const [card] = await listPipeline(db);
  assert.deepEqual([card.stage, card.title, card.valueDkk, card.mrrDkk], ["leveret", "standard", 4997, 299]);
});

test("sletter en aftale og logger det på tidslinjen", async () => {
  const d = await createDeal(db, companyId, { title: "Nyhedsbrev" }, "lucas");
  await deleteDeal(db, d.id, "lucas");
  assert.deepEqual(await db.select().from(deal).where(eq(deal.id, d.id)), []);
  const log = (await db.select().from(activity).where(eq(activity.companyId, companyId))).map((a) => a.summary);
  assert.ok(log.includes("Aftale slettet: Nyhedsbrev"));
});

test("betalt aftale kan ikke slettes", async () => {
  const [d] = await db.insert(deal).values({ companyId, title: "Site", stage: "betalt" }).returning();
  await assert.rejects(deleteDeal(db, d.id, "lucas"), /betalt/);
});

test("aftale med faktureret arbejde kan ikke slettes", async () => {
  const d = await createDeal(db, companyId, { title: "Site" }, "lucas");
  await db.insert(activity).values({ companyId, dealId: d.id, type: "arbejde", summary: "Design", billableDkk: 500, invoicedAt: new Date() });
  await assert.rejects(deleteDeal(db, d.id, "lucas"), /fakturerede/);
});
