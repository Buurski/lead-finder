// cc-auth.test.ts — skrive-guarden: proxy-marker + eksplicit same-origin.
// Samme tillidskæde som CRM-ruterne; testene dækker både uden og med auth-env.

import test from "node:test";
import assert from "node:assert/strict";
import { assertWriteRequest, ccAuthMarker } from "./cc-auth.ts";

const ORIGIN = "https://lead.example.com";

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://lead.example.com/api/invoices/001/status", { headers });
}

async function withAuthEnv(fn: () => Promise<void>): Promise<void> {
  const saved = {
    u: process.env.VERCEL_BASIC_AUTH_USER,
    p: process.env.VERCEL_BASIC_AUTH_PASS,
    s: process.env.AUTH_SESSION_SECRET,
  };
  process.env.VERCEL_BASIC_AUTH_USER = "u";
  process.env.VERCEL_BASIC_AUTH_PASS = "p";
  process.env.AUTH_SESSION_SECRET = "test-secret";
  try {
    await fn();
  } finally {
    if (saved.u === undefined) delete process.env.VERCEL_BASIC_AUTH_USER; else process.env.VERCEL_BASIC_AUTH_USER = saved.u;
    if (saved.p === undefined) delete process.env.VERCEL_BASIC_AUTH_PASS; else process.env.VERCEL_BASIC_AUTH_PASS = saved.p;
    if (saved.s === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = saved.s;
  }
}

test("assertWriteRequest: afviser kald uden Origin", async () => {
  await assert.rejects(assertWriteRequest(req()), /Origin/);
});

test("assertWriteRequest: afviser cross-origin", async () => {
  await assert.rejects(assertWriteRequest(req({ origin: "https://evil.example.com" })), /cross-origin/);
});

test("assertWriteRequest: afviser sec-fetch-site cross-site", async () => {
  await assert.rejects(assertWriteRequest(req({ origin: ORIGIN, "sec-fetch-site": "cross-site" })), /cross-site/);
});

test("assertWriteRequest: uden auth-env er same-origin nok", async () => {
  await assertWriteRequest(req({ origin: ORIGIN }));
});

test("assertWriteRequest: med auth-env kræves gyldig marker", async () => {
  await withAuthEnv(async () => {
    await assert.rejects(assertWriteRequest(req({ origin: ORIGIN })), /Command Center/);
    await assert.rejects(assertWriteRequest(req({ origin: ORIGIN, "x-command-center-auth": "falsk" })), /Command Center/);
    const marker = await ccAuthMarker("test-secret");
    await assertWriteRequest(req({ origin: ORIGIN, "x-command-center-auth": marker }));
  });
});
