import { test } from "node:test";
import assert from "node:assert/strict";
import { addressSuppressed, canSendTo, isSuppressed, previewBlockReason, sharedEmailSet } from "./canSendTo.ts";

test("preview-send: afmeldt spærrer, almindelig skip gør ikke, skip efter svar gør (Astra 9/10)", () => {
  const a = "kunde@example.dk";
  assert.equal(previewBlockReason([{ email: a, status: "skip", emailStatus: "" }], a), null, "frasorteret uden svar");
  assert.match(previewBlockReason([{ email: "Kunde@Example.dk ", emailStatus: "afmeldt" }], a) ?? "", /afmeldt/);
  assert.match(previewBlockReason([{ email: a, status: "skip", emailStatus: "replied" }], a) ?? "", /frasorteret efter et svar/);
  assert.equal(previewBlockReason([{ email: "anden@x.dk", emailStatus: "afmeldt" }], a), null);
});

const ok = { name: "Salon Artec", branch: "frisør", email: "hej@salonartec.dk", emailStatus: "", status: "new" };

test("adresse på 3+ forskellige virksomheder blokeres som shared-email", () => {
  const leads = [
    { name: "Optiker Ravn Odense", email: "info@grouponline.dk" },
    { name: "Moby Dick", email: "INFO@grouponline.dk" },
    { name: "AJ Byg", email: "info@grouponline.dk" },
    { name: "Salon Artec", email: "hej@salonartec.dk" },
  ];
  const shared = sharedEmailSet(leads);
  assert.deepEqual([...shared], ["info@grouponline.dk"]);
  assert.equal(canSendTo({ ...ok, email: "info@grouponline.dk" }, { sharedEmails: shared }).reason, "shared-email");
  assert.equal(canSendTo(ok, { sharedEmails: shared }).ok, true);
});

test("samme virksomhed to gange med samme adresse er ikke 'delt'", () => {
  const shared = sharedEmailSet([
    { name: "Pro Beauty", email: "info@probeauty.dk" },
    { name: "Pro Beauty", email: "info@probeauty.dk" },
    { name: "pro beauty ", email: "info@probeauty.dk" },
  ]);
  assert.equal(shared.size, 0);
});

test("pladsholder-adresser fra scrapet blokeres", () => {
  for (const e of ["user@domain.com", "mail@demolink.org", "x@example.com"]) {
    assert.equal(canSendTo({ ...ok, email: e }).reason, "bad-email", e);
  }
  assert.equal(canSendTo({ ...ok, email: "none" }).reason, "bad-email");
});

test("afmeldt/bounced på status eller emailStatus blokerer SMTP-gaten (E21, Sol GN2)", () => {
  const base = { name: "Salon Lux", email: "maja@salonlux.dk", status: "", emailStatus: "" };
  assert.equal(canSendTo(base).ok, true);
  for (const status of ["afmeldt", "unsubscribed", "bounced"]) assert.equal(canSendTo({ ...base, status }).ok, false, status);
  for (const emailStatus of ["afmeldt", "complained", "unsubscribed", "bounced"]) assert.equal(canSendTo({ ...base, emailStatus }).ok, false, emailStatus);
});

test("isSuppressed: afmeldt/bounced på status eller emailStatus kommer i adresse-registret (Astra S2#3)", () => {
  for (const emailStatus of ["afmeldt", " Afmeldt ", "unsubscribe", "unsubscribed", "complained", "bounced"]) {
    assert.equal(isSuppressed({ emailStatus }), true, emailStatus);
  }
  for (const status of ["afmeldt", "unsubscribed", "bounced"]) assert.equal(isSuppressed({ status }), true, status);
  for (const emailStatus of ["", "sent", "replied", "messenger-queued"]) assert.equal(isSuppressed({ emailStatus, status: "new" }), false, emailStatus);
});

test("addressSuppressed: umatchet kladde til afmeldt adresse på ANDET lead blokeres (Astra S2#3 trin 7)", () => {
  const leads = [
    { name: "Frisør A", email: "Info@Salon.dk ", emailStatus: "afmeldt" },
    { name: "Café B", email: "hej@cafe.dk", emailStatus: "sent" },
  ];
  assert.equal(addressSuppressed(leads, "info@salon.dk"), true);
  assert.equal(addressSuppressed(leads, "hej@cafe.dk"), false);
  assert.equal(addressSuppressed(leads, "ny@kunde.dk"), false);
  assert.equal(addressSuppressed([{ email: "x@y.dk", status: "bounced" }], " X@Y.dk"), true);
});
