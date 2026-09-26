import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity } from "../db/schema.ts";
import { PreviewSendError, sendPreview, type PreviewLike } from "./preview-send.ts";
import { KINLY_FRONT } from "../demos.ts";

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

// Fund 6 (26/9): GratisUdkast skriver standardteksten med defaultPreviewBody, og
// den tekst skal kunne gå gennem denne gate. Uden testen her kan nogen fjerne
// kinly.dk-linjen fra standardteksten igen uden at nogen opdager det — det var
// præcis fejlen s7 rettede.
test("standardteksten i GratisUdkast består sendPreview-gaten", async () => {
  const { defaultPreviewBody } = await import("./preview-body.ts");
  const body = defaultPreviewBody({ contactName: "Maja", company: req.company, previewUrl: url });
  const x = deps({ ...req, id: "preview_std" });
  await sendPreview(db, "preview_std", { subject: "Jeres gratis udkast fra Kinly", body }, "lucas", x.d);
  assert.deepEqual(x.sent, [req.email]);

  // ...og det er link-gaten der holder: samme tekst uden forside-linjen afvises.
  const uden = body.replace(`Min egen side: ${KINLY_FRONT}`, "Min egen side: vi har også en hjemmeside");
  const y = deps({ ...req, id: "preview_std2" });
  await assert.rejects(
    sendPreview(db, "preview_std2", { subject: "Jeres gratis udkast fra Kinly", body: uden }, "lucas", y.d),
    (err: Error) => err instanceof PreviewSendError && /kinly\.dk/.test(err.message),
  );
  assert.equal(y.sent.length, 0);
});

// 26/9: kundens egen side må aldrig linkes i udkastmailen — gaten står FØR db/deliver.
test("kunde-link i mailen afvises før db og afsendelse", async () => {
  const x = deps(req);
  const body = `Her er udkastet: ${url} — se min egen side https://kinly.dk/ og https://ktvvs.vercel.app/path?x=y`;
  await assert.rejects(sendPreview(db, req.id, { subject: msg.subject, body }, "lucas", x.d), PreviewSendError);
  assert.equal(x.sent.length, 0);
  assert.equal((await db.select().from(activity)).length, 0, "intet db-krav må oprettes");
});

// 26/9: previewUrl ER mailens link. Peger udkastet selv på en kendt kundeside,
// skal gaten give den klare besked — også når body'en slet ikke har linket, og
// før db/deliver.
test("kundeside som previewUrl afvises før db og afsendelse", async () => {
  const r: PreviewLike = { ...req, id: "preview_p1", previewUrl: "ktvvs.vercel.app/path?x=y" };
  for (const body of [
    `Her er udkastet: https://ktvvs.vercel.app/path?x=y\n\nMin egen side: https://kinly.dk/`,
    `Uden link endnu\n\nMin egen side: https://kinly.dk/`,
  ]) {
    const x = deps(r);
    await assert.rejects(
      sendPreview(db, r.id, { subject: msg.subject, body }, "lucas", x.d),
      /kundens egen side/,
    );
    assert.equal(x.sent.length, 0);
    assert.equal((await db.select().from(activity)).length, 0, "intet db-krav må oprettes");
  }
});

// Emnet er en selvstændig send-vej: et kunde-domæne der kan læses her må ikke ud.
test("kundeside i emnet afvises før db og afsendelse", async () => {
  const x = deps(req);
  const body = `Her er udkastet: ${url}\n\nMin egen side: https://kinly.dk/`;
  await assert.rejects(
    sendPreview(db, req.id, { subject: "Udkast til KT VVS (ktvvs.vercel.app)", body }, "lucas", x.d),
    /kundens egen side/,
  );
  assert.equal(x.sent.length, 0);
  assert.equal((await db.select().from(activity)).length, 0, "intet db-krav må oprettes");
});

// Positiv kontrol: den legitime demo-preview og kinly.dk-forsiden går uhindret.
test("legitim demo-preview i previewUrl og body sendes", async () => {
  const x = deps(req);
  await sendPreview(db, req.id, msg, "lucas", x.d);
  assert.deepEqual(x.sent, ["maja@salonlux.dk"]);
});
