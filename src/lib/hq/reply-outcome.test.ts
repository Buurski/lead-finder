import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, outreach, task } from "../db/schema.ts";
import { recordReplyOutcome, ReplyOutcomeError } from "./reply-outcome.ts";

let db: Db;
let companyId: string;
beforeEach(async () => {
  db = await freshTestDb();
  [{ id: companyId }] = await db.insert(company).values({ rowNo: 42, name: "VIDA Skønhedsklinik", leadStatus: "new" }).returning({ id: company.id });
});

test("interesseret sætter lead_status og logger en udgående tidslinje-linje", async () => {
  const res = await recordReplyOutcome(db, { leadId: "42", outcome: "interesseret", owner: "lucas", actor: "lucas" });
  const [c] = await db.select().from(company).where(eq(company.id, companyId));
  assert.equal(c.leadStatus, "interested");
  assert.equal(res.leadStatus, "interested");
  const [log] = await db.select().from(activity).where(eq(activity.companyId, companyId));
  assert.equal(log.type, "email");
  assert.equal(log.summary, "Svar sendt til VIDA Skønhedsklinik: interesseret");
  assert.match(log.summary, /^svar sendt/i); // matcher overview.ts's OUT-regex — vises som "ud"
});

test("ikke-interesseret sætter lead_status til not-interested", async () => {
  await recordReplyOutcome(db, { leadId: "42", outcome: "ikke-interesseret", owner: "lucas", actor: "lucas" });
  const [c] = await db.select().from(company).where(eq(company.id, companyId));
  assert.equal(c.leadStatus, "not-interested");
});

test("ring-op rører ikke lead_status men opretter en opkalds-opgave (default i morgen)", async () => {
  await recordReplyOutcome(db, { leadId: "42", outcome: "ring-op", owner: "charlie", actor: "lucas" });
  const [c] = await db.select().from(company).where(eq(company.id, companyId));
  assert.equal(c.leadStatus, "new");
  const [t] = await db.select().from(task).where(eq(task.companyId, companyId));
  assert.equal(t.title, "Ring til VIDA Skønhedsklinik");
  assert.equal(t.owner, "charlie");
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  assert.equal(t.due, tomorrow);
});

test("kunde-spoergsmaal og andet rører ikke lead_status og opretter ingen opgave uden dato", async () => {
  await recordReplyOutcome(db, { leadId: "42", outcome: "kunde-spoergsmaal", owner: "lucas", actor: "lucas" });
  await recordReplyOutcome(db, { leadId: "42", outcome: "andet", owner: "lucas", actor: "lucas" });
  const [c] = await db.select().from(company).where(eq(company.id, companyId));
  assert.equal(c.leadStatus, "new");
  const tasks = await db.select().from(task).where(eq(task.companyId, companyId));
  assert.equal(tasks.length, 0);
});

test("en opfølgningsdato opretter en 'Følg op'-opgave for ikke-ring-op-udfald", async () => {
  await recordReplyOutcome(db, { leadId: "42", outcome: "kunde-spoergsmaal", note: "vil vide mere om prisen", followUpDue: "2026-10-01", owner: "lucas", actor: "lucas" });
  const [t] = await db.select().from(task).where(eq(task.companyId, companyId));
  assert.equal(t.title, "Følg op: VIDA Skønhedsklinik");
  assert.equal(t.due, "2026-10-01");
  const [log] = await db.select().from(activity).where(eq(activity.companyId, companyId));
  assert.match(log.summary, /vil vide mere om prisen/);
});

test("en kunde (client_no sat) får aldrig ændret lead_status", async () => {
  await db.update(company).set({ clientNo: 7, leadStatus: "client" }).where(eq(company.id, companyId));
  await recordReplyOutcome(db, { leadId: "42", outcome: "ikke-interesseret", owner: "lucas", actor: "lucas" });
  const [c] = await db.select().from(company).where(eq(company.id, companyId));
  assert.equal(c.leadStatus, "client");
});

test("stopper åbne kolde kladder for virksomheden", async () => {
  await db.insert(outreach).values({
    id: "d1", companyRowNo: 42, status: "pending",
    draft: { id: "d1", leadId: "42", name: "VIDA", branch: "", city: "", hooks: [], demoPair: [], professionalism: "", subject: "s", body: "b", status: "pending", source: "t", createdAt: "", updatedAt: "" },
  });
  await recordReplyOutcome(db, { leadId: "42", outcome: "andet", owner: "lucas", actor: "lucas" });
  const [row] = await db.select().from(outreach).where(eq(outreach.id, "d1"));
  assert.equal(row.status, "rejected");
});

test("dobbeltklik inden for 1 minut logger ikke en ekstra aktivitet eller opgave", async () => {
  const first = await recordReplyOutcome(db, { leadId: "42", outcome: "ring-op", owner: "lucas", actor: "lucas" });
  const second = await recordReplyOutcome(db, { leadId: "42", outcome: "ring-op", owner: "lucas", actor: "lucas" });
  assert.equal(first.activityId, second.activityId);
  const logs = await db.select().from(activity).where(eq(activity.companyId, companyId));
  assert.equal(logs.length, 1);
  const tasks = await db.select().from(task).where(eq(task.companyId, companyId));
  assert.equal(tasks.length, 1);
});

test("slår også op via place_id når leadId ikke er numerisk", async () => {
  const [{ id: pid }] = await db.insert(company).values({ rowNo: 99, placeId: "ChIJabc123", name: "Café Wilder", leadStatus: "new" }).returning({ id: company.id });
  const res = await recordReplyOutcome(db, { leadId: "ChIJabc123", outcome: "interesseret", owner: "lucas", actor: "lucas" });
  assert.equal(res.companyId, pid);
});

test("ukendt lead-id fejler tydeligt", async () => {
  await assert.rejects(
    recordReplyOutcome(db, { leadId: "999999", outcome: "andet", owner: "lucas", actor: "lucas" }),
    ReplyOutcomeError,
  );
});

test("ukendt udfald og ugyldig dato fejler tydeligt", async () => {
  await assert.rejects(
    // @ts-expect-error — bevidst ugyldigt udfald for at teste valideringen
    recordReplyOutcome(db, { leadId: "42", outcome: "hvad-som-helst", owner: "lucas", actor: "lucas" }),
    ReplyOutcomeError,
  );
  await assert.rejects(
    recordReplyOutcome(db, { leadId: "42", outcome: "andet", followUpDue: "i morgen", owner: "lucas", actor: "lucas" }),
    ReplyOutcomeError,
  );
});
