import { test } from "node:test";
import assert from "node:assert/strict";
import { canSendTo, sharedEmailSet } from "./canSendTo.ts";

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
