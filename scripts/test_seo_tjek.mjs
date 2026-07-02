#!/usr/bin/env node
/*
 * test_seo_tjek.mjs — offline tests for the pure helpers behind the free
 * /seo-tjek funnel (src/lib/seo-tjek.ts): submission validation, booking
 * detection, local-rank matching, plain-Danish fixes, report + mail render.
 * No network.
 *
 *   node scripts/test_seo_tjek.mjs
 */
import path from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const st = await import(pathToFileURL(path.join(REPO_ROOT, "src", "lib", "seo-tjek.ts")).href);

let pass = 0, fail = 0;
const failures = [];
function check(name, cond) { if (cond) pass++; else { fail++; failures.push(name); } }

// ---- validateSubmission ---------------------------------------------------
{
  const r = st.validateSubmission({ url: "jernbanecafeen.dk", email: "test@example.com", consent: true });
  check("valid: ok", r.ok === true);
  check("valid: url normalized to https", r.ok && r.url === "https://jernbanecafeen.dk");
}
{
  const r = st.validateSubmission({ url: "https://vida-klinik.dk/", email: "a@b.dk", consent: true, branch: "klinik", city: "Herning" });
  check("valid: keeps branch+city", r.ok && r.branch === "klinik" && r.city === "Herning");
}
check("missing consent -> fail", st.validateSubmission({ url: "x.dk", email: "a@b.dk", consent: false }).ok === false);
check("missing email -> fail", st.validateSubmission({ url: "x.dk", consent: true }).ok === false);
check("bad email -> fail", st.validateSubmission({ url: "x.dk", email: "not-an-email", consent: true }).ok === false);
check("missing url -> fail", st.validateSubmission({ email: "a@b.dk", consent: true }).ok === false);
check("garbage url -> fail", st.validateSubmission({ url: "ikke en url", email: "a@b.dk", consent: true }).ok === false);
check("javascript: url -> fail", st.validateSubmission({ url: "javascript:alert(1)", email: "a@b.dk", consent: true }).ok === false);
check("localhost url -> fail", st.validateSubmission({ url: "http://localhost:3000", email: "a@b.dk", consent: true }).ok === false);
check("ip url -> fail", st.validateSubmission({ url: "http://192.168.1.1", email: "a@b.dk", consent: true }).ok === false);
check("null input -> fail", st.validateSubmission(null).ok === false);
{
  const r = st.validateSubmission({ url: " HTTP://Example.DK ", email: " A@B.dk ", consent: true });
  check("trims + lowercases email", r.ok && r.email === "a@b.dk");
}

// ---- detectBookingSystem --------------------------------------------------
{
  const html = `<a href="https://www.planway.com/booking/salonx">Bestil tid</a>`;
  const r = st.detectBookingSystem(html, "frisør");
  check("planway detected", r.relevant === true && r.found === true && /planway/i.test(r.system || ""));
}
{
  const r = st.detectBookingSystem(`<a href="https://book.dinnerbooking.com/dk/x">Book bord</a>`, "restaurant");
  check("dinnerbooking detected", r.found === true && /dinnerbooking/i.test(r.system || ""));
}
{
  const r = st.detectBookingSystem(`<html><body>Ring til os på 12345678</body></html>`, "restaurant");
  check("restaurant no booking -> relevant, not found", r.relevant === true && r.found === false);
}
{
  const r = st.detectBookingSystem(`<html></html>`, "advokat");
  check("advokat -> not relevant", r.relevant === false);
}
{
  const r = st.detectBookingSystem(`<a href="/book-tid">Book tid online</a>`, "negleklinik");
  check("generic book-tid link counts", r.relevant === true && r.found === true);
}

// ---- matchRank ------------------------------------------------------------
const places = [
  { title: "Cafe Alfa", website: "https://cafealfa.dk" },
  { title: "Jernbanecafeen", website: "https://www.jernbanecafeen.dk/menu" },
  { title: "Cafe Gamma", website: "" },
];
check("rank by host", st.matchRank(places, "jernbanecafeen.dk") === 2);
check("rank by name fallback", st.matchRank(places, "nomatch.dk", "cafe gamma") === 3);
check("no match -> null", st.matchRank(places, "nomatch.dk", "Ukendt Bar") === null);
check("empty list -> null", st.matchRank([], "x.dk") === null);

// ---- plainFixes -----------------------------------------------------------
const seoResult = {
  name: "x", domain: "x.dk", tier: "tier_basic", ranAt: new Date().toISOString(),
  schema: { found: false, types: [], count: 0 },
  schemaSuggestion: "<script>…</script>",
  onPage: { score: 40, checks: [
    { label: "Sidetitel", ok: false, detail: "mangler", weight: 3 },
    { label: "Meta-beskrivelse", ok: false, detail: "mangler", weight: 3 },
    { label: "HTTPS", ok: true, detail: "sikker", weight: 2 },
  ] },
  healthScore: 40, topIssues: [],
  crux: null,
  geo: { llmsTxt: false, aiCrawlersAllowed: false, blockedBots: ["GPTBot"], citabilityNote: "", note: "" },
  index: null, aiVisibility: null,
  lighthouse: { available: true, scores: { performance: 35, accessibility: 80, bestPractices: 90, seo: 70 }, note: "" },
  notes: [],
};
{
  const fixes = st.plainFixes(seoResult, { relevant: true, found: false, system: null, note: "" }, { available: true, query: "café i Ikast", position: null, total: 20, topNames: ["A"], note: "" });
  check("exactly 3 fixes", fixes.length === 3);
  check("fixes have title/why/how", fixes.every((f) => f.title && f.why && f.how));
  check("booking fix outranks speed (revenue blocker)", /booking|bestille/i.test(fixes[0].title));
  check("perf fix second", /langsom|hastighed/i.test(fixes[1].title + fixes[1].why));
  const all = JSON.stringify(fixes);
  check("no jargon: no 'canonical' in copy", !/canonical/i.test(all));
  check("no em-dash in fixes", !all.includes("—"));
}
{
  // healthy site -> still returns up to 3, but fewer is OK; never throws
  const healthy = { ...seoResult, schema: { found: true, types: ["Restaurant"], count: 1 }, geo: { ...seoResult.geo, llmsTxt: true, aiCrawlersAllowed: true, blockedBots: [] }, lighthouse: { available: true, scores: { performance: 95, accessibility: 95, bestPractices: 95, seo: 95 }, note: "" }, onPage: { score: 100, checks: [] } };
  const fixes = st.plainFixes(healthy, { relevant: false, found: false, system: null, note: "" }, null);
  check("healthy site -> <=3 fixes, no crash", Array.isArray(fixes) && fixes.length <= 3);
}

// ---- renderReportHtml -----------------------------------------------------
const submission = { id: "test-1", url: "https://x.dk", email: "a@b.dk", consent: true, consentAt: "2026-07-02T08:00:00Z", createdAt: "2026-07-02T08:00:00Z" };
const report = {
  submissionId: "test-1", url: "https://x.dk", host: "x.dk", ranAt: "2026-07-02T08:05:00Z",
  seo: seoResult,
  desktop: { performance: 60, accessibility: 85, bestPractices: 90, seo: 75 },
  localRank: { available: true, query: "café i Ikast", position: 4, total: 18, topNames: ["Cafe A", "Cafe B", "Cafe C"], note: "" },
  booking: { relevant: true, found: false, system: null, note: "" },
  fixes: [{ title: "Din side er langsom på mobil", why: "fordi", how: "gør sådan" }],
};
{
  const html = st.renderReportHtml(report);
  check("report: has mobile score", html.includes("35"));
  check("report: has desktop score", html.includes("60"));
  check("report: mentions ChatGPT section", /ChatGPT/.test(html));
  check("report: local rank shown", html.includes("café i Ikast"));
  check("report: fixes rendered", html.includes("Din side er langsom på mobil"));
  check("report: no raw email leaked", !html.includes("a@b.dk"));
  check("report: escapes host", st.renderReportHtml({ ...report, host: "<script>x</script>" }).includes("&lt;script&gt;") );
}

// ---- mails ----------------------------------------------------------------
{
  const m = st.day0Mail(submission, report, "https://example.com/seo-tjek/rapport/test-1");
  check("day0: subject mentions rapport", /rapport/i.test(m.subject));
  check("day0: link included", m.text.includes("https://example.com/seo-tjek/rapport/test-1") && m.html.includes("https://example.com/seo-tjek/rapport/test-1"));
  check("day0: highlights a fix", m.text.includes("Din side er langsom på mobil"));
  check("day0: unsubscribe present", /afmeld/i.test(m.text) && /afmeld/i.test(m.html));
  check("day0: no em-dash", !m.text.includes("—") && !m.subject.includes("—"));
  check("day0: no emoji", !/[\u{1F300}-\u{1FAFF}]/u.test(m.text + m.subject));
}
{
  const m = st.day7Mail(submission, "https://example.com/seo-tjek/rapport/test-1");
  check("day7: mentions Vida case", /vida/i.test(m.text));
  check("day7: unsubscribe present", /afmeld/i.test(m.text));
  check("day7: no em-dash", !m.text.includes("—"));
}

console.log(failures.length ? "FAILURES:\n  " + failures.join("\n  ") : "all seo-tjek checks ok");
console.log(`\ntest_seo_tjek — ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
