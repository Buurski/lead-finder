import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { __setStore, InMemoryStore } from "../store.ts";
import { CompetitorInputError } from "./competitors.ts";
import {
  MAX_ACTIVE, createExperiment, decideExperiment, deleteExperiment, listExperiments, measureGeo, measureGsc,
  planExperiment, reviewExperiment, saveBaseline, saveResult, startExperiment,
} from "./experiments.ts";

beforeEach(() => __setStore(new InMemoryStore()));
after(() => __setStore(null));

const input = (title = "Test lange title-tags med lokale ord") => ({
  title, detail: "Konkurrenterne har bynavne i title.", source: { kind: "seo", from: "konkurrent", url: "https://bureau-a.dk", competitor: "Bureau A" },
});
const review = (verdict: "test" | "drop") => ({ scores: [{ navn: "relevans", rating: 4, conf: 0.8 }], verdict, reason: "Relevant for lokale kunder." });
const plan = { hypothesis: "Bynavne i title giver flere klik.", change: "Skriv title om på /webdesign-herning.", metric: { type: "gsc_page", target: "https://kinly.dk/webdesign-herning" }, days: 7, success: "Flere klik end ugen før." };
const rejects = (p: Promise<unknown>) => assert.rejects(p, CompetitorInputError);

test("hele livsløbet: vurderes → klar → tester → resultat → beholdt", async () => {
  const e = await createExperiment(input(), "lucas");
  assert.equal(e.status, "vurderes");
  assert.equal(e.createdBy, "lucas");
  assert.equal((await reviewExperiment(e.id, review("test"))).status, "vurderes");
  assert.equal((await planExperiment(e.id, plan)).status, "klar");
  const started = await startExperiment(e.id, new Date("2026-09-28T08:00:00Z"));
  assert.equal(started.status, "tester");
  assert.equal(started.test?.endsAt, "2026-10-05T08:00:00.000Z");
  await saveBaseline(e.id, { at: "2026-09-28T09:00:00Z", window: { start: "2026-09-18", end: "2026-09-24" }, clicks: 2, impressions: 80, ctr: 0.025, position: 9.1 });
  await rejects(saveBaseline(e.id, { at: "2026-09-28T09:00:00Z" })); // kun én baseline
  const res = await saveResult(e.id, { at: "2026-10-08T09:00:00Z", clicks: 5, impressions: 120, position: 7.4 }, { verdict: "behold", summary: "Klik 2 → 5." });
  assert.equal(res.status, "resultat");
  assert.equal(res.outcome?.verdict, "behold");
  assert.equal((await decideExperiment(e.id, "behold")).status, "beholdt");
});

test("review drop ⇒ droppet med grund; kan ikke planlægges bagefter", async () => {
  const e = await createExperiment(input(), "lucas");
  const d = await reviewExperiment(e.id, review("drop"));
  assert.equal(d.status, "droppet");
  assert.equal(d.review?.reason, "Relevant for lokale kunder.");
  await rejects(planExperiment(e.id, plan));
});

test("forkerte overgange afvises", async () => {
  const e = await createExperiment(input(), "lucas");
  await rejects(startExperiment(e.id)); // ikke klar endnu
  await rejects(planExperiment(e.id, plan)); // intet review
  await rejects(decideExperiment(e.id, "behold")); // intet resultat
  await rejects(saveResult(e.id, null, { verdict: "behold", summary: "x" })); // tester ikke
  await rejects(startExperiment("findes-ikke"));
});

test("streng validering: ukendte felter, forkert metrik, forkert kilde", async () => {
  await rejects(createExperiment({ ...input(), extra: 1 }, "lucas"));
  await rejects(createExperiment({ ...input(), source: { kind: "seo", from: "andet" } }, "lucas"));
  await rejects(createExperiment({ ...input(), source: { kind: "seo", from: "seo", url: "javascript:alert(1)" } }, "lucas"));
  await rejects(createExperiment({ ...input(), title: "  " }, "lucas"));
  const e = await createExperiment(input(), "lucas");
  await reviewExperiment(e.id, review("test"));
  await rejects(planExperiment(e.id, { ...plan, metric: { type: "gsc_page", target: "https://evil.dk/" } }));
  await rejects(planExperiment(e.id, { ...plan, metric: { type: "tal", target: "x" } }));
  await rejects(planExperiment(e.id, { ...plan, days: 30 }));
  await rejects(reviewExperiment(e.id, { ...review("test"), scores: [{ navn: "x", rating: 9, conf: 0.8 }] }));
  const long = await createExperiment({ ...input("x".repeat(500)), detail: "y".repeat(5000) }, "lucas");
  assert.equal(long.title.length, 120);
  assert.equal(long.detail.length, 1000);
});

test("samme titel mens aktiv ⇒ samme test (dobbeltklik); maks aktive; slet", async () => {
  const a = await createExperiment(input(), "lucas");
  const b = await createExperiment(input("TEST LANGE TITLE-TAGS MED LOKALE ORD"), "charlie");
  assert.equal(a.id, b.id);
  for (let i = (await listExperiments()).length; i < MAX_ACTIVE; i++) await createExperiment(input(`idé ${i}`), "lucas");
  await rejects(createExperiment(input("en for meget"), "lucas"));
  await deleteExperiment(a.id);
  assert.equal((await listExperiments()).some((e) => e.id === a.id), false);
  await rejects(deleteExperiment(a.id));
});

test("measureGsc: filter, tal og ingen adgang", async () => {
  const calls: { property: string; body: unknown }[] = [];
  const q = async (property: string, body: unknown) => {
    calls.push({ property, body });
    return [{ clicks: 3, impressions: 150, position: 8.46 }];
  };
  const m = await measureGsc(q, "gsc_query", "webdesign herning", "2026-09-18", "2026-09-24");
  assert.deepEqual({ clicks: m.clicks, impressions: m.impressions, ctr: m.ctr, position: m.position }, { clicks: 3, impressions: 150, ctr: 0.02, position: 8.5 });
  assert.equal(calls[0].property, "sc-domain:kinly.dk");
  assert.deepEqual((calls[0].body as { dimensionFilterGroups: unknown }).dimensionFilterGroups, [{ filters: [{ dimension: "query", operator: "equals", expression: "webdesign herning" }] }]);
  const none = await measureGsc(async () => { throw Object.assign(new Error("nej"), { code: 403 }); }, "gsc_page", "https://kinly.dk/", "2026-09-18", "2026-09-24");
  assert.match(none.note ?? "", /adgang/);
});

test("measureGeo finder spørgsmålet uanset store/små bogstaver", () => {
  const geo = { receivedAt: "x", results: [{ query: "Webbureau Herning", engine: "chatgpt", measuredAt: "2026-09-28T06:20:00Z", mentionedKinly: true, competitors: [] }] };
  assert.deepEqual(measureGeo(geo, "webbureau herning"), { at: "2026-09-28T06:20:00Z", mentioned: true });
  assert.match(measureGeo(geo, "andet").note ?? "", /ikke med/);
  assert.match(measureGeo(null, "x").note ?? "", /ikke med/);
});
