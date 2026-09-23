import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, contact } from "../db/schema.ts";
import { draftCustomerUpdate, listUpdates, setUpdate, untoldWork, UpdateError } from "./customer-updates.ts";

let db: Db;
let cid: string;
beforeEach(async () => {
  db = await freshTestDb();
  [{ id: cid }] = await db.insert(company).values({ rowNo: -1, name: "KT VVS", clientNo: 1, email: "info@ktvvs.dk" }).returning({ id: company.id });
  await db.insert(contact).values({ companyId: cid, name: "Kim Thomsen", email: "kim@ktvvs.dk" });
  await db.insert(activity).values([
    { companyId: cid, type: "arbejde", summary: "Ny forside med billeder fra værkstedet", payload: { kundeSynlig: true } },
    { companyId: cid, type: "arbejde", summary: "Intern oprydning", payload: { kundeSynlig: false } },
  ]);
});

const noAi = async () => null;

test("kladde samler kun kunde-synligt arbejde, går til kontakten og kan ikke laves to gange", async () => {
  const u = await draftCustomerUpdate(db, cid, "lucas", noAi);
  assert.equal(u.to, "kim@ktvvs.dk");
  assert.match(u.body, /^Hej Kim,/);
  assert.match(u.body, /Ny forside/);
  assert.doesNotMatch(u.body, /oprydning/);
  assert.equal((await listUpdates(db)).length, 1);
  await assert.rejects(draftCustomerUpdate(db, cid, "lucas", noAi), UpdateError);
});

test("AI-tekst bruges når den er fornuftig; kassér frigiver arbejdet, sendt låser kladden", async () => {
  const u = await draftCustomerUpdate(db, cid, "lucas", async () => "Hej Kim,\n\nVi har lagt en ny forside op med billeder fra jeres værksted.");
  assert.match(u.body, /lagt en ny forside op/);
  await setUpdate(db, u.id, { status: "kasseret" }, "lucas");
  assert.equal((await untoldWork(db, cid)).length, 1);
  const u2 = await draftCustomerUpdate(db, cid, "charlie", noAi);
  await setUpdate(db, u2.id, { body: "Rettet tekst" }, "charlie");
  await setUpdate(db, u2.id, { status: "sendt" }, "charlie");
  assert.equal((await listUpdates(db, "sendt"))[0].body, "Rettet tekst");
  await assert.rejects(setUpdate(db, u2.id, { body: "x" }, "lucas"), UpdateError);
});
