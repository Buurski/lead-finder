// senders.test.ts — verifies the per-sender signature system added 2026-06-26.
// Before this change the cold-mail signature was hardcoded "Lucas\n+45 23 24 24 82"
// in 28+ places in email.ts. The fix: every template now renders the signature
// through formatSignature(senderId) so Charlie gets his own contact details
// automatically — env-driven, never hardcoded.
//
// Charlie's defaults (2026-06-26, opdateret fra telefon-fri til fuld profil):
//   - telefon: "+45 42 25 32 62"
//   - titel:   "Senior Funding Manager"
//   - tagline: "Web-design entusiast"
// All four fields (navn + titel + tagline + telefon) are env-overridable, so
// Charlie kan finjustere via CHARLIE_SENDER_TITLE / _TAGLINE / _PHONE uden at
// røre koden. Lucas beholder sit eksisterende layout ("navn + telefon") så
// diff'en for hans mails er usynlig for modtageren.

import test from "node:test";
import assert from "node:assert/strict";
import {
  formatSignature,
  formatFrom,
  availableSenders,
  defaultSender,
  getSenderCreds,
  isSenderAvailable,
} from "./senders.ts";

// ---- formatSignature: defaults ------------------------------------------

test("formatSignature: Lucas defaults = navn + telefon, ingen titel", () => {
  // Lucas's existing layout must be preserved exactly so the diff is invisible.
  const sig = formatSignature("lucas");
  assert.equal(sig.text, "Lucas Buur\n+45 23 24 24 82");
  assert.equal(sig.html, "<strong>Lucas Buur</strong><br>+45 23 24 24 82");
  assert.equal(sig.closing, "Mvh, Lucas Buur");
});

test("formatSignature: Charlie defaults = navn + titel + tagline + telefon", () => {
  // Per Charlie 2026-06-26: fuld profil — Senior Funding Manager (titel) +
  // Web-design entusiast (tagline) + telefon +45 42 25 32 62. Alle fire felter
  // er env-overridable, så Charlie kan finjustere uden code-change.
  const sig = formatSignature("charlie");
  assert.equal(
    sig.text,
    "Charlie Nielsen\nSenior Funding Manager\nWeb-design entusiast\n+45 42 25 32 62"
  );
  assert.equal(
    sig.html,
    "<strong>Charlie Nielsen</strong><br>Senior Funding Manager<br>Web-design entusiast<br>+45 42 25 32 62"
  );
  assert.equal(sig.closing, "Mvh, Charlie Nielsen");
  // Eksplicitte checks: alle fire felter er der, salgselev ALDRIG.
  assert.ok(sig.text.includes("+45 42 25 32 62"), "Charlie-telefon SKAL være der");
  assert.ok(sig.text.includes("Senior Funding Manager"), "Charlie-titel SKAL være der");
  assert.ok(sig.text.includes("Web-design entusiast"), "Charlie-tagline SKAL være der");
  assert.equal(sig.text.includes("salgselev"), false, "aldrig 'salgselev' på Charlie");
  assert.equal(sig.text.includes("Medstifter"), false, "gammel default-titel fjernet");
});

test("formatSignature: Charlie + CHARLIE_SENDER_PHONE env overskriver default-telefon", () => {
  // Charlie's default-telefon er +45 42 25 32 62. Env var med anden værdi
  // SKAL overskrive (ikke tilføje). Testen sætter env til en anden værdi
  // og tjekker at det er den der vises — alle andre felter holder defaults.
  const prev = process.env.CHARLIE_SENDER_PHONE;
  process.env.CHARLIE_SENDER_PHONE = "+45 99 88 77 66";
  try {
    const sig = formatSignature("charlie");
    assert.ok(sig.text.includes("+45 99 88 77 66"), "env-overskrivning skal virke");
    assert.equal(sig.text.includes("+45 42 25 32 62"), false, "default-telefon skal være væk");
    // Titel + tagline følger stadig med defaults.
    assert.ok(sig.text.includes("Senior Funding Manager"));
    assert.ok(sig.text.includes("Web-design entusiast"));
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_SENDER_PHONE;
    else process.env.CHARLIE_SENDER_PHONE = prev;
  }
});

test("formatSignature: Charlie + CHARLIE_SENDER_TITLE env overskriver default-titel", () => {
  const prev = process.env.CHARLIE_SENDER_TITLE;
  process.env.CHARLIE_SENDER_TITLE = "Funding Director";
  try {
    const sig = formatSignature("charlie");
    assert.ok(sig.text.includes("Funding Director"), "env-titel skal overskrive default");
    assert.equal(sig.text.includes("Senior Funding Manager"), false, "default-titel væk");
    // Telefon + tagline følger stadig med defaults.
    assert.ok(sig.text.includes("+45 42 25 32 62"));
    assert.ok(sig.text.includes("Web-design entusiast"));
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_SENDER_TITLE;
    else process.env.CHARLIE_SENDER_TITLE = prev;
  }
});

test("formatSignature: Charlie + CHARLIE_SENDER_TAGLINE env overskriver default-tagline", () => {
  const prev = process.env.CHARLIE_SENDER_TAGLINE;
  process.env.CHARLIE_SENDER_TAGLINE = "Frontend-arkitekt";
  try {
    const sig = formatSignature("charlie");
    assert.ok(sig.text.includes("Frontend-arkitekt"), "env-tagline skal overskrive default");
    assert.equal(sig.text.includes("Web-design entusiast"), false, "default-tagline væk");
    // Navn + titel + telefon følger stadig med defaults.
    assert.ok(sig.text.includes("Charlie Nielsen"));
    assert.ok(sig.text.includes("Senior Funding Manager"));
    assert.ok(sig.text.includes("+45 42 25 32 62"));
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_SENDER_TAGLINE;
    else process.env.CHARLIE_SENDER_TAGLINE = prev;
  }
});

test("formatSignature: Charlie + alle tre env-vars overskriver defaults", () => {
  const prevPhone = process.env.CHARLIE_SENDER_PHONE;
  const prevTitle = process.env.CHARLIE_SENDER_TITLE;
  const prevTagline = process.env.CHARLIE_SENDER_TAGLINE;
  process.env.CHARLIE_SENDER_PHONE = "+45 11 22 33 44";
  process.env.CHARLIE_SENDER_TITLE = "Investor Relations Lead";
  process.env.CHARLIE_SENDER_TAGLINE = "Building cool stuff";
  try {
    const sig = formatSignature("charlie");
    assert.equal(
      sig.text,
      "Charlie Nielsen\nInvestor Relations Lead\nBuilding cool stuff\n+45 11 22 33 44"
    );
    assert.equal(sig.closing, "Mvh, Charlie Nielsen");
  } finally {
    if (prevPhone === undefined) delete process.env.CHARLIE_SENDER_PHONE;
    else process.env.CHARLIE_SENDER_PHONE = prevPhone;
    if (prevTitle === undefined) delete process.env.CHARLIE_SENDER_TITLE;
    else process.env.CHARLIE_SENDER_TITLE = prevTitle;
    if (prevTagline === undefined) delete process.env.CHARLIE_SENDER_TAGLINE;
    else process.env.CHARLIE_SENDER_TAGLINE = prevTagline;
  }
});

test("formatSignature: Charlie + tom CHARLIE_SENDER_TAGLINE skjuler tagline-linje", () => {
  const prev = process.env.CHARLIE_SENDER_TAGLINE;
  process.env.CHARLIE_SENDER_TAGLINE = "";
  try {
    const sig = formatSignature("charlie");
    // Tom tagline → linjen forsvinder helt (filter bort tomme felter).
    assert.equal(sig.text, "Charlie Nielsen\nSenior Funding Manager\n+45 42 25 32 62");
    assert.equal(sig.html, "<strong>Charlie Nielsen</strong><br>Senior Funding Manager<br>+45 42 25 32 62");
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_SENDER_TAGLINE;
    else process.env.CHARLIE_SENDER_TAGLINE = prev;
  }
});

test("formatSignature: legacy alias CHARLIE_PHONE (uden _SENDER_) virker stadig", () => {
  // Vercel deploy satte muligvis CHARLIE_PHONE uden _SENDER_ prefix.
  // formatSignature skal acceptere begge former.
  const prev = process.env.CHARLIE_PHONE;
  const prevSender = process.env.CHARLIE_SENDER_PHONE;
  delete process.env.CHARLIE_SENDER_PHONE;
  process.env.CHARLIE_PHONE = "+45 42 25 32 62";
  try {
    const sig = formatSignature("charlie");
    // Legacy env = samme værdi som default → Charlie's fulde signatur stadig.
    assert.equal(
      sig.text,
      "Charlie Nielsen\nSenior Funding Manager\nWeb-design entusiast\n+45 42 25 32 62"
    );
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_PHONE;
    else process.env.CHARLIE_PHONE = prev;
    if (prevSender === undefined) delete process.env.CHARLIE_SENDER_PHONE;
    else process.env.CHARLIE_SENDER_PHONE = prevSender;
  }
});

test("formatSignature: CHARLIE_SENDER_PHONE vinder over CHARLIE_PHONE (legacy)", () => {
  const prev = process.env.CHARLIE_SENDER_PHONE;
  const prevLegacy = process.env.CHARLIE_PHONE;
  process.env.CHARLIE_SENDER_PHONE = "+45 99 99 99 99";
  process.env.CHARLIE_PHONE = "+45 11 11 11 11";
  try {
    const sig = formatSignature("charlie");
    // _SENDER_-varianten er den primære, så den vinder.
    assert.ok(sig.text.includes("+45 99 99 99 99"));
    assert.equal(sig.text.includes("+45 11 11 11 11"), false);
    // Titel + tagline følger stadig defaults.
    assert.ok(sig.text.includes("Senior Funding Manager"));
    assert.ok(sig.text.includes("Web-design entusiast"));
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_SENDER_PHONE;
    else process.env.CHARLIE_SENDER_PHONE = prev;
    if (prevLegacy === undefined) delete process.env.CHARLIE_PHONE;
    else process.env.CHARLIE_PHONE = prevLegacy;
  }
});

test("formatSignature: credsOverride tvinger bestemte værdier (test/dry-run)", () => {
  // tagline er et påkrævet felt på SenderCreds (2026-06-26) — senderen skal
  // enten have en tagline ELLER eksplicit tom streng, så den kan filtreres væk.
  const sig = formatSignature("charlie", {
    id: "charlie",
    email: "1charlie.nielsen@gmail.com",
    appPassword: "ignored",
    displayName: "Charlie Test",
    phone: "+45 00 00 00 00",
    title: "QA-test",
    tagline: "Test-tagline",
  });
  assert.equal(sig.text, "Charlie Test\nQA-test\nTest-tagline\n+45 00 00 00 00");
  assert.equal(sig.closing, "Mvh, Charlie Test");
});

test("formatSignature: credsOverride med tom tagline skjuler tagline-linje", () => {
  const sig = formatSignature("charlie", {
    id: "charlie",
    email: "1charlie.nielsen@gmail.com",
    appPassword: "ignored",
    displayName: "Charlie Test",
    phone: "+45 00 00 00 00",
    title: "QA-test",
    tagline: "", // tom → skal filtreres væk
  });
  assert.equal(sig.text, "Charlie Test\nQA-test\n+45 00 00 00 00");
});

// ---- formatFrom -----------------------------------------------------------

test("formatFrom: uden creds falder tilbage til senderId; med creds viser displaynavn", () => {
  // 2026-06-26: Charlie har egne creds (CHARLIE_GMAIL_USER + APP_PASSWORD),
  // så testen skal slette BEGGE sæt for at ramme "ingen creds"-stien.
  const prevLucas = process.env.GMAIL_USER;
  const prevLucasPw = process.env.GMAIL_APP_PASSWORD;
  const prevCharlie = process.env.CHARLIE_GMAIL_USER;
  const prevCharliePw = process.env.CHARLIE_GMAIL_APP_PASSWORD;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.CHARLIE_GMAIL_USER;
  delete process.env.CHARLIE_GMAIL_APP_PASSWORD;
  try {
    assert.equal(formatFrom("lucas"), "lucas");
    assert.equal(formatFrom("charlie"), "charlie");
  } finally {
    if (prevLucas !== undefined) process.env.GMAIL_USER = prevLucas;
    if (prevLucasPw !== undefined) process.env.GMAIL_APP_PASSWORD = prevLucasPw;
    if (prevCharlie !== undefined) process.env.CHARLIE_GMAIL_USER = prevCharlie;
    if (prevCharliePw !== undefined) process.env.CHARLIE_GMAIL_APP_PASSWORD = prevCharliePw;
  }
  process.env.GMAIL_USER = "buur.aigro@gmail.com";
  process.env.GMAIL_APP_PASSWORD = "x";
  try {
    const f = formatFrom("lucas");
    assert.ok(f.includes("Lucas Buur"));
    assert.ok(f.includes("buur.aigro@gmail.com"));
  } finally {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
  }
});

// ---- availableSenders / isSenderAvailable --------------------------------

test("availableSenders / isSenderAvailable: ingen creds = tom liste, begge unavailable", () => {
  const prevLucas = process.env.GMAIL_USER;
  const prevLucasPw = process.env.GMAIL_APP_PASSWORD;
  const prevCharlie = process.env.CHARLIE_GMAIL_USER;
  const prevCharliePw = process.env.CHARLIE_GMAIL_APP_PASSWORD;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.CHARLIE_GMAIL_USER;
  delete process.env.CHARLIE_GMAIL_APP_PASSWORD;
  try {
    assert.deepEqual(availableSenders(), []);
    assert.equal(isSenderAvailable("lucas"), false);
    assert.equal(isSenderAvailable("charlie"), false);
  } finally {
    if (prevLucas !== undefined) process.env.GMAIL_USER = prevLucas;
    if (prevLucasPw !== undefined) process.env.GMAIL_APP_PASSWORD = prevLucasPw;
    if (prevCharlie !== undefined) process.env.CHARLIE_GMAIL_USER = prevCharlie;
    if (prevCharliePw !== undefined) process.env.CHARLIE_GMAIL_APP_PASSWORD = prevCharliePw;
  }
});

test("defaultSender: foretrækker Lucas når begge er tilgængelige", () => {
  const prevLucas = process.env.GMAIL_USER;
  const prevLucasPw = process.env.GMAIL_APP_PASSWORD;
  const prevCharlie = process.env.CHARLIE_GMAIL_USER;
  const prevCharliePw = process.env.CHARLIE_GMAIL_APP_PASSWORD;
  process.env.GMAIL_USER = "lucas@buur.dk";
  process.env.GMAIL_APP_PASSWORD = "dummy";
  process.env.CHARLIE_GMAIL_USER = "charlie@buur.dk";
  process.env.CHARLIE_GMAIL_APP_PASSWORD = "dummy";
  try {
    assert.equal(defaultSender(), "lucas");
  } finally {
    if (prevLucas === undefined) delete process.env.GMAIL_USER;
    else process.env.GMAIL_USER = prevLucas;
    if (prevLucasPw === undefined) delete process.env.GMAIL_APP_PASSWORD;
    else process.env.GMAIL_APP_PASSWORD = prevLucasPw;
    if (prevCharlie === undefined) delete process.env.CHARLIE_GMAIL_USER;
    else process.env.CHARLIE_GMAIL_USER = prevCharlie;
    if (prevCharliePw === undefined) delete process.env.CHARLIE_GMAIL_APP_PASSWORD;
    else process.env.CHARLIE_GMAIL_APP_PASSWORD = prevCharliePw;
  }
});

test("defaultSender: falder tilbage til charlie hvis kun charlie er sat", () => {
  const prevLucas = process.env.GMAIL_USER;
  const prevLucasPw = process.env.GMAIL_APP_PASSWORD;
  const prevCharlie = process.env.CHARLIE_GMAIL_USER;
  const prevCharliePw = process.env.CHARLIE_GMAIL_APP_PASSWORD;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  process.env.CHARLIE_GMAIL_USER = "charlie@buur.dk";
  process.env.CHARLIE_GMAIL_APP_PASSWORD = "dummy";
  try {
    assert.equal(defaultSender(), "charlie");
  } finally {
    if (prevLucas === undefined) delete process.env.GMAIL_USER;
    else process.env.GMAIL_USER = prevLucas;
    if (prevLucasPw === undefined) delete process.env.GMAIL_APP_PASSWORD;
    else process.env.GMAIL_APP_PASSWORD = prevLucasPw;
    if (prevCharlie === undefined) delete process.env.CHARLIE_GMAIL_USER;
    else process.env.CHARLIE_GMAIL_USER = prevCharlie;
    if (prevCharliePw === undefined) delete process.env.CHARLIE_GMAIL_APP_PASSWORD;
    else process.env.CHARLIE_GMAIL_APP_PASSWORD = prevCharliePw;
  }
});

// ---- getSenderCreds: telefon + titel er en del af creds -------------------

test("getSenderCreds: telefon, titel og tagline er en del af creds for begge sendere", () => {
  // Per 2026-06-26: Charlie har fuld profil (telefon + titel + tagline),
  // Lucas beholder sit format (kun telefon, ingen titel, ingen tagline).
  const prevLucas = process.env.GMAIL_USER;
  const prevLucasPw = process.env.GMAIL_APP_PASSWORD;
  const prevCharlie = process.env.CHARLIE_GMAIL_USER;
  const prevCharliePw = process.env.CHARLIE_GMAIL_APP_PASSWORD;
  process.env.GMAIL_USER = "lucas@buur.dk";
  process.env.GMAIL_APP_PASSWORD = "dummy";
  process.env.CHARLIE_GMAIL_USER = "charlie@buur.dk";
  process.env.CHARLIE_GMAIL_APP_PASSWORD = "dummy";
  try {
    const lucas = getSenderCreds("lucas");
    const charlie = getSenderCreds("charlie");
    assert.ok(lucas, "lucas creds skal være sat");
    assert.ok(charlie, "charlie creds skal være sat");
    // Lucas: navn + telefon, ingen titel, ingen tagline (eksisterende format).
    assert.equal(lucas!.phone, "+45 23 24 24 82");
    assert.equal(lucas!.title, "");
    assert.equal(lucas!.tagline, "");
    assert.equal(lucas!.displayName, "Lucas Buur");
    // Charlie: navn + titel + tagline + telefon (fuld profil pr. 2026-06-26).
    assert.equal(charlie!.phone, "+45 42 25 32 62");
    assert.equal(charlie!.title, "Senior Funding Manager");
    assert.equal(charlie!.tagline, "Web-design entusiast");
    assert.equal(charlie!.displayName, "Charlie Nielsen");
    // "salgselev" må ALDRIG optræde på Charlie (defense-in-depth).
    assert.equal(charlie!.title.includes("salgselev"), false);
    assert.equal(charlie!.tagline.includes("salgselev"), false);
  } finally {
    delete process.env.GMAIL_USER;
    delete process.env.GMAIL_APP_PASSWORD;
    delete process.env.CHARLIE_GMAIL_USER;
    delete process.env.CHARLIE_GMAIL_APP_PASSWORD;
  }
});

// ---- Regressionssikring: Lucas-format er uændret --------------------------

test("REGRESSION: Lucas' signatur-format er uændret efter refactoring", () => {
  // Hvis denne test fejler, har vi brudt Lucas' eksisterende format — en
  // mail-modtager vil bemærke forskellen. Vigtigt at holde denne stabil.
  const sig = formatSignature("lucas");
  // Præcis det format der var hardcoded før — to linjer, ingen titel.
  assert.equal(sig.text, "Lucas Buur\n+45 23 24 24 82");
  // HTML-form: vi tilføjer <strong> omkring navnet som lille forbedring —
  // bekræft bevidst at dette er den nye normal.
  assert.equal(sig.html, "<strong>Lucas Buur</strong><br>+45 23 24 24 82");
});

// ---- Charlie-specifik: fuld profil, aldrig "salgselev" --------------------

test("Charlies signatur matcher Charlie-profilen (navn + Senior Funding Manager + Web-design entusiast + tlf)", () => {
  const sig = formatSignature("charlie");
  // Aldrig Lucas' differentiator.
  assert.equal(sig.text.includes("salgselev"), false);
  assert.equal(sig.text.includes("Lucas"), false, "aldrig Lucas-navn på Charlie");
  // Altid Charlie's egen profil.
  assert.ok(sig.text.includes("Charlie Nielsen"));
  assert.ok(sig.text.includes("Senior Funding Manager"));
  assert.ok(sig.text.includes("Web-design entusiast"));
  assert.ok(sig.text.includes("+45 42 25 32 62"));
});

test("Charlies signatur-senderClosing matcher hans navn", () => {
  const sig = formatSignature("charlie");
  assert.equal(sig.closing, "Mvh, Charlie Nielsen");
});

test("formatSignature: defense-in-depth — 'salgselev' scrubs ud af Charlies signatur", () => {
  // Selv hvis en tastefejl i Vercel-dashboardet sætter CHARLIE_SENDER_TITLE
  // til "salgselev" eller "Salgselev og finans", skal Charlie's mail ALDRIG
  // indeholde ordet "salgselev" (Lucas' differentiator). formatSignature
  // stripper det automatisk på Charlie-stien.
  const prevTitle = process.env.CHARLIE_SENDER_TITLE;
  const prevTagline = process.env.CHARLIE_SENDER_TAGLINE;
  process.env.CHARLIE_SENDER_TITLE = "Salgselev og finans";
  process.env.CHARLIE_SENDER_TAGLINE = "Både salgselev og web-design";
  try {
    const sig = formatSignature("charlie");
    assert.equal(sig.text.includes("salgselev"), false, "salgselev SKAL scrubs ud af Charlie");
    assert.equal(sig.text.includes("Salgselev"), false, "case-insensitive scrub");
    // Resterne af titlen er der stadig (kun ordet fjernes).
    assert.ok(sig.text.includes("og finans"));
    assert.ok(sig.text.includes("Både"));
    assert.ok(sig.text.includes("web-design"));
  } finally {
    if (prevTitle === undefined) delete process.env.CHARLIE_SENDER_TITLE;
    else process.env.CHARLIE_SENDER_TITLE = prevTitle;
    if (prevTagline === undefined) delete process.env.CHARLIE_SENDER_TAGLINE;
    else process.env.CHARLIE_SENDER_TAGLINE = prevTagline;
  }
});
