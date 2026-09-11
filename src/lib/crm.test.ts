import test from "node:test";
import assert from "node:assert/strict";
import { assertCrmMutationRequest, encodedClientName, validDate, validText, CrmInputError } from "./crm.ts";
import { ccAuthMarker } from "./cc-auth.ts";
import { nextAction, type NextAction } from "./next-action.ts";
import type { DeckSummary } from "./deck.ts";

function summary(over: Partial<DeckSummary> = {}): DeckSummary {
  return {
    generatedAt: "2026-09-11T00:00:00.000Z",
    ok: true,
    numbers: { newLeads: 0, contactable: 0, sentToday: 0, repliesPending: 0, wonThisWeek: 0 },
    needsYou: [],
    queue: { count: 0, pending: 0, top: [] },
    pipeline: { totalDrafts: 0, pending: 0, approved: 0, rejected: 0, lastRunAt: null, source: "queue" },
    pulse: [], dailySent: [],
    revenue: { monthlyDKK: 0, setupDKK: 0, clientCount: 0, payingClientCount: 0, goalMonthlyDKK: 0 },
    pause: null, invoicesOverdue: 0,
    buckets: { indtjening: false, kunder: false, kalender: false, kommunikation: false, opgaver: false, moeder: false, viden: false },
    ...over,
  };
}

function withoutAuthEnv<T>(fn: () => T): T {
  const saved = {
    user: process.env.VERCEL_BASIC_AUTH_USER,
    pass: process.env.VERCEL_BASIC_AUTH_PASS,
    secret: process.env.AUTH_SESSION_SECRET,
  };
  delete process.env.VERCEL_BASIC_AUTH_USER;
  delete process.env.VERCEL_BASIC_AUTH_PASS;
  delete process.env.AUTH_SESSION_SECRET;
  try {
    return fn();
  } finally {
    if (saved.user !== undefined) process.env.VERCEL_BASIC_AUTH_USER = saved.user;
    if (saved.pass !== undefined) process.env.VERCEL_BASIC_AUTH_PASS = saved.pass;
    if (saved.secret !== undefined) process.env.AUTH_SESSION_SECRET = saved.secret;
  }
}

const CRM_URL = "https://kinly.test/api/crm/tasks";

test("CRM-keyen bevarer clientName og koder kun storage-segmentet", () => {
  const name = "Jernbane/caféen & Co.";
  assert.equal(decodeURIComponent(encodedClientName(name)), name);
  assert.notEqual(encodedClientName(name), name);
});

test("CRM-validering afviser tom tekst og ugyldige datoer", () => {
  assert.throws(() => validText("", "navn", 20), CrmInputError);
  assert.throws(() => validDate("2026-02-30"), CrmInputError);
  assert.equal(validDate("2026-09-11"), "2026-09-11");
  assert.equal(validDate(""), "");
});

test("CRM afviser kald uden Origin og cross-origin kald", async () => {
  await withoutAuthEnv(async () => {
    await assert.rejects(assertCrmMutationRequest(new Request(CRM_URL, { method: "POST" })), CrmInputError);
    await assert.rejects(
      assertCrmMutationRequest(new Request(CRM_URL, { method: "POST", headers: { origin: "https://evil.test" } })),
      CrmInputError,
    );
    await assert.doesNotReject(
      assertCrmMutationRequest(new Request(CRM_URL, { method: "POST", headers: { origin: "https://kinly.test" } })),
    );
  });
});

test("CRM kræver proxyens HMAC-marker når auth er konfigureret — og afviser forfalskning", async () => {
  const saved = {
    user: process.env.VERCEL_BASIC_AUTH_USER,
    pass: process.env.VERCEL_BASIC_AUTH_PASS,
    secret: process.env.AUTH_SESSION_SECRET,
  };
  try {
    process.env.VERCEL_BASIC_AUTH_USER = "test";
    process.env.VERCEL_BASIC_AUTH_PASS = "test";
    process.env.AUTH_SESSION_SECRET = "test-secret";
    const headers = { origin: "https://kinly.test" };
    // Uden marker og med klient-gættet "1" — begge skal afvises.
    await assert.rejects(assertCrmMutationRequest(new Request(CRM_URL, { method: "POST", headers })), CrmInputError);
    await assert.rejects(
      assertCrmMutationRequest(new Request(CRM_URL, { method: "POST", headers: { ...headers, "x-command-center-auth": "1" } })),
      CrmInputError,
    );
    // Kun den HMAC proxyen selv kan udlede accepteres.
    const marker = await ccAuthMarker("test-secret");
    await assert.doesNotReject(
      assertCrmMutationRequest(new Request(CRM_URL, { method: "POST", headers: { ...headers, "x-command-center-auth": marker } })),
    );
  } finally {
    if (saved.user === undefined) delete process.env.VERCEL_BASIC_AUTH_USER; else process.env.VERCEL_BASIC_AUTH_USER = saved.user;
    if (saved.pass === undefined) delete process.env.VERCEL_BASIC_AUTH_PASS; else process.env.VERCEL_BASIC_AUTH_PASS = saved.pass;
    if (saved.secret === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = saved.secret;
  }
});

test("CRM next-action deep-linker til den mest presserende opgave", () => {
  const numbers = { newLeads: 0, contactable: 4, sentToday: 0, repliesPending: 2, wonThisWeek: 0 };
  const withId: NextAction = nextAction({ ...summary({ numbers }), crm: { overdueTasks: 1, dueTasks: 0, overdueInvoices: 0, topTaskId: "task_9" } });
  assert.equal(withId.href, "/crm?task=task_9");
  assert.equal(withId.source, "crm");
  const withoutId: NextAction = nextAction({ ...summary({ numbers }), crm: { overdueTasks: 1, dueTasks: 0, overdueInvoices: 0 } });
  assert.equal(withoutId.href, "/crm");
  assert.match(withoutId.label, /forfaldne opgaver/);
});
