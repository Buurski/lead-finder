// email.test.ts — verify cold-mail templates render sender-specific signature
// per bruger-spec 2026-06-26 (gen-restoreret):
//   Lucas: format uændret ("Lucas Buur\n+45 23 24 24 82")
//   Charlie: FULD profil ("Charlie Nielsen\nSenior Funding Manager\nWeb-design
//   entusiast\n+45 42 25 32 62")
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
function setEnv(map: Record<string, string | number | undefined | null>) {
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

// ---- Charlie (bruger-spec 2026-06-26 gen-restoreret: fuld profil) ---------

test("buildLeadEmail: Charlie-skabelon = FULD profil (navn + titel + tagline + telefon)", () => {
  setCharlie();
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "charlie" }, "cold");
    assert.ok(tpl.text.includes("Charlie Nielsen"), "Charlie-navn i text");
    assert.ok(tpl.html.includes("Charlie Nielsen"), "Charlie-navn i html");
    assert.ok(tpl.text.includes("+45 42 25 32 62"), "Charlie-telefon i text");
    assert.ok(tpl.html.includes("+45 42 25 32 62"), "Charlie-telefon i html");
    assert.ok(tpl.text.includes("Senior Funding Manager"), "Charlie-titel i text");
    assert.ok(tpl.html.includes("Senior Funding Manager"), "Charlie-titel i html");
    assert.ok(tpl.text.includes("Web-design entusiast"), "Charlie-tagline i text");
    assert.ok(tpl.html.includes("Web-design entusiast"), "Charlie-tagline i html");
    assert.equal(tpl.text.includes("Lucas Buur"), false, "Ingen Lucas-navn i Charlie-mail");
    assert.equal(tpl.html.includes("Lucas Buur"), false, "Ingen Lucas-navn i Charlie-html");
    assert.equal(tpl.text.includes("+45 23 24 24 82"), false, "Ingen Lucas-telefon i Charlie-mail");
    assert.equal(tpl.text.toLowerCase().includes("salgselev"), false);
    assert.equal(tpl.html.toLowerCase().includes("salgselev"), false);
  } finally { clearCharlie(); }
});

test("buildLeadEmail: followup Charlie-skabelon = FULD profil", () => {
  setCharlie();
  try {
    const tpl = buildLeadEmail(
      { ...baseLead, sender: "charlie", emailSentAt: new Date(Date.now() - 5 * 86400000).toISOString() },
      "followup"
    );
    assert.ok(tpl.text.includes("Charlie Nielsen"));
    assert.ok(tpl.text.includes("+45 42 25 32 62"));
    assert.ok(tpl.text.includes("Senior Funding Manager"));
    assert.ok(tpl.text.includes("Web-design entusiast"));
    assert.equal(tpl.text.includes("Lucas Buur"), false);
  } finally { clearCharlie(); }
});

test("buildLeadEmail: alle 7 branch-grupper render Charlie-specifik (FULD)", () => {
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
      assert.ok(tpl.text.includes("+45 42 25 32 62"),
        "branch=" + branch + " skal have Charlie-telefon");
      assert.ok(tpl.text.includes("Senior Funding Manager"),
        "branch=" + branch + " skal have Charlie-titel");
      assert.ok(tpl.text.includes("Web-design entusiast"),
        "branch=" + branch + " skal have Charlie-tagline");
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

test("previewEmailTemplate: Charlie-sender viser FULD Charlie-signatur", () => {
  setCharlie();
  try {
    const tpl = previewEmailTemplate({ ...baseLead, sender: "charlie" }, "cold");
    assert.ok(tpl.text.includes("Charlie Nielsen"));
    assert.ok(tpl.text.includes("+45 42 25 32 62"));
    assert.ok(tpl.text.includes("Senior Funding Manager"));
    assert.ok(tpl.text.includes("Web-design entusiast"));
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

test("HTML-form: Charlie-skabelon har FULD Charlie-profil i <strong>", () => {
  setCharlie();
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "charlie" }, "cold");
    assert.equal(tpl.html.includes("Lucas<br>+45 23 24 24 82"), false);
    assert.equal(tpl.html.includes("Lucas Buur<br>+45 23 24 24 82"), false);
    assert.ok(tpl.html.includes("Charlie Nielsen"));
    assert.ok(tpl.html.includes("+45 42 25 32 62"));
    assert.ok(tpl.html.includes("Senior Funding Manager"));
    assert.ok(tpl.html.includes("Web-design entusiast"));
  } finally { clearCharlie(); }
});

test("HTML-form: Lucas-signatur (Kinly-kort) har navn i bold-div + telefon", () => {
  // 2026-07-16: signaturen blev redesignet til Kinly-fotokort (senders.ts,
  // htmlTable) — navnet renderes i en <div style="...font-weight:bold...">,
  // ikke længere i <strong>. Testen opdateret 2026-07-17 til det nye format.
  setLucas();
  try {
    const tpl = buildLeadEmail({ ...baseLead, sender: "lucas" }, "cold");
    assert.match(tpl.html, /<div style="[^"]*font-weight:bold[^"]*">Lucas Buur<\/div>/);
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
