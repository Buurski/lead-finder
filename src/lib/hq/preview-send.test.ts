import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity } from "../db/schema.ts";
import { claimBlocksStatus, hasOpenClaim, PreviewSendError, previewClaims, previewLockName, reconcilePreview, sendPreview, type PreviewLike } from "./preview-send.ts";
import { acquireLock, releaseLock } from "../send-safety.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const url = "https://demo.kinly.dk/p/abc";
const req: PreviewLike = { id: "preview_x1", company: "Salon Lux", email: "maja@salonlux.dk", status: "preview klar", previewUrl: url };
const msg = { subject: "Jeres udkast", body: `Hej Maja\n\nHer er udkastet: ${url}` };

function deps(r: PreviewLike | null, fail?: Error) {
  const sent: string[] = [];
  const marked: string[] = [];
  return {
    sent,
    marked,
    d: {
      get: async () => r,
      deliver: async (m: { to: string }) => {
        if (fail) throw fail;
        sent.push(m.to);
      },
      markSent: async (id: string) => {
        marked.push(id);
      },
    },
  };
}

test("sender én gang, og aldrig igen", async () => {
  const x = deps(req);
  await sendPreview(db, req.id, msg, "lucas", x.d);
  assert.deepEqual(x.sent, ["maja@salonlux.dk"]);
  assert.deepEqual(x.marked, [req.id]);
  await assert.rejects(sendPreview(db, req.id, msg, "charlie", x.d), PreviewSendError);
  assert.equal(x.sent.length, 1);
});

test("sikker før-accept-fejl frigiver kravet; forkerte input afvises før afsendelse", async () => {
  const bad = deps(req, Object.assign(new Error("login afvist"), { code: "EAUTH" }));
  await assert.rejects(sendPreview(db, req.id, msg, "lucas", bad.d), PreviewSendError);
  assert.equal((await db.select().from(activity)).length, 0);
  const x = deps(req);
  await sendPreview(db, req.id, msg, "lucas", x.d);
  assert.equal(x.sent.length, 1);
  for (const r of [{ ...req, status: "bygger" }, { ...req, previewUrl: undefined }, { ...req, email: "ikke-en-mail" }]) {
    const y = deps({ ...r, id: "preview_y" });
    await assert.rejects(sendPreview(db, "preview_y", msg, "lucas", y.d), PreviewSendError);
    assert.equal(y.sent.length, 0);
  }
  const z = deps({ ...req, id: "preview_z" });
  await assert.rejects(sendPreview(db, "preview_z", { ...msg, body: "uden link" }, "lucas", z.d), PreviewSendError);
});

test("tvetydig SMTP-fejl (timeout efter DATA) holder kravet — intet dobbelt-send", async () => {
  const amb = deps(req, Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" }));
  await assert.rejects(sendPreview(db, req.id, msg, "lucas", amb.d), /usikkert/);
  assert.equal((await db.select().from(activity)).length, 1, "kravet står");
  const x = deps(req);
  await assert.rejects(sendPreview(db, req.id, msg, "lucas", x.d), /allerede sendt/);
  assert.equal(x.sent.length, 0);
});

test("afstemning: kun registreret usikkert kan frigives, én vinder, sikkert sendt låses aldrig op", async () => {
  const amb = (r: PreviewLike) => deps(r, Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" })).d;
  await assert.rejects(sendPreview(db, req.id, msg, "lucas", amb(req)), /usikkert/);
  assert.equal((await previewClaims(db)).get(req.id), "uncertain");
  await reconcilePreview(db, req.id, "not-sent", async () => {});
  // Modsat klik efter frigivelse taber.
  await assert.rejects(reconcilePreview(db, req.id, "sent", async () => {}), PreviewSendError);
  const x = deps(req);
  await sendPreview(db, req.id, msg, "lucas", x.d);
  assert.deepEqual(x.sent, ["maja@salonlux.dk"]);
  assert.equal((await previewClaims(db)).get(req.id), "sent");
  await assert.rejects(reconcilePreview(db, req.id, "not-sent", async () => {}), /kan ikke frigives/);

  // "sent" med fejlende status-skrivning kan gentages (idempotent), og derefter kan kravet ikke frigives.
  const r2 = { ...req, id: "preview_x2" };
  await assert.rejects(sendPreview(db, r2.id, msg, "lucas", amb(r2)), /usikkert/);
  await assert.rejects(reconcilePreview(db, r2.id, "sent", async () => { throw new Error("KV nede"); }), /KV nede/);
  const marked: string[] = [];
  await reconcilePreview(db, r2.id, "sent", async (i) => { marked.push(i); });
  assert.deepEqual(marked, [r2.id]);
  await assert.rejects(reconcilePreview(db, r2.id, "not-sent", async () => {}), /kan ikke frigives/);
});

test("uafklaret krav (state=sending, fx fejlet registrering) kan ikke frigives — kun bekræftes som sendt", async () => {
  const r3 = { ...req, id: "preview_x3" };
  await assert.rejects(sendPreview(db, r3.id, msg, "lucas", deps(r3, Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" })).d), /usikkert/);
  // Simulér at registreringen af "uncertain" fejlede: kravet står som "sending".
  await db.update(activity).set({ payload: { previewId: r3.id, state: "sending" } });
  assert.equal((await previewClaims(db)).get(r3.id), "sending");
  await assert.rejects(reconcilePreview(db, r3.id, "not-sent", async () => {}), /ikke registreret/);
  const again = deps(r3);
  await assert.rejects(sendPreview(db, r3.id, msg, "lucas", again.d), /allerede sendt/);
  assert.equal(again.sent.length, 0);
  // Et "sending"-krav kan være i gang: kan ikke bekræftes før det er afgjort (Sol R6-F1).
  await assert.rejects(reconcilePreview(db, r3.id, "sent", async () => {}), /vent 2 minutter/);
  await reconcilePreview(db, r3.id, "sent", async () => {}, Date.now() + 3 * 60_000);
  assert.equal((await previewClaims(db)).get(r3.id), "sent");
});

test("ældre usikkert krav (uncertain=true uden state) kan stadig frigives", async () => {
  await db.insert(activity).values({ legacyId: "preview-sent:preview_old1", type: "udkast_sendt", payload: { previewId: "preview_old1", uncertain: true } });
  assert.equal((await previewClaims(db)).get("preview_old1"), "uncertain");
  await reconcilePreview(db, "preview_old1", "not-sent", async () => {});
  assert.equal((await previewClaims(db)).has("preview_old1"), false);
});

test("forsøg er ikke et sendt udkast før Gmail har taget det (tidslinje-type)", async () => {
  const r4 = { ...req, id: "preview_x4" };
  await assert.rejects(sendPreview(db, r4.id, msg, "lucas", deps(r4, Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" })).d), /usikkert/);
  assert.deepEqual((await db.select({ type: activity.type }).from(activity)).map((r) => r.type), ["udkast_forsoeg"]);
  await reconcilePreview(db, r4.id, "sent", async () => {});
  assert.deepEqual((await db.select({ type: activity.type }).from(activity)).map((r) => r.type), ["udkast_sendt"]);
  const r5 = { ...req, id: "preview_x5" };
  await sendPreview(db, r5.id, msg, "lucas", deps(r5).d);
  const types = (await db.select({ type: activity.type }).from(activity)).map((r) => r.type).sort();
  assert.deepEqual(types, ["udkast_sendt", "udkast_sendt"]);
  assert.equal(await hasOpenClaim(db, r5.id), false);
});

test("send læser status under udkastets lås: en afvisning lavet mens låsen holdes, stopper afsendelsen (Sol R7-02)", async () => {
  const r = { ...req, id: "preview_lock1" };
  const x = deps(r);
  const h = await acquireLock(previewLockName(r.id), 30_000);
  assert.ok(h);
  const pending = sendPreview(db, r.id, msg, "lucas", x.d);
  await new Promise((res) => setTimeout(res, 300));
  r.status = "afvist"; // PATCH skriver under låsen
  await releaseLock(previewLockName(r.id), h!);
  await assert.rejects(pending, PreviewSendError);
  assert.equal(x.sent.length, 0);
});

test("sendt krav er endeligt: kun 'sendt/lukket' tilladt; intet krav blokerer intet (Sol R8-02)", async () => {
  const r = { ...req, id: "preview_final1" };
  assert.equal(await claimBlocksStatus(db, r.id, "afvist"), false);
  await sendPreview(db, r.id, msg, "lucas", deps(r).d);
  assert.equal(await claimBlocksStatus(db, r.id, "afvist"), true);
  assert.equal(await claimBlocksStatus(db, r.id, "preview klar"), true);
  assert.equal(await claimBlocksStatus(db, r.id, "sendt/lukket"), false);
  assert.equal(await claimBlocksStatus(db, r.id, "sendt/lukket", true), true); // feltændring på sendt udkast (R9-02)
});
