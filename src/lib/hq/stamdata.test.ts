import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";
import { StamdataError, updateStamdata } from "./stamdata.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

test("retter navn/telefon/mail/website/by/branche og logger én fase-hændelse", async () => {
  const [c] = await db.insert(company).values({ rowNo: 1, name: "Gammelt Navn", phone: "11223344" }).returning();
  await updateStamdata(db, c.id, { phone: "22334455", website: "www.kunde.dk" }, "lucas");

  const [after] = await db.select().from(company).where(eq(company.id, c.id));
  assert.equal(after.phone, "22334455");
  assert.equal(after.website, "www.kunde.dk");
  assert.equal(after.name, "Gammelt Navn"); // urørt

  const [a] = await db.select().from(activity);
  assert.equal(a.actor, "lucas");
  assert.equal(a.type, "fase");
  assert.equal(a.summary, "Stamdata rettet: telefon, website");
});

test("ugyldig e-mail og website afvises, gyldige gemmes", async () => {
  const [c] = await db.insert(company).values({ rowNo: 2, name: "X" }).returning();
  await assert.rejects(updateStamdata(db, c.id, { email: "ikke-en-mail" }, "lucas"), StamdataError);
  await assert.rejects(updateStamdata(db, c.id, { website: "ikke et domæne" }, "lucas"), StamdataError);
  await updateStamdata(db, c.id, { email: "kontakt@kunde.dk", website: "https://kunde.dk/forside" }, "lucas");
  const [after] = await db.select().from(company).where(eq(company.id, c.id));
  assert.equal(after.email, "kontakt@kunde.dk");
  assert.equal(after.website, "https://kunde.dk/forside");
});

test("tomt navn afvises, tom telefon/by/branche tillades (rydder feltet)", async () => {
  const [c] = await db.insert(company).values({ rowNo: 3, name: "X", phone: "123" }).returning();
  await assert.rejects(updateStamdata(db, c.id, { name: "  " }, "lucas"), StamdataError);
  await updateStamdata(db, c.id, { phone: "" }, "lucas");
  const [after] = await db.select().from(company).where(eq(company.id, c.id));
  assert.equal(after.phone, "");
});

test("for lange felter afvises", async () => {
  const [c] = await db.insert(company).values({ rowNo: 4, name: "X" }).returning();
  await assert.rejects(updateStamdata(db, c.id, { city: "a".repeat(101) }, "lucas"), StamdataError);
});

test("ukendt virksomhed afvises", async () => {
  await assert.rejects(updateStamdata(db, "00000000-0000-0000-0000-000000000000", { city: "Herning" }, "lucas"), StamdataError);
});

test("ingen ændring → ingen hændelse logges", async () => {
  const [c] = await db.insert(company).values({ rowNo: 5, name: "X", city: "Herning" }).returning();
  await updateStamdata(db, c.id, { city: "Herning" }, "lucas");
  const rows = await db.select().from(activity);
  assert.equal(rows.length, 0);
});

test("en kundes navn kan ikke rettes (fakturaer/kontakter hænger på navnet)", async () => {
  const [c] = await db.insert(company).values({ rowNo: 2, name: "Kunde ApS", clientNo: 9 }).returning();
  await assert.rejects(updateStamdata(db, c.id, { name: "Nyt Navn" }, "lucas"), StamdataError);
  await updateStamdata(db, c.id, { name: "Kunde ApS", phone: "12345678" }, "lucas");
  const [after] = await db.select().from(company).where(eq(company.id, c.id));
  assert.equal(after.name, "Kunde ApS");
  assert.equal(after.phone, "12345678");
});
