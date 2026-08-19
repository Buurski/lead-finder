#!/usr/bin/env node
/*
 * triage_rank.mjs — kvalitets-rang af de send-klare leads (Lucas, 2026-08-19).
 * Read-only. Rangerer A-email-bunken efter "ligner vores bedste kunder":
 *   + siden trænger (old/dead/none)  -> det er produktet vi sælger
 *   + branche matcher eksisterende kundeportefølje (beauty/auto/café/håndværk)
 *   + anmeldelser = etableret forretning
 * Flager samtidig svage leads (ingen reviews + ingen website = tynd).
 *
 *   node --env-file=.env.local scripts/triage_rank.mjs
 */
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const lib = (p) => pathToFileURL(path.join(REPO_ROOT, "src", "lib", p)).href;
const { getLeads } = await import(lib("sheets.ts"));
const { canSendTo } = await import(lib("canSendTo.ts"));
const { isContactable } = await import(lib("leads/contactable.ts"));

// Lookalike-brancher ud fra faktiske kunder: VIDA/Salon Artec (beauty),
// Ikast Autoservice (auto), Jernbanecafeen/Zaytoon (café/restaurant), KT VVS (håndværk).
const LOOKALIKE = [
  { re: /friso|salon|skoenhed|skønhed|beauty|klip|hår|haar|negle|wellness|massage/i, tag: "beauty" },
  { re: /auto|værksted|vaerksted|dæk|daek|mekanik/i, tag: "auto" },
  { re: /cafe|café|restaurant|pizzeria|grill|bager|konditor/i, tag: "café/rest" },
  { re: /vvs|tømrer|toemrer|maler|elektriker|murer|anlæg|anlaeg|kloak|blik/i, tag: "håndværk" },
];

const num = (v) => { const n = parseInt(String(v ?? "").replace(/\D/g, ""), 10); return Number.isFinite(n) ? n : 0; };

const leads = await getLeads();
const seen = new Set();
const A = leads.filter(isContactable).filter((l) => canSendTo(l, { seenEmails: seen }).ok);

const ranked = A.map((l) => {
  let score = 0; const why = [];
  const site = `${l.websiteStatus || ""}/${l.websiteQualityTier || ""}`.toLowerCase();
  if (/dead|none/.test(site) || !(l.website || "").trim()) { score += 3; why.push("mangler/død side"); }
  else if (/old|mediocre/.test(site)) { score += 2; why.push("gammel/middelmådig side"); }
  else if (/modern/.test(site)) { score -= 2; why.push("moderne side (svagt behov)"); }
  const hay = `${l.name} ${l.branch || ""}`;
  const m = LOOKALIKE.find((x) => x.re.test(hay));
  if (m) { score += 2; why.push(`lookalike:${m.tag}`); }
  const rev = num(l.reviewsCount);
  if (rev >= 50) { score += 3; why.push(`${rev} anmeldelser`); }
  else if (rev >= 10) { score += 2; why.push(`${rev} anmeldelser`); }
  else if (rev === 0 && !(l.website || "").trim()) { score -= 2; why.push("tynd (0 reviews, ingen site)"); }
  score += Math.min(num(l.score), 3) / 3; // eksisterende scraper-score, let vægt
  return { id: l.id, name: l.name, city: l.city, branch: l.branch || "", email: l.email, reviews: rev, site: site.replace(/^\/|\/$/g, ""), score: Math.round(score * 10) / 10, why: why.join(" · ") };
}).sort((a, b) => b.score - a.score);

const strong = ranked.filter((r) => r.score >= 4);
const ok = ranked.filter((r) => r.score >= 1.5 && r.score < 4);
const weak = ranked.filter((r) => r.score < 1.5);

const outFile = path.join(REPO_ROOT, ".triage", `rank-${new Date().toISOString().slice(0, 10)}.json`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify({ strong, ok, weak }, null, 2));

console.log(JSON.stringify({ A_ialt: ranked.length, staerke: strong.length, ok: ok.length, svage: weak.length }, null, 2));
console.log("\nTOP 15 (stærkest først):");
for (const r of ranked.slice(0, 15)) console.log(`  ${String(r.score).padStart(4)} | ${r.name} (${r.city}) [${r.branch}] ${r.reviews} rev | ${r.why}`);
console.log("\nBUND 10 (kandidater til frasortering):");
for (const r of ranked.slice(-10)) console.log(`  ${String(r.score).padStart(4)} | ${r.name} (${r.city}) [${r.branch}] | ${r.why}`);
console.log(`\nFuld rapport: ${outFile}`);
