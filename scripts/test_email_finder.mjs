#!/usr/bin/env node
/*
 * test_email_finder.mjs — offline regression for src/lib/email-finder.ts.
 *
 * Pure functions only (no DNS / no network): extraction, format filtering,
 * phone-prefix stripping, and the freemail RANKING that fixes the VIDA-class
 * bug (a gmail-only business must NOT be discarded).
 *
 *   node scripts/test_email_finder.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const ef = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "email-finder.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- isCleanEmailFormat --------------------------------------------------
check("accepts real address", ef.isCleanEmailFormat("info@vida.dk") === true);
check("rejects placeholder", ef.isCleanEmailFormat("name@domain.com") === false);
check("rejects wixpress vendor", ef.isCleanEmailFormat("x@wixpress.com") === false);
check("rejects encoded", ef.isCleanEmailFormat("info%40vida.dk@x.dk") === false);
check("rejects banned domain", ef.isCleanEmailFormat("a@example.com") === false);

// ---- stripPhonePrefix ----------------------------------------------------
check("strips phone prefix", ef.stripPhonePrefix("56info@foo.dk") === "info@foo.dk");
check("keeps clean local", ef.stripPhonePrefix("info@foo.dk") === "info@foo.dk");

// ---- extractEmailCandidates ----------------------------------------------
const txt = "Ring 20 12 34 56 info@salon.dk eller booking@salon.dk. mailto:chef@salon.dk";
const ex = ef.extractEmailCandidates(txt);
check("extracts mailto", ex.includes("chef@salon.dk"));
check("extracts bare", ex.includes("info@salon.dk") && ex.includes("booking@salon.dk"));
check("no phone-bleed bogus", !ex.some((e) => /^56info/.test(e)));

// ---- isFreemail ----------------------------------------------------------
check("gmail is freemail", ef.isFreemail("vida.salon@gmail.com") === true);
check("domain mail not freemail", ef.isFreemail("info@vida.dk") === false);

// ---- rankEmailCandidates: the VIDA fix -----------------------------------
// A business whose ONLY public contact is a gmail must keep that gmail.
const vidaOnly = ef.rankEmailCandidates(["vida.aarhus@gmail.com"], "vida.dk");
check("VIDA: gmail-only kept (not discarded)", vidaOnly.length === 1 && vidaOnly[0] === "vida.aarhus@gmail.com");

// Domain match outranks gmail, but gmail still survives the list.
const mixed = ef.rankEmailCandidates(["vida.aarhus@gmail.com", "info@vida.dk"], "vida.dk");
check("domain match ranked first", mixed[0] === "info@vida.dk");
check("gmail retained as fallback", mixed.includes("vida.aarhus@gmail.com"));

// Role address ranks below a personal domain address.
const roles = ef.rankEmailCandidates(["info@vida.dk", "chef@vida.dk"], "vida.dk");
check("non-role domain addr beats role", roles[0] === "chef@vida.dk");

// Other-domain real address beats freemail.
const other = ef.rankEmailCandidates(["someone@gmail.com", "kontakt@partner.dk"], "vida.dk");
check("other-domain real beats freemail", other[0] === "kontakt@partner.dk" && other.includes("someone@gmail.com"));

// ---- report --------------------------------------------------------------
console.log("");
console.log(`  test_email_finder — ${pass} passed, ${fail} failed`);
if (fail) {
  console.log("  FAILURES:");
  for (const f of failures) console.log(`    ✗ ${f}`);
  console.log("");
  process.exitCode = 1;
} else {
  console.log("  ✓ email-finder contracts hold (incl. VIDA freemail-keep)");
  console.log("");
  process.exitCode = 0;
}
