import test from "node:test";
import assert from "node:assert/strict";
import { pickDemos, verticalPageFor, DEMO_SITES } from "./demos.ts";
import { composeColdEmail } from "./compose.ts";

test("skønhedsklinik → VIDA-case først (reel kunde før demo)", () => {
  const demos = pickDemos("skønhedsklinik", "X");
  assert.equal(demos[0].url, DEMO_SITES.vidaCase);
});

test("autoværksted → Ikast AutoService-case først", () => {
  const demos = pickDemos("autoværksted", "X");
  assert.equal(demos[0].url, DEMO_SITES.ikastCase);
});

test("dansk café/restaurant → Jernbanecaféen-case først", () => {
  const demos = pickDemos("café", "X");
  assert.equal(demos[0].url, DEMO_SITES.jernbanecafeenCase);
});

test("international mad (kebab/pizza) er uændret — ingen case-side endnu", () => {
  const demos = pickDemos("pizzeria", "X");
  assert.equal(demos[0].url, DEMO_SITES.zaytoon);
});

test("verticalPageFor(vvs) → vvs-branchesiden", () => {
  assert.equal(verticalPageFor("vvs"), "https://kinly.dk/hjemmeside-til-vvs/");
});

test("verticalPageFor(tandlæge) → null (ingen branche-side, medicinsk-ekskluderet)", () => {
  assert.equal(verticalPageFor("tandlæge"), null);
});

test("mailteksten indeholder branche-siden først + case-linket (salon)", () => {
  const text = composeColdEmail({ name: "Salon Test", branch: "frisør", city: "Herning", reviewsCount: 60, websiteStatus: "old" }).text;
  const links = text.split("\n").filter((l) => l.startsWith("→ ")).map((l) => l.slice(2));
  assert.equal(links[0], verticalPageFor("frisør"));
  assert.ok(links.includes(DEMO_SITES.vidaCase), `kinly.dk-case mangler: ${links.join(", ")}`);
});

test("branche uden branche-side får kun demo-links (tandlæge)", () => {
  const text = composeColdEmail({ name: "Klinik Test", branch: "tandlæge", city: "Herning", reviewsCount: 60, websiteStatus: "old" }).text;
  const links = text.split("\n").filter((l) => l.startsWith("→ ")).map((l) => l.slice(2));
  assert.deepEqual(links, pickDemos("tandlæge", "Klinik Test").slice(0, 2).map((d) => d.url));
});
