#!/usr/bin/env node
/*
 * test_reply.mjs — offline contract tests for the reply-assistant (src/lib/reply.ts).
 * Deterministic classification + becameClient detection + that every suggested
 * reply obeys the voice rules (validateDraft). No API key needed.
 *
 *   node scripts/test_reply.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;
const reply = await import(libUrl("reply.ts"));
const { validateDraft } = await import(libUrl("draft.ts"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- classification ------------------------------------------------------
const cases = [
  ["Ja tak, lad os gå videre — send en aftale!", "interested", { becameClient: true, isInterested: true }],
  ["Det lyder spændende, kan du ringe til mig?", "question", { becameClient: false, isInterested: true }],
  ["Nej tak, ikke interesseret.", "not-interested", { shouldStop: true, isInterested: false }],
  ["Afmeld mig venligst, skriv ikke igen.", "unsubscribe", { shouldStop: true }],
  ["Jeg er ude af kontoret og vender tilbage den 5.", "auto-reply", { shouldStop: false, isInterested: false }],
  ["Du har skrevet til forkert person, kontakt i stedet vores chef.", "wrong-person", { shouldStop: true }],
  ["Det er lige lovlig dyrt for os lige nu, måske senere.", "objection", { isInterested: true, becameClient: false }],
  ["Hvad koster sådan en side?", "question", { isInterested: true }],
];
for (const [text, expCat, expFlags] of cases) {
  const c = reply.classifyReply(text);
  check(`classify "${text.slice(0, 30)}…" -> ${expCat}`, c.category === expCat);
  for (const [k, v] of Object.entries(expFlags)) {
    check(`  flag ${k}=${v} for "${text.slice(0, 20)}…"`, c[k] === v);
  }
}

// empty
check("empty reply -> other/no-stop", reply.classifyReply("").category === "other");

// ---- becameClient gate ---------------------------------------------------
check("becameClient only on explicit yes",
  reply.classifyReply("Vi vil gerne sætte i gang").becameClient === true &&
  reply.classifyReply("Måske, fortæl lidt mere").becameClient === false);

// "lad os" delay phrases must NOT count as a won client (regression: bare
// "lad os" used to flip these). Genuine commitment still flips.
check("'lad os vente' is not becameClient", reply.classifyReply("Tak, men lad os vente til efter sommeren").becameClient === false);
check("'lad os tænke over det' is not becameClient", reply.classifyReply("Spændende, lad os lige tænke over det").becameClient === false);
check("'lad os gå videre' still becameClient", reply.classifyReply("Ja, lad os gå videre med det").becameClient === true);

// ---- draftReply deterministic obeys voice rules --------------------------
const ctx = { leadName: "Salon Lumière", branch: "frisør", city: "Aarhus" };
for (const [text] of cases) {
  const d = await reply.draftReply(text, ctx, "", { useAI: false });
  check(`draftReply source deterministic for "${text.slice(0, 18)}…"`, d.source === "deterministic");
  if (d.suggestedReply) {
    const v = validateDraft(d.suggestedReply);
    check(`  reply passes validateDraft for "${text.slice(0, 18)}…"`, v.ok === true);
    check(`  reply ends Mvh, Lucas for "${text.slice(0, 18)}…"`, /Mvh, Lucas\s*$/.test(d.suggestedReply));
  }
}

// autoresponder -> no reply
const ar = await reply.draftReply("Jeg er på ferie, autosvar.", ctx, "", { useAI: false });
check("auto-reply yields no suggested reply", ar.suggestedReply === "");

// ---- report --------------------------------------------------------------
console.log("");
console.log(`  test_reply — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("  FAILURES:");
  for (const f of failures) console.log(`    ✗ ${f}`);
  console.log("");
  process.exitCode = 1;
} else {
  console.log("  ✓ reply-assistant contracts hold (offline)");
  console.log("");
  process.exitCode = 0;
}
