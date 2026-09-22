// contact-history.test.ts — "Set før"-indekset skal også dække køens egne
// sendte kladder (Lucas 2026-09-22: "tjek alle leads om de har været i mail
// før"), og et Sheets-svar må aldrig overskrives af en kø-record.
//
// Regression: indekset blev KUN bygget fra Sheets, så en forretning vi har
// mailet fra godkendelses-køen (uden Sheets-række) så "aldrig set" ud.

import test from "node:test";
import assert from "node:assert/strict";
import { buildContactIndex } from "./contact-history.ts";
import type { Lead } from "../sheets.ts";
import type { QueueDraft } from "../queue.ts";

const lead = (over: Partial<Lead>): Lead =>
  ({
    id: "L1",
    name: "Salon Test",
    branch: "Frisør",
    phone: "",
    city: "Ikast",
    score: 0,
    source: "",
    website: "",
    websiteStatus: "ok",
    status: "new",
    notes: "",
    lastUpdated: "",
    websiteQualityTier: "unknown",
    enrichedInfo: "",
    email: "",
    emailSentAt: "",
    emailOpenedAt: "",
    emailClickedAt: "",
    emailStatus: "",
    followupSentAt: "",
    callbackDate: "",
    reviewsCount: 0,
    ...over,
  }) as Lead;

const draft = (over: Partial<QueueDraft>): QueueDraft =>
  ({
    id: "d_1",
    leadId: "p_1",
    name: "Salon Test",
    branch: "Frisør",
    city: "Ikast",
    hooks: [],
    demoPair: [],
    professionalism: "",
    subject: "",
    body: "",
    status: "sent",
    source: "leadgen-ingest",
    createdAt: "2026-09-10T06:30:00.000Z",
    updatedAt: "2026-09-12T06:30:00.000Z",
    ...over,
  }) as QueueDraft;

const NOW = new Date("2026-09-22T12:00:00.000Z");

test("kø-sendt kladde uden Sheets-række giver 'set før' med ukendt svar", () => {
  const index = buildContactIndex([], NOW, [draft({ recipientEmail: "Hej@salon-test.dk" })]);
  const rec = index.lookup("Salon Test", "Ikast", undefined);
  assert.ok(rec, "kø-sendt forretning skal slå op i indekset");
  assert.equal(rec.reason, "sendt via køen 2026-09-12");
  assert.equal(rec.replied, "ukendt");
  // Også email/domæne-vejen (samme forretning under anden stavning/by)
  assert.equal(index.lookup("Andet Navn", "Herning", "hej@salon-test.dk")?.reason, "sendt via køen 2026-09-12");
});

test("afventende/rejected kladder tæller ikke som sendt", () => {
  const index = buildContactIndex([], NOW, [
    draft({ id: "d_a", status: "pending" }),
    draft({ id: "d_b", status: "rejected", name: "Anden Salon", city: "Herning" }),
  ]);
  assert.equal(index.lookup("Salon Test", "Ikast", undefined), null);
  assert.equal(index.lookup("Anden Salon", "Herning", undefined), null);
});

test("Sheets-svar vinder over kø-record for samme forretning", () => {
  const index = buildContactIndex(
    [lead({ status: "not-interested", emailSentAt: "2026-09-01", email: "hej@salon-test.dk" })],
    NOW,
    [draft({})],
  );
  const rec = index.lookup("Salon Test", "Ikast", undefined);
  assert.equal(rec?.replied, "nej", "arket ved at de svarede nej — det må kø-recorden ikke skjule");
});
