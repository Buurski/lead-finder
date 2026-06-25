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

test("formatSignature: Charlie defaults = kun navn (ingen telefon, ingen titel)", () => {
  // Per Charlie's spec: "fjern telefonnummeret fra mailsignaturen".
  // Signaturen er bevidst telefon-fri indtil han sætter CHARLIE_SENDER_PHONE.
  const sig = formatSignature("charlie");
  assert.equal(sig.text, "Charlie Nielsen");
  assert.equal(sig.html, "<strong>Charlie Nielsen</strong>");
  assert.equal(sig.closing, "Mvh, Charlie Nielsen");
  // Eksplicitte checks: ingen default-telefon, ingen default-titel.
  assert.equal(sig.text.includes("+45"), false, "ingen default telefon i Charlie-signatur");
  assert.equal(sig.text.includes("salgselev"), false, "aldrig 'salgselev' på Charlie");
  assert.equal(sig.text.includes("Medstifter"), false, "ingen default titel i Charlie-signatur");
});

test("formatSignature: Charlie + CHARLIE_SENDER_PHONE env tilføjer telefon", () => {
  const prev = process.env.CHARLIE_SENDER_PHONE;
  process.env.CHARLIE_SENDER_PHONE = "+45 42 25 32 62";
  try {
    const sig = formatSignature("charlie");
    assert.equal(sig.text, "Charlie Nielsen\n+45 42 25 32 62");
    assert.equal(sig.html, "<strong>Charlie Nielsen</strong><br>+45 42 25 32 62");
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_SENDER_PHONE;
    else process.env.CHARLIE_SENDER_PHONE = prev;
  }
});

test("formatSignature: Charlie + CHARLIE_SENDER_TITLE env tilføjer titel", () => {
  const prev = process.env.CHARLIE_SENDER_TITLE;
  process.env.CHARLIE_SENDER_TITLE = "Medstifter, Buur & Nielsen";
  try {
    const sig = formatSignature("charlie");
    assert.equal(sig.text, "Charlie Nielsen\nMedstifter, Buur & Nielsen");
    assert.equal(sig.html, "<strong>Charlie Nielsen</strong><br>Medstifter, Buur & Nielsen");
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_SENDER_TITLE;
    else process.env.CHARLIE_SENDER_TITLE = prev;
  }
});

test("formatSignature: Charlie + både telefon og titel", () => {
  const prevPhone = process.env.CHARLIE_SENDER_PHONE;
  const prevTitle = process.env.CHARLIE_SENDER_TITLE;
  process.env.CHARLIE_SENDER_PHONE = "+45 42 25 32 62";
  process.env.CHARLIE_SENDER_TITLE = "Medstifter, Buur & Nielsen";
  try {
    const sig = formatSignature("charlie");
    assert.equal(sig.text, "Charlie Nielsen\nMedstifter, Buur & Nielsen\n+45 42 25 32 62");
    assert.equal(
      sig.html,
      "<strong>Charlie Nielsen</strong><br>Medstifter, Buur & Nielsen<br>+45 42 25 32 62"
    );
    assert.equal(sig.closing, "Mvh, Charlie Nielsen");
  } finally {
    if (prevPhone === undefined) delete process.env.CHARLIE_SENDER_PHONE;
    else process.env.CHARLIE_SENDER_PHONE = prevPhone;
    if (prevTitle === undefined) delete process.env.CHARLIE_SENDER_TITLE;
    else process.env.CHARLIE_SENDER_TITLE = prevTitle;
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
    assert.equal(sig.text, "Charlie Nielsen\n+45 42 25 32 62");
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
  } finally {
    if (prev === undefined) delete process.env.CHARLIE_SENDER_PHONE;
    else process.env.CHARLIE_SENDER_PHONE = prev;
    if (prevLegacy === undefined) delete process.env.CHARLIE_PHONE;
    else process.env.CHARLIE_PHONE = prevLegacy;
  }
});

test("formatSignature: credsOverride tvinger bestemte værdier (test/dry-run)", () => {
  const sig = formatSignature("charlie", {
    id: "charlie",
    email: "1charlie.nielsen@gmail.com",
    appPassword: "ignored",
    displayName: "Charlie Test",
    phone: "+45 00 00 00 00",
    title: "QA-test",
  });
  assert.equal(sig.text, "Charlie Test\nQA-test\n+45 00 00 00 00");
  assert.equal(sig.closing, "Mvh, Charlie Test");
});

// ---- formatFrom -----------------------------------------------------------

test("formatFrom: uden creds falder tilbage til senderId; med creds viser displaynavn", () => {
  const prevLucas = process.env.GMAIL_USER;
  const prevLucasPw = process.env.GMAIL_APP_PASSWORD;
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  try {
    assert.equal(formatFrom("lucas"), "lucas");
    assert.equal(formatFrom("charlie"), "charlie");
  } finally {
    if (prevLucas !== undefined) process.env.GMAIL_USER = prevLucas;
    if (prevLucasPw !== undefined) process.env.GMAIL_APP_PASSWORD = prevLucasPw;
  }
  process.env.GMAIL_USER = "buur.aigro@gmail.com";
  process.env.GMAIL_APP_PASSWORD = "dummy";
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

test("getSenderCreds: telefonnummer og titel er en del af creds for begge sendere", () => {
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
    assert.equal(lucas!.phone, "+45 23 24 24 82");
    assert.equal(lucas!.title, "");
    assert.equal(charlie!.phone, ""); // bevidst tom default
    assert.equal(charlie!.title, ""); // bevidst tom default
    assert.equal(lucas!.displayName, "Lucas Buur");
    assert.equal(charlie!.displayName, "Charlie Nielsen");
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

// ---- Charlie-specifik: ikke "salgselev", telefon-fri som default ---------

test("Charlies signatur matcher Charlie-profilen (ikke 'salgselev', ingen default-telefon)", () => {
  const sig = formatSignature("charlie");
  assert.equal(sig.text.includes("salgselev"), false);
  assert.equal(sig.text.includes("Lucas"), false, "aldrig Lucas-navn på Charlie");
  // Default er bevidst telefon-fri.
  assert.equal(sig.text.includes("+45"), false, "default-signatur er telefon-fri");
  // Men Charlie-opt-in via env virker (testes andetsteds).
});

test("Charlies signatur-senderClosing matcher hans navn", () => {
  const sig = formatSignature("charlie");
  assert.equal(sig.closing, "Mvh, Charlie Nielsen");
});
