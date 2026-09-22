import { test } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import { company, contact as contactTable, activity as activityTable } from "../db/schema.ts";
import {
  listContacts,
  saveContact,
  deleteContact,
  listActivities,
  addActivity,
  appendSystemActivity,
  listTasks,
  saveTask,
  updateTask,
  deleteTask,
} from "./crm.ts";
import type { CrmContact } from "../crm-client.ts";

function contactDoc(overrides: Partial<CrmContact>): CrmContact {
  return {
    id: "contact_1",
    clientName: "Salon Artec",
    name: "Anna",
    role: "ejer",
    email: "anna@example.dk",
    phone: "12345678",
    channel: "mail",
    note: "vigtig",
    updatedAt: "2026-09-20T08:00:00.000Z",
    ...overrides,
  };
}

test("kontakter: create → list → delete er loss-frit og tømmer listen", async () => {
  await freshTestDb();
  const doc = contactDoc({});
  await saveContact(doc);

  let list = await listContacts("Salon Artec");
  assert.equal(list.length, 1);
  assert.deepEqual(list[0], doc);

  await deleteContact("Salon Artec", "contact_1");
  list = await listContacts("Salon Artec");
  assert.equal(list.length, 0);
});

test("deleteContact fejler pænt hvis kontakten ikke findes eller tilhører en anden kunde", async () => {
  await freshTestDb();
  await assert.rejects(deleteContact("Salon Artec", "missing"), /kontakt findes ikke/);
  await saveContact(contactDoc({ id: "contact_x", clientName: "A" }));
  await assert.rejects(deleteContact("B", "contact_x"), /kontakt findes ikke/);
});

test("aktiviteter: listActivities sorterer nyeste først, respekterer limit og klient-filter", async () => {
  await freshTestDb();
  await addActivity({ id: "act_1", clientName: "Salon Artec", at: "2026-09-18T08:00:00.000Z", type: "note", text: "Første", actor: "lucas" });
  await addActivity({ id: "act_2", clientName: "Salon Artec", at: "2026-09-19T08:00:00.000Z", type: "note", text: "Anden", actor: "lucas" });
  await addActivity({ id: "act_3", clientName: "Andet Firma", at: "2026-09-20T08:00:00.000Z", type: "note", text: "Tredje", actor: "lucas" });

  const forClient = await listActivities("Salon Artec", 60);
  assert.deepEqual(forClient.map((a) => a.id), ["act_2", "act_1"]);

  const limited = await listActivities(undefined, 2);
  assert.deepEqual(limited.map((a) => a.id), ["act_3", "act_2"]);

  const all = await listActivities(undefined, 60);
  assert.equal(all.length, 3);
});

test("appendSystemActivity er idempotent på eventKey (kaldt to gange = én række)", async () => {
  const db = await freshTestDb();
  await appendSystemActivity("Salon Artec", "invoice-009", "Faktura 009 oprettet som kladde");
  await appendSystemActivity("Salon Artec", "invoice-009", "Faktura 009 oprettet som kladde (igen)");

  const rows = await db.select().from(activityTable);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].legacyId, "sys_invoice-009");
  assert.equal((rows[0].payload as { text: string }).text, "Faktura 009 oprettet som kladde");
});

test("opgaver: saveTask/listTasks/updateTask/deleteTask spejler taskSort og fejler pænt på ukendt id", async () => {
  await freshTestDb();
  const a = await saveTask({ title: "Ring til kunden", due: "2026-09-25" }, "Salon Artec", "task_a");
  const b = await saveTask({ title: "Send tilbud", due: "2026-09-21" }, "Salon Artec", "task_b");
  assert.equal(a.done, false);
  assert.equal(b.due, "2026-09-21");

  let list = await listTasks("Salon Artec");
  assert.deepEqual(list.map((t) => t.id), ["task_b", "task_a"]); // tidligste frist først blandt ikke-færdige

  const updated = await updateTask("task_b", "Salon Artec", true);
  assert.equal(updated.done, true);
  assert.ok(updated.doneAt);

  list = await listTasks("Salon Artec");
  assert.deepEqual(list.map((t) => t.id), ["task_a", "task_b"]); // færdige sidst

  await deleteTask("task_a", "Salon Artec");
  list = await listTasks("Salon Artec");
  assert.deepEqual(list.map((t) => t.id), ["task_b"]);

  await assert.rejects(updateTask("task_a", "Salon Artec", true), /opgave findes ikke/);
  await assert.rejects(deleteTask("task_a", "Salon Artec"), /opgave findes ikke/);
});

test("saveTask afviser genbrug af et task-id der tilhører en anden kunde", async () => {
  await freshTestDb();
  await saveTask({ title: "Ring til kunden", due: "" }, "Salon Artec", "task_shared");
  await assert.rejects(saveTask({ title: "Andet" }, "Andet Firma", "task_shared"), /anden kunde/);
});

test("companyId sættes når canonicalClientName matcher en kunde med clientNo, ellers null — alias virker også", async () => {
  const db = await freshTestDb();
  const [withClientNo] = await db.insert(company).values({ rowNo: 1, name: "Salon Artec", clientNo: 5 }).returning();
  await db.insert(company).values({ rowNo: 2, name: "Ukendt Firma" }); // clientNo null ⇒ ikke kunde
  const [viaAlias] = await db.insert(company).values({ rowNo: 3, name: "VIDA Skønhedsklinik", clientNo: 9 }).returning();

  await saveContact(contactDoc({ id: "contact_co", clientName: "Salon Artec" }));
  await saveContact(contactDoc({ id: "contact_none", clientName: "Ukendt Firma" }));
  await saveContact(contactDoc({ id: "contact_alias", clientName: "Vida" })); // alias for VIDA Skønhedsklinik

  const rows = await db.select().from(contactTable);
  const byLegacyId = Object.fromEntries(rows.map((r) => [r.legacyId, r.companyId]));
  assert.equal(byLegacyId["contact_co"], withClientNo.id);
  assert.equal(byLegacyId["contact_none"], null);
  assert.equal(byLegacyId["contact_alias"], viaAlias.id);
});
