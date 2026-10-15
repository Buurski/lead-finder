import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, leadReply, outreach } from "../db/schema.ts";
import { listRepliedLeadsWithContext } from "./replied-leads.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const NOW = new Date("2026-10-15T12:00:00Z");
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const reply = (companyId: string, over: Partial<typeof leadReply.$inferInsert>) => ({
  companyId, account: "lucas", messageId: `<${Math.random()}@x>`, receivedAt: ago(3), subject: "Re: En lille hilsen", snippet: "Hvad koster det?", category: "question", asksCall: false, ...over,
});

async function seed() {
  const rows = await db.insert(company).values([
    { rowNo: 1, name: "A spørgsmål", emailStatus: "replied", leadStatus: "called", notes: "skin; cvr_unchecked", emailSentAt: ago(5).toISOString(), email: "a@x.dk" },
    { rowNo: 2, name: "B nej", emailStatus: "replied", leadStatus: "new" },
    { rowNo: 3, name: "C gammel", emailStatus: "replied", leadStatus: "new" },
    { rowNo: 4, name: "D ingen mail", emailStatus: "replied", leadStatus: "new" },
  ]).returning();
  return Object.fromEntries(rows.map((r) => [r.name[0], r]));
}

test("kontekst: nyeste svar vælges, bucket sættes, 'vi skrev' og mærker kommer med", async () => {
  const c = await seed();
  await db.insert(leadReply).values([
    reply(c.A.id, { receivedAt: ago(40), snippet: "gammelt", category: "other" }),
    reply(c.A.id, {}),
    reply(c.B.id, { category: "not-interested", snippet: "Nej tak." }),
    reply(c.C.id, { receivedAt: ago(90) }),
  ]);
  await db.insert(outreach).values({ id: "o1", companyRowNo: 1, status: "sent", draft: {} });

  const { leads, captureReady } = await listRepliedLeadsWithContext(db, NOW);
  assert.equal(captureReady, true);
  const by = Object.fromEntries(leads.map((l) => [l.name[0], l]));
  assert.equal(by.A.reply?.snippet, "Hvad koster det?");
  assert.equal(by.A.bucket, "skriv");
  assert.equal(by.A.mailsSent, 1);
  assert.equal(by.A.calledNoLog, true);
  assert.equal(by.A.cvrUnchecked, true);
  assert.equal(by.B.bucket, "luk");
  assert.equal(by.C.bucket, "gammel");
  assert.equal(by.D.reply, null);
  assert.equal(by.D.bucket, "tjek");
});

test("calledNoLog forsvinder når der findes et logget opkald", async () => {
  const c = await seed();
  await db.insert(activity).values({ companyId: c.A.id, type: "opkald", summary: "Ringede", actor: "lucas" });
  const { leads } = await listRepliedLeadsWithContext(db, NOW);
  assert.equal(leads.find((l) => l.name[0] === "A")?.calledNoLog, false);
});

test("før migration 0017: siden virker, captureReady er false og alle står som tjek", async () => {
  await seed();
  await db.execute(sql`drop table lead_reply`);
  const { leads, captureReady } = await listRepliedLeadsWithContext(db, NOW);
  assert.equal(captureReady, false);
  assert.equal(leads.length, 4);
  assert.ok(leads.every((l) => l.bucket === "tjek" && l.reply === null));
});
