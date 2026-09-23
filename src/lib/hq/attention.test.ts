import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { company, invoice, outreach, task } from "../db/schema.ts";
import { __setStore, InMemoryStore } from "../store.ts";
import { createPreviewRequest, updatePreviewStatus } from "../preview-queue.ts";
import { getAttention } from "./attention.ts";

let db: Db;
const TODAY = "2026-09-23";

beforeEach(async () => {
  db = await freshTestDb();
  __setStore(new InMemoryStore());
});

test("getAttention samler tasks, svar, kunder og fakturaer og sorterer haster først", async () => {
  // Lead med ubehandlet svar.
  await db.insert(company).values({ rowNo: 2, name: "Salon Artec", emailStatus: "replied", leadStatus: "new", emailSentAt: new Date(Date.now() - 3 * 86_400_000).toISOString() });

  // Kunde med forfalden faktura (rowNo negativ = ingen lead-række, kun kunde).
  const [vida] = await db.insert(company).values({ rowNo: -1, clientNo: 5, name: "VIDA" }).returning();
  const invData = {
    number: "010", clientName: "VIDA", recipient: { name: "VIDA" }, issueDate: "2026-09-01", dueDate: "2026-09-10",
    lines: [{ description: "Pas", amount: 750 }], vatRate: 0, status: "forfalden", payerType: "cvr",
  };
  await db.insert(invoice).values({ number: "010", companyId: vida.id, clientName: "VIDA", status: "forfalden", issueDate: "2026-09-01", dueDate: "2026-09-10", data: invData });

  // Opgaver: lucas' er forfalden, charlies er i dag — kun lucas' skal med ved owner-filter.
  await db.insert(task).values({ owner: "lucas", title: "Ring til kunden", due: "2026-09-01" });
  await db.insert(task).values({ owner: "charlie", title: "Send tilbud", due: TODAY });

  // Kladde der venter på godkendelse.
  await db.insert(outreach).values({ id: "d1", status: "pending", draft: {} });

  // Gratis udkast klar til afsendelse.
  const preview = await createPreviewRequest({ company: "Ny Kunde", channel: "formular", email: "ny@example.com" });
  await updatePreviewStatus(preview.id, "preview klar", { previewUrl: "https://private.example/x" });

  const items = await getAttention(db, { owner: "lucas", today: TODAY });

  // Haster-linjer skal alle ligge før obs-linjer.
  const firstObs = items.findIndex((i) => i.level === "obs");
  assert.ok(firstObs > 0);
  assert.ok(items.slice(0, firstObs).every((i) => i.level === "haster"));
  assert.ok(items.slice(firstObs).every((i) => i.level === "obs"));

  assert.ok(items.some((i) => i.kind === "svar" && i.level === "haster" && i.text === "1 svar venter — ikke behandlet" && i.href === "/replies"));
  assert.ok(items.some((i) => i.kind === "opgave" && i.text.includes("Ring til kunden")));
  assert.equal(items.some((i) => i.kind === "opgave" && i.text.includes("Send tilbud")), false, "charlies opgave må ikke med ved owner=lucas");
  assert.ok(items.some((i) => i.kind === "faktura" && i.level === "haster" && i.text.includes("Faktura 010 er forfalden")));
  assert.ok(items.some((i) => i.kind === "kunde" && i.text.includes("VIDA") && i.text.includes("forfaldent")));
  assert.ok(items.some((i) => i.kind === "kladde" && i.level === "obs" && i.text === "1 kladde venter på godkendelse" && i.href === "/approve"));
  assert.ok(items.some((i) => i.kind === "preview" && i.level === "obs" && i.href === "/previews"));
});

test("owner=null viser opgaver for begge ejere", async () => {
  await db.insert(task).values({ owner: "lucas", title: "Lucas-opgave", due: "2026-09-01" });
  await db.insert(task).values({ owner: "charlie", title: "Charlie-opgave", due: "2026-09-01" });
  const items = await getAttention(db, { owner: null, today: TODAY });
  assert.ok(items.some((i) => i.text.includes("Lucas-opgave")));
  assert.ok(items.some((i) => i.text.includes("Charlie-opgave")));
});

test("tom liste er tom, ikke en fejl", async () => {
  const items = await getAttention(db, { owner: "lucas", today: TODAY });
  assert.deepEqual(items, []);
});
