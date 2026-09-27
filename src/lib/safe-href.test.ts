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

// Jev-skyggesiden tegner lead.website (scrapet kolonne) direkte i et anker.
test("javascript:, vbscript: og data: afvises", () => {
  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref("vbscript:x"), undefined);
  assert.equal(safeHref("data:text/html,x"), undefined);
});

test("http(s) bevares og bart værtsnavn bliver https", () => {
  assert.equal(safeHref("https://eksempel.dk"), "https://eksempel.dk");
  assert.equal(safeHref("eksempel.dk"), "https://eksempel.dk");
});

test("jev-shadow-siden sender r.url gennem safeHref", () => {
  const src = readFileSync(new URL("../app/jev-shadow/page.tsx", import.meta.url), "utf8");
  assert.ok(!src.includes("href={r.url}"), "jev-shadow/page.tsx må ikke bruge r.url råt i href");
  assert.ok(src.includes("safeHref(r.url)"), "jev-shadow/page.tsx skal bruge safeHref(r.url)");
});
