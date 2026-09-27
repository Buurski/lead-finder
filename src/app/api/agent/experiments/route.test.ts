import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route.ts";
import { __setStore, InMemoryStore } from "../../../../lib/store.ts";
import { __setGscFactory, createExperiment, listExperiments } from "../../../../lib/hq/experiments.ts";
import { saveGeo } from "../../../../lib/hq/seo-signals.ts";
import { hermesSignature } from "../../../../lib/hermes-hmac.ts";

const SECRET = "test-hemmelig-hmac";
process.env.HERMES_API_SECRET = SECRET;
const PATH = "/api/agent/experiments";

beforeEach(() => {
  __setStore(new InMemoryStore());
  __setGscFactory(async () => async () => [{ clicks: 4, impressions: 90, position: 6.2 }]);
});
after(() => {
  __setStore(null);
  __setGscFactory(null);
});

function signed(body: string, secret = SECRET) {
  const ts = String(Math.floor(Date.now() / 1000));
  return new Request(`http://localhost${PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-timestamp": ts, authorization: `Bearer ${hermesSignature(secret, ts, "POST", PATH, body)}` },
    body,
  });
}
type Body = { ok: boolean; error?: string; experiments?: { id: string; status: string }[]; experiment?: { status: string }; geoQueries?: string[]; measurement?: Record<string, unknown> };
const call = async (payload: unknown, secret?: string) => {
  const res = await POST(signed(JSON.stringify(payload), secret));
  return { status: res.status, body: (await res.json()) as Body };
};
const seed = () => createExperiment({ title: "Lokale ord i title", source: { kind: "seo", from: "seo" } }, "lucas");

test("list giver vurderes/tester + geo-spørgsmålene", async () => {
  await seed();
  await saveGeo([{ query: "webbureau herning", engine: "chatgpt", measuredAt: "2026-09-28T06:20:00Z", mentionedKinly: false, competitors: [] }]);
  const r = await call({ action: "list" });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.experiments?.length, 1);
  assert.deepEqual(r.body.geoQueries, ["webbureau herning"]);
});

test("review → plan → klar via agenten", async () => {
  const e = await seed();
  const rv = await call({ action: "review", id: e.id, review: { scores: [{ navn: "relevans", rating: 4, conf: 0.8 }], verdict: "test", reason: "God idé." } });
  assert.equal(rv.status, 200, JSON.stringify(rv.body));
  const pl = await call({ action: "plan", id: e.id, plan: { hypothesis: "h", change: "c", metric: { type: "gsc_query", target: "webdesign herning" }, days: 14, success: "s" } });
  assert.equal(pl.body.experiment?.status, "klar");
});

test("agenten kan ikke starte, beholde, afvise eller slette", async () => {
  const e = await seed();
  for (const action of ["start", "keep", "drop", "delete", "decide"]) {
    const r = await call({ action, id: e.id });
    assert.equal(r.status, 400, action);
  }
  assert.equal((await listExperiments())[0].status, "vurderes");
  // resultat kan kun skrives på en test der kører, og kun som behold/drop/uklart — aldrig beholdt/afvist.
  assert.equal((await call({ action: "result", id: e.id, outcome: { verdict: "behold", summary: "x" } })).status, 400);
  assert.equal((await call({ action: "review", id: e.id, review: { scores: [], verdict: "beholdt", reason: "x" } })).status, 400);
});

test("measure: gsc via udskiftelig klient, geo fra seo-doc, validering", async () => {
  const g = await call({ action: "measure", metric: { type: "gsc_query", target: "webdesign herning" }, start: "2026-09-18", end: "2026-09-24" });
  assert.equal(g.status, 200, JSON.stringify(g.body));
  assert.equal(g.body.measurement?.clicks, 4);
  const geo = await call({ action: "measure", metric: { type: "geo", target: "ukendt" } });
  assert.match(String(geo.body.measurement?.note), /ikke med/);
  assert.equal((await call({ action: "measure", metric: { type: "gsc_page", target: "x" }, start: "i går", end: "2026-09-24" })).status, 400);
  assert.equal((await call({ action: "measure", metric: { type: "manuel", target: "x" } })).status, 400);
});

test("usigneret ⇒ 401; ukendt felt ⇒ 400; for stor ⇒ 413", async () => {
  assert.equal((await call({ action: "list" }, "forkert")).status, 401);
  assert.equal((await POST(new Request(`http://localhost${PATH}`, { method: "POST", body: "{}" }))).status, 401);
  assert.equal((await call({ action: "list", extra: 1 })).status, 400);
  assert.equal((await POST(new Request(`http://localhost${PATH}`, { method: "POST", body: "x".repeat(20_001) }))).status, 413);
});
