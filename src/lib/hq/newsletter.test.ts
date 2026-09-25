import { test } from "node:test";
import assert from "node:assert/strict";
import { newsletterInsights, NewsletterInputError, parseSnapshot, type CampaignStat } from "./newsletter.ts";

const now = new Date("2026-09-25T12:00:00Z");
const c = (o: Partial<CampaignStat>): CampaignStat => ({ id: 1, name: "[nyhedsbrev] x", type: "nyhedsbrev", status: "sent", sentAt: null, scheduledAt: null, recipients: 1000, opens: 400, clicks: 50, unsubscribes: 2, hardBounces: 3, softBounces: 2, complaints: 0, ...o });

test("parseSnapshot: afviser ukendte felter og mailadresser (ingen persondata i HQ)", () => {
  const ok = parseSnapshot({ account: "ikast", companyId: null, generatedAt: "2026-09-25T10:00:00Z", lists: [{ id: 1, name: "Kunder", subscribers: 1558 }], campaigns: [c({ sentAt: "2026-09-01T08:00:00Z" })], domain: { name: "ikastautoservice.dk", authenticated: true } });
  assert.equal(ok.lists[0].subscribers, 1558);
  assert.throws(() => parseSnapshot({ account: "ikast", lists: [{ id: 1, name: "x", subscribers: 1, emails: ["a@b.dk"] }], campaigns: [] }), NewsletterInputError);
  assert.throws(() => parseSnapshot({ account: "ikast", lists: [{ id: 1, name: "Test til allan@ikast.dk", subscribers: 1 }], campaigns: [] }), /mailadresse/);
  assert.throws(() => parseSnapshot({ account: "ikast", lists: [], campaigns: [], contacts: [] }), /ukendt felt/);
  assert.throws(() => parseSnapshot({ account: "ikast", lists: [], campaigns: [{ ...c({}), recipients: -1 }] }), NewsletterInputError);
});

test("insights: kadence (30 dage, maks 6/år), procenter og flag", () => {
  const sent = [
    c({ id: 1, sentAt: "2026-09-10T08:00:00Z", unsubscribes: 9, hardBounces: 25, complaints: 2 }),
    c({ id: 2, sentAt: "2026-06-01T08:00:00Z", type: "seo" }),
  ];
  const i = newsletterInsights({ lists: [{ id: 1, name: "a", subscribers: 900 }, { id: 2, name: "b", subscribers: 100 }], campaigns: [...sent, c({ id: 3, status: "scheduled", scheduledAt: "2026-09-20T08:00:00Z" }), c({ id: 4, status: "draft" })], domain: { name: "x.dk", authenticated: false } }, now);
  assert.equal(i.subscribers, 1000);
  assert.equal(i.sentLastYear, 2);
  assert.equal(i.daysSinceLast, 15);
  assert.equal(i.nextAllowedAt, "2026-10-10T08:00:00.000Z");
  assert.equal(i.drafts.length, 1);
  assert.equal(i.byType.seo, 1);
  assert.equal(i.sent[0].bounceRate, 0.027);
  const texts = i.flags.map((f) => f.text).join(" | ");
  assert.match(texts, /planlagt før næste tilladte/);
  assert.match(texts, /spamklager/);
  assert.match(texts, /bounce/);
  assert.match(texts, /afmeldte/);
  assert.match(texts, /ikke godkendt/);
});

test("insights: 6 på et år skubber næste tilladte til den ældstes årsdag", () => {
  const months = ["2025-10-20", "2025-12-01", "2026-02-01", "2026-04-01", "2026-06-01", "2026-08-01"];
  const i = newsletterInsights({ lists: [], campaigns: months.map((d, n) => c({ id: n, sentAt: `${d}T08:00:00Z` })), domain: null }, now);
  assert.equal(i.sentLastYear, 6);
  assert.equal(i.nextAllowedAt, "2026-10-20T08:00:00.000Z");
});
