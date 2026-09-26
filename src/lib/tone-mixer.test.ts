import { test } from "node:test";
import assert from "node:assert/strict";
import { DISCLOSURES, LUCAS_ONLY, adaptToSender, mixForLead, wrongPersonText } from "./tone-mixer.ts";

test("Charlie får aldrig Lucas' salgselev-historie; skift frem og tilbage er tabsfrit", () => {
  for (const line of DISCLOSURES.charlie) assert.equal(LUCAS_ONLY.test(line), false);
  const lead = { name: "Salon Test", branch: "frisør", city: "Herning", reviewsCount: 40, websiteStatus: "none" };
  assert.equal(LUCAS_ONLY.test(mixForLead(lead, "charlie").disclosure), false);
  const lucasBody = `Hej\n\n${DISCLOSURES.lucas[1]}\n\nMvh`;
  const asCharlie = adaptToSender(lucasBody, "charlie");
  assert.equal(LUCAS_ONLY.test(asCharlie), false);
  assert.equal(adaptToSender(asCharlie, "lucas"), lucasBody);
  const wrapped = lucasBody.replace(". Jeg går", ".\nJeg går"); // brudt over to linjer
  assert.equal(LUCAS_ONLY.test(adaptToSender(wrapped, "charlie")), false);
  // Linjeskift INDE i en sætning (Sol 23/9)
  const midBreak = `Hej\n\n${DISCLOSURES.lucas[0].replace("kode og kontakt", "kode og\nkontakt")}\n\nMvh`;
  assert.equal(LUCAS_ONLY.test(adaptToSender(midBreak, "charlie")), false);
  assert.equal(LUCAS_ONLY.test("Jeg står selv for både kode og\nkontakt."), true);
});

test("adaptToSender: gammel salgselev-præsentation (før 23/9) bliver den nye professionelle — også med linjeskift", async () => {
  const { adaptToSender, DISCLOSURES, LUCAS_ONLY } = await import("./tone-mixer.ts");
  const legacy = "Hej,\n\nJeg arbejder med min sidevirksomhed Kinly ved siden af min\nsalgselevplads, og jeg har et stort drive for at skabe hjemmesider, der kan give lokale virksomheder som jeres flere kunder. Jeg står selv for både kode og kontakt.\n\nMvh";
  const lucas = adaptToSender(legacy, "lucas");
  assert.ok(lucas.includes(DISCLOSURES.lucas[0]));
  assert.ok(!/salgselev/i.test(lucas));
  const charlie = adaptToSender(legacy, "charlie");
  assert.ok(charlie.includes(DISCLOSURES.charlie[0]));
  assert.ok(!LUCAS_ONLY.test(charlie));
  assert.equal(adaptToSender(charlie, "lucas"), lucas);
});

test("fælles præsentation: samme tekst for begge afsendere, gamle navngivne oversættes, forkert person fanges", async () => {
  const { DISCLOSURE, adaptToSender, wrongPersonText, mixForLead } = await import("./tone-mixer.ts");
  const lead = { name: "Café Klein", branch: "café", city: "Kolding", reviewsCount: 669, websiteStatus: "none" };
  assert.equal(mixForLead(lead, "lucas").disclosure, mixForLead(lead, "charlie").disclosure);
  for (const line of DISCLOSURE) {
    assert.equal(wrongPersonText("lucas", line), false);
    assert.equal(wrongPersonText("charlie", line), false);
    assert.doesNotMatch(line, /Lucas|Charlie/);
  }
  const oldCharlie = "Hej,\n\nSammen med Lucas driver jeg Kinly ved siden af mit arbejde, og vi har et stort drive for at skabe hjemmesider, der kan give lokale virksomheder som jeres flere kunder. Vi står selv for både design, kode og kontakt.\n\nMvh";
  assert.equal(wrongPersonText("lucas", oldCharlie), true);
  const fixed = adaptToSender(oldCharlie, "lucas");
  assert.ok(fixed.includes(DISCLOSURE[0]));
  assert.equal(wrongPersonText("lucas", fixed), false);
  const oldNamed = "Hej\n\nJeg hedder Lucas og er medstifter af Kinly. Vi laver hjemmesider til lokale virksomheder, blandt andet VIDA Klinik, Ikast AutoService og Jernbanecaféen.\n\nMvh";
  assert.equal(wrongPersonText("charlie", oldNamed), true);
  assert.equal(adaptToSender(oldNamed, "charlie"), adaptToSender(oldNamed, "lucas"));
  assert.ok(adaptToSender(oldNamed, "charlie").includes(DISCLOSURE[0]));
});

test("wrongPersonText fanger Charlie-formuleringer i en Lucas-mail (Hermes-audit 26/9)", () => {
  for (const t of ["Jeg driver Kinly med Lucas", "Lucas og jeg bygger sider", "min makker Lucas har kigget", "sammen med Lucas"]) {
    assert.equal(wrongPersonText("lucas", t), true, t);
    assert.equal(wrongPersonText("charlie", t), false, t);
  }
  assert.equal(wrongPersonText("lucas", "Hej, jeg hedder Lucas og driver Kinly"), false);
});

test("afsender-værn fanger AI-tekst skrevet til den anden person (Opus 26/9)", () => {
  for (const t of ["Hej, det er Charlie fra Kinly.", "Charlie Nielsen her.", "Ring på 42 25 32 62", "Mvh Charlie"]) {
    assert.equal(wrongPersonText("lucas", t), true, t);
  }
  for (const t of ["Hej, det er Lucas fra Kinly.", "Mvh Lucas", "Venlig hilsen,\nLucas", "Tak for i dag\n\nLucas\n", "Lucas her."]) {
    assert.equal(wrongPersonText("charlie", t), true, t);
  }
  assert.equal(wrongPersonText("charlie", "Jeg driver Kinly sammen med Lucas."), false);
  for (const line of DISCLOSURES.lucas) assert.equal(wrongPersonText("lucas", line), false, line);
  for (const line of DISCLOSURES.charlie) assert.equal(wrongPersonText("charlie", line), false, line);
});
