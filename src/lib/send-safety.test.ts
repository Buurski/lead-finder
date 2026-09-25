import { test } from "node:test";
import assert from "node:assert/strict";

// PGlite som app-db (samme mønster som queue.test.ts) — aldrig rigtig Neon.
process.env.DATA_BACKEND = "pg";
const { freshTestDb } = await import("./db/test-db.ts");
const { acquireSendLock, releaseSendLock, sendLockHeld, failedBeforeAccept } = await import("./send-safety.ts");
const { writeQueue, readQueue, reserveForSend, finishSend, updateDraft } = await import("./queue.ts");
import type { QueueDraft } from "./queue.ts";

function draft(overrides: Partial<QueueDraft>): QueueDraft {
  return {
    id: "d1", leadId: "7", name: "Kagehuset", branch: "café", city: "Herning",
    hooks: [], demoPair: [], professionalism: "", subject: "s", body: "b",
    status: "approved", source: "daily-engine",
    createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-01T08:00:00.000Z",
    ...overrides,
  };
}

test("send-lås: samtidige forsøg giver præcis én vinder; udløbet lås kan tages; release kun egen", async () => {
  await freshTestDb();
  const t0 = 1_790_000_000_000;
  const results = await Promise.all([acquireSendLock(60_000, t0), acquireSendLock(60_000, t0), acquireSendLock(60_000, t0)]);
  assert.equal(results.filter((r) => r !== null).length, 1);
  const handle = results.find((r) => r !== null)!;
  assert.equal(await sendLockHeld(t0 + 1000), true);
  assert.equal(await acquireSendLock(60_000, t0 + 30_000), null, "stadig låst");
  const later = await acquireSendLock(60_000, t0 + 61_000);
  assert.ok(later, "udløbet lås kan overtages");
  await releaseSendLock(handle); // den gamle ejer må ikke frigive den nye ejers lås
  assert.equal(await sendLockHeld(t0 + 62_000), true);
  await releaseSendLock(later!);
  assert.equal(await sendLockHeld(t0 + 62_000), false);
});

test("SMTP-fejl: kun sikre før-accept-fejl gør kladden sendbar igen", () => {
  assert.equal(failedBeforeAccept({ code: "EAUTH" }), true);
  assert.equal(failedBeforeAccept({ code: "ECONNECTION" }), false, "kan ske mens DATA-svaret venter");
  assert.equal(failedBeforeAccept({ code: "EENVELOPE" }), true);
  assert.equal(failedBeforeAccept({ code: "EMESSAGE", responseCode: 550 }), true);
  assert.equal(failedBeforeAccept({ code: "ETIMEDOUT" }), false, "timeout efter DATA er tvetydig");
  assert.equal(failedBeforeAccept({ code: "ESOCKET" }), false);
  assert.equal(failedBeforeAccept(new Error("ukendt")), false);
  assert.equal(failedBeforeAccept(null), false);
});

test("reserveForSend: kun approved/edited, låser modtager, kun én vinder", async () => {
  await freshTestDb();
  await writeQueue([draft({ id: "a" }), draft({ id: "p", status: "pending" }), draft({ id: "e", status: "edited" })]);
  const V = "2026-09-01T08:00:00.000Z";
  const [r1, r2] = await Promise.all([reserveForSend("a", "x@firma.dk", V), reserveForSend("a", "x@firma.dk", V)]);
  assert.equal([r1, r2].filter(Boolean).length, 1, "præcis én reservation");
  assert.equal(await reserveForSend("p", "x@firma.dk", V), null, "pending sendes aldrig");
  assert.equal(await reserveForSend("mangler", "x@firma.dk", V), null, "manglende række = ingen reservation");
  assert.ok(await reserveForSend("e", "y@firma.dk", V));
  const q = await readQueue();
  const a = q.find((d) => d.id === "a")!;
  assert.equal(a.status, "sending");
  assert.equal(a.recipientEmail, "x@firma.dk");
});

test("sending er beskyttet mod forældede hel-kø-skrivninger og sletning", async () => {
  await freshTestDb();
  const stale = [draft({ id: "a" }), draft({ id: "b" })];
  await writeQueue(stale);
  await reserveForSend("a", "x@firma.dk", "2026-09-01T08:00:00.000Z");
  await writeQueue(stale); // forældet snapshot: "a" som approved
  assert.equal((await readQueue()).find((d) => d.id === "a")!.status, "sending");
  await writeQueue([draft({ id: "b" })]); // snapshot uden "a" må ikke slette den
  assert.ok((await readQueue()).some((d) => d.id === "a"));
});

test("finishSend: sending → sent (endelig) eller → approved; ellers false", async () => {
  await freshTestDb();
  await writeQueue([draft({ id: "a" }), draft({ id: "b" })]);
  await reserveForSend("a", "x@firma.dk", "2026-09-01T08:00:00.000Z");
  await reserveForSend("b", "y@firma.dk", "2026-09-01T08:00:00.000Z");
  assert.equal(await finishSend("a", "sent", "lucas"), true);
  assert.equal(await finishSend("a", "approved", null), false, "sendt kan ikke gøres godkendt igen");
  assert.equal(await finishSend("b", "approved", null), true);
  const q = await readQueue();
  assert.deepEqual(q.map((d) => [d.id, d.status, d.sentBy ?? null]), [["a", "sent", "lucas"], ["b", "approved", null]]);
  assert.equal(await finishSend("b", "sent", "lucas"), false, "kun en reserveret kladde kan blive sendt");
});

test("reserveForSend: redigeret efter frisk læsning (ny version) ⇒ ingen reservation", async () => {
  await freshTestDb();
  await writeQueue([draft({ id: "a" })]);
  const edited = await updateDraft("a", { recipientEmail: "ny@firma.dk" });
  assert.ok(edited);
  assert.equal(await reserveForSend("a", "gammel@firma.dk", "2026-09-01T08:00:00.000Z"), null, "gammel version");
  assert.ok(await reserveForSend("a", "ny@firma.dk", edited!.updatedAt!));
});

test("updateDraft (pg): ét række-UPDATE, rører ikke andre kladder og nægter endelige", async () => {
  await freshTestDb();
  await writeQueue([draft({ id: "a" }), draft({ id: "b", body: "original" })]);
  await Promise.all([updateDraft("a", { body: "ny a" }), updateDraft("b", { body: "ny b" })]);
  const q = await readQueue();
  assert.deepEqual(q.map((d) => d.body), ["ny a", "ny b"], "samtidige redigeringer overskriver ikke hinanden");
  await reserveForSend("a", "x@firma.dk", q[0].updatedAt!);
  assert.equal(await updateDraft("a", { status: "rejected" }), null, "sending kan ikke afvises");
  assert.equal((await readQueue())[0].status, "sending");
});

test("stopOpenForRows stopper også place_id- og c:<uuid>-kladder for virksomheden", async () => {
  const db = await freshTestDb();
  const { company } = await import("./db/schema.ts");
  const { stopOpenForRows } = await import("./pg/queue.ts");
  const [c] = await db.insert(company).values({ rowNo: 900, name: "Salon X", placeId: "ChIJxyz" }).returning({ id: company.id });
  await writeQueue([draft({ id: "p", leadId: "ChIJxyz" }), draft({ id: "c", leadId: `c:${c.id}` }), draft({ id: "o", leadId: "ChIJandet" })]);
  assert.equal(await stopOpenForRows([900], "blev kunde", "2026-09-25T09:00:00.000Z"), 2);
  assert.deepEqual((await readQueue()).map((d) => d.status), ["rejected", "rejected", "approved"]);
});

test("writeQueue: forældet snapshot kan ikke genoplive en kladde der er afvist bagefter", async () => {
  await freshTestDb();
  await writeQueue([draft({ id: "a" })]);
  const stale = await readQueue(); // fx queue-enrich læser køen …
  await updateDraft("a", { status: "rejected" }); // … Lucas afviser imens …
  await writeQueue(stale); // … og enrich skriver det gamle snapshot
  assert.equal((await readQueue())[0].status, "rejected");
});

test("customerForDraft: manuelt oprettet kunde uden place_id matches på navn+by og mail", async () => {
  const db = await freshTestDb();
  const { company } = await import("./db/schema.ts");
  const { customerForDraft } = await import("./pg/queue.ts");
  await db.insert(company).values({ rowNo: -3, name: "Salon Ønske ApS", city: "Herning", email: "kontakt@salon.dk", clientNo: 7 });
  assert.equal(await customerForDraft({ leadId: "ChIJnyt", name: "SALON ØNSKE", city: "Herning" }, "andet@x.dk"), true, "navn+by");
  assert.equal(await customerForDraft({ leadId: "ChIJnyt", name: "Noget andet", city: "Ikast" }, "kontakt@salon.dk"), true, "mail");
  assert.equal(await customerForDraft({ leadId: "ChIJnyt", name: "Salon Ønske", city: "Ikast" }, "x@y.dk"), false, "anden by, anden mail");
});

test("customerForDraft: kunde med mailen kun på kontaktpersonen", async () => {
  const db = await freshTestDb();
  const { company, contact } = await import("./db/schema.ts");
  const { customerForDraft } = await import("./pg/queue.ts");
  const [c] = await db.insert(company).values({ rowNo: -4, name: "VVS Hansen", city: "Ikast", clientNo: 9 }).returning({ id: company.id });
  await db.insert(contact).values({ companyId: c.id, name: "Per", email: "Per@VVS-hansen.dk" });
  assert.equal(await customerForDraft({ leadId: "ChIJandet", name: "Hansens Rør", city: "Brande" }, "per@vvs-hansen.dk"), true);
  assert.equal(await customerForDraft({ leadId: "ChIJandet", name: "Hansens Rør", city: "Brande" }, "ukendt@x.dk"), false);
});

test("dagligt budget: atomisk pr. konto og dansk dag; samtidige forsøg overskrider aldrig loftet", async () => {
  await freshTestDb();
  const { takeDailyBudget, dailyBudgetUsed } = await import("./send-safety.ts");
  const noon = Date.parse("2026-09-25T10:00:00Z");
  const got = await Promise.all(Array.from({ length: 8 }, () => takeDailyBudget("lucas", noon, 5)));
  assert.equal(got.filter(Boolean).length, 5);
  assert.equal(await dailyBudgetUsed("lucas", noon), 5);
  assert.equal(await takeDailyBudget("charlie", noon, 5), true, "egen konto, eget budget");
  // 23:30 dansk tid samme dag deler budget; 00:30 næste dag er et nyt budget.
  assert.equal(await takeDailyBudget("lucas", Date.parse("2026-09-25T21:30:00Z"), 5), false);
  assert.equal(await takeDailyBudget("lucas", Date.parse("2026-09-25T22:30:00Z"), 5), true);
});

test("dagligt budget: to afsender-id'er på samme Gmail-konto deler ét budget", async () => {
  await freshTestDb();
  process.env.GMAIL_USER = "lucas@kinly.dk"; process.env.GMAIL_APP_PASSWORD = "x";
  process.env.CHARLIE_GMAIL_USER = "Lucas@Kinly.dk"; process.env.CHARLIE_GMAIL_APP_PASSWORD = "y";
  try {
    const { takeDailyBudget, dailyBudgetUsed } = await import("./send-safety.ts");
    const t = Date.parse("2026-09-26T10:00:00Z");
    assert.equal(await takeDailyBudget("lucas", t, 2), true);
    assert.equal(await takeDailyBudget("charlie", t, 2), true);
    assert.equal(await takeDailyBudget("charlie", t, 2), false, "samme konto ⇒ samme loft");
    assert.equal(await dailyBudgetUsed("lucas", t), 2);
  } finally {
    for (const k of ["GMAIL_USER", "GMAIL_APP_PASSWORD", "CHARLIE_GMAIL_USER", "CHARLIE_GMAIL_APP_PASSWORD"]) delete process.env[k];
  }
});
