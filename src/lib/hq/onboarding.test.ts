import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, contact, deal, invoice, outreach, site, task } from "../db/schema.ts";
import { getOnboardingChecklist, makeCustomer, OnboardingError, ONBOARDING_STEPS, setOnboardingTaskDone } from "./onboarding.ts";

let db: Db;
let companyId: string;
beforeEach(async () => {
  db = await freshTestDb();
  [{ id: companyId }] = await db.insert(company).values({ rowNo: 42, name: "VIDA Skønhedsklinik" }).returning({ id: company.id });
});

test("makeCustomer tildeler næste kundenummer og sætter lead_status/lifecycle", async () => {
  await db.insert(company).values({ rowNo: 1, clientNo: 3, name: "Andre" });
  const clientNo = await makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" });
  assert.equal(clientNo, 4);
  const [c] = await db.select().from(company).where(eq(company.id, companyId));
  assert.equal(c.leadStatus, "client");
  assert.equal(c.lifecycle, "kunde");
  const [log] = await db.select().from(activity).where(eq(activity.companyId, companyId));
  assert.equal(log.summary, "Blev kunde (#4)");
  assert.equal(log.type, "fase");
});

test("makeCustomer stopper åbne kolde kladder for virksomheden", async () => {
  await db.insert(outreach).values({
    id: "d1", companyRowNo: 42, status: "pending",
    draft: { id: "d1", leadId: "42", name: "VIDA", branch: "", city: "", hooks: [], demoPair: [], professionalism: "", subject: "s", body: "b", status: "pending", source: "t", createdAt: "", updatedAt: "" },
  });
  await makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" });
  const [row] = await db.select().from(outreach).where(eq(outreach.id, "d1"));
  assert.equal(row.status, "rejected");
});

test("makeCustomer er idempotent: andet kald ændrer intet", async () => {
  const first = await makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" });
  const second = await makeCustomer(db, companyId, { actor: "charlie", today: "2026-09-24" });
  assert.equal(first, second);
  const log = await db.select().from(activity).where(eq(activity.companyId, companyId));
  assert.equal(log.length, 1, "kun ét 'blev kunde'-opslag");
  const tasks = await db.select().from(task).where(eq(task.companyId, companyId));
  assert.equal(tasks.length, ONBOARDING_STEPS.length, "opstartslisten oprettes ikke igen");
});

test("opstartslisten forudafkrydser punkter data allerede opfylder", async () => {
  await db.update(company).set({ email: "info@vida.dk" }).where(eq(company.id, companyId));
  await db.insert(deal).values({ companyId, mrrDkk: 499, isPrimary: true });
  await db.insert(site).values({ companyId, domain: "vida.dk", status: "live" });
  await db.insert(invoice).values({ number: "001", companyId, clientName: "VIDA", status: "sendt", issueDate: "2026-09-01", dueDate: "2026-09-15", data: {} });
  await db.insert(activity).values({ companyId, actor: "lucas", type: "kundeopdatering", summary: "Nu har vi lavet…" });

  await makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" });
  const list = await getOnboardingChecklist(db, companyId);
  assert.equal(list.length, 7);
  assert.deepEqual(list.map((t) => t.title), [...ONBOARDING_STEPS]);
  assert.deepEqual(
    list.map((t) => t.done),
    [true, true, true, true, true, false, true],
    "kun 'Google-profil + Search Console' mangler stadig et datasignal",
  );
});

test("uden nogen data er alle syv punkter åbne", async () => {
  await makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" });
  const list = await getOnboardingChecklist(db, companyId);
  assert.ok(list.every((t) => !t.done));
});

test("kontaktperson-punktet klares også af en contact-mail (ikke kun company.email)", async () => {
  await db.insert(contact).values({ companyId, name: "Allan", email: "allan@vida.dk" });
  await makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" });
  const list = await getOnboardingChecklist(db, companyId);
  assert.equal(list[0].done, true);
});

test("setOnboardingTaskDone afkrydser og genåbner, og afviser fremmede opgaver", async () => {
  await makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" });
  const [t] = await getOnboardingChecklist(db, companyId);
  await setOnboardingTaskDone(db, companyId, t.id, true);
  assert.equal((await getOnboardingChecklist(db, companyId))[0].done, true);
  await setOnboardingTaskDone(db, companyId, t.id, false);
  assert.equal((await getOnboardingChecklist(db, companyId))[0].done, false);

  const [other] = await db.insert(company).values({ rowNo: 99, name: "Anden" }).returning({ id: company.id });
  await assert.rejects(setOnboardingTaskDone(db, other.id, t.id, true), OnboardingError);

  const [plainTask] = await db.insert(task).values({ companyId, title: "Ikke en opstartsopgave" }).returning({ id: task.id });
  await assert.rejects(setOnboardingTaskDone(db, companyId, plainTask.id, true), OnboardingError);
});

test("makeCustomer på en virksomhed der allerede er kunde beholder kundenummeret", async () => {
  await db.update(company).set({ clientNo: 12, leadStatus: "client" }).where(eq(company.id, companyId));
  const clientNo = await makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" });
  assert.equal(clientNo, 12);
  const log = await db.select().from(activity).where(eq(activity.companyId, companyId));
  assert.equal(log.length, 0, "ingen 'blev kunde'-aktivitet for en der allerede var kunde");
});

test("makeCustomer afviser ukendt virksomhed", async () => {
  await assert.rejects(
    makeCustomer(db, "00000000-0000-0000-0000-000000000000", { actor: "lucas", today: "2026-09-23" }),
    OnboardingError,
  );
});

test("første kunde nogensinde får nummer 2 (opslag afviser < 2); samtidige klik giver én opstartsliste", async () => {
  const [a, b] = await Promise.all([
    makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" }),
    makeCustomer(db, companyId, { actor: "lucas", today: "2026-09-23" }),
  ]);
  assert.equal(a, 2);
  assert.equal(b, 2);
  const steps = await db.select().from(task).where(eq(task.companyId, companyId));
  assert.equal(steps.length, 7);
});
