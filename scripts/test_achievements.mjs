#!/usr/bin/env node
/*
 * test_achievements.mjs — achievement detection (src/lib/achievements.ts) + that
 * the tone-mixer promotes the "Tillykke" opener when an achievement is present.
 *
 *   node scripts/test_achievements.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const libUrl = (f) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", f)).href;
const { detectAchievements, achievementStrings } = await import(libUrl("achievements.ts"));
const { mixForLead } = await import(libUrl("tone-mixer.ts"));

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- positive cases ------------------------------------------------------
check("Danmarksmester detected",
  detectAchievements("Vi blev Danmarksmester 2026 i master Lash Lift og Brow Lamination.").length > 0);
check("kåret af BT detected",
  detectAchievements("Salonen blev kåret af BT som en af de bedste i landet.").length > 0);
check("årets X detected",
  detectAchievements("Vi vandt prisen som Årets håndværker i regionen i 2025.").length > 0);

// ---- negative cases (must NOT trigger) ----------------------------------
check("plain reviews not an achievement",
  detectAchievements("Vi har 444 anmeldelser og mange 5-stjernede reviews.").length === 0);
check("generic marketing not an achievement",
  detectAchievements("Hos os er kunden altid en vinder og vi vinder hjerter.").length === 0);
check("short text ignored", detectAchievements("vinder").length === 0);

// ---- achievementStrings dedupes -----------------------------------------
{
  const s = achievementStrings(
    { text: "Vi blev Danmarksmester 2026.", source: "web" },
    { text: "Danmarksmester 2026 — det er vi stolte af.", source: "lead" },
  );
  check("achievementStrings returns at least one", s.length >= 1);
}

// ---- tone-mixer promotes achievement opener -----------------------------
{
  const mix = mixForLead({
    name: "RR Studio", branch: "skønhed", city: "Aarhus", reviewsCount: 120,
    websiteStatus: "old", hooks: [], achievements: ["Danmarksmester 2026 i Lash Lift"],
  });
  check("openerKind is achievement when present", mix.openerKind === "achievement");
  check("opener mentions the achievement", /Danmarksmester 2026/.test(mix.opener));
  check("opener uses 'Tillykke' frame", /tillykke/i.test(mix.opener));
}
{
  // no achievement -> not achievement kind
  const mix = mixForLead({ name: "Salon X", branch: "frisør", city: "Ikast", reviewsCount: 10, websiteStatus: "ok", hooks: [] });
  check("no achievement -> other opener kind", mix.openerKind !== "achievement");
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all achievement checks ok");
console.log(`\ntest_achievements — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
