import { test } from "node:test";
import assert from "node:assert/strict";
import { followUpAllowed, isFollowUpDraft } from "./followup-gate.ts";

const fu = { source: "opfoelgning", step: 2, leadId: "12" };
const lead = { email: "hej@salon.dk", status: "called", emailSentAt: "" };
const ctx = () => ({ priorSentLeadIds: new Set(["12"]), sentThisRun: new Set<string>() });

test("kun opfølgnings-kladder trin 2+ er opfølgninger", () => {
  assert.equal(isFollowUpDraft(fu), true);
  assert.equal(isFollowUpDraft({ ...fu, step: 1 }), false);
  assert.equal(isFollowUpDraft({ source: "daily-engine", step: 3 }), false);
});

test("opfølgning til samme adresse efter tidligere mail er tilladt", () => {
  assert.deepEqual(followUpAllowed(fu, lead, "hej@salon.dk", ctx()), { ok: true });
  // tidligere mail kan også stå på lead-rækken i stedet for i køen
  assert.deepEqual(followUpAllowed(fu, { ...lead, emailSentAt: "2026-09-10" }, "hej@salon.dk", { priorSentLeadIds: new Set(), sentThisRun: new Set() }), { ok: true });
});

test("afvises: ny adresse, ingen tidligere mail, nej tak, uden lead, to i samme kørsel", () => {
  assert.equal(followUpAllowed(fu, lead, "anden@salon.dk", ctx()).ok, false);
  assert.equal(followUpAllowed(fu, lead, "hej@salon.dk", { priorSentLeadIds: new Set(), sentThisRun: new Set() }).ok, false);
  assert.equal(followUpAllowed(fu, { ...lead, status: "not-interested" }, "hej@salon.dk", ctx()).ok, false);
  assert.equal(followUpAllowed(fu, undefined, "hej@salon.dk", ctx()).ok, false);
  const c = ctx();
  c.sentThisRun.add("12");
  assert.equal(followUpAllowed(fu, lead, "hej@salon.dk", c).ok, false);
});
