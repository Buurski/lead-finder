import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSentLedger, followUpAllowed, isFollowUpDraft } from "./followup-gate.ts";

const NOW = Date.parse("2026-09-22T12:00:00Z");
const fu = { source: "opfoelgning", step: 2, leadId: "12" };
const lead = { id: "12", email: "hej@salon.dk", status: "called", emailSentAt: "2026-09-15T10:00:00Z" };
const ledgerWith = (sent: Array<{ leadId: string; recipientEmail?: string }>) =>
  buildSentLedger(sent.map((s) => ({ ...s, status: "sent" })));
const ctx = (sent = [{ leadId: "12", recipientEmail: "hej@salon.dk" }]) => ({ ledger: ledgerWith(sent), sentThisRun: new Set<string>(), now: NOW });

test("kun opfølgnings-kladder trin 2+ er opfølgninger", () => {
  assert.equal(isFollowUpDraft(fu), true);
  assert.equal(isFollowUpDraft({ ...fu, step: 1 }), false);
  assert.equal(isFollowUpDraft({ source: "daily-engine", step: 3 }), false);
});

test("tilladt: trin passer, samme adresse som sendt, nok afstand", () => {
  assert.deepEqual(followUpAllowed(fu, lead, "hej@salon.dk", ctx()), { ok: true });
  // første mail sendt før køen fandtes (kun på lead-rækken)
  assert.deepEqual(followUpAllowed(fu, lead, "hej@salon.dk", ctx([])), { ok: true });
});

test("en sendt opfølgning der 'godkendes' igen kan ikke sendes igen", () => {
  const twoSent = ctx([{ leadId: "12", recipientEmail: "hej@salon.dk" }, { leadId: "12", recipientEmail: "hej@salon.dk" }]);
  const r = followUpAllowed(fu, { ...lead, followupSentAt: "2026-09-20T10:00:00Z" }, "hej@salon.dk", twoSent);
  assert.equal(r.ok, false);
});

test("afvises: ny adresse, for tæt på sidste mail, over loftet, nej tak, uden lead, to i samme kørsel", () => {
  assert.equal(followUpAllowed(fu, lead, "anden@salon.dk", ctx()).ok, false);
  assert.equal(followUpAllowed(fu, { ...lead, emailSentAt: "2026-09-20T10:00:00Z" }, "hej@salon.dk", ctx()).ok, false);
  assert.equal(followUpAllowed({ ...fu, step: 6 }, lead, "hej@salon.dk", ctx()).ok, false);
  assert.equal(followUpAllowed(fu, { ...lead, status: "not-interested" }, "hej@salon.dk", ctx()).ok, false);
  assert.equal(followUpAllowed(fu, undefined, "hej@salon.dk", ctx()).ok, false);
  const c = ctx();
  c.sentThisRun.add("12");
  assert.equal(followUpAllowed(fu, lead, "hej@salon.dk", c).ok, false);
  // lead-rækkens mail er skiftet siden: opfølgning må kun gå til den adresse der blev sendt til
  assert.equal(followUpAllowed(fu, { ...lead, email: "ny@salon.dk" }, "ny@salon.dk", ctx()).ok, false);
});

test("afvises: navne-match på en anden række end kladdens lead", () => {
  assert.equal(followUpAllowed(fu, { ...lead, id: "99" }, "hej@salon.dk", ctx()).ok, false);
});
