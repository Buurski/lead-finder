import { test } from "node:test";
import assert from "node:assert/strict";
import { applyHandled, type InboxDigest } from "./inbox-digest.ts";

test("besvarede svar forbliver skjulte når oversigten bygges igen; nyere svar dukker op", () => {
  const item = { id: "a", account: "lucas", from: "x@y.dk", subject: "Re", snippet: "", category: "interested" as const, importance: 80, needsReply: true, reason: "", leadId: "42" };
  const d: InboxDigest = { generatedAt: "", generatedBy: "live-fallback", account: "all", items: [
    { ...item, date: "2026-09-20T10:00:00Z" },
    { ...item, id: "b", date: "2026-09-24T10:00:00Z" },
  ] };
  const out = applyHandled(d, { "42": "2026-09-23T12:00:00Z" });
  assert.deepEqual(out.items.map((i) => i.needsReply), [false, true]);
});
