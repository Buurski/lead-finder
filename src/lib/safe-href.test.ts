import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { safeHref } from "./safe-href.ts";

test("kun http(s) slipper igennem", () => {
  assert.equal(safeHref("https://kinly.dk"), "https://kinly.dk");
  assert.equal(safeHref("salonlux.dk"), "https://salonlux.dk");
  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref(" JavaScript:alert(1)"), undefined);
  assert.equal(safeHref("data:text/html,x"), undefined);
  assert.equal(safeHref(""), undefined);
});

test("safeHref er fail-closed for ikke-http(s) og bevarer rigtige links", () => {
  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref("  JavaScript:alert(1)  "), undefined);
  assert.equal(safeHref("data:text/html,<script>alert(1)</script>"), undefined);
  assert.equal(safeHref("vbscript:msgbox(1)"), undefined);
  assert.equal(safeHref(""), undefined);
  assert.equal(safeHref(undefined), undefined);
  assert.equal(safeHref("https://ktvvs.vercel.app/"), "https://ktvvs.vercel.app/");
  assert.equal(safeHref("https://vida-klinik.dk/"), "https://vida-klinik.dk/");
  assert.equal(safeHref("ktvvs.vercel.app"), "https://ktvvs.vercel.app");
});

test("StudioGrid tegner demo-kataloget gennem safeHref", () => {
  const src = readFileSync(new URL("../app/studio/StudioGrid.tsx", import.meta.url), "utf8");
  assert.ok(src.includes("href={safeHref(d.url)}"), "demo-ankeret gaar ikke gennem safeHref");
  assert.ok(!src.includes("href={d.url}"), "raa href={d.url} findes stadig");
});

// Jev-skyggesiden tegner lead.website (scrapet kolonne) direkte i et anker.
// (60d4462: negativ/positiv kontrol ovenfor, kildekode-tjek her.)
test("jev-shadow-siden sender r.url gennem safeHref", () => {
  const src = readFileSync(new URL("../app/jev-shadow/page.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("href={r.url}"), "jev-shadow/page.tsx må ikke bruge r.url råt i href");
  assert.ok(src.includes("safeHref(r.url)"), "jev-shadow/page.tsx skal bruge safeHref(r.url)");
});

