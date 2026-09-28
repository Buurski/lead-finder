import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { POST } from "./route.ts";
import { __setStore, InMemoryStore } from "../../../../lib/store.ts";
import { hentMaaling } from "../../../../lib/hq/kunde-rapport.ts";
import { hermesSignature } from "../../../../lib/hermes-hmac.ts";

const SECRET = "test-hemmelig-hmac";
process.env.HERMES_API_SECRET = SECRET;
const PATH = "/api/agent/kunde-rapport";
const ikast = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "../../../../lib/hq/fixtures/kunde-maaling-ikast.json"), "utf-8"));

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
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; domaene?: string; maaned?: string } };
};

test("sendbar måling gemmes under domæne + dansk måned", async () => {
  const r = await call({ action: "maaling", maaling: ikast });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.domaene, "ikastautoservice.dk");
  assert.equal(r.body.maaned, "2026-09");
  assert.ok(await hentMaaling("ikastautoservice.dk", "2026-09"));
});

test("blokeret kørsel afvises med 422 og gemmes ikke", async () => {
  const r = await call({ action: "maaling", maaling: { ...ikast, status_flag: "blokeret", kan_sendes: false } });
  assert.equal(r.status, 422);
  assert.equal(await hentMaaling("ikastautoservice.dk", "2026-09"), null);
});

test("forkert signatur ⇒ 401, ukendt action ⇒ 400, intet gemt", async () => {
  assert.equal((await call({ action: "maaling", maaling: ikast }, "forkert")).status, 401);
  assert.equal((await call({ action: "slet" })).status, 400);
  assert.equal(await hentMaaling("ikastautoservice.dk", "2026-09"), null);
});
