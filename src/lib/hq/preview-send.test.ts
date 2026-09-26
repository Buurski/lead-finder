import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity } from "../db/schema.ts";
import { PreviewSendError, sendPreview, type PreviewLike } from "./preview-send.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const url = "https://demo.kinly.dk/p/abc";
const req: PreviewLike = { id: "preview_x1", company: "Salon Lux", email: "maja@salonlux.dk", status: "preview klar", previewUrl: url };
const msg = { subject: "Jeres udkast", body: `Hej Maja\n\nHer er udkastet: ${url}\n\nMin egen side: https://kinly.dk/` };

function deps(r: PreviewLike | null, fail = false) {
  const sent: string[] = [];
  const marked: string[] = [];
  return {
    sent,
    marked,
    d: {
      get: async () => r,
      deliver: async (m: { to: string }) => {
        if (fail) throw new Error("smtp nede");
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

test("fejlet afsendelse frigiver kravet; forkerte input afvises før afsendelse", async () => {
  const bad = deps(req, true);
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

// Link-politik (Lucas 24/9): et case-link er ikke forsiden. Den løse
// includes("https://kinly.dk/")-test lod /case/... slippe igennem — gaten skal
// bruge samme strenge kontrol som missingReferenceLinks i demos.ts.
test("et case-link tæller ikke som forsiden (streng front-gate)", async () => {
  const x = deps({ ...req, id: "preview_s" });
  const body = `Hej Maja\n\nHer er udkastet: ${url}\n\nVi har bygget https://kinly.dk/case/vida-klinik/`;
  await assert.rejects(sendPreview(db, "preview_s", { subject: msg.subject, body }, "lucas", x.d), PreviewSendError);
  assert.equal(x.sent.length, 0);
});
