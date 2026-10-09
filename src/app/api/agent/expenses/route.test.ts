import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route.ts";
import { __setStore, InMemoryStore, store } from "../../../../lib/store.ts";
import { EXPENSES_KEY, PAYMENTS_KEY } from "../../../../lib/expenses.ts";
import { hermesSignature } from "../../../../lib/hermes-hmac.ts";

const HERMES = "test-hermes-hemmelig";
const BANK = "test-bank-hemmelig";
process.env.HERMES_API_SECRET = HERMES;
process.env.LUCAS_OS_EXPENSE_SECRET = BANK;
const PATH = "/api/agent/expenses";

beforeEach(() => __setStore(new InMemoryStore()));
after(() => __setStore(null));

type Body = { ok: boolean; added?: number; skipped?: number; rejected?: { index: number; error: string }[]; balance?: { owed: number } };
async function call(expenses: unknown[], secret: string) {
  const body = JSON.stringify({ expenses });
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await POST(new Request(`http://localhost${PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-timestamp": ts, authorization: `Bearer ${hermesSignature(secret, ts, "POST", PATH, body)}` },
    body,
  }));
  return { status: res.status, body: (await res.json()) as Body };
}
const row = (o: Record<string, unknown> = {}) => ({ date: "2026-10-02", vendor: "Vercel", amount: 151.17, share: "selskab", payer: "lucas", ref: "bank:nordea-1", ...o });

test("bank-nøglen opretter fælles bankudgift (source bank) og svarer med Charlies saldo", async () => {
  await store.append(PAYMENTS_KEY, { id: "p", date: "2026-09-26", amount: 880, from: "charlie" });
  const r = await call([row()], BANK);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.added, 1);
  assert.equal(r.body.balance?.owed, -804.41); // 151,17/2 − 880, rundet til øre
  const [saved] = await store.readAll(EXPENSES_KEY) as { source: string; ref: string }[];
  assert.equal(saved.source, "bank");
  assert.equal(saved.ref, "bank:nordea-1");
  const again = await call([row()], BANK);
  assert.equal(again.body.skipped, 1, "samme bankref to gange");
});

test("bank-nøglen afviser alt andet end fælles, Lucas betaler, ref bank:…, fra 27/9", async () => {
  const r = await call([
    row({ ref: "Vercel:1" }), row({ share: "charlie" }), row({ payer: "charlie" }), row({ date: "2026-09-26", ref: "bank:2" }),
  ], BANK);
  assert.equal(r.status, 200);
  assert.equal(r.body.added, 0);
  assert.equal(r.body.rejected?.length, 4);
  assert.equal((await store.readAll(EXPENSES_KEY)).length, 0);
});

test("Hermes-nøglen er uændret (mail-ref, Charlie betaler), forkert nøgle = 401", async () => {
  const h = await call([row({ ref: "chatgpt:2026-10", payer: "charlie", date: "2026-10-01", amount: 179 })], HERMES);
  assert.equal(h.body.added, 1, JSON.stringify(h.body));
  assert.equal((await call([row()], "forkert")).status, 401);
});
