import test from "node:test";
import assert from "node:assert/strict";
import { assertCrmMutationRequest, encodedClientName, validDate, validText, CrmInputError } from "./crm.ts";
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

test("CRM mutationer afviser cross-origin browser-kald", () => {
  assert.throws(() => assertCrmMutationRequest(new Request("https://kinly.test/api/crm/tasks", { method: "POST", headers: { origin: "https://evil.test" } })), CrmInputError);
  assert.doesNotThrow(() => assertCrmMutationRequest(new Request("https://kinly.test/api/crm/tasks", { method: "POST", headers: { origin: "https://kinly.test" } })));
});

test("production CRM mutationer kræver proxyens auth-marker", () => {
  const previous = { env: process.env.VERCEL_ENV, user: process.env.VERCEL_BASIC_AUTH_USER, pass: process.env.VERCEL_BASIC_AUTH_PASS, secret: process.env.AUTH_SESSION_SECRET };
  try {
    process.env.VERCEL_ENV = "production";
    process.env.VERCEL_BASIC_AUTH_USER = "test";
    process.env.VERCEL_BASIC_AUTH_PASS = "test";
    process.env.AUTH_SESSION_SECRET = "test";
    assert.throws(() => assertCrmMutationRequest(new Request("https://kinly.test/api/crm/tasks", { method: "POST" })), CrmInputError);
    assert.doesNotThrow(() => assertCrmMutationRequest(new Request("https://kinly.test/api/crm/tasks", { method: "POST", headers: { "x-command-center-auth": "1" } })));
  } finally {
    if (previous.env === undefined) delete process.env.VERCEL_ENV; else process.env.VERCEL_ENV = previous.env;
    if (previous.user === undefined) delete process.env.VERCEL_BASIC_AUTH_USER; else process.env.VERCEL_BASIC_AUTH_USER = previous.user;
    if (previous.pass === undefined) delete process.env.VERCEL_BASIC_AUTH_PASS; else process.env.VERCEL_BASIC_AUTH_PASS = previous.pass;
    if (previous.secret === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = previous.secret;
  }
});

test("CRM next-action prioriterer forfaldne opgaver foran øvrige feeds", () => {
  const action: NextAction = nextAction({ ...summary({ numbers: { newLeads: 0, contactable: 4, sentToday: 0, repliesPending: 2, wonThisWeek: 0 } }), crm: { overdueTasks: 1, dueTasks: 0, overdueInvoices: 0 } });
  assert.equal(action.href, "/crm");
  assert.equal(action.source, "crm");
  assert.match(action.label, /forfaldne opgaver/);
});
