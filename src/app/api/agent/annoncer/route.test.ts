import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "./route.ts";
import { __setStore, InMemoryStore } from "../../../../lib/store.ts";
import { bestil, loadAnnoncer } from "../../../../lib/hq/annoncer.ts";
import { hermesSignature } from "../../../../lib/hermes-hmac.ts";

const SECRET = "test-hemmelig-hmac";
process.env.HERMES_API_SECRET = SECRET;
const PATH = "/api/agent/annoncer";

beforeEach(() => __setStore(new InMemoryStore()));
after(() => __setStore(null));

function signed(method: "GET" | "POST", body = "", secret = SECRET) {
  const ts = String(Math.floor(Date.now() / 1000));
  return new Request(`http://localhost${PATH}`, {
    method,
    headers: { "content-type": "application/json", "x-timestamp": ts, authorization: `Bearer ${hermesSignature(secret, ts, method, PATH, body)}` },
    ...(method === "POST" ? { body } : {}),
  });
}

test("forkert signatur giver 401", async () => {
  assert.equal((await GET(signed("GET", "", "forkert"))).status, 401);
  assert.equal((await POST(signed("POST", "{}", "forkert"))).status, 401);
});

test("GET giver oversigt", async () => {
  const r = await GET(signed("GET"));
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.ok(Array.isArray(j.godkendte) && Array.isArray(j.tests) && Array.isArray(j.bestillinger));
});

test("POST kan kun markere bestillinger", async () => {
  const nej = await POST(signed("POST", JSON.stringify({ action: "beslutning", slug: "x", status: "godkendt" })));
  assert.equal(nej.status, 400);
  const [b] = await bestil({ gruppe: loadAnnoncer()[0].gruppe, onske: "test" }, "lucas");
  const ja = await POST(signed("POST", JSON.stringify({ action: "bestillingStatus", id: b.id, status: "lavet", note: "klar" })));
  assert.equal(ja.status, 200);
  assert.equal((await ja.json()).bestillinger[0].status, "lavet");
  assert.equal((await POST(signed("POST", "ikke json"))).status, 400);
});
