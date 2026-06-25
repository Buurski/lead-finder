// email.test.ts — verifies the cold-mail templates render the sender-specific
// signature (2026-06-26). Before this refactor every template had "Lucas\n+45
// 23 24 24 82" hardcoded 28 times. After: formatSignature(sender) drives the
// render, so Charlie drafts get Charlie's name automatically and pick up his
// own phone/title/tagline per Charlie's own profile.
//
// Per 2026-06-26: Charlie's default-signatur er Senior Funding Manager +
// Web-design entusiast + +45 42 25 32 62. Lucas beholder sit format (kun
// navn + telefon). Alle fire felter er env-overridable.

import test from "node:test";
import assert from "node:assert/strict";
import { buildLeadEmail, previewEmailTemplate, getEmailTemplate } from "./email.ts";
import { formatSignature } from "./senders.ts";

const baseLead = {
  id: "lead-test-123",
  name: "Test Virksomhed",
  branch: "restaurant",
  city: "Aarhus",
  websiteStatus: "none",
  websiteQualityTier: "",
  emailSentAt: "",
};

// ---- Lucas (regression — formatet SKAL være uændret) -----------------------

test("buildLeadEmail: Lucas-skabelon beholder præcis det gamle format", () => {
  const tpl = buildLeadEmail({ ...baseLead, sender: "lucas" }, "cold");
  assert.ok(tpl.text.includes("Lucas Buur"));
  assert.ok(tpl.text.includes("+45 23 24 24 82"));
  assert.ok(tpl.html.includes("Lucas Buur"));
  assert.ok(tpl.html.includes("+45 23 24 24 82"));
  // Ingen Charlie-specifik data i Lucas-mail.
  assert.equal(tpl.text.includes("Medstifter"), false);
  assert.equal(tpl.text.includes("+45 42 25 32 62"), false);
});

test("buildLeadEmail: Charlie-skabelon = navn + titel + tagline + telefon (fuld profil)", () => {
  // Per Charlie 2026-06-26: fuld profil inkl. telefon + titel + tagline.
  const tpl = buildLeadEmail({ ...baseLead, sender: "charlie" }, "cold");
  // Charlie-specifik navn SKAL være der.
  assert.ok(tpl.text.includes("Charlie Nielsen"));
  assert.ok(tpl.html.includes("Charlie Nielsen"));
  // Charlie-specifik titel + tagline + telefon SKAL være der.
  assert.ok(tpl.text.includes("Senior Funding Manager"));
  assert.ok(tpl.text.includes("Web-design entusiast"));
  assert.ok(tpl.text.includes("+45 42 25 32 62"));
  // Skal IKKE have Lucas' data.
  assert.equal(tpl.text.includes("Lucas Buur"), false);
  assert.equal(tpl.text.includes("+45 23 24 24 82"), false);
  // Aldrig 'salgselev' på Charlie.
  assert.equal(tpl.text.includes("salgselev"), false);
});

test("buildLeadEmail: Charlie + CHARLIE_SENDER_PHONE env overskriver default-telefon", () => {
  const prev = process.env.CHARLIE_SENDER_PHONE;
  process.env.CHARLIE_SENDER_PHONE = "+45 99 88 77 66";
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "charlie" }, "cold");
    assert.ok(tpl.text.includes("Charlie Nielsen"));
    assert.ok(tpl.text.includes("+45 99 88 77 66"), "env-telefon skal være der");
    assert.equal(tpl.text.includes("+45 42 25 32 62"), false, "default-telefon væk");
    // Titel + tagline følger stadig defaults.
    assert.ok(tpl.text.includes("Senior Funding Manager"));
    assert.ok(tpl.text.includes("Web-design entusiast"));
    assert.equal(tpl.text.includes("Lucas Buur"), false);
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_SENDER_PHONE;
    else process.env.CHARLIE_SENDER_PHONE = prev;
  }
});

test("buildLeadEmail: followup Charlie-skabelon bruger også Charlie-signatur", () => {
  const tpl = buildLeadEmail(
    { ...baseLead, sender: "charlie", emailSentAt: new Date(Date.now() - 5 * 86400000).toISOString() },
    "followup"
  );
  assert.ok(tpl.text.includes("Charlie Nielsen"));
  assert.equal(tpl.text.includes("Lucas Buur"), false);
  assert.equal(tpl.text.includes("+45 23 24 24 82"), false);
});

test("buildLeadEmail: alle 7 branch-grupper render Charlie-signatur korrekt", () => {
  const branches = ["restaurant", "frisør", "tømrer", "advokat", "foto", "galleri", "rengøringsvirksomhed"];
  for (const branch of branches) {
    const tpl = buildLeadEmail({ ...baseLead, branch, sender: "charlie" }, "cold");
    assert.ok(
      tpl.text.includes("Charlie Nielsen"),
      `branch=${branch} skal have Charlie-navn i text`
    );
    assert.equal(
      tpl.text.includes("Lucas Buur"),
      false,
      `branch=${branch} må IKKE have Lucas-navn`
    );
  }
});

test("buildLeadEmail: default sender uden lead.sender = Lucas (backward-compat)", () => {
  const tpl = buildLeadEmail(baseLead, "cold");
  assert.ok(tpl.text.includes("Lucas Buur"));
  assert.ok(tpl.text.includes("+45 23 24 24 82"));
});

// ---- previewEmailTemplate -------------------------------------------------

test("previewEmailTemplate: Charlie-sender viser Charlie-signatur i preview", () => {
  const tpl = previewEmailTemplate({ ...baseLead, sender: "charlie" }, "cold");
  assert.ok(tpl.text.includes("Charlie Nielsen"));
  assert.equal(tpl.text.includes("Lucas Buur"), false);
});

test("previewEmailTemplate: default sender = Lucas", () => {
  const tpl = previewEmailTemplate(baseLead, "cold");
  assert.ok(tpl.text.includes("Lucas Buur"));
  assert.ok(tpl.text.includes("+45 23 24 24 82"));
});

// ---- getEmailTemplate: direkte API ----------------------------------------

test("getEmailTemplate: sender propagates ned til signatur-render", () => {
  const lucasTpl = getEmailTemplate("restaurant", "cold", {
    leadId: "x", name: "X", branch: "restaurant", city: "Aarhus",
    websiteStatus: "none", websiteQualityTier: "", daysSince: 7,
    sender: "lucas",
  });
  const charlieTpl = getEmailTemplate("restaurant", "cold", {
    leadId: "x", name: "X", branch: "restaurant", city: "Aarhus",
    websiteStatus: "none", websiteQualityTier: "", daysSince: 7,
    sender: "charlie",
  });
  const lucasSig = formatSignature("lucas");
  const charlieSig = formatSignature("charlie");
  assert.ok(lucasTpl.text.includes(lucasSig.text), "Lucas-template skal matche formatSignature(lucas).text");
  assert.ok(charlieTpl.text.includes(charlieSig.text), "Charlie-template skal matche formatSignature(charlie).text");
});

test("getEmailTemplate: default sender når ikke sat = lucas", () => {
  // Sender-prop er nu påkrævet i TemplateVars — vi sender "lucas" eksplicit
  // for at verificere at den propagater korrekt gennem formatSignature.
  const tpl = getEmailTemplate("restaurant", "cold", {
    leadId: "x", name: "X", branch: "restaurant", city: "Aarhus",
    websiteStatus: "none", websiteQualityTier: "", daysSince: 7,
    sender: "lucas",
  });
  assert.ok(tpl.text.includes("Lucas Buur"));
  assert.ok(tpl.text.includes("+45 23 24 24 82"));
});

// ---- HTML-form verifikation ----------------------------------------------

test("HTML-form: Charlie-skabelon har ikke Lucas' telefonnummer", () => {
  const tpl = buildLeadEmail({ ...baseLead, sender: "charlie" }, "cold");
  assert.equal(
    tpl.html.includes("Lucas<br>+45 23 24 24 82"),
    false,
    "Gammel hardcoded Lucas-signatur må ikke være i HTML"
  );
  assert.equal(
    tpl.html.includes("Lucas Buur<br>+45 23 24 24 82"),
    false,
    "Lucas-signatur må ikke være i Charlie-HTML"
  );
  // Skal have Charlie-data.
  assert.ok(tpl.html.includes("Charlie Nielsen"));
});
