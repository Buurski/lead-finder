import { test } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import { readQueue, writeQueue } from "./queue.ts";
import type { QueueDraft } from "../queue.ts";

function draft(overrides: Partial<QueueDraft>): QueueDraft {
  return {
    id: "d_base",
    leadId: "7",
    name: "Salon Artec",
    branch: "frisør",
    city: "Herning",
    hooks: ["god anmeldelse", "ingen hjemmeside"],
    demoPair: [
      { label: "Under Klippen", url: "https://under-klippen.vercel.app/", verticalUrl: "/hjemmeside-til-frisor/" },
      { label: "Streetcut", url: "https://streetcut.vercel.app/" },
    ],
    professionalism: "seriøs",
    subject: "Hej Salon Artec",
    body: "Vi har lavet en demo til jer.",
    status: "pending",
    source: "daily-engine",
    createdAt: "2026-09-20T08:00:00.000Z",
    updatedAt: "2026-09-20T08:00:00.000Z",
    comboId: "combo_1",
    openerKind: "quote",
    sender: "lucas",
    sentBy: "charlie",
    recipientEmail: "salon@example.dk",
    website: "https://salon-artec.dk",
    reviewsCount: 42,
    businessStatus: "OPERATIONAL",
    history: {
      seenBefore: true,
      reason: "svarede sidst",
      lastContactAt: "2026-08-01T00:00:00.000Z",
      daysSince: 50,
      replied: "ja",
      warmth: "lun",
    },
    ...overrides,
  };
}

test("writeQueue → readQueue er et loss-frit roundtrip (inkl. hooks/demoPair/history)", async () => {
  await freshTestDb();
  const d = draft({ id: "d_full" });
  await writeQueue([d]);
  const all = await readQueue();
  assert.equal(all.length, 1);
  assert.deepEqual(all[0], d);
});

test("writeQueue sletter rækker hvis id ikke længere er i drafts", async () => {
  await freshTestDb();
  const a = draft({ id: "d_a", createdAt: "2026-09-20T08:00:00.000Z" });
  const b = draft({ id: "d_b", createdAt: "2026-09-20T09:00:00.000Z" });
  await writeQueue([a, b]);
  assert.equal((await readQueue()).length, 2);

  await writeQueue([b]);
  const remaining = await readQueue();
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].id, "d_b");
});

test("readQueue er ordnet efter createdAt ASC (derefter id)", async () => {
  await freshTestDb();
  const late = draft({ id: "d_late", createdAt: "2026-09-20T12:00:00.000Z" });
  const early = draft({ id: "d_early", createdAt: "2026-09-20T06:00:00.000Z" });
  const sameTimeB = draft({ id: "d_same_b", createdAt: "2026-09-20T09:00:00.000Z" });
  const sameTimeA = draft({ id: "d_same_a", createdAt: "2026-09-20T09:00:00.000Z" });
  await writeQueue([late, early, sameTimeB, sameTimeA]);

  const order = (await readQueue()).map((d) => d.id);
  assert.deepEqual(order, ["d_early", "d_same_a", "d_same_b", "d_late"]);
});

test("writeQueue tildeler companyRowNo kun for numeriske leadId", async () => {
  const db = await freshTestDb();
  const numeric = draft({ id: "d_num", leadId: "12" });
  const nonNumeric = draft({ id: "d_ingest", leadId: "ingest-abc" });
  await writeQueue([numeric, nonNumeric]);

  const { outreach } = await import("../db/schema.ts");
  const rows = await db.select().from(outreach);
  const byId = Object.fromEntries(rows.map((r) => [r.id, r.companyRowNo]));
  assert.equal(byId["d_num"], 12);
  assert.equal(byId["d_ingest"], null);
});

test("writeQueue med tom liste tømmer køen", async () => {
  await freshTestDb();
  await writeQueue([draft({ id: "d_1" })]);
  assert.equal((await readQueue()).length, 1);
  await writeQueue([]);
  assert.equal((await readQueue()).length, 0);
});
