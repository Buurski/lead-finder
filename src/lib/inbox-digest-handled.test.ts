import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHandled, normalizeDigest, type InboxDigest } from "./inbox-digest.ts";

test("besvarede svar forbliver skjulte når oversigten bygges igen; nyere svar dukker op", () => {
  const item = { id: "a", account: "lucas", from: "x@y.dk", subject: "Re", snippet: "", category: "interested" as const, importance: 80, needsReply: true, reason: "", leadId: "42" };
  const d: InboxDigest = { generatedAt: "", generatedBy: "live-fallback", account: "all", items: [
    { ...item, date: "2026-09-20T10:00:00Z" },
    { ...item, id: "b", date: "2026-09-24T10:00:00Z" },
  ] };
  const out = applyHandled(d, { "42": "2026-09-23T12:00:00Z" });
  assert.deepEqual(out.items.map((i) => i.needsReply), [false, true]);
});

test("fjernede meddelelser droppes helt — også uden leadId", () => {
  const d: InboxDigest = { generatedAt: "", generatedBy: "cowork-opus", account: "all", items: [
    { id: "bosch1", account: "lucas", from: "allan@ikastautoservice.dk", subject: "Re: FW: Bosch billeder", snippet: "", date: "2026-08-28T09:03:36Z", category: "interested", importance: 90, needsReply: false, reason: "" },
    { id: "keep1", account: "lucas", from: "x@y.dk", subject: "Hej", snippet: "", date: "2026-09-24T06:00:00Z", category: "question", importance: 80, needsReply: true, reason: "" },
  ] };
  const out = applyHandled(d, {}, { bosch1: "2026-09-24T09:00:00Z" });
  assert.deepEqual(out.items.map((i) => i.id), ["keep1"]);
});

test("sortering: vigtighed først, derefter nyeste dato", () => {
  const item = { account: "lucas", from: "x@y.dk", subject: "S", snippet: "", category: "question" as const, needsReply: true, reason: "" };
  const d = normalizeDigest({
    items: [
      { ...item, id: "gammel-80", importance: 80, date: "2026-09-20T10:00:00Z" },
      { ...item, id: "ny-80", importance: 80, date: "2026-09-24T10:00:00Z" },
      { ...item, id: "gammel-90", importance: 90, date: "2026-09-19T10:00:00Z" },
    ],
  });
  assert.deepEqual(d.items.map((i) => i.id), ["gammel-90", "ny-80", "gammel-80"]);
});

test("threadSummary og threadCount bevares gennem normalizeDigest", () => {
  const d = normalizeDigest({
    items: [
      {
        id: "a", account: "lucas", from: "allan@ikastautoservice.dk", subject: "Re: Google-profilen",
        snippet: "en dag i næste uge", date: "2026-09-24T05:38:17Z", category: "question",
        importance: 92, needsReply: true, reason: "Allan foreslår et besøg",
        threadSummary: "Allan bekræfter besøg i næste uge; videoen mangler.", threadCount: 5,
      },
    ],
  });
  assert.equal(d.items[0].threadSummary, "Allan bekræfter besøg i næste uge; videoen mangler.");
  assert.equal(d.items[0].threadCount, 5);
});

test("markering med millisekunder skjuler svar uden (VPS-format) — regression 26/9", () => {
  const d: InboxDigest = normalizeDigest({ items: [
    { id: "m1", from: "a@b.dk", date: "2026-09-24T05:38:17Z", needsReply: true, leadId: "7", category: "client" },
    { id: "m2", from: "a@b.dk", date: "2026-09-24T07:38:17+02:00", needsReply: true, leadId: "8", category: "client" },
  ] }) as InboxDigest;
  // HQ gemmer new Date(date).toISOString() → "…17.000Z"
  const fjernet = applyHandled(d, {}, { m1: "2026-09-24T05:38:17.000Z", m2: "2026-09-24T05:38:17.000Z" });
  assert.equal(fjernet.items.length, 0);
  const svaret = applyHandled(d, { "7": "2026-09-24T05:38:17.000Z" });
  assert.equal(svaret.items.find((i) => i.id === "m1")!.needsReply, false);
  // et NYERE svar dukker stadig op
  const nyt = applyHandled(d, {}, { m1: "2026-09-24T05:38:16.000Z" });
  assert.ok(nyt.items.some((i) => i.id === "m1"));
});
