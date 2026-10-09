import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company } from "../db/schema.ts";
import { listRepliedLeads } from "./replied-leads.ts";
import { getHqSummary } from "./summary.ts";
import { createTask } from "./tasks.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const replied = { emailStatus: "replied" };
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

async function seed() {
  const rows = await db.insert(company).values([
    { rowNo: 1, name: "A svaret gammel", ...replied, leadStatus: "new", emailSentAt: ago(60), phone: "12 34 56 78", email: "a@example.dk" },
    { rowNo: 2, name: "B interesseret", ...replied, leadStatus: "interested", emailSentAt: ago(30), followupSentAt: ago(20) },
    { rowNo: 3, name: "C nej", ...replied, leadStatus: "not-interested", emailSentAt: ago(10) }, // → tabt
    { rowNo: 4, name: "D ikke egnet", ...replied, leadStatus: "skip", emailSentAt: ago(10) }, // → ikke_egnet
    { rowNo: 5, name: "E flettet", ...replied, lifecycle: "flettet", emailSentAt: ago(10) },
    { rowNo: 6, name: "F kunde", ...replied, clientNo: 1, emailSentAt: ago(10) },
    { rowNo: 7, name: "G afmeldt", emailStatus: "unsubscribed", emailSentAt: ago(10) },
    { rowNo: 8, name: "H arkiveret", ...replied, archived: true, emailSentAt: ago(10) },
    { rowNo: -9, name: "I manuel", ...replied, emailSentAt: ago(10) },
    { rowNo: 10, name: "J uden dato", ...replied, leadStatus: "new" },
  ]).returning();
  return Object.fromEntries(rows.map((r) => [r.name[0], r]));
}

test("listen indeholder kun åbne leads der har svaret — ingen nej, afmeldt, kunde, tabt, ikke egnet, flettet", async () => {
  await seed();
  const list = await listRepliedLeads(db);
  assert.deepEqual(list.map((l) => l.name).sort(), ["A svaret gammel", "B interesseret", "J uden dato"]);
  assert.ok(list.every((l) => ["svaret", "interesseret"].includes(l.lifecycle)));
});

test("samme WHERE som KPI'en: tallet på forsiden = antal rækker i listen", async () => {
  await seed();
  const s = await getHqSummary(db, "2026-10-09");
  assert.equal(s.kpi.repliedLeads, (await listRepliedLeads(db)).length);
});

test("Sidst kontaktet = seneste af mail, opfølgning, opkald/møde/note og udfald; ældst først; udateret sidst", async () => {
  const c = await seed();
  // Opkald nyere end B's opfølgning → B's dato bliver opkaldet. Systemets note tæller ikke.
  await db.insert(activity).values([
    { companyId: c.B.id, actor: "lucas", type: "opkald", summary: "Ringede", at: new Date(Date.now() - 2 * 86_400_000) },
    { companyId: c.A.id, actor: "system", type: "note", summary: "data udfyldt", at: new Date() },
    { companyId: c.J.id, actor: "lucas", type: "email", summary: "Svar sendt til J: skal ringes op", payload: { replyOutcome: "ring-op" }, at: new Date(Date.now() - 5 * 86_400_000) },
  ]);
  const list = await listRepliedLeads(db);
  assert.deepEqual(list.map((l) => l.name[0]), ["A", "J", "B"]); // A (60 d) < J (5 d) < B (2 d)
  const by = Object.fromEntries(list.map((l) => [l.name[0], l]));
  assert.equal(Math.round((Date.now() - Date.parse(by.A.lastContactAt!)) / 86_400_000), 60); // systemnoten ignoreres
  assert.equal(Math.round((Date.now() - Date.parse(by.B.lastContactAt!)) / 86_400_000), 2);
  assert.ok(list.every((l) => l.lastContactAt), "alle rækker her har en dato");
});

test("række uden nogen kontaktdato kommer sidst, ikke først", async () => {
  await seed();
  const list = await listRepliedLeads(db);
  assert.equal(list.at(-1)?.name, "J uden dato");
  assert.equal(list.at(-1)?.lastContactAt, null);
});

// Ring-knappen kalder den eksisterende aktivitets-rute med type "opkald". Ruten bruger @/-alias og
// Next-headers og kan ikke importeres under node:test, så kontrakten tjekkes på kilden, og
// virkningen (opkaldet rykker "Sidst kontaktet") på databasen.
test("Ring logger et opkald via den eksisterende rute — og ingen mail-afsendelse i de nye filer", async () => {
  const route = readFileSync(new URL("../../app/api/virksomheder/[id]/activity/route.ts", import.meta.url), "utf8");
  assert.match(route, /new Set\(\[[^\]]*"opkald"/);
  const ui = readFileSync(new URL("../../app/har-svaret/HarSvaretList.tsx", import.meta.url), "utf8");
  assert.match(ui, /\/api\/virksomheder\/\$\{row\.id\}\/activity/);
  assert.match(ui, /type: "opkald"/);
  assert.match(ui, /mailto:/);
  assert.doesNotMatch(ui, /onClick=\{[^}]*ring\b/, "tel:-linket må ikke logge automatisk");
  assert.match(ui, /Log opkald/);
  assert.match(ui, /"\/api\/opgaver"/);
  assert.doesNotMatch(ui, /udfald/, "Ring senere må ikke bruge udfalds-ruten");
  for (const f of [ui, readFileSync(new URL("./replied-leads.ts", import.meta.url), "utf8"), readFileSync(new URL("../../app/har-svaret/page.tsx", import.meta.url), "utf8")]) {
    assert.doesNotMatch(f, /nodemailer|resend|brevo|sendMail|transport/i);
  }
  const c = await seed();
  await db.insert(activity).values({ companyId: c.A.id, actor: "lucas", type: "opkald", summary: "Ringede til A svaret gammel" });
  const a = (await listRepliedLeads(db)).find((l) => l.name[0] === "A")!;
  assert.ok(Date.now() - Date.parse(a.lastContactAt!) < 60_000);
});

test("lead_status afmeldt/nej med replied + livsfase svaret er hverken i listen eller i KPI", async () => {
  await seed();
  const rows = await db.insert(company).values([
    { rowNo: 21, name: "K afmeldt", emailStatus: "replied", leadStatus: " Afmeldt ", emailSentAt: ago(5) },
    { rowNo: 22, name: "L nej", emailStatus: "replied", leadStatus: "nej", emailSentAt: ago(5) },
  ]).returning();
  assert.deepEqual(rows.map((r) => r.lifecycle), ["svaret", "svaret"], "triggeren kender ikke disse stavemåder");
  const list = await listRepliedLeads(db);
  assert.ok(!list.some((l) => /^[KL] /.test(l.name)));
  assert.equal((await getHqSummary(db, "2026-10-09")).kpi.repliedLeads, list.length);
});

test("listen har intet loft: KPI = liste også ved over 300 leads", async () => {
  await db.insert(company).values(Array.from({ length: 320 }, (_, i) => ({ rowNo: 100 + i, name: `Lead ${i}`, emailStatus: "replied", emailSentAt: ago(3) })));
  const list = await listRepliedLeads(db);
  assert.equal(list.length, 320);
  assert.equal((await getHqSummary(db, "2026-10-09")).kpi.repliedLeads, 320);
});

test("Ring senere = almindelig opgave Ring til X: ændrer ikke Sidst kontaktet og skriver ingen aktivitet", async () => {
  const c = await seed();
  const before = (await listRepliedLeads(db)).find((l) => l.name[0] === "A")!.lastContactAt;
  const t = await createTask(db, { companyId: c.A.id, owner: "lucas", title: `Ring til ${c.A.name}`, due: "2026-10-12" });
  assert.equal(t.companyId, c.A.id);
  assert.equal((await db.select().from(activity)).length, 0);
  assert.equal((await listRepliedLeads(db)).find((l) => l.name[0] === "A")!.lastContactAt, before);
});
