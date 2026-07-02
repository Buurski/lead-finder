#!/usr/bin/env node
/*
 * _seo_tjek_run.mjs — kør det fulde gratis SEO-tjek mod rigtige sites fra
 * kommandolinjen (ingen server). Skriver standalone HTML-rapporter til
 * audits/seo-tjek/. Bruges til Bundle C-verifikation.
 *
 *   node scripts/_seo_tjek_run.mjs "https://site.dk|branche|by" ...
 */
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");

// .env.local ind i process.env (PAGESPEED_API_KEY, GOOGLE_PLACES_API_KEY).
try {
  const envRaw = fs.readFileSync(path.join(REPO_ROOT, ".env.local"), "utf-8");
  for (const line of envRaw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^"|"$/g, "");
  }
} catch { /* ingen .env.local */ }

const st = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "seo-tjek.ts")).href);

const targets = process.argv.slice(2);
if (!targets.length) {
  console.error('brug: node scripts/_seo_tjek_run.mjs "https://site.dk|branche|by" ...');
  process.exit(1);
}

const outDir = path.join(REPO_ROOT, "audits", "seo-tjek");
fs.mkdirSync(outDir, { recursive: true });

for (const t of targets) {
  const [url, branch, city] = t.split("|").map((s) => (s || "").trim() || undefined);
  const v = st.validateSubmission({ url, email: "buur.aigro@gmail.com", consent: true, branch, city });
  if (!v.ok) { console.error(`SKIP ${url}: ${v.error}`); continue; }
  const sub = {
    id: "cli-" + st.hostOfUrl(v.url).replace(/[^a-z0-9]/g, "-"),
    url: v.url, email: v.email, branch: v.branch, city: v.city,
    consent: true, consentAt: new Date().toISOString(), createdAt: new Date().toISOString(),
  };
  console.log(`\n=== ${v.url} (${branch || "?"} / ${city || "?"}) ===`);
  const t0 = Date.now();
  const report = await st.runFreeCheck(sub);
  const html = st.renderReportHtml(report, { standalone: true });
  const file = path.join(outDir, `${st.hostOfUrl(v.url).replace(/[^a-z0-9.]/g, "_")}.html`);
  fs.writeFileSync(file, html, "utf-8");
  const m = report.seo.lighthouse?.scores;
  console.log(`  mobil perf ${m?.performance ?? "?"} · desktop perf ${report.desktop?.performance ?? "?"} · schema ${report.seo.schema?.found ? "ja" : "nej"} · llms.txt ${report.seo.geo?.llmsTxt ? "ja" : "nej"}`);
  console.log(`  lokal placering: ${report.localRank?.available ? (report.localRank.position ?? "ikke fundet") + " (" + report.localRank.query + ")" : report.localRank?.note}`);
  console.log(`  booking: ${report.booking.note}`);
  console.log(`  fixes: ${report.fixes.map((f) => f.title).join(" | ")}`);
  console.log(`  -> ${file} (${Date.now() - t0} ms)`);
}
