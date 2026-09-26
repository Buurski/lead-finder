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

test("dødt demo-link stopper kladden", async () => {
  const { validateDraft } = await import("./draft.ts");
  const r = validateDraft("Se fx https://vestfjends.vercel.app/ her");
  assert.equal(r.ok, false);
});

test("suggestMailLinks: kun kendte, levende links, bedst først, max 5", async () => {
  const { suggestMailLinks, MAIL_LINKS } = await import("./demos.ts");
  const known = new Set(MAIL_LINKS.map((l) => l.url));
  const cafe = suggestMailLinks("café", "Kagehuset");
  assert.ok(cafe.length > 0 && cafe.length <= 5);
  assert.equal(cafe[0].url, "https://kinly.dk/case/jernbanecafeen/");
  assert.ok(cafe.every((l) => known.has(l.url)));
  assert.ok(cafe.some((l) => l.url === "https://kinly.dk/hjemmeside-til-restaurant-cafe/"));
  const klinik = suggestMailLinks("skønhedsklinik", "Frederiksberg Skønhedsklinik");
  assert.equal(klinik[0].url, "https://kinly.dk/case/vida-klinik/");
  assert.ok(!MAIL_LINKS.some((l) => /vestfjends|vida-klinik\.dk|ikastautoservice\.dk/.test(l.url)));
});

test("fitness og ukendte brancher får en rigtig case + projektoversigten, aldrig klinik-demoen (26/9)", () => {
  for (const [branch, name] of [["Fitnesscenter / wellness", "Pure Performance Fitness"], ["Yoga", "Yoga Huset"], ["Tøjbutik", "Butik Nord"]]) {
    const d = pickDemos(branch, name);
    assert.equal(d.length, 2, name);
    assert.ok(d[0].url.startsWith("https://kinly.dk/case/"), `${name}: ${d[0].url}`);
    assert.equal(d[1].url, "https://kinly.dk/projekter/");
    assert.deepEqual(pickDemos(branch, name), d, "samme lead → samme case");
  }
  assert.equal(pickDemos("Hudklinik", "Glow")[0].url, "https://kinly.dk/case/vida-klinik/");
});
