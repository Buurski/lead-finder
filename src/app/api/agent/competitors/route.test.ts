import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { POST } from "./route.ts";
import { __setStore, InMemoryStore } from "../../../../lib/store.ts";
import { loadLatestReport } from "../../../../lib/hq/competitors.ts";
import { hermesSignature } from "../../../../lib/hermes-hmac.ts";

const SECRET = "test-hemmelig-hmac";
process.env.HERMES_API_SECRET = SECRET;
const PATH = "/api/agent/competitors";

beforeEach(() => {
  __setStore(new InMemoryStore());
});
after(() => {
  __setStore(null);
});

function validReport(overrides: Record<string, unknown> = {}) {
  return {
    generatedAt: "2026-09-21T02:00:00.000Z",
    jevCalls: 6,
    competitors: [{ name: "Bureau A", url: "https://bureau-a.dk", country: "DK" }],
    patterns: [],
    gaps: [{ title: "Ingen viser priser", detail: "Kun 1 ud af 5 har synlig pris.", kind: "pris" }],
    ...overrides,
  };
}

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
  return { status: res.status, body: (await res.json()) as { ok: boolean; error?: string; generatedAt?: string; competitors?: number } };
};

test("gyldig rapport gemmes og kan læses tilbage som latest", async () => {
  const r = await call({ action: "save", report: validReport() });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.competitors, 1);
  const latest = await loadLatestReport();
  assert.equal(latest?.generatedAt, "2026-09-21T02:00:00.000Z");
});

test("forkert signatur afvises", async () => {
  const r = await call({ action: "save", report: validReport() }, "forkert");
  assert.equal(r.status, 401);
});

test("ukendt action afvises", async () => {
  const r = await call({ action: "delete", report: validReport() });
  assert.equal(r.status, 400);
});

test("ugyldig rapport (forkert kind) afvises med 400, gemmer intet", async () => {
  const r = await call({ action: "save", report: validReport({ gaps: [{ title: "x", detail: "y", kind: "ukendt" }] }) });
  assert.equal(r.status, 400);
  assert.equal(await loadLatestReport(), null);
});

test("for stor body afvises med 413 uden at røre HMAC", async () => {
  const huge = "x".repeat(400_001);
  const res = await POST(new Request(`http://localhost${PATH}`, { method: "POST", body: huge }));
  assert.equal(res.status, 413);
});

test("rapport med de nye felter (kind, findings) gemmes end-to-end via agent-ruten", async () => {
  const r = await call({
    action: "save",
    report: validReport({
      competitors: [{ name: "Bygger AS", url: "https://bygger.dk", country: "DK", kind: "ai-bygger", aiBuilder: { priceFromText: "99 kr/md", aiFeatures: true } }],
      findings: [{ id: "f1", category: "alternativ", title: "AI-byggere er billigere", detail: "Fra 99 kr/md.", rating: 5, evidence: ["Bygger AS"], suggest: "kinly-dk" }],
    }),
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const latest = await loadLatestReport();
  assert.equal(latest?.competitors[0].kind, "ai-bygger");
  assert.equal(latest?.findings?.[0].suggest, "kinly-dk");
});

test("ugyldig JSON afvises med 400", async () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const body = "{not json";
  const req = new Request(`http://localhost${PATH}`, {
    method: "POST",
    headers: { "x-timestamp": ts, authorization: `Bearer ${hermesSignature(SECRET, ts, "POST", PATH, body)}` },
    body,
  });
  assert.equal((await POST(req)).status, 400);
});
