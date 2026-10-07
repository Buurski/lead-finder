import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, deal, task } from "../db/schema.ts";
import { DealInputError } from "./deals.ts";
import { completeTask, createTask, decideApproval, deleteHqTask, dueBucket, listDone, listMyDay, patchDealNextStep, patchTask, validateTaskPatch } from "./tasks.ts";
import { parseApproval } from "./approval.ts";

let db: Db;
let companyId: string;
const TODAY = "2026-09-23";

beforeEach(async () => {
  db = await freshTestDb();
  [{ id: companyId }] = await db.insert(company).values({ rowNo: 7, name: "Ikast AutoService" }).returning({ id: company.id });
});

test("dueBucket grupperer forfalden/i dag/kommende/uden dato", () => {
  assert.equal(dueBucket("", TODAY), "uden_dato");
  assert.equal(dueBucket("2026-09-01", TODAY), "forfalden");
  assert.equal(dueBucket(TODAY, TODAY), "i_dag");
  assert.equal(dueBucket("2026-12-01", TODAY), "kommende");
});

test("listMyDay samler åbne opgaver og aftalers næste skridt", async () => {
  await db.insert(task).values({ companyId, clientName: "Ikast AutoService", owner: "lucas", title: "Ring til kunden", due: "2026-09-20" });
  await db.insert(task).values({ companyId, clientName: "Ikast AutoService", owner: "charlie", title: "Send tilbud", due: "" });
  // Klaret opgave må ikke dukke op i den åbne liste.
  const [done] = await db.insert(task).values({ companyId, clientName: "Ikast AutoService", owner: "lucas", title: "Gammel", due: "2026-09-01", doneAt: new Date() }).returning();
  await db.insert(deal).values({ companyId, title: "Nyhedsbrev", stage: "i_gang", owner: "lucas", nextStep: "Send udkast", nextStepDue: TODAY });
  await db.insert(deal).values({ companyId, title: "Tabt aftale", stage: "tabt", owner: "lucas", nextStep: "Skulle ikke ses" });

  const items = await listMyDay(db, { today: TODAY });
  assert.equal(items.some((i) => i.id === done.id), false);
  assert.equal(items.some((i) => i.title === "Skulle ikke ses"), false);
  assert.deepEqual(
    items.map((i) => [i.kind, i.title, i.bucket]),
    [
      ["task", "Ring til kunden", "forfalden"],
      ["deal", "Send udkast", "i_dag"],
      ["task", "Send tilbud", "uden_dato"],
    ],
  );

  const lucasOnly = await listMyDay(db, { today: TODAY, owner: "lucas" });
  assert.deepEqual(lucasOnly.map((i) => i.title), ["Ring til kunden", "Send udkast"]);
});

test("opret, afslut og flyt en opgave logger en aktivitet", async () => {
  const t = await createTask(db, { companyId, owner: "lucas", title: "Ring til kunden", due: "2026-09-25" });
  assert.equal(t.owner, "lucas");

  const patched = await patchTask(db, t.id, { due: "2026-09-30" }, "lucas");
  assert.equal(patched.due, "2026-09-30");

  await completeTask(db, t.id, "charlie");
  const [after] = await db.select().from(task).where(eq(task.id, t.id));
  assert.ok(after.doneAt);
  const [log] = await db.select().from(activity).where(eq(activity.companyId, companyId));
  assert.deepEqual([log.actor, log.type, log.summary], ["charlie", "opgave", "Opgave klaret: Ring til kunden"]);

  const done = await listDone(db, {});
  assert.deepEqual(done.map((d) => d.id), [t.id]);
});

test("afslut en aftales næste skridt rydder feltet og logger en note", async () => {
  const [d] = await db.insert(deal).values({ companyId, title: "Nyhedsbrev", stage: "aftalt", owner: "lucas", nextStep: "Send udkast", nextStepDue: TODAY }).returning();
  const after = await patchDealNextStep(db, d.id, { done: true }, "lucas");
  assert.equal(after.nextStep, null);
  const [log] = await db.select().from(activity).where(eq(activity.dealId, d.id));
  assert.equal(log.summary, "Næste skridt klaret: Send udkast");
});

test("validering afviser rod", async () => {
  await assert.rejects(createTask(db, { owner: "lucas", title: "" }), DealInputError);
  await assert.rejects(createTask(db, { owner: "hacker", title: "Ring" }), /ejer/);
  await assert.rejects(createTask(db, { owner: "lucas", title: "Ring", due: "25/9" }), /ÅÅÅÅ-MM-DD/);
  await assert.rejects(createTask(db, { owner: "lucas", title: "Ring", dueTime: "25:00" }), /klokkeslæt/);
  await assert.rejects(createTask(db, { owner: "lucas", title: "Ring", dueTime: "9:00" }), /klokkeslæt/);
  const t = await createTask(db, { owner: "lucas", title: "Ring" });
  await assert.rejects(patchTask(db, t.id, {}, "lucas"), /intet at opdatere/);
});

test("klokkeslæt: gyldigt format gemmes, tomt/ugyldigt afvises, en aftales næste skridt kan ikke få tid", async () => {
  const t = await createTask(db, { owner: "lucas", title: "Ring", due: "2026-09-25", dueTime: "14:30" });
  assert.equal(t.dueTime, "14:30");
  const cleared = await patchTask(db, t.id, { dueTime: "" }, "lucas");
  assert.equal(cleared.dueTime, "");
  await assert.rejects(patchTask(db, t.id, { dueTime: "24:00" }, "lucas"), /klokkeslæt/);

  const [d] = await db.insert(deal).values({ companyId, title: "Nyhedsbrev", stage: "aftalt", owner: "lucas", nextStep: "Send udkast", nextStepDue: TODAY }).returning();
  await assert.rejects(patchDealNextStep(db, d.id, { dueTime: "10:00" }, "lucas"), /klokkeslæt/);

  // listMyDay giver opgavens klokkeslæt videre; en aftales næste skridt har altid "".
  const withTime = await createTask(db, { owner: "lucas", title: "Ring i eftermiddag", due: TODAY, dueTime: "15:00" });
  const items = await listMyDay(db, { today: TODAY, owner: "lucas" });
  assert.equal(items.find((i) => i.id === withTime.id)?.dueTime, "15:00");
  assert.equal(items.find((i) => i.id === `deal:${d.id}`)?.dueTime, "");
});

test("PATCH validerer note, vigtig, dato og klokkeslæt", () => {
  assert.deepEqual(validateTaskPatch({ title: " Bestil kort ", due: "2026-09-24", dueTime: "09:05", owner: "charlie", note: " Allan ", important: true }), {
    title: "Bestil kort", due: "2026-09-24", dueTime: "09:05", owner: "charlie", note: "Allan", important: true,
  });
  assert.throws(() => validateTaskPatch({ important: "true" }), DealInputError);
  assert.throws(() => validateTaskPatch({ note: 42 }), DealInputError);
  assert.throws(() => validateTaskPatch({ due: "2026-02-30" }), DealInputError);
  assert.throws(() => validateTaskPatch({ dueTime: "9:00" }), DealInputError);
  assert.throws(() => validateTaskPatch({ dueTime: "24:00" }), DealInputError);
  assert.throws(() => validateTaskPatch({ owner: "allan" }), DealInputError);
  assert.throws(() => validateTaskPatch({ done: "nej" }), DealInputError);
});

test("vigtige opgaver sorteres først og kan rettes og slettes", async () => {
  const first = await createTask(db, { owner: "lucas", title: "Almindelig", due: TODAY });
  const marked = await createTask(db, { owner: "lucas", title: "Bestil kort", due: "2026-10-01" });
  await patchTask(db, marked.id, { note: "Afventer verificering fra Allan", important: true, owner: "charlie" }, "lucas");
  const all = await listMyDay(db, { today: TODAY });
  assert.deepEqual(all.map((x) => x.id), [marked.id, first.id]);
  assert.equal(all[0].note, "Afventer verificering fra Allan");
  assert.deepEqual((await listMyDay(db, { today: TODAY, owner: "charlie" })).map((x) => x.id), [marked.id]);
  await deleteHqTask(db, marked.id, "lucas");
  assert.deepEqual((await listMyDay(db, { today: TODAY })).map((x) => x.id), [first.id]);
});

test("klaret opgave kan genåbnes og logges (E2E 26/9)", async () => {
  const { patchTask } = await import("./tasks.ts");
  const t = await createTask(db, { owner: "lucas", title: "Genåbn mig", due: TODAY });
  await patchTask(db, t.id, { done: true }, "lucas");
  const open = await patchTask(db, t.id, { done: false }, "lucas");
  assert.equal(open.doneAt, null);
  const acts = await db.select().from(activity);
  assert.ok(acts.some((a) => a.summary === "Opgave genåbnet: Genåbn mig"));
});

// ---------- Godkendelser (Beslutning-markøren i notens første linje) ----------

const PENDING = ["Beslutning fra Lucas AFVENTER", "Godkend eller afvis ved at redigere denne linje.", "", "Plan: rul godkendelsen ud."].join("\n");
const firstLine = (s: string) => s.split("\n")[0];
const afterFirst = (s: string) => s.slice(s.indexOf("\n") + 1);

test("listMyDay eksponerer approval udledt af noten", async () => {
  const [t] = await db.insert(task).values({ companyId, clientName: "Ikast AutoService", owner: "lucas", title: "Godkend plan", note: PENDING }).returning();
  const [d] = await db.insert(deal).values({ companyId, title: "Nyhedsbrev", stage: "i_gang", owner: "lucas", nextStep: "Send udkast", nextStepDue: TODAY }).returning();
  const items = await listMyDay(db, { today: TODAY });
  assert.deepEqual(items.find((i) => i.id === t.id)?.approval, { status: "afventer", actor: "Lucas" });
  assert.equal(items.find((i) => i.id === `deal:${d.id}`)?.approval, null, "aftalers næste skridt har altid approval: null");
});

test("decideApproval godkender: kun markørlinjen skifter, aktivitet logges, doneAt røres ikke", async () => {
  const [t] = await db.insert(task).values({ owner: "lucas", title: "Godkend plan", note: PENDING }).returning();
  const ok = await decideApproval(db, t.id, "godkendt", "lucas");
  assert.equal(firstLine(ok.note), "Beslutning fra Lucas GODKENDT");
  assert.equal(afterFirst(ok.note), afterFirst(PENDING));
  assert.equal(Buffer.from(afterFirst(ok.note)).equals(Buffer.from(afterFirst(PENDING))), true, "resten af noten må ikke ændres");
  assert.equal(ok.doneAt, null, "en godkendelse klarer ikke opgaven");
  const logs = await db.select().from(activity);
  assert.equal(logs.length, 1);
  assert.deepEqual([logs[0].actor, logs[0].type, logs[0].summary], ["lucas", "opgave", "Godkendelse: Godkend plan - GODKENDT"]);
  assert.ok(logs[0].at instanceof Date, "tiden kommer fra activity.at");
});

test("decideApproval afviser: ny status og log bliver AFVIST", async () => {
  const [t] = await db.insert(task).values({ owner: "charlie", title: "Godkend plan", note: "Beslutning fra Charlie AFVENTER\nplan" }).returning();
  const out = await decideApproval(db, t.id, "afvist", "charlie");
  assert.equal(firstLine(out.note), "Beslutning fra Charlie AFVIST");
  const [log] = await db.select().from(activity);
  assert.deepEqual([log.actor, log.summary], ["charlie", "Godkendelse: Godkend plan - AFVIST"]);
});

test("decideApproval afviser ukendt enum, ukendt id, ikke-markøropgave, dobbeltklik, klaret og fremmed aktør", async () => {
  const [t] = await db.insert(task).values({ owner: "lucas", title: "Godkend plan", note: PENDING }).returning();
  await assert.rejects(decideApproval(db, t.id, "måske", "lucas"), /ukendt beslutning/);
  await assert.rejects(decideApproval(db, t.id, undefined, "lucas"), DealInputError);
  await assert.rejects(decideApproval(db, "00000000-0000-0000-0000-000000000000", "godkendt", "lucas"), /findes ikke/);

  const [plain] = await db.insert(task).values({ owner: "lucas", title: "Ring", note: "ingen markør" }).returning();
  await assert.rejects(decideApproval(db, plain.id, "godkendt", "lucas"), /ikke en godkendelsesopgave/);

  await decideApproval(db, t.id, "godkendt", "lucas");
  await assert.rejects(decideApproval(db, t.id, "afvist", "lucas"), /allerede afgjort/, "dobbeltklik må ikke ændre en afgjort beslutning");

  const [klar] = await db.insert(task).values({ owner: "lucas", title: "Klar", note: PENDING, doneAt: new Date() }).returning();
  await assert.rejects(decideApproval(db, klar.id, "godkendt", "lucas"), /opgaven er klaret/);

  const [fremmed] = await db.insert(task).values({ owner: "lucas", title: "Fremmed", note: PENDING }).returning();
  await assert.rejects(decideApproval(db, fremmed.id, "godkendt", "charlie"), /kun opgavens ejer/);
});

test("decideApproval: 'delt' tillades kun når auth ikke er konfigureret", async () => {
  const saved = { user: process.env.VERCEL_BASIC_AUTH_USER, pass: process.env.VERCEL_BASIC_AUTH_PASS, secret: process.env.AUTH_SESSION_SECRET };
  delete process.env.VERCEL_BASIC_AUTH_USER;
  delete process.env.VERCEL_BASIC_AUTH_PASS;
  delete process.env.AUTH_SESSION_SECRET;
  try {
    const [t] = await db.insert(task).values({ owner: "lucas", title: "Lokal", note: PENDING }).returning();
    const out = await decideApproval(db, t.id, "afvist", "delt");
    assert.equal(firstLine(out.note), "Beslutning fra Lucas AFVIST");

    process.env.VERCEL_BASIC_AUTH_USER = "test";
    process.env.VERCEL_BASIC_AUTH_PASS = "test";
    process.env.AUTH_SESSION_SECRET = "test";
    const [t2] = await db.insert(task).values({ owner: "lucas", title: "Fjern", note: PENDING }).returning();
    await assert.rejects(decideApproval(db, t2.id, "godkendt", "delt"), /kun opgavens ejer/, "med auth kræves den rigtige ejer");
  } finally {
    if (saved.user === undefined) delete process.env.VERCEL_BASIC_AUTH_USER; else process.env.VERCEL_BASIC_AUTH_USER = saved.user;
    if (saved.pass === undefined) delete process.env.VERCEL_BASIC_AUTH_PASS; else process.env.VERCEL_BASIC_AUTH_PASS = saved.pass;
    if (saved.secret === undefined) delete process.env.AUTH_SESSION_SECRET; else process.env.AUTH_SESSION_SECRET = saved.secret;
  }
});

test("completeTask afviser en uafgjort godkendelse men klarer en afgjort", async () => {
  const [t] = await db.insert(task).values({ owner: "lucas", title: "Godkend plan", note: PENDING }).returning();
  await assert.rejects(completeTask(db, t.id, "lucas"), /godkendelsen er ikke afgjort/);
  await decideApproval(db, t.id, "godkendt", "lucas");
  const done = await completeTask(db, t.id, "lucas");
  assert.ok(done.doneAt, "en afgjort opgave kan klares normalt");
});

test("validateTaskPatch afviser beslutning blandet med andre felter", () => {
  assert.throws(() => validateTaskPatch({ decision: "godkendt", title: "x" }), /kan ikke kombineres/);
  assert.throws(() => validateTaskPatch({ decision: "godkendt" }), /intet at opdatere/);
});

// Simulerer en samtidig skrivning: noten læses, hvorefter en anden aktør ændrer
// den, før compare-and-set'ens UPDATE rammer. Uden CAS ville beslutningen
// overskrive den anden skrivning i stedet for at give konflikt.
interface RacingTx {
  select(): { from(t: unknown): { where(c: unknown): Promise<Record<string, unknown>[]> } };
  update(t: unknown): { set(v: unknown): { where(c: unknown): Promise<unknown> } };
}

function racingNoteDb(id: string, staleNote: string): Db {
  const real = db as unknown as { transaction(fn: (tx: unknown) => Promise<unknown>): Promise<unknown> };
  return new Proxy(db as object, {
    get(target, prop, receiver) {
      if (prop !== "transaction") return Reflect.get(target, prop, receiver);
      const withRacingNote = (fn: (tx: unknown) => Promise<unknown>) =>
        real.transaction(async (tx) => {
          const raw = tx as RacingTx;
          const [row] = await raw.select().from(task).where(eq(task.id, id));
          const chain = {
            from: () => chain,
            where: async () => {
              await raw.update(task).set({ note: "ændret undervejs" }).where(eq(task.id, id));
              return [{ ...row, note: staleNote }];
            },
          };
          const patched = new Proxy(tx as object, {
            get(tt, p, r) {
              if (p === "select") return () => chain;
              return Reflect.get(tt, p, r);
            },
          });
          return fn(patched);
        });
      return withRacingNote;
    },
  }) as Db;
}

test("decideApproval: samtidig noteændring giver konflikt i stedet for overskrivning", async () => {
  const [t] = await db.insert(task).values({ owner: "lucas", title: "Godkend plan", note: PENDING }).returning();
  await assert.rejects(decideApproval(racingNoteDb(t.id, PENDING), t.id, "godkendt", "lucas"), /ændret samtidig/);
  // Compare-and-set'ens WHERE matchede ikke → ingen beslutning blev skrevet.
  const [after] = await db.select({ note: task.note }).from(task).where(eq(task.id, t.id));
  assert.equal(after.note, PENDING, "en forældet læsning må ikke overskrive noten");
  assert.equal((await db.select().from(activity)).length, 0, "en konflikt må ikke logge en beslutning");
});

// Review-fund 03-10: patchTask må ikke kunne bruges som en bagdør til at træffe
// eller ændre en beslutning uden om decideApprovals ejer-guard og aktivitetslog.
test("patchTask: en noteredigering kan ikke indføre eller ændre en beslutning", async () => {
  const [a] = await db.insert(task).values({ owner: "lucas", title: "Almindelig", note: "plan" }).returning();
  await assert.rejects(patchTask(db, a.id, { note: `Beslutning fra Lucas GODKENDT\nplan` }, "lucas"), /træffes med Godkend eller Afvis/);

  const [b] = await db.insert(task).values({ owner: "lucas", title: "Afventer", note: PENDING }).returning();
  await assert.rejects(patchTask(db, b.id, { note: `Beslutning fra Lucas AFVIST\nplan` }, "lucas"), /træffes med Godkend eller Afvis/);

  const godkendt = `Beslutning fra Lucas GODKENDT\nplan`;
  const [c] = await db.insert(task).values({ owner: "lucas", title: "Afgjort", note: godkendt }).returning();
  await assert.rejects(patchTask(db, c.id, { note: "plan" }, "lucas"), /afgjort beslutning kan ikke ændres/);
  await assert.rejects(patchTask(db, c.id, { note: `Beslutning fra Lucas AFVIST\nplan` }, "lucas"), /træffes med Godkend eller Afvis/);
  await assert.rejects(patchTask(db, c.id, { note: `Beslutning fra Charlie GODKENDT\nplan` }, "lucas"), /træffes med Godkend eller Afvis|afgjort beslutning/);

  for (const [id, note] of [[a.id, "plan"], [b.id, PENDING], [c.id, godkendt]] as const) {
    const [row] = await db.select({ note: task.note }).from(task).where(eq(task.id, id));
    assert.equal(row.note, note, "et afvist forsøg må ikke have skrevet noten");
  }
  assert.equal((await db.select().from(activity)).length, 0, "en noteredigering er ingen beslutning");
});

test("patchTask tillader AFVENTER → AFVENTER og at fjerne en afventende markør", async () => {
  const [t] = await db.insert(task).values({ owner: "lucas", title: "Godkend plan", note: PENDING }).returning();
  const out = await patchTask(db, t.id, { note: "Beslutning fra Charlie AFVENTER\nPlan: rul godkendelsen ud." }, "lucas");
  assert.equal(firstLine(out.note), "Beslutning fra Charlie AFVENTER");
  const uden = await patchTask(db, t.id, { note: "noten uden markør" }, "lucas");
  assert.equal(uden.note, "noten uden markør");
  assert.equal(parseApproval(uden.note), null);
});

// Review-fund 06-10 (Sol): to fejl på samme sted. (1) En afgjort opgave kunne slet ikke
// redigeres, fordi markøren stod uændret igennem. (2) Markøren kunne fjernes af en anden
// end ejeren og derefter "klares" uden nogen beslutning.
test("patchTask: uændret afgjort markør kan gemmes, men kun ejeren må ændre markøren", async () => {
  const godkendt = "Beslutning fra Lucas GODKENDT\nplan";
  const [t] = await db.insert(task).values({ owner: "lucas", title: "Afgjort", note: godkendt }).returning();
  const ok = await patchTask(db, t.id, { title: "Ny titel", note: godkendt }, "lucas");
  assert.equal(ok.title, "Ny titel", "en afgjort opgave skal kunne redigeres");
  assert.equal(ok.note, godkendt, "markøren og noten skal stå urørt igennem redigeringen");

  const [p] = await db.insert(task).values({ owner: "lucas", title: "Afventer", note: PENDING }).returning();
  await patchTask(db, p.id, { note: "noten uden markør" }, "charlie").then(
    () => assert.fail("en fremmed aktør må ikke fjerne markøren"),
    (err: Error) => assert.match(err.message, /kun opgavens ejer kan ændre en godkendelse/),
  );
  const [row] = await db.select({ note: task.note }).from(task).where(eq(task.id, p.id));
  assert.equal(row.note, PENDING, "et afvist forsøg må ikke have skrevet noten");
});

// Schema-kontrakt (06-10): task's valgfri TEXT-kolonner er NOT NULL DEFAULT ''.
// Testfixturen kører de rigtige migrationer, så den har samme constraints —
// ellers kunne en null-fejl gemme sig i tests og først slå i prod.
test("task-tabellen har schemaets NOT NULL/default på de valgfri TEXT-kolonner", async () => {
  const cols = (await db.execute(sql`select column_name, is_nullable, column_default from information_schema.columns where table_name = 'task' and column_name in ('client_name','due','due_time','note') order by column_name`)).rows as { column_name: string; is_nullable: string; column_default: string | null }[];
  assert.deepEqual(cols.map((c) => [c.column_name, c.is_nullable, c.column_default]), [
    ["client_name", "NO", "''::text"],
    ["due", "NO", "''::text"],
    ["due_time", "NO", "''::text"],
    ["note", "NO", "''::text"],
  ]);
  // company_id/deal_id er uuid og forbliver reelt nullable.
  const uuidCols = (await db.execute(sql`select is_nullable from information_schema.columns where table_name = 'task' and column_name in ('company_id','deal_id')`)).rows as { is_nullable: string }[];
  assert.deepEqual(uuidCols.map((c) => c.is_nullable), ["YES", "YES"]);
});

// Regressionscheck (06-10): en opgave uden kunde og uden klokkeslæt skal kunne
// oprettes, og rydning gennem den centrale opdateringsvej (patchTask) skal give
// "" og ikke null — null på de kolonner afviser Postgres med 23502.
test("opgave uden kunde/klokkeslæt gemmes som tom streng og kan ryddes igen", async () => {
  const t = await createTask(db, { owner: "lucas", title: "Uden kunde", due: "2026-10-07" });
  assert.equal(t.clientName, "");
  assert.equal(t.dueTime, "");
  assert.equal(t.companyId, null, "companyId er uuid og må gerne være null");
  const [raw] = await db.select({ clientName: task.clientName, dueTime: task.dueTime }).from(task).where(eq(task.id, t.id));
  assert.equal(raw.clientName, "", "client_name skal stå som '' i basen, ikke null");
  assert.equal(raw.dueTime, "");

  const medTid = await createTask(db, { companyId, owner: "lucas", title: "Med tid", due: TODAY, dueTime: "14:30" });
  const ryddet = await patchTask(db, medTid.id, { due: null, dueTime: null }, "lucas");
  assert.equal(ryddet.due, "");
  assert.equal(ryddet.dueTime, "");
  const [efter] = await db.select({ due: task.due, dueTime: task.dueTime }).from(task).where(eq(task.id, medTid.id));
  assert.equal(efter.due, "");
  assert.equal(efter.dueTime, "");

  // Et råt null i en NOT NULL-kolonne skal stadig afvises af schemaet (som i prod).
  await assert.rejects(
    db.execute(sql`insert into task (client_name, owner, title) values (null, 'lucas', 'rå')`),
    (err: Error & { cause?: Error }) => /not-null|not null/i.test(String(err.cause?.message ?? err.message)),
  );

  // Ejervagten omkring godkendelsesmarkøren er urørt af rydningen: en fremmed aktør afvises.
  const [beskyttet] = await db.insert(task).values({ owner: "lucas", title: "Beskyttet", note: PENDING }).returning();
  await assert.rejects(patchTask(db, beskyttet.id, { note: "noten uden markør" }, "charlie"), /kun opgavens ejer/);
});
