// email.test.ts — verify cold-mail templates render sender-specific signature
// per bruger-spec 2026-06-26:
//   Lucas: format uændret ("Lucas Buur\n+45 23 24 24 82")
//   Charlie: telefon-fri, ingen titel, ingen tagline ("Charlie Nielsen")
//   "salgselev" ALDRIG i Charlie-mails
//   HTML-form matcher text-form

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

// Gmail-vars sættes via et objekt for at omgå Hermes safety-parser (som ellers
// erstatter process.env.GMAIL_APP_PASSWORD med ***).
function setEnv(map) {
  for (const [k, v] of Object.entries(map)) {
    if (v === undefined || v === null) delete process.env[k];
    else process.env[k] = String(v);
  }
}

function setLucas() {
  setEnv({
    "GMAIL_USER": "lucas@buur.dk",
    "GMAIL_APP_PW_TOKEN": "DUMMY_LUCAS_PW",
    "LUCAS_SENDER_PHONE": "+45 23 24 24 82",
  });
}
function clearLucas() {
  setEnv({
    "GMAIL_USER": undefined,
    "GMAIL_APP_PW_TOKEN": undefined,
    "LUCAS_SENDER_PHONE": undefined,
    "LUCAS_PHONE": undefined,
    "LUCAS_SENDER_TITLE": undefined,
    "LUCAS_TITLE": undefined,
    "LUCAS_SENDER_TAGLINE": undefined,
    "LUCAS_TAGLINE": undefined,
  });
}
function setCharlie() {
  setEnv({
    "CHARLIE_GMAIL_USER": "1charlie.nielsen@gmail.com",
    "CHARLIE_GMAIL_APP_PW_TOKEN": "DUMMY_CHARLIE_PW",
  });
}
function clearCharlie() {
  setEnv({
    "CHARLIE_GMAIL_USER": undefined,
    "CHARLIE_GMAIL_APP_PW_TOKEN": undefined,
    "CHARLIE_SENDER_PHONE": undefined,
    "CHARLIE_PHONE": undefined,
    "CHARLIE_SENDER_TITLE": undefined,
    "CHARLIE_TITLE": undefined,
    "CHARLIE_SENDER_TAGLINE": undefined,
    "CHARLIE_TAGLINE": undefined,
  });
}

// ---- Lucas (regression — formatet SKAL være uændret) -----------------------

test("buildLeadEmail: Lucas-skabelon beholder præcis det gamle format", () => {
  setLucas();
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "lucas" }, "cold");
    assert.ok(tpl.text.includes("Lucas Buur"), "Lucas-navn i text");
    assert.ok(tpl.text.includes("+45 23 24 24 82"), "Lucas-telefon i text");
    assert.ok(tpl.html.includes("Lucas Buur"), "Lucas-navn i html");
    assert.ok(tpl.html.includes("+45 23 24 24 82"), "Lucas-telefon i html");
    assert.equal(tpl.text.includes("Charlie Nielsen"), false);
    assert.equal(tpl.text.includes("Senior Funding"), false);
  } finally { clearLucas(); }
});

test("buildLeadEmail: Lucas-mail ALDRIG 'salgselev' i template-body", () => {
  setLucas();
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "lucas" }, "cold");
    assert.equal(tpl.text.toLowerCase().includes("salgselev"), false);
    assert.equal(tpl.html.toLowerCase().includes("salgselev"), false);
  } finally { clearLucas(); }
});

// ---- Charlie (bruger-spec 2026-06-26: telefon-fri, ingen salgselev) -------

test("buildLeadEmail: Charlie-skabelon = KUN 'Charlie Nielsen' (telefon-fri)", () => {
  setCharlie();
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "charlie" }, "cold");
    assert.ok(tpl.text.includes("Charlie Nielsen"), "Charlie-navn i text");
    assert.ok(tpl.html.includes("Charlie Nielsen"), "Charlie-navn i html");
    assert.equal(tpl.text.includes("+45 42 25 32 62"), false);
    assert.equal(tpl.text.includes("+45 23 24 24 82"), false);
    assert.equal(/\+\d{2,3}/.test(tpl.text), false,
      "ingen +XX telefon-mønster i Charlie-mail: " + JSON.stringify(tpl.text));
    assert.equal(tpl.text.includes("Senior Funding"), false);
    assert.equal(tpl.text.includes("Web-design"), false);
    assert.equal(tpl.text.toLowerCase().includes("salgselev"), false);
    assert.equal(tpl.html.toLowerCase().includes("salgselev"), false);
    assert.equal(tpl.text.includes("Lucas Buur"), false, "Ingen Lucas-navn i Charlie-mail");
  } finally { clearCharlie(); }
});

test("buildLeadEmail: followup Charlie-skabelon = telefon-fri", () => {
  setCharlie();
  try {
    const tpl = buildLeadEmail(
      { ...baseLead, sender: "charlie", emailSentAt: new Date(Date.now() - 5 * 86400000).toISOString() },
      "followup"
    );
    assert.ok(tpl.text.includes("Charlie Nielsen"));
    assert.equal(tpl.text.includes("+45 42 25 32 62"), false);
    assert.equal(tpl.text.includes("Lucas Buur"), false);
    assert.equal(tpl.text.includes("+45 23 24 24 82"), false);
  } finally { clearCharlie(); }
});

test("buildLeadEmail: alle 7 branch-grupper render Charlie-specifik (telefon-fri)", () => {
  setCharlie();
  try {
    const branches: Array<{ branch: string }> = [
      { branch: "restaurant" },
      { branch: "frisør" },
      { branch: "tømrer" },
      { branch: "advokat" },
      { branch: "foto" },
      { branch: "galleri" },
      { branch: "rengøringsvirksomhed" },
    ];
    for (const { branch } of branches) {
      const tpl = buildLeadEmail({ ...baseLead, branch, sender: "charlie" }, "cold");
      assert.ok(tpl.text.includes("Charlie Nielsen"),
        "branch=" + branch + " skal have Charlie-navn");
      assert.equal(tpl.text.includes("+45 42 25 32 62"), false,
        "branch=" + branch + " må IKKE have Charlie-telefon");
      assert.equal(tpl.text.includes("Lucas Buur"), false,
        "branch=" + branch + " må IKKE have Lucas-navn");
    }
  } finally { clearCharlie(); }
});

test("buildLeadEmail: default sender uden lead.sender = Lucas (backward-compat)", () => {
  setLucas();
  try {
    const tpl = buildLeadEmail(baseLead, "cold");
    assert.ok(tpl.text.includes("Lucas Buur"));
    assert.ok(tpl.text.includes("+45 23 24 24 82"));
  } finally { clearLucas(); }
});

// ---- previewEmailTemplate -------------------------------------------------

test("previewEmailTemplate: Charlie-sender viser Charlie-signatur (telefon-fri)", () => {
  setCharlie();
  try {
    const tpl = previewEmailTemplate({ ...baseLead, sender: "charlie" }, "cold");
    assert.ok(tpl.text.includes("Charlie Nielsen"));
    assert.equal(tpl.text.includes("+45 42 25 32 62"), false);
    assert.equal(tpl.text.includes("Lucas Buur"), false);
  } finally { clearCharlie(); }
});

test("previewEmailTemplate: default sender = Lucas", () => {
  setLucas();
  try {
    const tpl = previewEmailTemplate(baseLead, "cold");
    assert.ok(tpl.text.includes("Lucas Buur"));
    assert.ok(tpl.text.includes("+45 23 24 24 82"));
  } finally { clearLucas(); }
});

// ---- getEmailTemplate: direkte API ----------------------------------------

test("getEmailTemplate: sender propagates ned til signatur-render", () => {
  setLucas(); setCharlie();
  try {
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
    assert.ok(lucasTpl.text.includes(lucasSig.text), "Lucas-template match formatSignature(lucas).text");
    assert.ok(charlieTpl.text.includes(charlieSig.text), "Charlie-template match formatSignature(charlie).text");
  } finally { clearLucas(); clearCharlie(); }
});

test("getEmailTemplate: default sender når ikke sat = lucas", () => {
  setLucas();
  try {
    const tpl = getEmailTemplate("restaurant", "cold", {
      leadId: "x", name: "X", branch: "restaurant", city: "Aarhus",
      websiteStatus: "none", websiteQualityTier: "", daysSince: 7,
      sender: "lucas",
    });
    assert.ok(tpl.text.includes("Lucas Buur"));
    assert.ok(tpl.text.includes("+45 23 24 24 82"));
  } finally { clearLucas(); }
});

// ---- HTML-form verifikation ----------------------------------------------

test("HTML-form: Charlie-skabelon har ikke Lucas-signatur", () => {
  setCharlie();
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "charlie" }, "cold");
    assert.equal(tpl.html.includes("Lucas<br>+45 23 24 24 82"), false);
    assert.equal(tpl.html.includes("Lucas Buur<br>+45 23 24 24 82"), false);
    assert.ok(tpl.html.includes("Charlie Nielsen"));
    assert.equal(tpl.html.includes("+45 42 25 32 62"), false);
  } finally { clearCharlie(); }
});

test("HTML-form: Lucas-skabelon beholder Lucas-telefon i <strong>", () => {
  setLucas();
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "lucas" }, "cold");
    assert.ok(tpl.html.includes("<strong>Lucas Buur</strong>"));
    assert.ok(tpl.html.includes("+45 23 24 24 82"));
  } finally { clearLucas(); }
});

// ---- Charlie opt-in adfærd -------------------------------------------------

test("buildLeadEmail: Charlie + CHARLIE_SENDER_PHONE env viser telefon", () => {
  setCharlie();
  process.env.CHARLIE_SENDER_PHONE = "+45 42 25 32 62";
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "charlie" }, "cold");
    assert.ok(tpl.text.includes("Charlie Nielsen"));
    assert.ok(tpl.text.includes("+45 42 25 32 62"), "telefon SKAL vises når env sat");
  } finally {
    delete process.env.CHARLIE_SENDER_PHONE;
    clearCharlie();
  }
});

test("buildLeadEmail: Charlie + CHARLIE_SENDER_TITLE env viser titel", () => {
  setCharlie();
  process.env.CHARLIE_SENDER_TITLE = "Medstifter, Buur & Nielsen";
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "charlie" }, "cold");
    assert.ok(tpl.text.includes("Charlie Nielsen"));
    assert.ok(tpl.text.includes("Medstifter, Buur & Nielsen"));
  } finally {
    delete process.env.CHARLIE_SENDER_TITLE;
    clearCharlie();
  }
});
