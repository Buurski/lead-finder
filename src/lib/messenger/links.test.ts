import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handleFromWebsite } from "./handle.ts";
import { safeHref } from "../safe-href.ts";

const PANEL = new URL("../../app/messenger/MessengerPanel.tsx", import.meta.url);

// Negativ kontrol: website-kolonnen (scraping/import) kan bære et fremmed skema.
// handle.ts:28 kræver kun at strengen indeholder "facebook.com", og id-grenene
// (linje 33/36) giver inputstrengen RÅ videre i fbPageUrl.
test("fbPageUrl kan blive et javascript:-skema — safeHref lukker den", () => {
  const h = handleFromWebsite("javascript:alert('facebook.com/p/123456')");
  assert.ok(h, "forudsætning: handle.ts accepterer strengen");
  assert.match(h.fbPageUrl, /^javascript:/i, "forudsætning: fbPageUrl er rå");
  assert.equal(safeHref(h.fbPageUrl), undefined, "fail-closed: ikke-http(s) = ikke-klikbart");
});

test("messengerUrl er bygget på https og er sikker i samme gren", () => {
  const h = handleFromWebsite("javascript:alert('facebook.com/p/123456')");
  assert.match(h!.messengerUrl, /^https:\/\/www\.facebook\.com\/messages\/t\/\d+$/);
});

// Positiv kontrol: rigtige FB-links skal overleve uændret.
test("positiv kontrol: https-fbPageUrl bevares", () => {
  const h = handleFromWebsite("https://www.facebook.com/p/Test-123456789/");
  assert.ok(h);
  assert.equal(safeHref(h.fbPageUrl), h.fbPageUrl);
  assert.match(h.messengerUrl, /^https:\/\/www\.facebook\.com\/messages\/t\/[A-Za-z0-9.-]+$/);
});

// Kildekode-tjek: panelet må ikke gå tilbage til det rå href.
test("MessengerPanel tegner fbPageUrl gennem safeHref", () => {
  const src = readFileSync(PANEL, "utf8");
  assert.ok(!/href=\{c\.fbPageUrl\}/.test(src), "rå fbPageUrl er tilbage i MessengerPanel");
  assert.ok(/href=\{safeHref\(c\.fbPageUrl\)\}/.test(src), "safeHref mangler på FB-side-linket");
});
