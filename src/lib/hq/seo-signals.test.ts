import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { __setStore, InMemoryStore } from "../store.ts";
import type { CompetitorReport } from "./competitors.ts";
import {
  blogTraffic, compareWithCompetitors, geoCompetitorCounts, gscFlag, isMoneyQuery, loadBlogCheck, loadBlogReview, loadGeo,
  saveBlogCheck, saveBlogReview, saveGeo, seoActions, type KinlyGsc,
} from "./seo-signals.ts";

beforeEach(() => __setStore(new InMemoryStore()));
after(() => __setStore(null));

const geoRow = (o: Record<string, unknown> = {}) => ({ query: "webbureau herning", engine: "chatgpt", measuredAt: "2026-09-28T06:20:00Z", mentionedKinly: false, competitors: ["webko.dk", "klartstudio.dk"], ...o });

test("saveGeo: gemmer gyldige rækker; ukendte felter og forkerte typer afvises", async () => {
  await saveGeo([geoRow({ group: "lokal" }), geoRow({ query: "billig hjemmeside", mentionedKinly: true, competitors: [] })]);
  const run = await loadGeo();
  assert.equal(run?.results.length, 2);
  assert.equal(run?.results[0].group, "lokal");
  await assert.rejects(saveGeo([geoRow({ answer: "x" })]), /kendes ikke/);
  await assert.rejects(saveGeo([geoRow({ mentionedKinly: "ja" })]), /sand\/falsk/);
  await assert.rejects(saveGeo([]), /ikke-tom/);
  await assert.rejects(saveGeo([geoRow({ measuredAt: "i går" })]), /ISO-dato/);
});

test("saveBlogCheck: poster med spørgsmål valideres; ugyldigt svar afvises", async () => {
  const post = { id: "p1", title: "Hvad koster en hjemmeside", stage: "udgivet", keyword: "hjemmeside pris", seoIssues: ["Tilføj mindst 2 interne kinly.dk-links."], questions: [{ question: "hvad koster en hjemmeside", answer: "ja" }] };
  await saveBlogCheck("2026-09-28T07:00:00Z", [post]);
  assert.equal((await loadBlogCheck())?.posts[0].questions[0].answer, "ja");
  await assert.rejects(saveBlogCheck("2026-09-28T07:00:00Z", [{ ...post, questions: [{ question: "x", answer: "måske" }] }]), /ja eller delvist/);
  await assert.rejects(saveBlogCheck("2026-09-28T07:00:00Z", [{ ...post, extra: 1 }]), /kendes ikke/);
});

test("penge-søgninger og flag", () => {
  assert.equal(isMoneyQuery("webdesign herning"), true);
  assert.equal(isMoneyQuery("hjemmeside pris"), true);
  assert.equal(isMoneyQuery("kinly hjemmeside"), false);
  assert.equal(isMoneyQuery("frisør herning"), false);
  assert.equal(gscFlag({ clicks: 0, impressions: 50, position: 10 }), "side1-ingen-klik");
  assert.equal(gscFlag({ clicks: 1, impressions: 50, position: 10 }), null);
  assert.equal(gscFlag({ clicks: 0, impressions: 49, position: 4 }), null);
  assert.equal(gscFlag({ clicks: 0, impressions: 5, position: 14 }), "taet-paa-side1");
  assert.equal(gscFlag({ clicks: 0, impressions: 5, position: 21 }), null);
});

test("geoCompetitorCounts tæller hvert domæne én gang pr. spørgsmål", () => {
  const counts = geoCompetitorCounts([geoRow(), geoRow({ competitors: ["webko.dk", "webko.dk"] })] as never);
  assert.deepEqual(counts, [{ name: "webko.dk", count: 2 }, { name: "klartstudio.dk", count: 1 }]);
});

test("compareWithCompetitors: AI-byggere og umålte tæller ikke med", () => {
  const report = { competitors: [
    { name: "A", url: "https://a.dk", country: "DK", seoExtra: { faqVisible: true }, site: { https: true, schemaLocalBusiness: true, hasPrices: false } },
    { name: "B", url: "https://b.dk", country: "DK", seoExtra: { faqVisible: false } },
    { name: "Wix", url: "https://wix.com", country: "andet", kind: "ai-bygger", seoExtra: { faqVisible: true } },
  ] } as unknown as CompetitorReport;
  const rows = compareWithCompetitors(report);
  assert.deepEqual(rows.find((r) => r.key === "faq"), { key: "faq", label: "Synlig FAQ", kinly: true, have: 1, measured: 2 });
  assert.deepEqual(rows.find((r) => r.key === "prices")?.measured, 1);
  assert.equal(compareWithCompetitors(null).every((r) => r.measured === 0), true);
});

test("seoActions: regler i fast rækkefølge, maks 6, ingen ved tomme data", () => {
  assert.deepEqual(seoActions({ gsc: null, geo: null, blog: null, compare: [] }), []);
  const gsc = { queries: [
    { query: "webdesign herning", clicks: 0, impressions: 120, position: 6.2, prevClicks: null, prevPosition: null },
    { query: "webbureau herning", clicks: 1, impressions: 90, position: 13.4, prevClicks: 0, prevPosition: 18 },
    { query: "kinly", clicks: 30, impressions: 60, position: 1, prevClicks: 20, prevPosition: 1 },
  ] } as KinlyGsc;
  const geo = { receivedAt: "", results: [geoRow({ competitors: [] }), geoRow({ query: "hjemmeside til frisør" }), geoRow({ query: "x", mentionedKinly: true })] };
  const blog = { checkedAt: "", posts: [{ id: "p1", title: "Pris", stage: "udgivet", keyword: "pris", seoIssues: [], questions: [{ question: "hvad koster det", answer: "nej" as const }] }] };
  const compare = [{ key: "prices" as const, label: "Synlige priser", kinly: false, have: 2, measured: 5 }];
  const a = seoActions({ gsc, geo, blog, compare });
  assert.deepEqual(a.map((x) => x.id), ["gsc-klik-webdesign herning", "gsc-side1-webbureau herning", "geo-hjemmeside til frisør", "geo-webbureau herning", "blog-p1", "konk-prices"]);
  assert.equal(a[1].blog?.category, "lokal-synlighed");
  assert.equal(a[2].blog?.category, "ai-soegning");
  assert.match(a[2].detail, /webko\.dk, klartstudio\.dk/);
  assert.match(a[4].detail, /hvad koster det/);
});

test("blogTraffic: side matches på slug, indeks på url; under 14 dage = for tidligt", () => {
  const gsc = {
    fetchedAt: "2026-10-05T06:00:00Z", property: "sc-domain:kinly.dk", periodStart: "2026-09-05", periodEnd: "2026-10-02",
    totals: { clicks: 0, impressions: 0, position: null }, prevTotals: { clicks: 0, impressions: 0, position: null }, queries: [],
    pages: [{ path: "/blog/pris/", clicks: 3, impressions: 50, position: 9.3, prev: null, topQueries: [] }],
    index: [{ url: "https://kinly.dk/blog/pris/", indexed: true, coverage: "Indsendt og indekseret", lastCrawl: null }],
  } satisfies KinlyGsc;
  const posts = [
    { id: "1", title: "Pris", slug: "pris", publishedAt: "2026-09-10T08:00:00Z", publishedUrl: "https://kinly.dk/blog/pris" },
    { id: "2", title: "Ny", slug: "ny", publishedAt: "2026-09-27T08:00:00Z", publishedUrl: "https://kinly.dk/blog/ny/" },
  ];
  const [a, b] = blogTraffic(posts, gsc, "2026-10-05");
  assert.equal(a.page?.clicks, 3);
  assert.equal(a.index?.indexed, true);
  assert.equal(a.tooEarlyUntil, null);
  assert.equal(b.page, null);
  assert.equal(b.index, null);
  assert.equal(b.tooEarlyUntil, "2026-10-11");
  assert.equal(blogTraffic(posts, null, "2026-10-05")[0].page, null);
});

test("saveBlogReview: ok kræver punkter; for-tidligt uden; lofter og ukendte felter", async () => {
  await saveBlogReview({ reviewedAt: "2026-10-05T07:00:00Z", status: "for-tidligt", measured: 1 });
  assert.equal((await loadBlogReview())?.status, "for-tidligt");
  const pts = Array.from({ length: 6 }, (_, i) => ({ title: `p${i}`, detail: "d" }));
  const r = await saveBlogReview({ reviewedAt: "2026-10-05T07:00:00Z", status: "ok", measured: 3, points: pts, suggestions: [{ post: "Pris", change: "Tilføj graf", from: "Anmeldelser" }] });
  assert.equal(r.points.length, 4);
  assert.equal(r.suggestions[0].from, "Anmeldelser");
  await assert.rejects(saveBlogReview({ reviewedAt: "2026-10-05T07:00:00Z", status: "ok", measured: 3, points: [] }), /points mangler/);
  await assert.rejects(saveBlogReview({ reviewedAt: "2026-10-05T07:00:00Z", status: "ok", measured: 3, points: [{ title: "x", detail: "y", extra: 1 }] }), /kendes ikke/);
  await assert.rejects(saveBlogReview({ reviewedAt: "x", status: "ok", measured: 3, points: pts }), /ISO-dato/);
});