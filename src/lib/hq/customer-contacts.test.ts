import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { company, contact, deal } from "../db/schema.ts";
import { listCustomerContacts } from "./customer-contacts.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

test("kunder (lifecycle 'kunde') tages med, med kontakt-mails og domæne", async () => {
  const [vida] = await db.insert(company).values({ rowNo: 1, clientNo: 1, name: "VIDA Skønhedsklinik", email: "info@vida-klinik.dk", website: "https://www.vida-klinik.dk" }).returning();
  await db.insert(contact).values({ companyId: vida.id, clientName: "VIDA Skønhedsklinik", name: "Lene", email: "Lene@Vida-Klinik.dk" });

  const rows = await listCustomerContacts(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "VIDA Skønhedsklinik");
  assert.deepEqual(rows[0].domains, ["vida-klinik.dk"]);
  assert.deepEqual(new Set(rows[0].emails), new Set(["info@vida-klinik.dk", "lene@vida-klinik.dk"]));
});

test("varmt lead med aftale i gang tages med — uden aftale springes den over", async () => {
  await db.insert(company).values({ rowNo: 2, name: "Salon Uden Aftale", leadStatus: "interested" });
  const [warm] = await db.insert(company).values({ rowNo: 3, name: "Salon Med Aftale", leadStatus: "interested", email: "kontakt@salon.dk" }).returning();
  await db.insert(deal).values({ companyId: warm.id, title: "Hjemmeside", stage: "tilbud" });

  const rows = await listCustomerContacts(db);
  assert.deepEqual(rows.map((r) => r.name), ["Salon Med Aftale"]);
});

test("almindelig lead (ikke kunde, ikke varm) udelades", async () => {
  await db.insert(company).values({ rowNo: 4, name: "Kold Lead" });
  const rows = await listCustomerContacts(db);
  assert.equal(rows.length, 0);
});

test("ugyldigt website giver ingen domæne, men tæller ikke som fejl", async () => {
  await db.insert(company).values({ rowNo: 5, clientNo: 2, name: "Uden Website" });
  const rows = await listCustomerContacts(db);
  assert.deepEqual(rows[0].domains, []);
});
