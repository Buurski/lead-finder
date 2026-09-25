import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity } from "../db/schema.ts";
import { PreviewSendError, previewClaims, reconcilePreview, sendPreview, type PreviewLike } from "./preview-send.ts";

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

test("usikkert forsøg kan afstemmes: én vinder, ikke mens det kan være i gang, sikkert sendt kan aldrig låses op", async () => {
  const later = Date.now() + 3 * 60_000;
  const amb = () => deps(req, Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" })).d;
  await assert.rejects(sendPreview(db, req.id, msg, "lucas", amb()), /usikkert/);
  // For tidligt: forsøget kan stadig være i gang.
  await assert.rejects(reconcilePreview(db, req.id, "not-sent", async () => {}), /vent 2 minutter/);
  await reconcilePreview(db, req.id, "not-sent", async () => {}, later);
  // Modsat klik efter frigivelse taber.
  await assert.rejects(reconcilePreview(db, req.id, "sent", async () => {}, later), PreviewSendError);
  const x = deps(req);
  await sendPreview(db, req.id, msg, "lucas", x.d);
  assert.deepEqual(x.sent, ["maja@salonlux.dk"]);
  await assert.rejects(reconcilePreview(db, req.id, "not-sent", async () => {}, later), /kan ikke frigives/);
  assert.equal((await db.select().from(activity)).length, 1, "sikkert krav står");

  const r2 = { ...req, id: "preview_x2" };
  await assert.rejects(sendPreview(db, r2.id, msg, "lucas", deps(r2, Object.assign(new Error("Timeout"), { code: "ETIMEDOUT" })).d), /usikkert/);
  // "sent" med fejlende status-skrivning kan gentages (idempotent), og derefter kan kravet ikke frigives.
  await assert.rejects(reconcilePreview(db, r2.id, "sent", async () => { throw new Error("KV nede"); }, later), /KV nede/);
  const marked: string[] = [];
  await reconcilePreview(db, r2.id, "sent", async (i) => { marked.push(i); }, later);
  assert.deepEqual(marked, [r2.id]);
  await assert.rejects(reconcilePreview(db, r2.id, "not-sent", async () => {}, later), /kan ikke frigives/);

  const claims = await previewClaims(db);
  assert.equal(claims.get(req.id), "sent");
  assert.equal(claims.get(r2.id), "sent");
});
