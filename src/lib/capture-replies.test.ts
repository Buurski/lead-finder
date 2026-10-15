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

test("replyCandidates: leadStatus afmeldt spærrer, og en afmeldt adresse er spærret globalt (også på en anden virksomhed/kontakt) (Sol 15/10)", async () => {
  const [, , z] = await db.insert(company).values([
    { rowNo: 11, name: "X afmeldt via leadStatus", email: "x@x.dk", emailStatus: "replied", leadStatus: " Afmeldt " },
    { rowNo: 12, name: "Y samme adresse som afmeldt", email: "X@X.dk" },
    { rowNo: 13, name: "Z kontakt med afmeldt adresse", email: "" },
  ]).returning();
  await db.insert(contact).values({ companyId: z.id, name: "K", email: "x@x.dk" });
  assert.equal((await replyCandidates(db)).size, 0);
});

test("replyCandidates: adresse delt af to aktive virksomheder kan ikke henføres og udelades; lead-mail slår kontakt-mail", async () => {
  const [p, q, r] = await db.insert(company).values([
    { rowNo: 21, name: "P", email: "fælles@x.dk" },
    { rowNo: 22, name: "Q", email: "fælles@x.dk" },
    { rowNo: 23, name: "R", email: "r@x.dk" },
  ]).returning();
  await db.insert(contact).values([{ companyId: p.id, name: "K1", email: "r@x.dk" }, { companyId: q.id, name: "K2", email: "k@x.dk" }]);
  const m = await replyCandidates(db);
  assert.equal(m.has("fælles@x.dk"), false);
  assert.equal(m.get("r@x.dk"), r.id); // egen adresse vinder over P's kontakt
  assert.equal(m.get("k@x.dk"), q.id);
});

test("captureWindowDays: 1-365 helt tal, alt andet giver 30 (aldrig et større vindue)", async () => {
  const { captureWindowDays } = await import("./hq/lead-replies.ts");
  assert.equal(captureWindowDays({ days: 365 }), 365);
  assert.equal(captureWindowDays({ days: 1 }), 1);
  for (const bad of [{ days: 366 }, { days: 0 }, { days: -5 }, { days: 1.5 }, { days: "365" }, { days: null }, {}, null, undefined, "x"]) assert.equal(captureWindowDays(bad), 30, JSON.stringify(bad));
});

test("safeError: aldrig SQL-parametre fra en drizzle-fejl", async () => {
  const { safeError } = await import("./hq/lead-replies.ts");
  const err = Object.assign(new Error('Failed query: insert into "lead_reply" ... params: ja tak, ring til mig 12345678'), { name: "DrizzleQueryError", cause: Object.assign(new Error("duplicate key value\nDETAIL: Key (x)=(y)"), { code: "23505" }) });
  const s = safeError(err);
  assert.match(s, /23505/);
  assert.doesNotMatch(s, /ring til mig|12345678|params/);
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
  assert.equal(row.fromEmail, "a@salon.dk"); // afsenderadressen gemmes (lowercased)

  const again = await saveCaptured(db, both, byEmail);
  assert.equal(again.existing, 1);
  assert.equal(again.inserted, 0);
  assert.equal((await db.select().from(leadReply)).length, 1);
});

test("ældre række uden afsender får den udfyldt ved næste scan, og en udfyldt række overskrives aldrig", async () => {
  const { a } = await seed();
  await db.insert(leadReply).values([
    { companyId: a.id, account: "lucas", messageId: "<old@x>", receivedAt: new Date("2026-09-01T10:00:00Z"), subject: "Re: x", snippet: "ok", category: "other", asksCall: false },
    { companyId: a.id, account: "lucas", messageId: "<set@x>", fromEmail: "bevares@salon.dk", receivedAt: new Date("2026-09-02T10:00:00Z"), subject: "Re: y", snippet: "ok", category: "other", asksCall: false },
  ]);
  const byEmail = await replyCandidates(db);
  const r = await saveCaptured(db, [raw({ messageId: "<old@x>" }), raw({ messageId: "<set@x>" }), raw({ messageId: "<ukendt@x>", from: "ukendt@x.dk" })], byEmail);
  assert.equal(r.inserted, 0);
  const rows = Object.fromEntries((await db.select().from(leadReply)).map((x) => [x.messageId, x.fromEmail]));
  assert.equal(rows["<old@x>"], "a@salon.dk");
  assert.equal(rows["<set@x>"], "bevares@salon.dk");
  // dry-run udfylder intet
  await db.update(leadReply).set({ fromEmail: null });
  await saveCaptured(db, [raw({ messageId: "<old@x>" })], byEmail, { dryRun: true });
  assert.equal((await db.select().from(leadReply).where(eq(leadReply.messageId, "<old@x>")))[0].fromEmail, null);
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
