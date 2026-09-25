import { test } from "node:test";
import assert from "node:assert/strict";
import { newsletterInsights, NewsletterInputError, parseSnapshot, type CampaignStat } from "./newsletter.ts";

const now = new Date("2026-09-25T12:00:00Z");
const c = (o: Partial<CampaignStat>): CampaignStat => ({ id: 1, name: "[nyhedsbrev] x", type: "nyhedsbrev", status: "sent", sentAt: null, scheduledAt: null, recipients: 1000, opens: 400, clicks: 50, unsubscribes: 2, hardBounces: 3, softBounces: 2, complaints: 0, ...o });

test("parseSnapshot: afviser ukendte felter og mailadresser (ingen persondata i HQ)", () => {
  const ok = parseSnapshot({ account: "ikast", companyId: null, generatedAt: "2026-09-25T10:00:00Z", lists: [{ id: 1, name: "Kunder", subscribers: 1558 }], campaigns: [c({ sentAt: "2026-09-01T08:00:00Z" })], domain: { name: "ikastautoservice.dk", authenticated: true } });
  assert.equal(ok.lists[0].subscribers, 1558);
  assert.throws(() => parseSnapshot({ account: "ikast", lists: [{ id: 1, name: "x", subscribers: 1, emails: ["a@b.dk"] }], campaigns: [] }), NewsletterInputError);
  assert.throws(() => parseSnapshot({ account: "ikast", lists: [{ id: 1, name: "Test til allan@ikast.dk", subscribers: 1 }], campaigns: [] }), /må ikke indeholde "@"/);
  // "@" afvises i den fulde tekst — også når afkortning ville have skjult det (Sol w4a-r3 R3-04).
  assert.throws(() => parseSnapshot({ account: "ikast", lists: [{ id: 1, name: "Allan@ikast", subscribers: 1 }], campaigns: [] }), /"@"/);
  assert.equal(ok.generatedAt, "2026-09-25T10:00:00.000Z");
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
  assert.match(texts, /planlagt 10 dage efter forrige/);
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

test("abonnenter: batch-lister og Brevos standardlister dobbelttælles ikke", async () => {
  const { newsletterInsights } = await import("./newsletter.ts");
  const lists = [
    { id: 1, name: "Kunder A+B (navneskift 2026)", subscribers: 1558 },
    { id: 2, name: "Tilmeldt via hjemmeside", subscribers: 2 },
    { id: 3, name: "[service] Mail1 navneskift batch 7", subscribers: 300 },
    { id: 4, name: "identified_contacts", subscribers: 0 },
    { id: 5, name: "Your first list", subscribers: 1 },
  ];
  assert.equal(newsletterInsights({ lists, campaigns: [], domain: null }).subscribers, 1560);
});

test("insights: to planlagte med for kort afstand og årsloft med planlagte (Sol w4a-r3 R3-03)", () => {
  const i = newsletterInsights({ lists: [], campaigns: [c({ id: 1, status: "scheduled", scheduledAt: "2026-11-04T08:00:00Z", name: "A" }), c({ id: 2, status: "scheduled", scheduledAt: "2026-11-05T08:00:00Z", name: "B" })], domain: null }, now);
  const t = i.flags.map((f) => f.text).join(" | ");
  assert.match(t, /"B" er planlagt 1 dage efter forrige/);
  assert.doesNotMatch(t, /"A" er planlagt/);
  const months = ["2025-12-01", "2026-02-01", "2026-04-01", "2026-06-01", "2026-08-01"];
  const j = newsletterInsights({ lists: [], campaigns: [...months.map((d, n) => c({ id: n, sentAt: `${d}T08:00:00Z` })), c({ id: 10, status: "scheduled", scheduledAt: "2026-10-15T08:00:00Z", name: "Seks" }), c({ id: 11, status: "scheduled", scheduledAt: "2026-11-20T08:00:00Z", name: "Syv" })], domain: null }, now);
  const u = j.flags.map((f) => f.text).join(" | ");
  assert.doesNotMatch(u, /"Seks" bliver/);
  assert.match(u, /"Syv" bliver udsendelse nr. 7/);
});
