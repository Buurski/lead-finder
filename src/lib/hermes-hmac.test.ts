import { test } from "node:test";
import assert from "node:assert/strict";
import { hermesSignature, verifyHermesRequest } from "./hermes-hmac.ts";

const SECRET = "s3cret";
const NOW = 1_790_000_000;
const url = "https://x.test/api/hermes/crm-dossier?q=vida";
const signed = (ts: number, path = "/api/hermes/crm-dossier?q=vida", secret = SECRET) =>
  new Request(url, { headers: { "x-timestamp": String(ts), authorization: `Bearer ${hermesSignature(secret, String(ts), "GET", path)}` } });

test("gyldig signatur accepteres", () => {
  assert.equal(verifyHermesRequest(signed(NOW), SECRET, "", NOW), true);
});

test("forkert secret, anden query, gammelt tidsstempel og tomt secret afvises", () => {
  assert.equal(verifyHermesRequest(signed(NOW, undefined, "andet"), SECRET, "", NOW), false);
  assert.equal(verifyHermesRequest(signed(NOW, "/api/hermes/crm-dossier?q=andet"), SECRET, "", NOW), false);
  assert.equal(verifyHermesRequest(signed(NOW - 301), SECRET, "", NOW), false);
  assert.equal(verifyHermesRequest(signed(NOW), "", "", NOW), false);
  assert.equal(verifyHermesRequest(new Request(url), SECRET, "", NOW), false);
});
