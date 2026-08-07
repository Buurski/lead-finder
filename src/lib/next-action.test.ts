import test from "node:test";
import assert from "node:assert/strict";
import { nextAction } from "./next-action.ts";
import type { DeckSummary } from "./deck.ts";

// Minimal DeckSummary — kun det stigen kigger på. Resten er nuller/tomme, så
// testen fejler hvis en ny gren begynder at læse noget udokumenteret.
function summary(over: Partial<DeckSummary> = {}): DeckSummary {
  return {
    generatedAt: "2026-07-31T00:00:00.000Z",
    ok: true,
    numbers: { newLeads: 0, contactable: 0, sentToday: 0, repliesPending: 0, wonThisWeek: 0 },
    needsYou: [],
    queue: { count: 0, pending: 0, top: [] },
    pipeline: { totalDrafts: 0, pending: 0, approved: 0, rejected: 0, lastRunAt: null, source: "queue" },
    pulse: [],
    dailySent: [],
    revenue: { monthlyDKK: 0, setupDKK: 0, clientCount: 0, payingClientCount: 0, goalMonthlyDKK: 0 },
    previews: { ready: 0, ok: true },
    feeds: [],
    clientHealth: { blocked: 0, liveWithoutFee: 0, ok: true },
    invoicesOverdue: 0,
    pause: null,
    buckets: { indtjening: false, kunder: false, kalender: false, kommunikation: false, moeder: false, opgaver: false, viden: true },
    ...over,
  };
}

test("svar slår alt andet", () => {
  const a = nextAction(summary({
    numbers: { newLeads: 0, contactable: 9, sentToday: 0, repliesPending: 2, wonThisWeek: 0 },
    queue: { count: 5, pending: 5, top: [] },
  }));
  assert.equal(a.source, "replies");
  assert.equal(a.priority, 1);
  assert.equal(a.href, "/replies");
  assert.ok(a.reason.length > 0);
});

test("stigen følger rækkefølgen svar → kø → udkast → brief → økonomi", () => {
  assert.equal(nextAction(summary({ queue: { count: 3, pending: 3, top: [] } })).source, "queue");
  assert.equal(nextAction(summary({ previews: { ready: 1, ok: true } })).source, "previews");
  assert.equal(nextAction(summary({ clientHealth: { blocked: 2, liveWithoutFee: 1, ok: true } })).source, "clients");
  assert.equal(nextAction(summary({ clientHealth: { blocked: 0, liveWithoutFee: 1, ok: true } })).source, "okonomi");
});

test("offline Sheets bliver aldrig en presserende handling", () => {
  // ok:false betyder tomme arrays, ikke "ingenting at lave".
  const a = nextAction(summary({ ok: false, clientHealth: { blocked: 0, liveWithoutFee: 0, ok: false } }));
  assert.equal(a.degraded, true);
  assert.equal(a.priority, 99);
  assert.equal(a.source, "none");
});

test("offline kilde blokerer ikke en pålidelig kø", () => {
  // Køen ligger lokalt, så den gælder selv når Sheets er nede.
  const a = nextAction(summary({ ok: false, queue: { count: 4, pending: 4, top: [] } }));
  assert.equal(a.source, "queue");
  assert.notEqual(a.degraded, true);
});

test("manglende previews-felt springes over i stedet for at tælle som nul", () => {
  const a = nextAction(summary({ previews: undefined, clientHealth: { blocked: 3, liveWithoutFee: 0, ok: true } }));
  assert.equal(a.source, "clients");
});

test("lead-opfølgning slår 'find nye leads'", () => {
  const withFollowUp = nextAction(summary({
    needsYou: [{ leadId: "1", name: "Salon Nord", branch: "frisør", kind: "reply", why: "svarede" }],
    numbers: { newLeads: 0, contactable: 40, sentToday: 0, repliesPending: 0, wonThisWeek: 0 },
  }));
  assert.equal(withFollowUp.priority, 6);
  assert.equal(withFollowUp.count, 1);

  const onlyContactable = nextAction(summary({
    numbers: { newLeads: 0, contactable: 40, sentToday: 0, repliesPending: 0, wonThisWeek: 0 },
  }));
  assert.equal(onlyContactable.priority, 7);
  assert.equal(onlyContactable.count, 40);
  assert.equal(onlyContactable.href, "/leadgen");
});

test("ro på ser anderledes ud end offline", () => {
  const calm = nextAction(summary());
  assert.equal(calm.priority, 8);
  assert.notEqual(calm.degraded, true);
  assert.notEqual(calm.href, nextAction(summary({ ok: false })).href);
});

test("count følger altid den handling der vandt", () => {
  const a = nextAction(summary({ previews: { ready: 4, ok: true }, queue: { count: 0, pending: 0, top: [] } }));
  assert.equal(a.count, 4);
  assert.equal(a.source, "previews");
});

const deadLeadgen = (days: number) => ([{
  key: "leadgen", label: "Nye leads", feeds: "godkendelseskøen", path: "data/leadgen.json",
  status: "dead" as const, at: "2026-07-06T20:10:37.630Z", ageHours: 24 * days, expectEveryHours: 24,
}]);

test("tavs lead-feed med FULD kø er gated, ikke i stykker", () => {
  // Den virkelige sag: 328 pending, motoren springer korrekt over hver morgen.
  const a = nextAction(summary({
    numbers: { newLeads: 0, contactable: 202, sentToday: 0, repliesPending: 0, wonThisWeek: 0 },
    queue: { count: 524, pending: 328, top: [] },
    feeds: deadLeadgen(25),
  }));
  // Køen vinder allerede på trin 2 her — men beskeden må aldrig kalde det en fejl.
  const gatedCase = nextAction(summary({
    numbers: { newLeads: 0, contactable: 202, sentToday: 0, repliesPending: 0, wonThisWeek: 0 },
    queue: { count: 524, pending: 0, top: [] },
    feeds: deadLeadgen(25),
  }));
  assert.equal(a.source, "queue");            // fuld kø er stadig trin 2
  assert.equal(gatedCase.degraded, true);     // tom kø + tavs motor = reel fejl
  assert.match(gatedCase.reason, /burde have kørt/);
});

test("tavs lead-feed med tom kø er en reel fejl", () => {
  const a = nextAction(summary({
    numbers: { newLeads: 0, contactable: 202, sentToday: 0, repliesPending: 0, wonThisWeek: 0 },
    feeds: deadLeadgen(25),
  }));
  assert.equal(a.priority, 7);
  assert.equal(a.degraded, true);
  assert.match(a.reason, /25 dage/);
  assert.notEqual(a.label, "Find nye leads");
});

test("frisk lead-feed lader stigen køre normalt", () => {
  const a = nextAction(summary({
    numbers: { newLeads: 0, contactable: 202, sentToday: 0, repliesPending: 0, wonThisWeek: 0 },
    feeds: [{ key: "leadgen", label: "Nye leads", feeds: "godkendelseskøen", path: "data/leadgen.json", status: "fresh" as const, at: "2026-07-31T06:00:00.000Z", ageHours: 6, expectEveryHours: 24 }],
  }));
  assert.equal(a.label, "Find nye leads");
  assert.notEqual(a.degraded, true);
});
