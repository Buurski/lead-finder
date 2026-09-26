import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route.ts";
import { __setDb, type Db } from "../../../../../lib/db/client.ts";
import { freshTestDb } from "../../../../../lib/db/test-db.ts";
import { createPost, updatePost } from "../../../../../lib/hq/posts.ts";
import { __setStore, InMemoryStore } from "../../../../../lib/store.ts";
import { hermesSignature } from "../../../../../lib/hermes-hmac.ts";

const SECRET = "test-hemmelig-hmac";
process.env.HERMES_API_SECRET = SECRET;
process.env.DATA_BACKEND = "pg";
const PATH = "/api/agent/posts/image";
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
  __setStore(new InMemoryStore());
});
after(() => {
  __setDb(null);
  __setStore(null);
});

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
  return { status: res.status, body: (await res.json()) as { ok: boolean; url?: string; error?: string } };
};

test("gyldig PNG gemmes og giver en url; samme bytes to gange giver samme url", async () => {
  const p = await createPost(db, { title: "Graf-test", category: "pris" }, "hermes");
  const payload = { id: p.id, slot: "a", mime: "image/png", data: PNG.toString("base64") };
  const r1 = await call(payload);
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.match(r1.body.url!, new RegExp(`blog/${p.id}/a-[0-9a-f]{12}\\.png$`));
  const r2 = await call(payload);
  assert.equal(r2.body.url, r1.body.url);
});

test("forkert signatur, forkert format, ukendt slot og ukendt kort afvises", async () => {
  const p = await createPost(db, { title: "Graf-test", category: "pris" }, "hermes");
  const ok = { id: p.id, slot: "a", mime: "image/png", data: PNG.toString("base64") };
  assert.equal((await call(ok, "forkert")).status, 401);
  assert.equal((await call({ ...ok, mime: "image/svg+xml" })).status, 400);
  assert.equal((await call({ ...ok, mime: "image/webp" })).status, 400); // PNG-bytes mærket webp
  assert.equal((await call({ ...ok, slot: "../x" })).status, 400);
  assert.equal((await call({ ...ok, data: Buffer.from("<svg onload=x>").toString("base64") })).status, 400);
  assert.ok([400, 404].includes((await call({ ...ok, id: "00000000-0000-4000-8000-000000000000" })).status));
});

test("kort i publicer er låst for agent-upload", async () => {
  const p = await createPost(db, { title: "Låst", category: "pris" }, "hermes");
  await db.update((await import("../../../../../lib/db/schema.ts")).blogPost).set({ stage: "publicer" });
  void updatePost;
  const r = await call({ id: p.id, slot: "a", mime: "image/png", data: PNG.toString("base64") });
  assert.equal(r.status, 400);
});
