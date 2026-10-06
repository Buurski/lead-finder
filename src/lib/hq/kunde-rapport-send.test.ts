import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { company, contact } from "../db/schema.ts";
import { __setStore, InMemoryStore, store } from "../store.ts";
import { gemMaaling, gemPersonligNote, hentLevering, keyS, oversigt, saetLevering } from "./kunde-rapport.ts";
import { iArbejdstid, klarTilAuto, sendKundeRapport } from "./kunde-rapport-send.ts";
import { foersteAfsendelse } from "./kunde-rapport.ts";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures", `kunde-maaling-${n}.json`), "utf-8"));
const ikast = fx("ikast");
const jb = { ...fx("jbcafeen"), url: "https://jbcafeen.dk/" }; // har et "Tager vi først"-fund
const MAALT = new Date("2026-09-28T21:30:00+02:00");
const EFTER_FRIST = new Date("2026-09-30T10:00:00+02:00"); // onsdag kl. 10

type Mail = { from?: string; to: string; subject: string; text: string; attachments: { filename: string; content: Buffer }[] };
function falskAfsender(fejl?: { code: string }) {
  const sendt: Mail[] = [];
  const transporter = {
    sendMail: async (m: Mail & { from: string }) => {
      if (fejl) throw Object.assign(new Error("smtp"), fejl);
      sendt.push(m);
      return {};
    },
  };
  return { sendt, pdf: async () => Buffer.from("%PDF-1.4 falsk"), transporter, from: "Lucas Buur <lucas@kinly.dk>" };
}

let db: Db;
beforeEach(async () => {
  __setStore(new InMemoryStore());
  db = await freshTestDb();
  const rows = await db
    .insert(company)
    .values([
      { rowNo: -1, clientNo: 1, name: "Ikast AutoService", website: "https://ikastautoservice.dk/", services: ["seo"] },
      { rowNo: -2, clientNo: 2, name: "Jernbanecaféen", website: "https://jbcafeen.dk/", services: ["seo"] },
    ])
    .returning({ id: company.id });
  await db.insert(contact).values({ companyId: rows[0].id, name: "Allan Jensen", email: "allan@ikast.dk" });
  await db.insert(contact).values({ companyId: rows[1].id, name: "Niels", email: "niels@jb.dk" });
  await gemMaaling(ikast, MAALT);
  await gemMaaling(jb, MAALT);
});
after(() => __setStore(null));

test("test-send går kun til den valgte adresse og markerer intet", async () => {
  const a = falskAfsender();
  const r = await sendKundeRapport(db, "ikastautoservice.dk", "2026-09", "lucas", { til: "lucas@test.dk", test: true, afsender: a, pdf: a.pdf });
  assert.equal(r.til, "lucas@test.dk");
  assert.equal(a.sendt.length, 1);
  assert.match(a.sendt[0].subject, /^\[TEST\] /);
  assert.equal(a.sendt[0].from, "Lucas Buur <lucas@kinly.dk>");
  assert.equal(a.sendt[0].attachments[0].content.subarray(0, 5).toString(), "%PDF-");
  assert.equal(await hentLevering("ikastautoservice.dk", "2026-09"), null);
  assert.equal(await store.get(keyS("ikastautoservice.dk", "2026-09")), null);
});

test("rigtig send: kundens kontakt, fryses, kan hverken sendes igen eller fortrydes", async () => {
  await gemPersonligNote("ikastautoservice.dk", "2026-09", "Tak for kaffen i tirsdags.");
  const a = falskAfsender();
  const r = await sendKundeRapport(db, "ikastautoservice.dk", "2026-09", "lucas", { nu: EFTER_FRIST, afsender: a, pdf: a.pdf });
  assert.equal(r.til, "allan@ikast.dk");
  const m = a.sendt[0];
  assert.match(m.text, /^Hej Allan\./, "hilsenen går til den person, mailen sendes til");
  assert.match(m.text, /Tak for kaffen i tirsdags\./);
  assert.equal((m.text.match(/\nLucas\b/g) ?? []).length <= 1, true, "navnet står ikke to gange over signaturen");
  const lev = await hentLevering("ikastautoservice.dk", "2026-09");
  assert.equal(lev?.status, "sendt");
  assert.equal(lev?.mail?.til, "allan@ikast.dk");
  assert.ok(lev?.rapport && lev.maaling);
  assert.equal(await store.get(keyS("ikastautoservice.dk", "2026-09")), null);
  await assert.rejects(sendKundeRapport(db, "ikastautoservice.dk", "2026-09", "lucas", { afsender: a, pdf: a.pdf }), /allerede sendt/);
  await assert.rejects(saetLevering("ikastautoservice.dk", "2026-09", "aaben", "lucas", undefined, EFTER_FRIST), /kan ikke kaldes tilbage/);
  await assert.rejects(gemPersonligNote("ikastautoservice.dk", "2026-09", "ny"), /sendt/);
  assert.equal(a.sendt.length, 1);
});

test("fejl før serveren fik mailen frigiver låsen; ellers står den og stopper automatikken", async () => {
  await assert.rejects(sendKundeRapport(db, "ikastautoservice.dk", "2026-09", "lucas", { afsender: falskAfsender({ code: "ECONNECTION" }), pdf: falskAfsender().pdf }));
  assert.equal(await store.get(keyS("ikastautoservice.dk", "2026-09")), null);
  await assert.rejects(sendKundeRapport(db, "ikastautoservice.dk", "2026-09", "lucas", { afsender: falskAfsender({ code: "EMESSAGE" }), pdf: falskAfsender().pdf }));
  assert.ok(await store.get(keyS("ikastautoservice.dk", "2026-09")), "måske sendt: låsen står");
  await assert.rejects(sendKundeRapport(db, "ikastautoservice.dk", "2026-09", "lucas", { afsender: falskAfsender(), pdf: falskAfsender().pdf }), /Tjek Sendt-mappen/);
  const r = (await oversigt(db, "2026-09")).raekker.find((x) => x.domaene === "ikastautoservice.dk");
  assert.match(r?.auto.stop ?? "", /afbrudt/);
});

test("auto-vejen sender intet: hverken efter fristen eller efter genåbning; mennesket i HQ virker fortsat", async () => {
  const a = falskAfsender();
  const o = await oversigt(db, "2026-09");
  assert.deepEqual(klarTilAuto(o.raekker, MAALT).map((r) => r.domaene), [], "ikke før fristen");
  assert.deepEqual(klarTilAuto(o.raekker, EFTER_FRIST).map((r) => r.domaene), [], "efter fristen: auto er slået fra");
  assert.match(o.raekker.find((r) => r.domaene === "jbcafeen.dk")?.auto.stop ?? "", /haster/, "de specifikke stop-grunde vises stadig");

  await assert.rejects(
    sendKundeRapport(db, "ikastautoservice.dk", "2026-09", "auto", { nu: EFTER_FRIST, afsender: a, pdf: a.pdf }),
    /slået fra/,
  );
  assert.equal(a.sendt.length, 0, "auto-vejen nåede ikke transporten");
  assert.equal(await store.get(keyS("ikastautoservice.dk", "2026-09")), null, "ingen mail = ingen lås");

  await saetLevering("ikastautoservice.dk", "2026-09", "sprunget", "lucas", "ferie", EFTER_FRIST);
  await saetLevering("ikastautoservice.dk", "2026-09", "aaben", "lucas", undefined, EFTER_FRIST);
  assert.deepEqual(klarTilAuto((await oversigt(db, "2026-09")).raekker, EFTER_FRIST).map((r) => r.domaene), [], "genåbnet = stadig ingen auto");
  await assert.rejects(
    sendKundeRapport(db, "ikastautoservice.dk", "2026-09", "auto", { nu: EFTER_FRIST, afsender: a, pdf: a.pdf }),
    /slået fra/,
  );
  assert.equal(a.sendt.length, 0, "stadig intet sendt");

  const r = await sendKundeRapport(db, "ikastautoservice.dk", "2026-09", "lucas", { nu: EFTER_FRIST, afsender: a, pdf: a.pdf });
  assert.equal(r.til, "allan@ikast.dk");
  assert.equal(a.sendt.length, 1, "den manuelle vej sender præcis én mail");
});

test("arbejdstid er hverdage kl. 8-17 i dansk tid", () => {
  assert.equal(iArbejdstid(new Date("2026-09-30T10:00:00+02:00")), true);
  assert.equal(iArbejdstid(new Date("2026-09-30T07:30:00+02:00")), false);
  assert.equal(iArbejdstid(new Date("2026-09-30T17:00:00+02:00")), false);
  assert.equal(iArbejdstid(new Date("2026-10-03T11:00:00+02:00")), false, "lørdag");
  assert.equal(iArbejdstid(new Date("2026-11-02T08:30:00+01:00")), true, "vintertid");
  assert.equal(foersteAfsendelse("2026-09-29T22:18:56Z"), new Date("2026-09-30T08:00:00+02:00").toISOString(), "nat -> kl. 8");
  assert.equal(foersteAfsendelse("2026-10-02T15:30:00Z"), new Date("2026-10-05T08:00:00+02:00").toISOString(), "fredag aften -> mandag");
  assert.equal(foersteAfsendelse("2026-09-30T08:30:00Z"), "2026-09-30T08:30:00.000Z", "i arbejdstid = uændret");
});
