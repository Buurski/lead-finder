// senders.test.ts — sender hub unit tests, frosset kontrakt per 2026-06-26.
//
// Lucas-specifik kontrakt (regression-safe): format uændret
//   text = "Lucas Buur\n+45 23 24 24 82" / closing = "Mvh, Lucas Buur"
//
// Charlie-specifik kontrakt (bruger-spec 2026-06-26, gen-restoreret til FULD):
//   defaults: phone="+45 42 25 32 62", title="Senior Funding Manager",
//             tagline="Web-design entusiast"
//   → signatur = "Charlie Nielsen\nSenior Funding Manager & Web-design entusiast\n+45 42 25 32 62"
//   closing = "Mvh, Charlie Nielsen"
//   "salgselev" ALDRIG i Charlie-signatur (Lucas' differentiator) — scrubCharlieLeak()
//   defense-in-depth: fjerner "salgselev" fra Charlie-felter uanset kilde.
//   telefon opt-in: process.env.CHARLIE_SENDER_PHONE (legacy alias CHARLIE_PHONE)
//   titel opt-in:   process.env.CHARLIE_SENDER_TITLE  (legacy alias CHARLIE_TITLE)
//   tagline opt-in: process.env.CHARLIE_SENDER_TAGLINE (legacy alias CHARLIE_TAGLINE)

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

const DUMMY_PW = "dummy-app-pw";

// Snapshot + restore helpers for each test
function withEnv<T>(setup: () => void, teardown: () => void, fn: () => T): T {
  setup();
  try { return fn(); } finally { teardown(); }
}

function setLucasEnv() {
  process.env.GMAIL_USER = "lucas@buur.dk";
  process.env.GMAIL_APP_PASSWORD = DUMMY_PW;
  process.env.LUCAS_SENDER_PHONE = "+45 23 24 24 82";
}
function clearLucasEnv() {
  delete process.env.GMAIL_USER;
  delete process.env.GMAIL_APP_PASSWORD;
  delete process.env.LUCAS_SENDER_PHONE;
  delete process.env.LUCAS_PHONE;
  delete process.env.LUCAS_SENDER_TITLE;
  delete process.env.LUCAS_TITLE;
  delete process.env.LUCAS_SENDER_TAGLINE;
  delete process.env.LUCAS_TAGLINE;
}
function setCharlieEnv() {
  process.env.CHARLIE_GMAIL_USER = "1charlie.nielsen@gmail.com";
  process.env.CHARLIE_GMAIL_APP_PASSWORD = DUMMY_PW;
}
function clearCharlieEnv() {
  delete process.env.CHARLIE_GMAIL_USER;
  delete process.env.CHARLIE_GMAIL_APP_PASSWORD;
  delete process.env.CHARLIE_SENDER_PHONE;
  delete process.env.CHARLIE_PHONE;
  delete process.env.CHARLIE_SENDER_TITLE;
  delete process.env.CHARLIE_TITLE;
  delete process.env.CHARLIE_SENDER_TAGLINE;
  delete process.env.CHARLIE_TAGLINE;
}

// ============================================================================
// formatSignature: Lucas (regression)
// ============================================================================

test("formatSignature: Lucas defaults — navn + telefon, ingen titel", () => {
  withEnv(setLucasEnv, clearLucasEnv, () => {
    const sig = formatSignature("lucas");
    assert.equal(sig.text, "Lucas Buur\n+45 23 24 24 82\nKinly");
    assert.ok(sig.html.startsWith("<table"));
    assert.ok(sig.html.includes("Lucas Buur"));
    assert.ok(sig.html.includes("+45 23 24 24 82"));
    assert.ok(sig.html.includes("kinly-logo-email.png"));
    assert.equal(sig.closing, "Mvh, Lucas Buur");
  });
});

test("formatSignature: Lucas creds-missing fallback — defaults stadig active", () => {
  withEnv(clearLucasEnv, () => {}, () => {
    const sig = formatSignature("lucas");
    assert.equal(sig.text, "Lucas Buur\n+45 23 24 24 82\nKinly");
  });
});

// ============================================================================
// formatSignature: Charlie (BRUGER-SPEC — FULD profil gen-restoreret)
// ============================================================================

test("formatSignature: Charlie defaults — navn + titel+tagline-på-én-linje + telefon", () => {
  withEnv(setCharlieEnv, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.equal(
      sig.text,
      "Charlie Nielsen\nSenior Funding Manager & Web-design entusiast\n+45 42 25 32 62\nKinly"
    );
    assert.equal(sig.closing, "Mvh, Charlie Nielsen");
    assert.ok(sig.html.includes("Charlie Nielsen"));
    assert.ok(sig.html.includes("Senior Funding Manager & Web-design entusiast"));
    assert.ok(sig.html.includes("+45 42 25 32 62"));
  });
});

test("formatSignature: Charlie — ALDRIG 'salgselev' i nogen signatur-del", () => {
  withEnv(setCharlieEnv, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.equal(sig.text.toLowerCase().includes("salgselev"), false);
    assert.equal(sig.html.toLowerCase().includes("salgselev"), false);
    assert.equal(sig.closing.toLowerCase().includes("salgselev"), false);
  });
});

test("formatSignature: Charlie + CHARLIE_SENDER_PHONE env — opt-in override", () => {
  withEnv(() => {
    setCharlieEnv();
    process.env.CHARLIE_SENDER_PHONE = "+45 11 22 33 44";
  }, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.ok(sig.text.includes("+45 11 22 33 44"));
    assert.ok(!sig.text.includes("+45 42 25 32 62"));
  });
});

test("formatSignature: Charlie + legacy CHARLIE_PHONE alias — opt-in stadig", () => {
  withEnv(() => {
    setCharlieEnv();
    process.env.CHARLIE_PHONE = "+45 99 88 77 66";
  }, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.ok(sig.text.includes("+45 99 88 77 66"));
  });
});

test("formatSignature: Charlie + CHARLIE_SENDER_PHONE vinder over CHARLIE_PHONE", () => {
  withEnv(() => {
    setCharlieEnv();
    process.env.CHARLIE_SENDER_PHONE = "+45 11 11 11 11";
    process.env.CHARLIE_PHONE = "+45 99 99 99 99";
  }, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.ok(sig.text.includes("+45 11 11 11 11"));
    assert.ok(!sig.text.includes("+45 99 99 99 99"));
  });
});

test("formatSignature: Charlie + CHARLIE_SENDER_TITLE env — opt-in override", () => {
  withEnv(() => {
    setCharlieEnv();
    process.env.CHARLIE_SENDER_TITLE = "Medstifter, Buur & Nielsen";
  }, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.ok(sig.text.includes("Medstifter, Buur & Nielsen"));
    assert.ok(!sig.text.includes("Senior Funding Manager"));
  });
});

test("formatSignature: Charlie + CHARLIE_SENDER_TAGLINE env — opt-in override", () => {
  withEnv(() => {
    setCharlieEnv();
    process.env.CHARLIE_SENDER_TAGLINE = "Frontend-developer";
  }, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.ok(sig.text.includes("Frontend-developer"));
    assert.ok(!sig.text.includes("Web-design entusiast"));
  });
});

test("formatSignature: Charlie + både telefon OG titel OG tagline env", () => {
  withEnv(() => {
    setCharlieEnv();
    process.env.CHARLIE_SENDER_PHONE = "+45 22 22 22 22";
    process.env.CHARLIE_SENDER_TITLE = "QA-tester";
    process.env.CHARLIE_SENDER_TAGLINE = "Frontend-developer";
  }, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.ok(sig.text.includes("QA-tester"));
    assert.ok(sig.text.includes("Frontend-developer"));
    assert.ok(sig.text.includes("+45 22 22 22 22"));
    assert.ok(!sig.text.includes("Senior Funding Manager"));
    assert.ok(!sig.text.includes("Web-design entusiast"));
  });
});

test("formatSignature: Charlie + tom CHARLIE_SENDER_TITLE skjuler kun titel-linje", () => {
  withEnv(() => {
    setCharlieEnv();
    process.env.CHARLIE_SENDER_TITLE = "";
  }, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.ok(!sig.text.includes("Senior Funding Manager"));
    assert.ok(sig.text.includes("Web-design entusiast"));
    assert.ok(sig.text.includes("+45 42 25 32 62"));
  });
});

test("formatSignature: defense-in-depth — 'salgselev' scrubbes fra Charlie-felter", () => {
  withEnv(() => {
    setCharlieEnv();
    process.env.CHARLIE_SENDER_TITLE = "salgselev-elev";
  }, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.equal(sig.text.toLowerCase().includes("salgselev"), false,
      "salgselev skal scrubbes: " + sig.text);
  });
});

test("formatSignature: Lucas ALDRIG scrubbes (det er hans differentiator)", () => {
  withEnv(() => {
    setLucasEnv();
    process.env.LUCAS_SENDER_TITLE = "salgselev";
  }, clearLucasEnv, () => {
    const sig = formatSignature("lucas");
    assert.ok(sig.text.includes("salgselev"),
      "Lucas må gerne have 'salgselev'-titel: " + sig.text);
  });
});

// ============================================================================
// formatSignature: edge cases
// ============================================================================

test("formatSignature: credsOverride tvinger bestemte værdier (test/dry-run)", () => {
  const sig = formatSignature("charlie", {
    id: "charlie",
    email: "1charlie.nielsen@gmail.com",
    appPassword: "ignored",
    displayName: "Charlie Test",
    phone: "+45 00 00 00 00",
    title: "QA-test",
    tagline: "",
  });
  assert.equal(sig.text, "Charlie Test\nQA-test\n+45 00 00 00 00\nKinly");
  assert.equal(sig.closing, "Mvh, Charlie Test");
});

test("formatSignature: ingen creds falder tilbage til defaults (begge har telefon)", () => {
  withEnv(() => {
    clearLucasEnv();
    clearCharlieEnv();
  }, () => {}, () => {
    const lucas = formatSignature("lucas");
    const charlie = formatSignature("charlie");
    assert.ok(lucas.text.includes("+45 23 24 24 82"));
    assert.ok(charlie.text.includes("+45 42 25 32 62"));
    assert.ok(charlie.text.includes("Senior Funding Manager"));
    assert.ok(charlie.text.includes("Web-design entusiast"));
  });
});

test("formatSignature: ingen trailing newlines", () => {
  withEnv(setCharlieEnv, clearCharlieEnv, () => {
    const sig = formatSignature("charlie");
    assert.equal(sig.text.endsWith("\n"), false);
    assert.equal(sig.html.endsWith("<br>"), false);
  });
});

// ============================================================================
// formatFrom
// ============================================================================

test("formatFrom: uden creds = senderId; med creds = displayName <email>", () => {
  withEnv(clearLucasEnv, () => {}, () => {
    assert.equal(formatFrom("lucas"), "lucas");
    assert.equal(formatFrom("charlie"), "charlie");
  });
  process.env.GMAIL_USER = "buur.aigro@gmail.com";
  process.env.GMAIL_APP_PASSWORD = DUMMY_PW;
  const f = formatFrom("lucas");
  assert.ok(f.includes("Lucas Buur"));
  assert.ok(f.includes("buur.aigro@gmail.com"));
  clearLucasEnv();
});

// ============================================================================
// availableSenders / isSenderAvailable / defaultSender
// ============================================================================

test("availableSenders / isSenderAvailable: ingen creds = tom liste", () => {
  withEnv(() => {
    clearLucasEnv();
    clearCharlieEnv();
  }, () => {}, () => {
    assert.deepEqual(availableSenders(), []);
    assert.equal(isSenderAvailable("lucas"), false);
    assert.equal(isSenderAvailable("charlie"), false);
  });
});

test("defaultSender: foretrækker Lucas når begge er tilgængelige", () => {
  withEnv(() => {
    setLucasEnv();
    setCharlieEnv();
  }, () => {
    clearLucasEnv();
    clearCharlieEnv();
  }, () => {
    assert.equal(defaultSender(), "lucas");
  });
});

test("defaultSender: falder tilbage til charlie hvis kun charlie er sat", () => {
  withEnv(() => {
    clearLucasEnv();
    setCharlieEnv();
  }, () => {
    clearLucasEnv();
    clearCharlieEnv();
  }, () => {
    assert.equal(defaultSender(), "charlie");
  });
});

// ============================================================================
// getSenderCreds: phone/title/tagline defaults
// ============================================================================

test("getSenderCreds: begge sendere har telefon, title og tagline som defaults", () => {
  withEnv(() => {
    setLucasEnv();
    setCharlieEnv();
  }, () => {
    clearLucasEnv();
    clearCharlieEnv();
  }, () => {
    const lucas = getSenderCreds("lucas");
    const charlie = getSenderCreds("charlie");
    assert.ok(lucas, "lucas creds skal være sat");
    assert.ok(charlie, "charlie creds skal være sat");
    assert.equal(lucas.phone, "+45 23 24 24 82");
    assert.equal(lucas.title, "");
    assert.equal(lucas.tagline, "");
    assert.equal(charlie.phone, "+45 42 25 32 62");           // FULD default
    assert.equal(charlie.title, "Senior Funding Manager");     // FULD default
    assert.equal(charlie.tagline, "Web-design entusiast");      // FULD default
    assert.equal(lucas.displayName, "Lucas Buur");
    assert.equal(charlie.displayName, "Charlie Nielsen");
  });
});

// ============================================================================
// pickHybridSender (regression)
// ============================================================================

test("pickHybridSender: 14-dags hybrid allokering med Lucas tie-break", async () => {
  // pickHybridSender kortslutter via availableSenders() — begge Gmail-creds
  // skal være sat for at nå den egentlige hybrid-logik.
  setLucasEnv();
  setCharlieEnv();
  try {
    const { pickHybridSender } = await import("./senders.ts");
    const now = new Date("2026-06-26T12:00:00Z");
    const history: Parameters<typeof pickHybridSender>[0] = [
      { sender: "lucas", status: "sent", updatedAt: "2026-06-20T12:00:00Z" },
      { sender: "lucas", status: "sent", updatedAt: "2026-06-21T12:00:00Z" },
      { sender: "charlie", status: "sent", updatedAt: "2026-06-22T12:00:00Z" },
    ];
    // Lucas har sendt 2, Charlie 1 → Charlie bør vælges (lavere count wins)
    const choice = pickHybridSender(history, now);
    assert.equal(choice, "charlie");
  } finally {
    clearLucasEnv();
    clearCharlieEnv();
  }
});
// ---------------------------------------------------------------------------
// stripSignature: fulde navne (Bundle G-regression)
// ---------------------------------------------------------------------------
// formatSignature().closing er "Mvh, Lucas Buur" / "Mvh, Charlie Nielsen".
// Foer Bundle G daekkede Mvh-mønstret kun fornavne, saa closing-linjen blev
// aldrig strippet og applySignature dobbelt-signerede ved send.

test("stripSignature: fjerner 'Mvh, Lucas Buur' (fuldt navn)", async () => {
  const { stripSignature } = await import("./senders.ts");
  assert.equal(stripSignature("Hej\n\ntekst.\n\nMvh, Lucas Buur"), "Hej\n\ntekst.");
});

test("stripSignature: fjerner 'Mvh, Charlie Nielsen' (fuldt navn)", async () => {
  const { stripSignature } = await import("./senders.ts");
  assert.equal(stripSignature("Hej\n\ntekst.\n\nMvh, Charlie Nielsen"), "Hej\n\ntekst.");
});

test("applySignature: ingen dobbelt-signatur oven paa closing-linje", async () => {
  const { applySignature } = await import("./senders.ts");
  const out = applySignature("Hej\n\ntekst.\n\nMvh, Lucas Buur", "lucas");
  assert.equal(/Mvh, Lucas Buur[\s\S]*Lucas Buur/.test(out), false);
  assert.equal((out.match(/Lucas Buur/g) || []).length, 1);
  assert.equal(/Med venlig hilsen\nLucas Buur/.test(out), true);
  assert.equal(out.endsWith("\nKinly"), true);
});

// ---------------------------------------------------------------------------
// stripSignature: Charlie-blok med rolle-linje + stablede blokke (toggle-bug
// 2026-07-16). Foer fixet matchede ingen moenstre Charlies "Senior Funding
// Manager & Web-design entusiast"-linje, saa toggle Lucas/Charlie paa
// /godkendelse stablede en ny signaturblok pr. klik.
// ---------------------------------------------------------------------------

const CHARLIE_BLOCK = "Med venlig hilsen\nCharlie Nielsen\nSenior Funding Manager & Web-design entusiast\n+45 42 25 32 62\nKinly";
const LUCAS_BLOCK = "Med venlig hilsen\nLucas Buur\n+45 23 24 24 82\nKinly";

test("stripSignature: fjerner Charlie-blok med rolle-linje", async () => {
  const { stripSignature } = await import("./senders.ts");
  assert.equal(stripSignature(`Hej\n\ntekst.\n\n${CHARLIE_BLOCK}`), "Hej\n\ntekst.");
});

test("stripSignature: fjerner STABLEDE signaturblokke (toggle-bug)", async () => {
  const { stripSignature } = await import("./senders.ts");
  const stacked = `Hej\n\ntekst.\n\n${CHARLIE_BLOCK}\n\n${LUCAS_BLOCK}\n\n${CHARLIE_BLOCK}`;
  assert.equal(stripSignature(stacked), "Hej\n\ntekst.");
});

test("previewSignature: toggle frem og tilbage stabler ikke", async () => {
  const { previewSignature } = await import("./leads/signature-preview.ts");
  let body = `Hej\n\ntekst.\n\n${LUCAS_BLOCK}`;
  for (let i = 0; i < 5; i++) {
    body = previewSignature(body, "charlie", "+45 23 24 24 82", "+45 42 25 32 62");
    body = previewSignature(body, "lucas", "+45 23 24 24 82", "+45 42 25 32 62");
  }
  assert.equal((body.match(/Med venlig hilsen/g) || []).length, 1);
  assert.equal(body, `Hej\n\ntekst.\n\n${LUCAS_BLOCK}`);
});

test("applySignature: matcher preview-formatet (Med venlig hilsen + blok)", async () => {
  const { applySignature } = await import("./senders.ts");
  const { previewSignature } = await import("./leads/signature-preview.ts");
  const body = "Hej\n\ntekst.";
  const sent = applySignature(body, "charlie");
  const preview = previewSignature(body, "charlie", "+45 23 24 24 82", "+45 42 25 32 62");
  assert.equal(sent, preview);
});

test("applySignatureHtml: escaped brødtekst + logo + ingen dobbelt-signatur", async () => {
  const { applySignatureHtml } = await import("./senders.ts");
  const out = applySignatureHtml("Hej <Vida>,\n\nSe https://demo.dk\n\nMvh, Lucas Buur", "lucas");
  assert.equal(out.includes("&lt;Vida&gt;"), true);
  assert.equal(out.includes('<a href="https://demo.dk"'), true);
  assert.equal(out.includes("kinly-logo-email.png"), true);
  assert.equal((out.match(/Med venlig hilsen/g) || []).length, 1);
  assert.equal(/Mvh, Lucas Buur/.test(out), false);
});
