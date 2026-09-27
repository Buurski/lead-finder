import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity } from "../db/schema.ts";
import { claimBlocksStatus, hasOpenClaim, PreviewSendError, previewClaims, previewLockName, reconcilePreview, sendPreview, type PreviewLike } from "./preview-send.ts";
import { acquireLock, releaseLock } from "../send-safety.ts";
import { DEMO_SITES, KINLY_FRONT } from "../demos.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const url = "https://demo.kinly.dk/p/abc";
const req: PreviewLike = { id: "preview_x1", company: "Salon Lux", email: "maja@salonlux.dk", status: "preview klar", previewUrl: url };
const msg = { subject: "Jeres udkast", body: `Hej Maja\n\nHer er udkastet: ${url}\n\nMin egen side: https://kinly.dk/` };

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

test("previewBodyError: samme krav som send (Sol w4a-r2 R2)", async () => {
  const { previewBodyError } = await import("./preview-send.ts");
  const url = "https://kinly.dk/udkast/x";
  // F1 27/9: front-linket er nu også en del af previewBodyError, så en gyldig tekst skal bære det.
  assert.equal(previewBodyError("Emne", `Se ${url}\n\nMin egen side: ${KINLY_FRONT}`, url), null);
  assert.match(previewBodyError("Emne", `Se ${url}`, url) ?? "", /linket til kinly\.dk/);
  assert.match(previewBodyError("Emne", "uden link", url) ?? "", /linket/);
  assert.match(previewBodyError("Emne", "x".repeat(5001) + url, url) ?? "", /for lang/);
  assert.match(previewBodyError("Emne", `Se ${url}`, undefined) ?? "", /intet link/);
});

test("SEO-tjek-henvendelse: sendes uden demo-link fra 'ny', lukker svar-opgaven; afvist kan ikke sendes (E2E 25/9)", async () => {
  const { isSendable, previewBodyError } = await import("./preview-send.ts");
  const { task } = await import("../db/schema.ts");
  const seo: PreviewLike = { id: "preview_seo1", company: "example.com", email: "ejer@example.com", status: "ny", seoTjek: { host: "example.com", score: 22, mangler: ["Sidetitel"] } };
  assert.equal(isSendable(seo), true);
  assert.equal(isSendable({ ...seo, status: "afvist" }), false);
  assert.equal(isSendable({ status: "ny", previewUrl: url }), false); // demo-henvendelse venter stadig på Hermes
  assert.equal(previewBodyError("Dit SEO-tjek af example.com", "Hej, tak for tjekket", undefined, true), null);
  await db.insert(task).values({ legacyId: "inbound:preview_seo1", title: "Svar på SEO-tjek (22/100)", owner: "lucas" });
  const x = deps(seo);
  await sendPreview(db, seo.id, { subject: "Dit SEO-tjek af example.com", body: "Hej, tak for tjekket" }, "lucas", x.d);
  assert.deepEqual(x.sent, ["ejer@example.com"]);
  const [t] = await db.select().from(task);
  assert.ok(t.doneAt, "svar-opgaven lukkes når svaret er sendt");
  await assert.rejects(sendPreview(db, "preview_seo2", msg, "lucas", deps({ ...seo, id: "preview_seo2", status: "afvist" }).d), /status "afvist"/);
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

// F1 (27/9): før dette var forhåndsvisningen og send-ruten to sæt regler —
// send-ruten afviste med 422 på tekst forhåndsvisningen havde vist som OK.
// Nu kalder begge previewBodyError, og testen måler begge veje på SAMME input.
test("forhåndsvisning og send svarer præcis det samme på samme tekst (F1)", async () => {
  const { previewBodyError } = await import("./preview-send.ts");
  const gyldigBody = `Hej Maja\n\nHer er udkastet: ${url}\n\nMin egen side: ${KINLY_FRONT}`;

  async function begge(rec: PreviewLike, subject: string, body: string): Promise<string | null> {
    const forhaand = previewBodyError(subject, body, rec.previewUrl, Boolean(rec.seoTjek));
    let send: string | null = null;
    try {
      await sendPreview(db, rec.id, { subject, body }, "lucas", deps(rec).d);
    } catch (err) {
      assert.ok(err instanceof PreviewSendError, `send fejlede med andet end PreviewSendError: ${err}`);
      send = (err as Error).message;
    }
    assert.equal(forhaand, send, `forhåndsvisning og send er uenige (${rec.id})`);
    return forhaand;
  }

  // (i) body uden kinly.dk-forsiden
  const udenForside = (await begge({ ...req, id: "preview_f1a" }, "Jeres udkast", `Se ${url}`)) ?? "";
  assert.match(udenForside, /linket til kinly\.dk/);

  // (ii) kundelink i body
  const kundeLinkBody = (await begge({ ...req, id: "preview_f1b" }, "Jeres udkast", `${gyldigBody}\n\nSe ${DEMO_SITES.ktvvs}`)) ?? "";
  assert.match(kundeLinkBody, /kundens egen side/);

  // (iii) kundelink i emnet
  const kundeLinkEmne = (await begge({ ...req, id: "preview_f1c" }, `Udkast til KT VVS (${DEMO_SITES.ktvvs})`, gyldigBody)) ?? "";
  assert.match(kundeLinkEmne, /kundens egen side/);

  // (iv) SEO-rapportmail uden demo-link: skal slippe igennem BEGGE veje
  const seo: PreviewLike = {
    id: "preview_f1d",
    company: "example.com",
    email: "ejer@example.com",
    status: "ny",
    seoTjek: { host: "example.com", score: 22, mangler: ["Sidetitel"] },
  };
  assert.equal(await begge(seo, "Dit SEO-tjek af example.com", "Hej, tak for tjekket"), null);
});
