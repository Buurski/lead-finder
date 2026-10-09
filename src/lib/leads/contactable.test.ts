import { test } from "node:test";
import assert from "node:assert/strict";
import { isContactable, coldOutreachPaused } from "./contactable.ts";
import type { Lead } from "../sheets.ts";

const lead = (o: Partial<Lead>): Lead => ({ name: "Salon X", status: "", email: "", ...o }) as Lead;

test("aldrig kontaktet lead er kontaktbar", () => {
  assert.equal(isContactable(lead({})), true);
});

test("afmeldt/bounced er aldrig kontaktbar — heller ikke uden emailSentAt (E21)", () => {
  for (const emailStatus of ["unsubscribed", "unsubscribe", "afmeldt", "bounced", "complained"]) {
    assert.equal(isContactable(lead({ emailStatus })), false, emailStatus);
  }
  for (const status of ["unsubscribed", "afmeldt", "bounced"]) {
    assert.equal(isContactable(lead({ status })), false, status);
  }
});

test("§10-kill-switch: pauset som default, kun '0' åbner (E18)", () => {
  assert.equal(coldOutreachPaused({}), true);
  assert.equal(coldOutreachPaused({ COLD_OUTREACH_PAUSED: "1" }), true);
  assert.equal(coldOutreachPaused({ COLD_OUTREACH_PAUSED: "" }), true);
  assert.equal(coldOutreachPaused({ COLD_OUTREACH_PAUSED: " 0 " }), false);
});

test("kølagt til Messenger via emailStatus genvises aldrig (Astra S2#5)", () => {
  for (const emailStatus of ["messenger-queued", " Messenger "]) {
    assert.equal(isContactable(lead({ emailStatus })), false, emailStatus);
  }
});
