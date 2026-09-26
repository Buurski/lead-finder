import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { __setStore, InMemoryStore } from "../store.ts";
import { CompetitorInputError, loadLatestReport, loadReportHistory, saveAnalysis, saveReport, validateReport } from "./competitors.ts";

beforeEach(() => {
  __setStore(new InMemoryStore());
});
after(() => {
  __setStore(null);
});

function validRaw(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-09-21T02:00:00.000Z",
    jevCalls: 12,
    competitors: [
      {
        name: "Bureau A",
        url: "https://bureau-a.dk",
        city: "Herning",
        country: "DK",
        google: { rating: 4.6, reviews: 32, source: "Google Maps" },
        site: { pagespeedMobile: 71, https: true, schemaLocalBusiness: false, hasPrices: true, priceFrom: "5.000 kr", cms: "WordPress" },
        services: ["Hjemmesider", "SEO"],
        positioning: "Billige skabelon-sites til lokale butikker.",
        blog: { posts30d: 2, topics: ["SEO", "Priser"], quality: "mellem" },
        social: { facebookFollowers: 340, facebookActive: true },
        geo: { mentionedBy: ["ChatGPT"] },
        strengths: ["Hurtig levering"],
        weaknesses: ["Ingen kode, kun skabelon"],
      },
    ],
    patterns: [{ title: "Alle sælger skabeloner", detail: "Ingen konkurrenter koder selv.", evidence: ["https://bureau-a.dk"] }],
    gaps: [{ title: "Ingen viser priser tydeligt", detail: "Kun 1 ud af 5 har synlig pris.", kind: "pris" }],
    ...overrides,
  };
}

test("gyldig rapport valideres og kan gemmes/hentes", async () => {
  const raw = validRaw();
  const report = await saveReport(raw);
  assert.equal(report.competitors.length, 1);
  const latest = await loadLatestReport();
  assert.deepEqual(latest, report);
});

test("ukendt felt afvises (afvis ukendte typer)", () => {
  assert.throws(() => validateReport(validRaw({ ekstraFelt: 1 })), CompetitorInputError);
  const raw = validRaw();
  (raw.competitors[0] as Record<string, unknown>).ukendt = "x";
  assert.throws(() => validateReport(raw), CompetitorInputError);
});

test("ugyldigt enum, http-url og out-of-range tal afvises", () => {
  assert.throws(() => validateReport(validRaw({ competitors: [{ ...validRaw().competitors[0], country: "SE" }] })), CompetitorInputError);
  assert.throws(() => validateReport(validRaw({ competitors: [{ ...validRaw().competitors[0], url: "http://bureau-a.dk" }] })), CompetitorInputError);
  const bad = validRaw();
  (bad.competitors[0] as { google: { rating: number } }).google.rating = 7;
  assert.throws(() => validateReport(bad), CompetitorInputError);
});

test("manglende påkrævet felt afvises", () => {
  const raw = validRaw();
  delete (raw as { generatedAt?: unknown }).generatedAt;
  assert.throws(() => validateReport(raw), CompetitorInputError);
});

test("for lange tekster klippes i stedet for at blive afvist", () => {
  const raw = validRaw({ gaps: [{ title: "x".repeat(200), detail: "y".repeat(500), kind: "pris" }] });
  const report = validateReport(raw);
  assert.equal(report.gaps[0].title.length, 80);
  assert.equal(report.gaps[0].detail.length, 300);
});

test("lister over loftet klippes (>40 konkurrenter, >12 mønstre/huller)", () => {
  const one = validRaw().competitors[0];
  const raw = validRaw({
    competitors: Array.from({ length: 45 }, (_, i) => ({ ...one, name: `Bureau ${i}`, url: `https://bureau-${i}.dk` })),
    patterns: Array.from({ length: 15 }, () => validRaw().patterns[0]),
    gaps: Array.from({ length: 15 }, () => validRaw().gaps[0]),
  });
  const report = validateReport(raw);
  assert.equal(report.competitors.length, 40);
  assert.equal(report.patterns.length, 12);
  assert.equal(report.gaps.length, 12);
});

test("historik holdes på maks 12 — ældste rydes ud", async () => {
  for (let i = 0; i < 14; i++) {
    const d = String(i + 1).padStart(2, "0");
    await saveReport(validRaw({ generatedAt: `2026-01-${d}T02:00:00.000Z` }));
  }
  const history = await loadReportHistory();
  assert.equal(history.length, 12);
  // nyeste-først: 14. og 13. dag skal være med, 1. og 2. skal være rykket ud.
  assert.equal(history[0].generatedAt.slice(0, 10), "2026-01-14");
  assert.equal(history.at(-1)!.generatedAt.slice(0, 10), "2026-01-03");
});

test("nye valgfrie felter (kind, uniqueServices, messaging, seoExtra, geoExtra, aiBuilder, findings) accepteres og bevares", async () => {
  const raw = validRaw({
    competitors: [
      {
        ...validRaw().competitors[0],
        kind: "ai-bygger",
        uniqueServices: ["Dansk support", "Kode-eksport"],
        messaging: { angles: ["pris", "ai"] },
        seoExtra: { faqVisible: true, reviewsAsText: false },
        geoExtra: { citableAnswers: true },
        aiBuilder: { priceFromText: "99 kr/md", aiFeatures: true, danish: true, codeExport: false },
      },
    ],
    findings: [
      { id: "f1", category: "pris-budskab", title: "Ingen viser pris", detail: "Kun 1 ud af 5.", rating: 4, evidence: ["Bureau A", "Bureau B"], suggest: "blog" },
    ],
  });
  const report = await saveReport(raw);
  assert.equal(report.competitors[0].kind, "ai-bygger");
  assert.deepEqual(report.competitors[0].uniqueServices, ["Dansk support", "Kode-eksport"]);
  assert.deepEqual(report.competitors[0].messaging, { angles: ["pris", "ai"] });
  assert.deepEqual(report.competitors[0].seoExtra, { faqVisible: true, reviewsAsText: false });
  assert.deepEqual(report.competitors[0].geoExtra, { citableAnswers: true });
  assert.deepEqual(report.competitors[0].aiBuilder, { priceFromText: "99 kr/md", aiFeatures: true, danish: true, codeExport: false });
  assert.equal(report.findings?.[0].title, "Ingen viser pris");
  const latest = await loadLatestReport();
  assert.deepEqual(latest, report);
});

test("rapport uden de nye felter valideres stadig (bagudkompatibel)", () => {
  const report = validateReport(validRaw());
  assert.equal(report.competitors[0].kind, undefined);
  assert.equal(report.findings, undefined);
});

test("ukendt nøgle i de nye nestede objekter afvises", () => {
  const base = validRaw().competitors[0];
  assert.throws(() => validateReport(validRaw({ competitors: [{ ...base, messaging: { angles: ["pris"], ekstra: 1 } }] })), CompetitorInputError);
  assert.throws(() => validateReport(validRaw({ competitors: [{ ...base, seoExtra: { faqVisible: true, ekstra: 1 } }] })), CompetitorInputError);
  assert.throws(() => validateReport(validRaw({ competitors: [{ ...base, kind: "bureaukrati" }] })), CompetitorInputError);
});

test("finding uden for rating 1-5 afvises; ukendt kategori/suggest afvises; >20 findings klippes", () => {
  const goodFinding = { id: "f1", category: "seo" as const, title: "t", detail: "d", rating: 3, evidence: [], suggest: "blog" as const };
  assert.throws(() => validateReport(validRaw({ findings: [{ ...goodFinding, rating: 0 }] })), CompetitorInputError);
  assert.throws(() => validateReport(validRaw({ findings: [{ ...goodFinding, rating: 6 }] })), CompetitorInputError);
  assert.throws(() => validateReport(validRaw({ findings: [{ ...goodFinding, category: "ukendt" }] })), CompetitorInputError);
  assert.throws(() => validateReport(validRaw({ findings: [{ ...goodFinding, suggest: "ukendt" }] })), CompetitorInputError);
  const many = Array.from({ length: 25 }, (_, i) => ({ ...goodFinding, id: `f${i}` }));
  const report = validateReport(validRaw({ findings: many }));
  assert.equal(report.findings?.length, 20);
});

test("analyse-punkter kan bære valgfri kategori/suggest", async () => {
  await saveReport(validRaw());
  const analysis = await saveAnalysis({ model: "m", points: [{ title: "t", detail: "d", category: "geo", suggest: "annonce" }] });
  assert.equal(analysis.points[0].category, "geo");
  assert.equal(analysis.points[0].suggest, "annonce");
  await assert.rejects(saveAnalysis({ model: "m", points: [{ title: "t", detail: "d", category: "ukendt" }] }), CompetitorInputError);
});

test("analyse hæftes på nyeste rapport; nyt scan fjerner den; validering holder", async () => {
  await assert.rejects(saveAnalysis({ model: "m", points: [{ title: "t", detail: "d" }] }), CompetitorInputError);
  await saveReport(validRaw());
  await saveAnalysis({ model: "deepseek-v4-flash", points: [{ title: "Priser skjules", detail: "13 af 18 viser ingen pris." }] });
  assert.equal((await loadLatestReport())!.analysis!.points[0].title, "Priser skjules");
  assert.throws(() => validateReport({ ...validRaw(), analysis: {} }), CompetitorInputError); // scannet kan ikke selv sætte analyse
  await assert.rejects(saveAnalysis({ model: "m", points: [] }), CompetitorInputError);
  await assert.rejects(saveAnalysis({ model: "m", points: [{ title: "t", detail: "d", x: 1 }] }), CompetitorInputError);
  await saveReport(validRaw({ generatedAt: "2026-02-01T02:00:00.000Z" }));
  assert.equal((await loadLatestReport())!.analysis, undefined);
});
