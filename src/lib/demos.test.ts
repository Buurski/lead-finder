import test from "node:test";
import assert from "node:assert/strict";
import { pickDemos, verticalPageFor, DEMO_SITES, KINLY_FRONT, referenceLinks, referenceLines, missingReferenceLinks, withReferenceLinks, hasKinlyFront } from "./demos.ts";
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

// ---- Link-politik (Lucas 24/9) -------------------------------------------
// Alle udkastveje skal bære kinly.dk-forsiden + den matchende case (når branchen
// har en) + branche-siden (når den findes). VVS-casen er bevidst null: /case/
// kt-vvs/ svarede 404 ved verifikation 25/9 — ingen død URL i et udkast.
const BRANCH_CASES: { branch: string; caseUrl: string | null; vertical: string | null }[] = [
  { branch: "skønhedsklinik", caseUrl: DEMO_SITES.vidaCase, vertical: "https://kinly.dk/hjemmeside-til-skoenhedsklinik/" },
  // BEAUTY-rækken (frisør/salon) får VIDA-casen som case-rolle — samme mapping som
  // pickDemos altid har haft. Leads med barber-nøgleord får Artec/Streetcut + frisør-siden.
  { branch: "frisør", caseUrl: DEMO_SITES.vidaCase, vertical: "https://kinly.dk/hjemmeside-til-skoenhedsklinik/" },
  { branch: "barber", caseUrl: null, vertical: "https://kinly.dk/hjemmeside-til-frisoer/" },
  { branch: "café", caseUrl: DEMO_SITES.jernbanecafeenCase, vertical: "https://kinly.dk/hjemmeside-til-restaurant-cafe/" },
  { branch: "autoværksted", caseUrl: DEMO_SITES.ikastCase, vertical: "https://kinly.dk/hjemmeside-til-automekaniker/" },
  { branch: "vvs", caseUrl: null, vertical: "https://kinly.dk/hjemmeside-til-vvs/" },
  { branch: "tandlæge", caseUrl: null, vertical: null },
];

test("link-politikken kræver forside + case/branche-side på tværs af brancher", () => {
  for (const c of BRANCH_CASES) {
    const refs = referenceLinks(c.branch, "Test Test");
    assert.equal(refs.front, KINLY_FRONT, c.branch);
    // Den valgte case og branche-side er de forventede — ikke bare "et eller andet".
    assert.equal(refs.caseUrl, c.caseUrl, `case for ${c.branch}`);
    assert.equal(refs.verticalUrl, c.vertical, `branche-side for ${c.branch}`);
    // caseMissing og caseUrl hænger sammen: ingen ægte case = intet case-link.
    assert.equal(refs.caseMissing, refs.caseUrl === null, `caseMissing/case for ${c.branch}`);
    // Kravene matcher præcis de linjer politikken selv skriver...
    const body = referenceLines(c.branch, "Test Test").join("\n");
    assert.deepEqual(missingReferenceLinks(body, c.branch, "Test Test"), [], c.branch);
    // ...og et case-link må kun optræde når branchen FAKTISK har en case
    // (fail-closed: ingen fremmed branches case, fx Ikast-casen for ukendt branche).
    assert.ok(c.caseUrl || !body.includes("/case/"), `fremmed case-link for ${c.branch}`);
    // ...og en tekst uden links afvises (forsiden kræves altid).
    assert.ok(missingReferenceLinks("Hej, her er ingen links.", c.branch, "Test Test").length > 0, c.branch);
    // Aldrig kundens eget domæne — kun kinly.dk og vores egne demoer.
    assert.ok(!/vida-klinik\.dk|ikastautoservice\.dk|ktvvs\.vercel\.app|jernbanecafeen\.dk/.test(body), c.branch);
  }
});

test("alle fire sekvens-vinkler + kold mail + opfølgning bærer link-linjerne", async () => {
  const { composeColdEmail, composeFollowupEmail } = await import("./compose.ts");
  const { composeStep } = await import("./hq/sequence.ts");
  const lead = { name: "Salon Test", branch: "frisør", city: "Herning", reviewsCount: 60, websiteStatus: "old" };
  const bodies = [composeColdEmail(lead).text, composeFollowupEmail(lead).text];
  for (const angle of ["gratis_udkast", "seo_tjek", "eksempel", "sidste"] as const) {
    bodies.push(composeStep({ name: "Salon Test", branch: "frisør", website: "https://salontest.dk" }, angle).body);
  }
  for (const b of bodies) {
    assert.deepEqual(missingReferenceLinks(b, "frisør", "Salon Test"), [], b.slice(0, 120));
    assert.ok(!/vida-klinik\.dk|ikastautoservice\.dk|ktvvs\.vercel\.app|jernbanecafeen\.dk/.test(b), "aldrig kundens eget domæne");
  }
});

test("legacy-skabelonen får de manglende links ind før signaturen", async () => {
  const { getEmailTemplate } = await import("./email.ts");
  const { formatSignature } = await import("./senders.ts");
  const t = getEmailTemplate("frisør", "cold", {
    leadId: "1", name: "Salon Test", branch: "frisør", city: "Herning",
    websiteStatus: "old", websiteQualityTier: "poor",
  });
  assert.ok(t.text.includes(KINLY_FRONT), "forsiden mangler i legacy-mailen");
  assert.ok(t.html.includes(KINLY_FRONT), "forsiden mangler i legacy-HTML");
  assert.deepEqual(missingReferenceLinks(t.text, "frisør", "Salon Test"), []);
  // Link-blokken skal stå FØR signaturen — ikke efter "Mvh/MVH".
  const sig = formatSignature("lucas").text;
  if (t.text.includes(sig)) assert.ok(t.text.indexOf(KINLY_FRONT) < t.text.indexOf(sig), "links står efter signaturen");
});

test("messenger-DM'en kræver kinly.dk-linket", async () => {
  const { buildMessengerDraft, validateMessengerDraft } = await import("./messenger/compose.ts");
  const d = buildMessengerDraft({ name: "Salon Test", branch: "frisør", city: "Herning", reviews: 80, pattern: "A" });
  assert.deepEqual(validateMessengerDraft(d.text), []);
  assert.ok(validateMessengerDraft(d.text.replace(KINLY_FRONT, "")).includes("mangler kinly.dk-link"));
});

test("withReferenceLinks tilføjer det der mangler og rører ikke en komplet tekst", () => {
  const complete = referenceLines("café", "Bodega Test").join("\n");
  assert.deepEqual(withReferenceLinks(complete, "café", "Bodega Test"), { body: complete, added: [], caseMissing: false });
  const r = withReferenceLinks("Hej\n\nMed venlig hilsen\nLucas", "café", "Bodega Test");
  assert.equal(r.added.length, 3);
  assert.deepEqual(missingReferenceLinks(r.body, "café", "Bodega Test"), []);
  // VVS: ingen case findes → kun forside + branche-side tilføjes, ingen falsk case.
  const v = withReferenceLinks("Hej", "vvs", "VVS Test");
  assert.deepEqual(v.added, [KINLY_FRONT, "https://kinly.dk/hjemmeside-til-vvs/"]);
  assert.equal(v.caseMissing, true);
});

test("case-link og branche-side tæller ikke som link til forsiden", () => {
  const body = `→ ${DEMO_SITES.vidaCase}\n→ https://kinly.dk/hjemmeside-til-skoenhedsklinik/`;
  assert.ok(missingReferenceLinks(body, "skønhedsklinik").some((issue) => issue.includes("forside")));
  const fixed = withReferenceLinks(body, "skønhedsklinik");
  assert.deepEqual(fixed.added, [KINLY_FRONT]);
  assert.deepEqual(missingReferenceLinks(fixed.body, "skønhedsklinik"), []);
  assert.deepEqual(withReferenceLinks(fixed.body, "skønhedsklinik").added, []);
});

test("forsiden tælles med tegnsætning efter og uden afsluttende slash", () => {
  // Fund 5 (26/9): gaten står på et felt Lucas selv skriver. Punktrum, kolon,
  // em dash og # efter URL'en — eller en forside uden afsluttende slash — skal
  // tælle med, ellers afviser vi en mail hvor forsiden faktisk står der.
  for (const ja of [
    KINLY_FRONT,
    `${KINLY_FRONT}.`,
    `${KINLY_FRONT}:`,
    `${KINLY_FRONT}—`,
    `${KINLY_FRONT}#kontakt`,
    "https://kinly.dk",
    "Min egen side: https://kinly.dk.",
    `Se ${KINLY_FRONT} her`,
  ]) {
    assert.equal(hasKinlyFront(ja), true, ja);
  }
  // ...og undersider er stadig ikke forsiden.
  for (const nej of [
    "https://kinly.dk/case/vida-klinik/",
    "https://kinly.dk/hjemmeside-til-vvs/",
    "https://kinly.dk/projekter/",
    "https://kinly.dk/case",
    "https://kinly.dkk/",
  ]) {
    assert.equal(hasKinlyFront(nej), false, nej);
  }
  assert.ok(
    missingReferenceLinks("Se https://kinly.dk/case/vida-klinik/", "skønhedsklinik").some((i) => i.includes("forside")),
    "et case-link alene skal stadig fanges som manglende forside",
  );
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
