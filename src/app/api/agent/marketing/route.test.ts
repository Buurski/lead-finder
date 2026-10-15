import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "./route.ts";
import { __setDb, type Db } from "../../../../lib/db/client.ts";
import { freshTestDb } from "../../../../lib/db/test-db.ts";
import { marketingDraft } from "../../../../lib/db/schema.ts";
import { createDraft } from "../../../../lib/hq/marketing.ts";
import { hermesSignature } from "../../../../lib/hermes-hmac.ts";

const SECRET = "test-hemmelig-hmac";
process.env.HERMES_API_SECRET = SECRET;
process.env.DATA_BACKEND = "pg";
const PATH = "/api/agent/marketing";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});
after(() => __setDb(null));

function signed(method: "GET" | "POST", body = "", opts: { secret?: string; search?: string } = {}) {
  const ts = String(Math.floor(Date.now() / 1000));
  const search = opts.search ?? "";
  return new Request(`http://localhost${PATH}${search}`, {
    method,
    headers: { "content-type": "application/json", "x-timestamp": ts, authorization: `Bearer ${hermesSignature(opts.secret ?? SECRET, ts, method, PATH + search, body)}` },
    ...(method === "POST" ? { body } : {}),
  });
}
type PostBody = { ok: boolean; error?: string; draft?: { status: string; source: string; createdBy: string; priority: number } };
const post = async (payload: unknown, secret?: string) => {
  const res = await POST(signed("POST", JSON.stringify(payload), { secret }));
  return { status: res.status, body: (await res.json()) as PostBody };
};
const rows = () => db.select().from(marketingDraft);

test("forkert signatur og ingen signatur afvises, og intet skrives", async () => {
  assert.equal((await post({ title: "x" }, "forkert-hemmelighed")).status, 401);
  const unsigned = await POST(new Request(`http://localhost${PATH}`, { method: "POST", body: JSON.stringify({ title: "x" }) }));
  assert.equal(unsigned.status, 401);
  assert.equal((await GET(new Request(`http://localhost${PATH}`))).status, 401);
  assert.equal((await GET(signed("GET", "", { secret: "forkert-hemmelighed" }))).status, 401);
  assert.equal((await rows()).length, 0);
});

test("signatur over en anden krop afvises (kroppen er bundet til signaturen)", async () => {
  const req = signed("POST", JSON.stringify({ title: "a" }));
  const tampered = new Request(req.url, { method: "POST", headers: req.headers, body: JSON.stringify({ title: "b" }) });
  assert.equal((await POST(tampered)).status, 401);
  assert.equal((await rows()).length, 0);
});

test("gyldig POST laver kun en kladde (status kladde, source agent, createdBy hermes)", async () => {
  const r = await post({ title: "Dag 1 af at bygge Kinly", track: "dag-n", hook: "Dag 1.", script: "tekst", lengthS: 70 });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.draft?.status, "kladde");
  assert.equal(r.body.draft?.source, "agent");
  assert.equal(r.body.draft?.createdBy, "hermes");
  const all = await rows();
  assert.equal(all.length, 1);
  assert.equal(all[0].status, "kladde");
  assert.equal(all[0].track, "dag-n");
});

test("agenten kan ikke godkende, prioritere, planlaegge eller saette ok-felter", async () => {
  const forbidden = [{ status: "godkendt" }, { status: "postet" }, { priority: 1 }, { plannedFor: "2026-10-20" }, { charlieOk: true }, { customerOk: true }, { trueCheckedOn: "2026-10-15" }, { createdBy: "lucas" }, { musicLicense: "erhverv-ok" }, { customerCase: false }];
  for (const extra of forbidden) {
    const r = await post({ title: "x", ...extra });
    assert.equal(r.status, 400, JSON.stringify(extra));
  }
  assert.equal((await rows()).length, 0);
});

test("trending lyd afvises ogsaa fra agenten; ugyldig JSON og for stor krop", async () => {
  assert.equal((await post({ title: "x", musicKind: "trending" })).status, 400);
  const bad = await POST(signed("POST", "{ikke json"));
  assert.equal(bad.status, 400);
  const big = await POST(signed("POST", "x".repeat(120_001)));
  assert.equal(big.status, 413);
});

test("GET laeser kladder (med statusfilter) og aendrer intet", async () => {
  await createDraft(db, { title: "a", hook: "h" }, "lucas");
  const res = await GET(signed("GET"));
  const body = (await res.json()) as { ok: boolean; drafts: unknown[]; tests: unknown[] };
  assert.equal(res.status, 200);
  assert.equal(body.drafts.length, 1);
  const filtered = await GET(signed("GET", "", { search: "?status=godkendt" }));
  assert.equal(((await filtered.json()) as { drafts: unknown[] }).drafts.length, 0);
  assert.equal((await GET(signed("GET", "", { search: "?status=hej" }))).status, 400);
  assert.equal((await rows()).length, 1);
});
