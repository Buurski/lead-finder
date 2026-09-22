import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import { company } from "../db/schema.ts";
import type { Db } from "../db/client.ts";
import type { Invoice, Subscription } from "../invoices.ts";
import {
  deleteInvoiceRow,
  ensureInvoiceCounterAtLeast,
  getInvoice,
  getSubscriptions,
  listInvoices,
  listInvoicesFor,
  nextInvoiceNumber,
  saveInvoice,
  saveSubscriptions,
} from "./invoices.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const inv = (number: string, clientName: string, extra: Partial<Invoice> = {}): Invoice => ({
  number,
  clientName,
  recipient: { name: clientName, cvr: "12345678" },
  issueDate: "2026-09-01",
  dueDate: "2026-09-15",
  lines: [{ description: "Hjemmeside", amount: 4997 }],
  vatRate: 0,
  status: "kladde",
  payerType: "cvr",
  ...extra,
});

test("nummerering er fortløbende og genbruger aldrig et slettet nummer", async () => {
  assert.equal(await nextInvoiceNumber("2026-09-22"), "001");
  assert.equal(await nextInvoiceNumber("2026-09-22"), "002");
  await saveInvoice(inv("002", "Vida"));
  await deleteInvoiceRow("002");
  assert.equal(await nextInvoiceNumber("2026-09-22"), "003");
});

test("tælleren kan hæves men aldrig sænkes", async () => {
  await ensureInvoiceCounterAtLeast(9);
  await ensureInvoiceCounterAtLeast(4);
  assert.equal(await nextInvoiceNumber("2026-09-22"), "010");
});

test("faktura roundtripper loss-frit og overskrives ved gem", async () => {
  const a = inv("001", "Vida", { note: "første" });
  await saveInvoice(a);
  assert.deepEqual(await getInvoice("001"), a);
  const b = { ...a, status: "betalt" as const, paidAt: "2026-09-20" };
  await saveInvoice(b);
  assert.deepEqual(await getInvoice("001"), b);
  assert.equal(await getInvoice("999"), null);
});

test("listInvoices sorterer nyeste nummer først", async () => {
  await saveInvoice(inv("001", "A"));
  await saveInvoice(inv("003", "B"));
  await saveInvoice(inv("002", "C"));
  assert.deepEqual((await listInvoices()).map((i) => i.number), ["003", "002", "001"]);
});

test("listInvoicesFor matcher alias og kobler kun til kunder, ikke leads", async () => {
  const [vida] = await db
    .insert(company)
    .values({ rowNo: 10, clientNo: 2, name: "VIDA Skønhedsklinik", lifecycle: "kunde" })
    .returning();
  await db.insert(company).values({ rowNo: 11, name: "Vida Lead", lifecycle: "ny" });
  await saveInvoice(inv("001", "Vida"));
  await saveInvoice(inv("002", "Andre"));
  const forVida = await listInvoicesFor("VIDA Skønhedsklinik");
  assert.deepEqual(forVida.map((i) => i.number), ["001"]);
  const [row] = await db.select().from(company).where((await import("drizzle-orm")).eq(company.id, vida.id));
  assert.equal(row.clientNo, 2);
});

test("abonnementer erstatter hele listen og bevarer rækkefølgen", async () => {
  const s = (clientName: string, day: number): Subscription => ({
    clientName,
    lines: [{ description: "Hjemmesidepas", amount: 299 }],
    dayOfMonth: day,
    active: true,
  });
  await saveSubscriptions([s("B", 1), s("A", 15)]);
  assert.deepEqual(await getSubscriptions(), [s("B", 1), s("A", 15)]);
  await saveSubscriptions([s("A", 15)]);
  assert.deepEqual(await getSubscriptions(), [s("A", 15)]);
  await assert.rejects(saveSubscriptions([s("A", 1), s("A", 2)]), /Dobbelt/);
});
