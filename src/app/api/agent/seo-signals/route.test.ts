import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route.ts";
import { __setStore, InMemoryStore } from "../../../../lib/store.ts";
import { loadBlogCheck, loadGeo } from "../../../../lib/hq/seo-signals.ts";
import { hermesSignature } from "../../../../lib/hermes-hmac.ts";

const SECRET = "test-hemmelig-hmac";
process.env.HERMES_API_SECRET = SECRET;
const PATH = "/api/agent/seo-signals";

beforeEach(() => __setStore(new InMemoryStore()));
after(() => __setStore(null));

function signed(body: string, secret = SECRET) {
  const ts = String(Math.floor(Date.now() / 1000));
  return new Request(`http://localhost${PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-timestamp": ts, authorization: `Bearer ${hermesSignature(secret, ts, "POST", PATH, body)}` },
    body,
  });
}
const call = async (payload: unknown, secret?: string) => {
  const res = await POST(signed(JSON.stringify(payload), secret));
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; results?: number; posts?: number } };
};
const geo = { action: "geo", results: [{ query: "webbureau herning", group: "lokal", engine: "chatgpt", measuredAt: "2026-09-28T06:20:00Z", mentionedKinly: true, competitors: ["webko.dk"] }] };
const blog = { action: "blogcheck", checkedAt: "2026-09-28T07:00:00Z", posts: [{ id: "p1", title: "Pris", stage: "udgivet", keyword: "pris", seoIssues: [], questions: [] }] };

test("geo gemmes og kan læses tilbage", async () => {
  const r = await call(geo);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.results, 1);
  assert.equal((await loadGeo())?.results[0].mentionedKinly, true);
});

test("blogcheck gemmes og kan læses tilbage", async () => {
  const r = await call(blog);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal((await loadBlogCheck())?.posts[0].id, "p1");
});

test("usigneret/forkert signatur ⇒ 401, intet gemt", async () => {
  assert.equal((await call(geo, "forkert")).status, 401);
  const res = await POST(new Request(`http://localhost${PATH}`, { method: "POST", body: JSON.stringify(geo) }));
  assert.equal(res.status, 401);
  assert.equal(await loadGeo(), null);
});

test("ukendt action, ukendt topfelt og ugyldig række ⇒ 400", async () => {
  assert.equal((await call({ action: "slet" })).status, 400);
  assert.equal((await call({ ...geo, extra: 1 })).status, 400);
  assert.equal((await call({ action: "geo", results: [{ query: "x" }] })).status, 400);
  assert.equal((await call([1, 2])).status, 400);
  assert.equal(await loadGeo(), null);
});

test("for stor body ⇒ 413", async () => {
  const res = await POST(new Request(`http://localhost${PATH}`, { method: "POST", body: "x".repeat(200_001) }));
  assert.equal(res.status, 413);
});
