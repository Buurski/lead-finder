import { test } from "node:test";
import assert from "node:assert/strict";
import { isOptOut, isRejection, wantsContact } from "./rejections.ts";
import { decodeMailBody } from "./mail-decode.ts";

test("eksplicit opt-out er både afvisning og afmelding (Opus S2#2)", () => {
  for (const body of ["Fjern mig fra jeres liste", "Afmeld venligst", "Please unsubscribe", "Stop med at sende mails"]) {
    assert.equal(isRejection(body), true, body);
    assert.equal(isOptOut(body), true, body);
  }
});

test("høfligt nej er afvisning, men ikke afmelding", () => {
  for (const body of ["Nej tak", "Vi er ikke interesseret", "Det er ikke aktuelt"]) {
    assert.equal(isRejection(body), true, body);
    assert.equal(isOptOut(body), false, body);
  }
});

test("accept vinder over afvisning (uændret adfærd)", () => {
  assert.equal(isRejection("Ja tak, ring til mig"), false);
  assert.equal(isOptOut("Ja tak, ring til mig"), false);
});

test("eksplicit afmelding vinder over accept-ord; leadet vil stadig ringes op (Astra 9/10)", () => {
  const body = "Ring til mig, men fjern mig fra mailinglisten";
  assert.equal(isOptOut(body), true);
  assert.equal(wantsContact(body), true);
});

test("citeret afmeld-tekst i vores egen mail tæller ikke: kun selve svaret klassificeres (Astra 9/10)", () => {
  const raw = [
    "From: kunde@example.dk", "List-Unsubscribe: <mailto:x@kinly.dk?subject=unsubscribe>", "Content-Type: text/plain; charset=utf-8", "",
    "Hvad koster det?", "", "Den tor. 9. okt. 2026 kl. 10.00 skrev Lucas <lucas@kinly.dk>:", "> Skriv afmeld, hvis du ikke vil høre mere.",
  ].join("\r\n");
  const body = decodeMailBody(raw);
  assert.equal(body.includes("afmeld"), false);
  assert.equal(isRejection(body), false);
  assert.equal(isOptOut(body), false);
});
