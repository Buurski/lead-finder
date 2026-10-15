import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { freshTestDb } from "./db/test-db.ts";
import type { Db } from "./db/client.ts";
import { company, contact, leadReply } from "./db/schema.ts";
import { expireOldSnippets, replyCandidates, saveLeadReplies } from "./hq/lead-replies.ts";
import { saveCaptured, type RawReply } from "./capture-replies.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const raw = (over: Partial<RawReply>): RawReply => ({
  account: "lucas",
  messageId: "<m1@x>",
  threadId: null,
  receivedAt: new Date("2026-10-01T10:00:00Z"),
  subject: "Re: En lille hilsen",
  from: "a@salon.dk",
  source: "From: a@salon.dk\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nJa tak, ring gerne.",
  ...over,
});

async function seed() {
  const [a, b, c, d] = await db.insert(company).values([
    { rowNo: 1, name: "A", email: "A@Salon.dk", emailStatus: "replied" },
    { rowNo: 2, name: "B arkiveret", email: "b@x.dk", archived: true },
    { rowNo: 3, name: "C afmeldt", email: "c@x.dk", emailStatus: "unsubscribed" },
    { rowNo: 4, name: "D med kontakt", email: "" },
  ]).returning();
  await db.insert(contact).values({ companyId: d.id, name: "Værkfører", email: "Vaerk@d.dk" });
  return { a, b, c, d };
}

test("replyCandidates: lead- og kontaktmails lowercased; arkiverede og afmeldte udelades", async () => {
  const { a, d } = await seed();
  const m = await replyCandidates(db);
  assert.deepEqual([...m.entries()].sort(), [["a@salon.dk", a.id], ["vaerk@d.dk", d.id]]);
});

test("saveCaptured: gemmer nye, er idempotent, og tæller samme Message-ID fra begge konti én gang", async () => {
  const { a } = await seed();
  const byEmail = await replyCandidates(db);
  const both = [raw({}), raw({ account: "charlie" })];
  const first = await saveCaptured(db, both, byEmail);
  assert.equal(first.matched, 1);
  assert.equal(first.inserted, 1);
  assert.equal(first.companies, 1);
  assert.deepEqual(first.byCategory, { interested: 1 });
  const [row] = await db.select().from(leadReply);
  assert.equal(row.companyId, a.id);
  assert.equal(row.asksCall, true);
  assert.equal(row.snippet, "Ja tak, ring gerne.");

  const again = await saveCaptured(db, both, byEmail);
  assert.equal(again.existing, 1);
  assert.equal(again.inserted, 0);
  assert.equal((await db.select().from(leadReply)).length, 1);
});

test("saveCaptured dryRun: tæller men skriver intet", async () => {
  await seed();
  const r = await saveCaptured(db, [raw({})], await replyCandidates(db), { dryRun: true });
  assert.equal(r.wouldInsert, 1);
  assert.equal(r.inserted, 0);
  assert.equal((await db.select().from(leadReply)).length, 0);
});

test("saveCaptured: afsender uden kendt virksomhed gemmes ikke", async () => {
  await seed();
  const r = await saveCaptured(db, [raw({ from: "ukendt@x.dk" })], await replyCandidates(db));
  assert.equal(r.inserted, 0);
});

test("expireOldSnippets: nulstiller kun uddrag ældre end 180 dage, beholder metadata", async () => {
  const { a } = await seed();
  const old = new Date(Date.now() - 200 * 86_400_000);
  const young = new Date(Date.now() - 10 * 86_400_000);
  const base = { companyId: a.id, account: "lucas", threadId: null, subject: "", category: "other", asksCall: false };
  await saveLeadReplies(db, [
    { ...base, messageId: "<old>", receivedAt: old, snippet: "gammelt" },
    { ...base, messageId: "<young>", receivedAt: young, snippet: "nyt" },
  ]);
  assert.equal(await expireOldSnippets(db), 1);
  const [o] = await db.select().from(leadReply).where(eq(leadReply.messageId, "<old>"));
  const [y] = await db.select().from(leadReply).where(eq(leadReply.messageId, "<young>"));
  assert.equal(o.snippet, null);
  assert.equal(o.category, "other");
  assert.equal(y.snippet, "nyt");
});

test("saveCaptured dryRun virker før migrationen er kørt (lead_reply findes ikke); rigtig kørsel fejler stadig", async () => {
  await seed();
  const byEmail = await replyCandidates(db);
  await db.execute(sql`drop table lead_reply`);
  const r = await saveCaptured(db, [raw({})], byEmail, { dryRun: true });
  assert.equal(r.wouldInsert, 1);
  assert.equal(r.existing, 0);
  await assert.rejects(saveCaptured(db, [raw({})], byEmail));
});
