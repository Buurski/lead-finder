import { test } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import { company } from "../db/schema.ts";
import { fetchGsc, fetchKinlyGsc, gscWindow, inspectBlogUrls, latestGscFor, syncGsc, type GscQuery } from "./gsc.ts";

const denied = Object.assign(new Error("forbidden"), { code: 403 });

// Falsk GSC: kun "https://ikast.dk/" er delt; én dag med data i vinduet.
const fake: GscQuery = async (property, body) => {
  if (property !== "https://ikast.dk/") throw denied;
  if (!body.dimensions) return [{ clicks: 100, impressions: 2000, position: 7.34 }];
  if (body.dimensions[0] === "query") return [{ keys: ["autoværksted ikast"], clicks: 40, impressions: 300, position: 3.26 }];
  return [{ keys: ["2026-09-20"], clicks: 5, impressions: 60, position: 4 }];
};

test("gscWindow: 28 dage der slutter 3 dage før i dag; 90 dages dagserie", () => {
  assert.deepEqual(gscWindow("2026-09-25"), { start: "2026-08-26", end: "2026-09-22", dailyStart: "2026-06-25" });
});

test("fetchGsc: prøver domæne- og URL-ejendomme, runder, fylder tomme dage med 0", async () => {
  const s = (await fetchGsc(fake, "ikast.dk", "2026-09-25"))!;
  assert.equal(s.property, "https://ikast.dk/");
  assert.deepEqual([s.clicks, s.impressions, s.position], [100, 2000, 7.3]);
  assert.equal(s.topQueries[0].query, "autoværksted ikast");
  assert.equal(s.daily.length, 90);
  assert.equal(s.daily.find((d) => d.date === "2026-09-20")?.clicks, 5);
  assert.equal(s.daily[0].clicks, 0);
  assert.equal(await fetchGsc(fake, "andet.dk", "2026-09-25"), null);
  await assert.rejects(fetchGsc(async () => { throw Object.assign(new Error("quota"), { code: 429 }); }, "ikast.dk", "2026-09-25"), /quota/);
});

test("fetchKinlyGsc: 28 dage mod de 28 før, pr. søgning med forrige position; ingen adgang ⇒ property null", async () => {
  const seen: string[] = [];
  const q: GscQuery = async (property, body) => {
    if (property !== "sc-domain:kinly.dk") throw denied;
    seen.push(`${body.startDate}..${body.endDate}${body.dimensions ? ` ${body.dimensions.join("+")}` : ""}${body.dimensionFilterGroups ? " /blog/" : ""}`);
    const prev = body.startDate === "2026-07-29";
    if (!body.dimensions) return [{ clicks: prev ? 4 : 9, impressions: prev ? 200 : 410, position: 14.26 }];
    if (body.dimensions.join() === "page") return prev
      ? [{ keys: ["https://kinly.dk/blog/pris/"], clicks: 1, impressions: 30, position: 12.04 }, { keys: ["https://kinly.dk/blog/gammel/"], clicks: 2, impressions: 9, position: 20 }]
      : [{ keys: ["https://kinly.dk/blog/pris/"], clicks: 3, impressions: 50, position: 9.26 }];
    if (body.dimensions.join() === "page,query") return [
      { keys: ["https://kinly.dk/blog/pris/", "pris hjemmeside"], clicks: 0, impressions: 20, position: 8 },
      { keys: ["https://kinly.dk/blog/pris/", "hvad koster en hjemmeside"], clicks: 2, impressions: 10, position: 6 },
      { keys: ["https://kinly.dk/blog/pris/", "a"], clicks: 0, impressions: 1, position: 30 },
      { keys: ["https://kinly.dk/blog/pris/", "b"], clicks: 1, impressions: 5, position: 11 },
    ];
    return prev ? [{ keys: ["webdesign herning"], clicks: 1, impressions: 40, position: 15.04 }]
      : [{ keys: ["webdesign herning"], clicks: 0, impressions: 80, position: 8.44 }, { keys: ["kinly"], clicks: 9, impressions: 20, position: 1 }];
  };
  const k = await fetchKinlyGsc(q, "2026-09-25");
  assert.deepEqual(seen, [
    "2026-08-26..2026-09-22", "2026-07-29..2026-08-25", "2026-08-26..2026-09-22 query", "2026-07-29..2026-08-25 query",
    "2026-08-26..2026-09-22 page /blog/", "2026-07-29..2026-08-25 page /blog/", "2026-08-26..2026-09-22 page+query /blog/", "2026-06-25..2026-09-22 date",
  ]);
  // Blog-sider: forrige periode med, side der er faldet til 0 bevares, top-3 søgeord efter klik.
  assert.deepEqual(k.pages?.[0], {
    path: "/blog/pris/", clicks: 3, impressions: 50, position: 9.3, prev: { clicks: 1, impressions: 30, position: 12 },
    topQueries: [{ query: "hvad koster en hjemmeside", clicks: 2, impressions: 10, position: 6 }, { query: "b", clicks: 1, impressions: 5, position: 11 }, { query: "pris hjemmeside", clicks: 0, impressions: 20, position: 8 }],
  });
  assert.deepEqual(k.pages?.[1], { path: "/blog/gammel/", clicks: 0, impressions: 0, position: null, prev: { clicks: 2, impressions: 9, position: 20 }, topQueries: [] });
  assert.equal(k.property, "sc-domain:kinly.dk");
  assert.deepEqual([k.totals.clicks, k.prevTotals.clicks, k.totals.position], [9, 4, 14.3]);
  assert.deepEqual(k.queries[0], { query: "webdesign herning", clicks: 0, impressions: 80, position: 8.4, prevClicks: 1, prevPosition: 15 });
  assert.equal(k.queries[1].prevPosition, null);
  const none = await fetchKinlyGsc(fake, "2026-09-25");
  assert.equal(none.property, null);
  assert.deepEqual(none.queries, []);
});

test("inspectBlogUrls: PASS = indekseret, ellers dækning/crawl; fejl på én url er en fejl, ikke 'ikke indekseret'", async () => {
  const r = await inspectBlogUrls(async (prop, url) => {
    assert.equal(prop, "sc-domain:kinly.dk");
    if (url.endsWith("/a/")) return { verdict: "PASS", coverageState: "Indsendt og indekseret", lastCrawlTime: "2026-09-26T10:00:00Z" };
    if (url.endsWith("/b/")) return { verdict: "NEUTRAL", coverageState: "Webadressen er ikke kendt af Google" };
    throw Object.assign(new Error("quota"), { code: 429 });
  }, "sc-domain:kinly.dk", ["https://kinly.dk/blog/a/", "https://kinly.dk/blog/b/", "https://kinly.dk/blog/c/"]);
  assert.deepEqual(r, [
    { url: "https://kinly.dk/blog/a/", indexed: true, coverage: "Indsendt og indekseret", lastCrawl: "2026-09-26T10:00:00Z" },
    { url: "https://kinly.dk/blog/b/", indexed: false, coverage: "Webadressen er ikke kendt af Google", lastCrawl: null },
    { url: "https://kinly.dk/blog/c/", indexed: false, coverage: "", lastCrawl: null, error: "429" },
  ]);
});

test("syncGsc: gemmer for kunder med adgang, 'ingen adgang' er ikke en fejl, ikke-kunder springes over", async () => {
  const db = await freshTestDb();
  const [ikast] = await db.insert(company).values({ rowNo: 1, name: "Ikast", website: "https://www.ikast.dk/", clientNo: 5 }).returning({ id: company.id });
  await db.insert(company).values({ rowNo: 2, name: "Uden GSC", website: "andet.dk", clientNo: 6 });
  await db.insert(company).values({ rowNo: 3, name: "Lead", website: "ikast.dk" });
  const r = await syncGsc(db, fake, "2026-09-25");
  assert.deepEqual(r.map((x) => [x.company, x.ok, x.error ?? x.property]), [["Ikast", true, "https://ikast.dk/"], ["Uden GSC", true, "ingen adgang"]]);
  const { latest, previous } = await latestGscFor(db, ikast.id);
  assert.equal(latest?.clicks, 100);
  assert.equal(previous, null);
});

test("syncGsc: anden måling laver 'seo-opdatering' + opgave ved fald (dommer injiceret)", async () => {
  const db = await freshTestDb();
  const { activity, task } = await import("../db/schema.ts");
  const { diffGsc } = await import("./gsc-updates.ts");
  await db.insert(company).values({ rowNo: 1, name: "Ikast", clientNo: 7, website: "https://ikast.dk" });
  const judge = async () => ({ handling: true, kunde: false, jev: false });
  await syncGsc(db, fake, "2026-09-18", judge);
  assert.equal((await db.select().from(activity)).length, 0, "første måling: intet at sammenligne med");
  const worse: GscQuery = async (p, b) => (b.dimensions ? fake(p, b) : (await fake(p, b)).map((r) => ({ ...r, clicks: 60, position: 9.1 })));
  await syncGsc(db, worse, "2026-09-25", judge);
  const [a] = await db.select().from(activity);
  assert.equal(a.type, "seo-opdatering");
  assert.match(a.summary ?? "", /Klik faldt 40 %/);
  const [t] = await db.select().from(task);
  assert.match(t.title, /^SEO: Ikast — Klik faldt/);
  // Støj filtreres fra: små udsving giver ingen ændringer.
  const base = { clicks: 100, impressions: 2000, position: 5, topQueries: [] };
  assert.deepEqual(diffGsc(base, { ...base, clicks: 108, position: 5.3 }), []);
});
