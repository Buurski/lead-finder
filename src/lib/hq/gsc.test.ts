import { test } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import { company } from "../db/schema.ts";
import { fetchGsc, gscWindow, latestGscFor, syncGsc, type GscQuery } from "./gsc.ts";

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
