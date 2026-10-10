import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { company, deal, task } from "../db/schema.ts";
import { copenhagenNow } from "../settings.ts";
import { createDeal, updateDeal } from "./deals.ts";
import { listMyDay } from "./tasks.ts";
import { toEvents } from "./gcal-sync.ts";
import { bookMeeting, copenhagenInstant, sweepMeetingOutcomes } from "./meetings.ts";

let db: Db;
let companyId: string;
beforeEach(async () => {
  db = await freshTestDb();
  [{ id: companyId }] = await db.insert(company).values({ rowNo: 7, name: "Ikast AutoService" }).returning({ id: company.id });
});

const book = (over: Partial<Parameters<typeof bookMeeting>[1]> = {}) =>
  bookMeeting(db, { companyId, owner: "lucas", due: "2026-10-20", dueTime: "10:00", place: "Storegade 1, Ikast", actor: "lucas", ...over });

test("bookMeeting opretter mødeopgave med tid og sted + aftale i trinnet Møde", async () => {
  const { task: t, deal: d } = await book();
  assert.equal(d.stage, "moede");
  assert.equal(t.dealId, d.id);
  assert.deepEqual([t.title, t.due, t.dueTime, t.note, t.owner, t.companyId], ["Møde", "2026-10-20", "10:00", "Storegade 1, Ikast", "lucas", companyId]);
  assert.deepEqual(t.data, { kind: "moede" });
});

test("bookMeeting kræver dato og klokkeslæt", async () => {
  await assert.rejects(book({ dueTime: "" }), /klokkeslæt/);
  await assert.rejects(book({ due: "" }), /dato/);
});

test("bookMeeting flytter en åben tilbuds-aftale til Møde, genbruger den, og rører ikke aftaler længere fremme", async () => {
  const tilbud = await createDeal(db, companyId, { title: "Hjemmeside", stage: "tilbud" }, "lucas");
  const r1 = await book();
  assert.equal(r1.deal.id, tilbud.id);
  assert.equal((await db.select().from(deal).where(eq(deal.id, tilbud.id)))[0].stage, "moede");
  const r2 = await book({ due: "2026-10-21" }); // allerede i Møde → samme aftale
  assert.equal(r2.deal.id, tilbud.id);
  await updateDeal(db, tilbud.id, { stage: "i_gang" }, "lucas");
  const r3 = await book({ due: "2026-10-22" }); // i_gang flyttes aldrig tilbage → ny aftale
  assert.notEqual(r3.deal.id, tilbud.id);
  assert.equal((await db.select().from(deal).where(eq(deal.id, tilbud.id)))[0].stage, "i_gang");
});

test("toEvents: mødeopgave = 60 min + 2 påmindelser; almindelig tidsat opgave = 30 min", async () => {
  await book({ due: "2026-10-20", dueTime: "10:00" });
  await db.insert(task).values({ owner: "lucas", title: "Ring", due: "2026-10-20", dueTime: "13:00" });
  const items = await listMyDay(db, { owner: "lucas", today: "2026-10-19" });
  const ev = toEvents(items, "2026-10-19");
  const meeting = ev.find((e) => e.summary.startsWith("Møde"))!;
  assert.equal(meeting.start.dateTime, "2026-10-20T10:00:00");
  assert.equal(meeting.end.dateTime, "2026-10-20T11:00:00");
  assert.equal(meeting.reminders.overrides.length, 2);
  assert.deepEqual(meeting.reminders.overrides.map((o) => o.minutes), [17 * 60, 0]); // dagen før kl. 17 (10:00 − 17:00 dagen før = 17 t) og ved start
  assert.match(meeting.description, /Storegade 1, Ikast/);
  const plain = ev.find((e) => e.summary.startsWith("Ring"))!;
  assert.equal(plain.end.dateTime, "2026-10-20T13:30:00");
});

test("cron mødeudfald: kørt to gange = præcis én opgave pr. afsluttet møde; fremtidige møder får ingen", async () => {
  const today = copenhagenNow().date;
  const past = await book({ due: today, dueTime: "00:00" }); // slut for længst (i dag kl. 00:00 + 60 min)
  await book({ due: "2099-01-01", dueTime: "10:00" });
  const now = new Date(Date.now() + 2 * 3_600_000); // sikrer at 00:00 + 60 min er passeret uanset klokkeslæt
  assert.equal((await sweepMeetingOutcomes(db, now)).created, 1);
  assert.equal((await sweepMeetingOutcomes(db, now)).created, 0);
  const all = await db.select().from(task);
  const outcomes = all.filter((t) => (t.data as { kind?: string } | null)?.kind === "moede-udfald");
  assert.equal(outcomes.length, 1);
  assert.equal((outcomes[0].data as { moedeId: string }).moedeId, past.task.id);
  assert.match(outcomes[0].title, /Hvordan gik mødet med Ikast AutoService\? Ryk aftalen til Tilbud eller Tabt/);
  assert.equal(outcomes[0].dealId, past.deal.id);
  assert.equal(outcomes[0].owner, "lucas");
});

test("cron mødeudfald: mødet er først slut efter start + 60 min", async () => {
  await book({ due: "2026-10-20", dueTime: "10:00" }); // København CEST = 08:00 UTC
  assert.equal((await sweepMeetingOutcomes(db, new Date("2026-10-20T08:59:00Z"))).created, 0);
  assert.equal((await sweepMeetingOutcomes(db, new Date("2026-10-20T09:01:00Z"))).created, 1);
});

test("moede → tilbud opretter Send tilbud (+2 d) og Følg op (+5 d); ingen dubletter ved gentagelse", async () => {
  const d = await createDeal(db, companyId, { title: "Hjemmeside", stage: "moede", owner: "charlie" }, "lucas");
  await updateDeal(db, d.id, { stage: "tilbud" }, "lucas");
  const today = copenhagenNow().date;
  const plus = (n: number) => { const [y, m, dd] = today.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
  const mine = (await db.select().from(task).where(eq(task.dealId, d.id))).sort((a, b) => a.due.localeCompare(b.due));
  assert.deepEqual(mine.map((t) => [t.title, t.due, t.owner]), [
    ["Send tilbud til Ikast AutoService", plus(2), "charlie"],
    ["Følg op på tilbud til Ikast AutoService", plus(5), "charlie"],
  ]);
  await updateDeal(db, d.id, { stage: "moede" }, "lucas");
  await updateDeal(db, d.id, { stage: "tilbud" }, "lucas");
  assert.equal((await db.select().from(task).where(eq(task.dealId, d.id))).length, 2);
});

test("copenhagenInstant: almindelig dag og DST-skiftedage", () => {
  const z = (day: string, time: string) => new Date(copenhagenInstant(day, time)).toISOString();
  assert.equal(z("2026-06-10", "10:00"), "2026-06-10T08:00:00.000Z");
  assert.equal(z("2026-12-10", "10:00"), "2026-12-10T09:00:00.000Z");
  assert.equal(z("2026-03-29", "01:30"), "2026-03-29T00:30:00.000Z"); // før springet (CET)
  assert.equal(z("2026-03-29", "03:30"), "2026-03-29T01:30:00.000Z"); // efter springet (CEST)
  assert.equal(z("2026-10-25", "02:30"), "2026-10-25T01:30:00.000Z"); // tvetydig: senere forekomst (CET)
  assert.equal(z("2026-10-25", "03:30"), "2026-10-25T02:30:00.000Z");
  assert.equal(z("2026-10-25", "01:30"), "2026-10-24T23:30:00.000Z"); // før efterårsskiftet (CEST)
});

test("bookMeeting: samtidige bookinger på samme virksomhed giver én aftale", async () => {
  await Promise.all([book(), book({ due: "2026-10-21" })]);
  assert.equal((await db.select().from(deal).where(eq(deal.companyId, companyId))).length, 1);
});

test("toEvents: møde kl. 23:00 slutter næste dag kl. 00:00", async () => {
  await book({ due: "2026-10-20", dueTime: "23:00" });
  const items = await listMyDay(db, { owner: "lucas", today: "2026-10-19" });
  const meeting = toEvents(items, "2026-10-19").find((e) => e.summary.startsWith("Møde"))!;
  assert.equal(meeting.start.dateTime, "2026-10-20T23:00:00");
  assert.equal(meeting.end.dateTime, "2026-10-21T00:00:00");
});

test("cron mødeudfald lukker mødeopgaven; ældre møder (uden vindue) tages med; brugerlukket møde får intet udfald", async () => {
  const old = await book({ due: "2026-01-05", dueTime: "09:00" });
  const doneByUser = await book({ due: "2026-01-06", dueTime: "09:00" });
  const future = await book({ due: "2099-01-01", dueTime: "10:00" });
  await db.update(task).set({ doneAt: new Date() }).where(eq(task.id, doneByUser.task.id));
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal((await sweepMeetingOutcomes(db, now)).created, 1);
  assert.equal((await sweepMeetingOutcomes(db, now)).created, 0);
  const all = await db.select().from(task);
  const byId = (id: string) => all.find((t) => t.id === id)!;
  assert.ok(byId(old.task.id).doneAt, "mødet er lukket");
  assert.equal(byId(future.task.id).doneAt, null);
  const outcomes = all.filter((t) => (t.data as { kind?: string } | null)?.kind === "moede-udfald");
  assert.deepEqual(outcomes.map((t) => (t.data as { moedeId: string }).moedeId), [old.task.id]);
  const items = await listMyDay(db, { owner: "lucas", today: "2026-10-20" });
  assert.ok(!items.some((i) => i.id === old.task.id), "lukket møde er ude af min dag");
});

test("moede → tilbud: kun den manglende opfølgningstype oprettes", async () => {
  const d = await createDeal(db, companyId, { title: "Hjemmeside", stage: "moede", owner: "lucas" }, "lucas");
  await db.insert(task).values({ companyId, dealId: d.id, owner: "lucas", title: "Følg op", due: "2026-10-30", data: { kind: "tilbud-foelg", dealId: d.id } });
  await updateDeal(db, d.id, { stage: "tilbud" }, "lucas");
  const kinds = (await db.select().from(task).where(eq(task.dealId, d.id))).map((t) => (t.data as { kind: string }).kind).sort();
  assert.deepEqual(kinds, ["tilbud-foelg", "tilbud-send"]);
});

test("andre fase-skift opretter ingen opfølgningsopgaver", async () => {
  const d = await createDeal(db, companyId, { title: "x", stage: "tilbud" }, "lucas");
  await updateDeal(db, d.id, { stage: "aftalt" }, "lucas");
  assert.equal((await db.select().from(task)).length, 0);
});
