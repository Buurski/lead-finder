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
