import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import { company } from "../db/schema.ts";
import type { Db } from "../db/client.ts";
import type { Lead } from "../sheets.ts";
import {
  appendLeads,
  batchSetLeadStatus,
  batchUpdateLeadVerifications,
  deleteLeadRows,
  getLeadNames,
  getLeadPhones,
  getLeads,
  moveLeadsToDeadLeads,
  purgeAndArchiveLeads,
  saveEnrichedInfo,
  saveLeadEmail,
  updateCallbackDate,
  updateLeadEmailStatus,
  updateLeadEmailStatusBulk,
  updateLeadSkipReason,
  updateLeadStatus,
  updateLeadWebsiteStatus,
} from "./leads.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const newLead = (name: string, extra: Partial<Omit<Lead, "id">> = {}): Omit<Lead, "id"> => ({
  name,
  branch: "",
  phone: "",
  city: "",
  score: 0,
  source: "",
  website: "",
  websiteStatus: "none",
  status: "new",
  notes: "",
  lastUpdated: "",
  websiteQualityTier: "",
  enrichedInfo: "",
  email: "",
  emailSentAt: "",
  emailOpenedAt: "",
  emailClickedAt: "",
  emailStatus: "",
  followupSentAt: "",
  reviewsCount: 0,
  callbackDate: "",
  skipReason: "",
  ...extra,
});

test("getLeads returner samme form som sheets-mapperen: id=row_no, ingen null", async () => {
  await appendLeads([newLead("Salon Artec")]);
  const [lead] = await getLeads();
  assert.deepEqual(lead, {
    id: "2",
    name: "Salon Artec",
    branch: "",
    phone: "",
    city: "",
    score: 0,
    source: "",
    website: "",
    websiteStatus: "none",
    status: "new",
    notes: "",
    lastUpdated: "",
    websiteQualityTier: "",
    enrichedInfo: "",
    email: "",
    emailSentAt: "",
    emailOpenedAt: "",
    emailClickedAt: "",
    emailStatus: "",
    followupSentAt: "",
    reviewsCount: 0,
    callbackDate: "",
    skipReason: "",
  });
});

test("appendLeads tildeler row_no fortløbende, uafhængigt af hvor mange der allerede findes", async () => {
  await appendLeads([newLead("A"), newLead("B")]);
  await appendLeads([newLead("C")]);
  const rows = (await db.select().from(company)).sort((a, b) => a.rowNo - b.rowNo);
  assert.deepEqual(
    rows.map((r) => [r.rowNo, r.name]),
    [[2, "A"], [3, "B"], [4, "C"]],
  );
});

test("updateLeadStatus sætter status+lastUpdated og nulstiller notes uden argument", async () => {
  await appendLeads([newLead("A", { notes: "gammel note" })]);
  await updateLeadStatus(0, "called", "ny note");
  assert.equal((await getLeads())[0].notes, "ny note");
  await updateLeadStatus(0, "interested");
  assert.equal((await getLeads())[0].status, "interested");
  assert.equal((await getLeads())[0].notes, ""); // spejler sheets.ts: notes uden argument = ""
});

test("batchUpdateLeadVerifications skriver score+kvalitet altid, email kun hvis givet", async () => {
  await appendLeads([newLead("A"), newLead("B")]);
  await batchUpdateLeadVerifications([
    { rowIndex: 0, qualityTier: "old", adjustedScore: 40, email: "a@b.test" },
    { rowIndex: 1, qualityTier: "dead", adjustedScore: 55 },
  ]);
  const leads = await getLeads();
  assert.equal(leads[0].email, "a@b.test");
  assert.equal(leads[0].score, 40);
  assert.equal(leads[1].email, ""); // ingen email givet -> urørt
  assert.equal(leads[1].score, 55);
});

test("batchSetLeadStatus rører ikke notes (i modsætning til updateLeadStatus)", async () => {
  await appendLeads([newLead("A", { notes: "skal blive" })]);
  await batchSetLeadStatus([{ rowIndex: 0, status: "skip", skipReason: "chain" }]);
  const [lead] = await getLeads();
  assert.equal(lead.status, "skip");
  assert.equal(lead.skipReason, "chain");
  assert.equal(lead.notes, "skal blive");
});

test("getLeadNames/getLeadPhones følger row_no-rækkefølgen og filtrerer tomme telefoner", async () => {
  await appendLeads([newLead("A", { phone: "111" }), newLead("B", { phone: "" }), newLead("C", { phone: "333" })]);
  assert.deepEqual(await getLeadNames(), ["A", "B", "C"]);
  assert.deepEqual(await getLeadPhones(), ["111", "333"]);
});

test("saveEnrichedInfo, saveLeadEmail, updateCallbackDate, updateLeadSkipReason, updateLeadWebsiteStatus", async () => {
  await appendLeads([newLead("A")]);
  await saveEnrichedInfo(0, '{"hook":"x"}');
  await saveLeadEmail(0, "a@b.test");
  await updateCallbackDate(0, "2026-10-01");
  await updateLeadSkipReason(0, "bad_fit");
  await updateLeadWebsiteStatus(0, "old", "mediocre");
  const [lead] = await getLeads();
  assert.equal(lead.enrichedInfo, '{"hook":"x"}');
  assert.equal(lead.email, "a@b.test");
  assert.equal(lead.callbackDate, "2026-10-01");
  assert.equal(lead.skipReason, "bad_fit");
  assert.equal(lead.websiteStatus, "old");
  assert.equal(lead.websiteQualityTier, "mediocre");
});

test("updateLeadEmailStatus(Bulk) skriver kun de angivne felter", async () => {
  // appendLeads sætter altid email-sporingsfelterne til "" (som i sheets.ts) —
  // så vi sætter emailStatus eksplicit først, for at kunne bevise den er urørt bagefter.
  await appendLeads([newLead("A")]);
  await updateLeadEmailStatus(0, { emailStatus: "sent" });
  await updateLeadEmailStatus(0, { emailOpenedAt: "2026-09-22T10:00:00Z" });
  assert.equal((await getLeads())[0].emailOpenedAt, "2026-09-22T10:00:00Z");
  assert.equal((await getLeads())[0].emailStatus, "sent"); // urørt

  await appendLeads([newLead("B")]);
  await updateLeadEmailStatusBulk([
    { rowIndex: 0, fields: { emailStatus: "opened" } },
    { rowIndex: 1, fields: { emailSentAt: "2026-09-22T09:00:00Z", followupSentAt: "2026-09-25T09:00:00Z" } },
  ]);
  const leads = await getLeads();
  assert.equal(leads[0].emailStatus, "opened");
  assert.equal(leads[1].emailSentAt, "2026-09-22T09:00:00Z");
  assert.equal(leads[1].followupSentAt, "2026-09-25T09:00:00Z");
});

test("deleteLeadRows arkiverer i stedet for at slette — skjult fra getLeads, row_no genbruges aldrig", async () => {
  await appendLeads([newLead("A"), newLead("B"), newLead("C")]);
  await deleteLeadRows([2]); // row_no 2 = "A"
  const leads = await getLeads();
  assert.equal(leads.length, 2);
  assert.ok(!leads.some((l) => l.name === "A"));

  const all = await db.select().from(company);
  const row = all.find((r) => r.rowNo === 2)!;
  assert.equal(row.archived, true);
  assert.equal(row.lifecycle, "ikke_egnet");

  // næste appendLeads fortsætter fra det højeste row_no (4), springer aldrig tilbage til 2
  await appendLeads([newLead("D")]);
  const rows = await db.select().from(company);
  assert.equal(rows.find((r) => r.name === "D")?.rowNo, 5);
});

test("moveLeadsToDeadLeads og purgeAndArchiveLeads arkiverer og returnerer sheets.ts-formede tal", async () => {
  await appendLeads([newLead("A"), newLead("B"), newLead("C")]);
  const leads = await getLeads();

  assert.deepEqual(await moveLeadsToDeadLeads([leads[0]], "dublet"), { moved: 1 });
  assert.equal((await getLeads()).length, 2);

  const remaining = await getLeads();
  assert.deepEqual(await purgeAndArchiveLeads([remaining[0]], [remaining[1]], "oprydning"), {
    deleted: 1,
    archived: 1,
  });
  assert.equal((await getLeads()).length, 0);

  assert.deepEqual(await moveLeadsToDeadLeads([], "x"), { moved: 0 });
  assert.deepEqual(await purgeAndArchiveLeads([], [], "x"), { deleted: 0, archived: 0 });
});
