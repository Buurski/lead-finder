// Lucas OS' læse-nøgle (spec §7): virker KUN på GET /api/agent/read?what=udgifter. Mod alt andet = 401.
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { authorizedRead, projectForLucasOs, readerOf, udgifterResponse } from "./lucas-os-read.ts";
import { __setStore, InMemoryStore, store } from "./store.ts";
import { EXPENSES_KEY } from "./expenses.ts";
import { hermesSignature } from "./hermes-hmac.ts";

const HERMES = "hermes-hemmelig-test";
const LOS = "lucas-os-laese-noegle-test";
process.env.HERMES_API_SECRET = HERMES;
process.env.LUCAS_OS_READ_SECRET = LOS;

beforeEach(() => __setStore(new InMemoryStore()));
after(() => __setStore(null));

function signed(path: string, secret: string, method = "GET") {
  const ts = String(Math.floor(Date.now() / 1000));
  return new Request(`http://localhost${path}`, { method, headers: { "x-timestamp": ts, authorization: `Bearer ${hermesSignature(secret, ts, method, path)}` } });
}

test("læse-nøgle: kun de fem visninger; Hermes-nøglen virker til alt; forkert nøgle aldrig", () => {
  for (const what of ["udgifter", "opmaerksomhed", "min-dag", "pipeline", "blog"]) {
    assert.equal(readerOf(signed(`/api/agent/read?what=${what}`, LOS), what), "lucas-os", what);
  }
  assert.equal(readerOf(signed("/api/agent/read?what=pipeline", HERMES), "pipeline"), "hermes");
  for (const what of ["sog", "customer-contacts", "replies", "kundeopdateringer", "feed", "cms", "blog-post", ""]) {
    assert.ok(!authorizedRead(signed(`/api/agent/read?what=${what}`, LOS), what), what);
    assert.ok(authorizedRead(signed(`/api/agent/read?what=${what}`, HERMES), what), `hermes ${what}`);
  }
  assert.ok(!authorizedRead(signed("/api/agent/read?what=udgifter", "forkert"), "udgifter"));
  // Signaturen dækker query: en udgifter-signatur kan ikke genbruges til pipeline.
  const r = signed("/api/agent/read?what=udgifter", LOS);
  const forged = new Request("http://localhost/api/agent/read?what=pipeline", { headers: r.headers });
  assert.ok(!authorizedRead(forged, "udgifter"));
});

test("udgifter-svar: count/checksum, øre, ingen note/ref", async () => {
  await store.append(EXPENSES_KEY, { id: "a", date: "2026-09-02", vendor: "Vercel", amount: 150.5, share: "selskab", payer: "lucas", ref: "<m@v>", note: "hemmelig note", source: "hermes" });
  const res = await udgifterResponse();
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.count, 1);
  assert.equal(body.expenses[0].amountOre, 15050);
  assert.ok(!JSON.stringify(body).includes("hemmelig note") && !JSON.stringify(body).includes("<m@v>"));
});

test("LUCAS_OS_READ_SECRET læses KUN i lucas-os-read.ts (ingen anden rute kan acceptere nøglen)", () => {
  const SRC = join(import.meta.dirname, "..");
  const hits = readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"))
    .filter((f) => readFileSync(join(SRC, f), "utf8").includes("LUCAS_OS_READ_SECRET"))
    .map((f) => f.replaceAll("\\", "/"));
  assert.deepEqual(hits, ["lib/lucas-os-read.ts"]);
  const route = readFileSync(join(SRC, "app/api/agent/read/route.ts"), "utf8");
  assert.match(route, /export async function GET/);
  assert.doesNotMatch(route, /export async function (POST|PUT|PATCH|DELETE)/);
});

test("V3-1: Lucas OS-nøglen får kun tilladte felter — ingen noter, links, id'er eller kontaktdata", () => {
  const p = projectForLucasOs("min-dag", { ok: true, today: "2026-09-30", items: [{ id: "t1", kind: "task", title: "Ring", company: "Salon X", companyId: "c1", note: "tlf 12345678 mail a@b.dk", due: "2026-10-01" }] });
  assert.deepEqual(p, { ok: true, today: "2026-09-30", items: [{ kind: "task", title: "Ring", company: "Salon X", due: "2026-10-01" }] });
  const b = projectForLucasOs("blog", { ok: true, cards: [{ id: "x", title: "T", stage: "idé", note: "intern", work: { a: 1 }, source: { url: "u" } }] });
  assert.deepEqual(b, { ok: true, cards: [{ title: "T", stage: "idé" }] });
  const a = projectForLucasOs("opmaerksomhed", { ok: true, items: [{ level: "høj", kind: "svar", text: "Svar Salon X", href: "/k/1", action: { x: 1 } }] });
  assert.deepEqual(a, { ok: true, items: [{ level: "høj", kind: "svar", text: "Svar Salon X" }] });
  assert.deepEqual(projectForLucasOs("customer-contacts", { ok: true, customers: [{ email: "a@b.dk" }] }), { ok: true, items: [] });
});
