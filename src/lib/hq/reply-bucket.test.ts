import { test } from "node:test";
import assert from "node:assert/strict";
import { bucketFor, phoneInText, OLD_REPLY_DAYS, type BucketInput } from "./reply-bucket.ts";

const NOW = new Date("2026-10-15T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const base: BucketInput = { category: "question", asksCall: false, receivedAt: ago(3), hasSnippet: true };
const b = (over: Partial<BucketInput>) => bucketFor({ ...base, ...over }, NOW).bucket;

test("nej og afmeld → luk, også når svaret er gammelt eller beder om opkald", () => {
  assert.equal(b({ category: "not-interested" }), "luk");
  assert.equal(b({ category: "unsubscribe", receivedAt: ago(200), hasSnippet: false }), "luk");
  assert.equal(b({ category: "not-interested", asksCall: true }), "luk");
});

test("ingen hentet svar-mail → tjek", () => {
  assert.equal(b({ category: null, receivedAt: null, hasSnippet: false }), "tjek");
});

test("gammel: grænsen er mere end 60 dage; auto-reply og spørgsmål gamle ender begge i gammel", () => {
  assert.equal(b({ receivedAt: ago(OLD_REPLY_DAYS) }), "skriv");
  assert.equal(b({ receivedAt: ago(OLD_REPLY_DAYS + 1) }), "gammel");
  assert.equal(b({ category: "auto-reply", receivedAt: ago(100) }), "gammel");
  assert.equal(b({ asksCall: true, receivedAt: ago(100) }), "gammel");
});

test("friske: autosvar, uklart og uden tekst → tjek", () => {
  assert.equal(b({ category: "auto-reply" }), "tjek");
  assert.equal(b({ category: "other" }), "tjek");
  assert.equal(b({ category: "wrong-person" }), "tjek");
  assert.equal(b({ category: "interested", hasSnippet: false }), "tjek");
});

test("friske: bad om opkald → ring; ellers spørgsmål/indvending/interesse → skriv med egen begrundelse", () => {
  assert.equal(b({ category: "interested", asksCall: true }), "ring");
  assert.equal(b({ category: "question" }), "skriv");
  assert.equal(bucketFor({ ...base, category: "objection" }, NOW).why, "De tøver. Svar roligt på mail, uden pres.");
  assert.equal(b({ category: "interested" }), "skriv");
});

test("phoneInText: finder nummer, ignorerer CVR og korte tal", () => {
  assert.equal(phoneInText("Ring på 12 34 56 78 efter kl. 16"), "12 34 56 78");
  assert.equal(phoneInText("min mobil +45 12345678"), "+45 12345678");
  assert.equal(phoneInText("CVR 12345678, ring til mig"), null);
  assert.equal(phoneInText("vi åbner kl. 10 den 5."), null);
});
