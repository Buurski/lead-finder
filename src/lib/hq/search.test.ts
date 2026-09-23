import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { company, contact, deal, invoice } from "../db/schema.ts";
import { searchAll } from "./search.ts";

let db: Db;
let vidaId: string;
let ktId: string;

beforeEach(async () => {
  db = await freshTestDb();
  [{ id: vidaId }] = await db
    .insert(company)
    .values({ rowNo: 1, name: "VIDA Klinik", city: "Aarhus", lifecycle: "kunde", clientNo: 1 })
    .returning({ id: company.id });
  [{ id: ktId }] = await db
    .insert(company)
    .values({ rowNo: 2, name: "KT VVS ApS", city: "Ikast", lifecycle: "ny" })
    .returning({ id: company.id });
  await db.insert(contact).values({ companyId: vidaId, name: "Vibeke", email: "vibeke@vida.dk", phone: "12345678" });
  await db.insert(deal).values({ companyId: vidaId, title: "Ny hjemmeside til VIDA" });
  await db.insert(invoice).values({ number: "004", companyId: vidaId, clientName: "VIDA Klinik", status: "sendt", issueDate: "2026-09-01", dueDate: "2026-09-15", data: {} });
});

test("tom forespørgsel giver ingen grupper", async () => {
  assert.deepEqual(await searchAll(db, ""), []);
  assert.deepEqual(await searchAll(db, "   "), []);
});

test("finder virksomhed på navn, kunder først", async () => {
  await db.insert(company).values({ rowNo: 3, name: "Vida Frisør", city: "Herning", lifecycle: "ny" });
  const groups = await searchAll(db, "vida");
  const virk = groups.find((g) => g.label === "Virksomheder");
  assert.ok(virk);
  assert.equal(virk!.items[0].title, "VIDA Klinik"); // kunde (clientNo sat) før lead
  assert.equal(virk!.items[0].href, `/virksomheder/${vidaId}`);
});

test("finder kontakt på navn/mail/telefon og peger på virksomheden", async () => {
  const byName = await searchAll(db, "Vibeke");
  assert.equal(byName.find((g) => g.label === "Kontakter")?.items[0].href, `/virksomheder/${vidaId}`);
  const byEmail = await searchAll(db, "vibeke@vida.dk");
  assert.equal(byEmail.find((g) => g.label === "Kontakter")?.items.length, 1);
  const byPhone = await searchAll(db, "12345678");
  assert.equal(byPhone.find((g) => g.label === "Kontakter")?.items.length, 1);
});

test("finder aftale på titel", async () => {
  const groups = await searchAll(db, "hjemmeside");
  const aftaler = groups.find((g) => g.label === "Aftaler");
  assert.equal(aftaler?.items[0].title, "Ny hjemmeside til VIDA");
  assert.equal(aftaler?.items[0].href, `/virksomheder/${vidaId}`);
});

test("finder faktura på nummer eller kundenavn og peger på fakturaer-siden", async () => {
  const byNumber = await searchAll(db, "004");
  const fak = byNumber.find((g) => g.label === "Fakturaer");
  assert.equal(fak?.items[0].title, "Faktura 004");
  assert.equal(fak?.items[0].href, "/fakturaer?clientName=VIDA%20Klinik");
  const byName = await searchAll(db, "VIDA Klinik");
  assert.ok(byName.find((g) => g.label === "Fakturaer")?.items.length);
});

test("KT VVS ApS matcher 'ktvvs'-agtig søgning uden accent-problemer", async () => {
  const groups = await searchAll(db, "kt vvs");
  assert.equal(groups.find((g) => g.label === "Virksomheder")?.items[0].id, ktId);
});

test("'ktvvs' uden mellemrum finder 'KT VVS ApS'", async () => {
  const groups = await searchAll(db, "ktvvs");
  assert.equal(groups.find((g) => g.label === "Virksomheder")?.items[0].id, ktId);
});

test("arkiverede virksomheder vises ikke", async () => {
  await db.update(company).set({ archived: true }).where(eq(company.id, ktId));
  const groups = await searchAll(db, "kt vvs");
  assert.equal(groups.find((g) => g.label === "Virksomheder"), undefined);
});

test("max 5 pr. gruppe og respekterer et lavere limit", async () => {
  for (let i = 0; i < 6; i++) {
    await db.insert(company).values({ rowNo: 100 + i, name: `Testfirma ${i}`, city: "Herning" });
  }
  const groups = await searchAll(db, "testfirma");
  assert.equal(groups.find((g) => g.label === "Virksomheder")?.items.length, 5);
  const limited = await searchAll(db, "testfirma", 2);
  assert.equal(limited.find((g) => g.label === "Virksomheder")?.items.length, 2);
});
