import { test } from "node:test";
import assert from "node:assert/strict";

// Route readQueue/writeQueue through the in-memory pg test backend (pg/queue.ts)
// so this test never touches the real .send_queue/approval_queue.json on disk —
// same isolation pattern as src/lib/pg/queue.test.ts. PGlite is an embedded fake,
// not real Postgres/Neon.
process.env.DATA_BACKEND = "pg";
const { freshTestDb } = await import("./db/test-db.ts");
const { appendDrafts, readQueue } = await import("./queue.ts");
import type { QueueDraft } from "./queue.ts";

function draft(overrides: Partial<QueueDraft>): QueueDraft {
  return {
    id: "d_base", leadId: "7", name: "Kagehuset", branch: "café", city: "Herning",
    hooks: [], demoPair: [], professionalism: "", subject: "s", body: "b",
    status: "pending", source: "daily-engine",
    createdAt: "2026-09-23T08:00:00.000Z", updatedAt: "2026-09-23T08:00:00.000Z",
    ...overrides,
  };
}

// Bug fixed 2026-09-23: the engine keys a draft by Sheets ROW NUMBER (leadId),
// the VPS lead-gen pipeline keys it by Google PLACE_ID — so the same business
// entered the queue twice, once from each path.
test("appendDrafts blokerer samme virksomhed (navn+by) under et ANDET leadId-skema", async () => {
  await freshTestDb();
  // Motoren har allerede en PENDING kladde til "Kagehuset" med rækkenummer som leadId.
  await appendDrafts([draft({ id: "d_engine", leadId: "42", name: "Kagehuset", city: "Herning", status: "pending" })]);
  // VPS-ingest forsøger nu den SAMME virksomhed under et place_id — skal springes over.
  const merged = await appendDrafts([draft({ id: "d_vps", leadId: "ChIJabc123", name: "Kagehuset", city: "Herning" })]);
  assert.equal(merged.length, 1, "den anden kladde til samme virksomhed skal springes over");
  assert.equal(merged[0].id, "d_engine");
});

test("appendDrafts blokerer også når den eksisterende kladde allerede er SENDT", async () => {
  await freshTestDb();
  await appendDrafts([draft({ id: "d_sent", leadId: "42", name: "Kagehuset", city: "Herning", status: "sent" })]);
  const merged = await appendDrafts([draft({ id: "d_new", leadId: "ChIJabc123", name: "Kagehuset", city: "Herning" })]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "d_sent");
});

test("appendDrafts blokerer normaliserede navnevarianter (ApS/tegn/store bogstaver)", async () => {
  await freshTestDb();
  await appendDrafts([draft({ id: "d_a", leadId: "1", name: "Kagehuset ApS", city: "Herning", status: "approved" })]);
  const merged = await appendDrafts([draft({ id: "d_b", leadId: "2", name: "KAGEHUSET", city: "Herning" })]);
  assert.equal(merged.length, 1);
});

test("appendDrafts blokerer duplikater INDEN i samme batch (to ingest-poster for samme firma)", async () => {
  await freshTestDb();
  const merged = await appendDrafts([
    draft({ id: "d_1", leadId: "p1", name: "Kagehuset", city: "Herning" }),
    draft({ id: "d_2", leadId: "p2", name: "Kagehuset", city: "Herning" }),
  ]);
  assert.equal(merged.length, 1);
});

test("appendDrafts tillader samme virksomhed i en ANDEN by (bizKey inkluderer by)", async () => {
  await freshTestDb();
  await appendDrafts([draft({ id: "d_a", leadId: "1", name: "Kagehuset", city: "Herning", status: "sent" })]);
  const merged = await appendDrafts([draft({ id: "d_b", leadId: "2", name: "Kagehuset", city: "Aarhus" })]);
  assert.equal(merged.length, 2);
});

// Follow-up-sekvenser (hq/sequence.ts, source "opfoelgning") mål-retter BEVIDST
// en virksomhed der allerede har en SENDT kladde med samme leadId+navn — den
// nye krydsvejs-spærre må aldrig blokere dem.
test("appendDrafts blokerer IKKE opfølgnings-kladder mod en allerede sendt første mail", async () => {
  await freshTestDb();
  await appendDrafts([draft({ id: "d_step1", leadId: "42", name: "Kagehuset", city: "Herning", status: "sent", source: "daily-engine" })]);
  const merged = await appendDrafts([
    draft({ id: "d_step2", leadId: "42", name: "Kagehuset", city: "Herning", status: "pending", source: "opfoelgning", step: 2 }),
  ]);
  assert.equal(merged.length, 2, "opfølgningen skal komme igennem");
  assert.ok(merged.some((d) => d.id === "d_step2"));
});
