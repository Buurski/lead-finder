import { test } from "node:test";
import assert from "node:assert/strict";

// PGlite som app-db (samme mønster som queue.test.ts) — aldrig rigtig Neon.
process.env.DATA_BACKEND = "pg";
const { freshTestDb } = await import("./db/test-db.ts");
const { acquireSendLock, releaseSendLock, sendLockHeld, failedBeforeAccept } = await import("./send-safety.ts");
const { writeQueue, readQueue, reserveForSend, finishSend } = await import("./queue.ts");
import type { QueueDraft } from "./queue.ts";

function draft(overrides: Partial<QueueDraft>): QueueDraft {
  return {
    id: "d1", leadId: "7", name: "Kagehuset", branch: "café", city: "Herning",
    hooks: [], demoPair: [], professionalism: "", subject: "s", body: "b",
    status: "approved", source: "daily-engine",
    createdAt: "2026-09-25T08:00:00.000Z", updatedAt: "2026-09-25T08:00:00.000Z",
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
  assert.equal(failedBeforeAccept({ code: "ECONNECTION" }), true);
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
  const [r1, r2] = await Promise.all([reserveForSend("a", "x@firma.dk"), reserveForSend("a", "x@firma.dk")]);
  assert.equal([r1, r2].filter(Boolean).length, 1, "præcis én reservation");
  assert.equal(await reserveForSend("p", "x@firma.dk"), null, "pending sendes aldrig");
  assert.equal(await reserveForSend("mangler", "x@firma.dk"), null, "manglende række = ingen reservation");
  assert.ok(await reserveForSend("e", "y@firma.dk"));
  const q = await readQueue();
  const a = q.find((d) => d.id === "a")!;
  assert.equal(a.status, "sending");
  assert.equal(a.recipientEmail, "x@firma.dk");
});

test("sending er beskyttet mod forældede hel-kø-skrivninger og sletning", async () => {
  await freshTestDb();
  const stale = [draft({ id: "a" }), draft({ id: "b" })];
  await writeQueue(stale);
  await reserveForSend("a", "x@firma.dk");
  await writeQueue(stale); // forældet snapshot: "a" som approved
  assert.equal((await readQueue()).find((d) => d.id === "a")!.status, "sending");
  await writeQueue([draft({ id: "b" })]); // snapshot uden "a" må ikke slette den
  assert.ok((await readQueue()).some((d) => d.id === "a"));
});

test("finishSend: sending → sent (endelig) eller → approved; ellers false", async () => {
  await freshTestDb();
  await writeQueue([draft({ id: "a" }), draft({ id: "b" })]);
  await reserveForSend("a", "x@firma.dk");
  await reserveForSend("b", "y@firma.dk");
  assert.equal(await finishSend("a", "sent", "lucas"), true);
  assert.equal(await finishSend("a", "approved", null), false, "sendt kan ikke gøres godkendt igen");
  assert.equal(await finishSend("b", "approved", null), true);
  const q = await readQueue();
  assert.deepEqual(q.map((d) => [d.id, d.status, d.sentBy ?? null]), [["a", "sent", "lucas"], ["b", "approved", null]]);
  assert.equal(await finishSend("b", "sent", "lucas"), false, "kun en reserveret kladde kan blive sendt");
});
