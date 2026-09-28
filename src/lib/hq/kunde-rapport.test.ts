import { test, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { activity, company, contact } from "../db/schema.ts";
import { __setStore, InMemoryStore, store } from "../store.ts";
import { forrigeSendte, gemMaaling, KundeRapportError, oversigt, rapportFor, saetLevering, validerMaaling } from "./kunde-rapport.ts";

const fx = (n: string) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures", `kunde-maaling-${n}.json`), "utf-8"));
const ikast = fx("ikast");
const vida = fx("vida");

let db: Db;
let ikastId: string;
beforeEach(async () => {
  __setStore(new InMemoryStore());
  db = await freshTestDb();
  const rows = await db
    .insert(company)
    .values([
      { rowNo: -1, clientNo: 1, name: "Ikast AutoService", website: "https://ikastautoservice.dk/", services: ["hjemmeside", "seo"] },
      { rowNo: -2, clientNo: 2, name: "VIDA Skønhedsklinik", website: "https://vida-klinik.dk/", services: ["seo"] },
      { rowNo: -3, clientNo: 3, name: "KT VVS", website: "http://ktvvs.dk/", services: ["hjemmeside"] },
      { rowNo: -4, clientNo: 4, name: "Jernbanecaféen", website: "", services: ["seo"] },
      { rowNo: -5, name: "Lead med SEO", website: "https://lead.dk", services: ["seo"] }, // ikke kunde
    ])
    .returning({ id: company.id, name: company.name });
  ikastId = rows[0].id;
  await db.insert(contact).values({ companyId: ikastId, name: "Allan Jensen", email: "a@x.dk" });
});
after(() => __setStore(null));

test("gaten: en blokeret eller delvis kørsel kan ikke komme ind", async () => {
  await assert.rejects(gemMaaling({ ...ikast, status_flag: "blokeret", kan_sendes: false, kan_sendes_grund: "HTTP 403" }), /ikke sendbar.*403/);
  await assert.rejects(gemMaaling({ ...ikast, status_flag: "delvis", kan_sendes: false }), KundeRapportError);
  await assert.rejects(gemMaaling({ ...ikast, kan_sendes: "true" }), KundeRapportError, "kun ægte true tæller");
  await assert.rejects(gemMaaling({ ...ikast, url: "ikke en adresse" }), KundeRapportError);
});

test("én måling pr. domæne pr. måned: nyere overskriver, ældre afvises, sendt låser måneden", async () => {
  const r1 = await gemMaaling(ikast);
  assert.deepEqual(r1, { domaene: "ikastautoservice.dk", maaned: "2026-09", overskrev: false });
  const senere = { ...ikast, maalt: "2026-09-29T08:00:00+02:00" };
  assert.equal((await gemMaaling(senere)).overskrev, true);
  await assert.rejects(gemMaaling(ikast), /nyere måling/);
  await saetLevering("ikastautoservice.dk", "2026-09", "sendt", "lucas");
  await assert.rejects(gemMaaling({ ...ikast, maalt: "2026-09-30T08:00:00+02:00" }), /allerede sendt/);
  const om16min = new Date(Date.now() + 16 * 60_000);
  await assert.rejects(saetLevering("ikastautoservice.dk", "2026-09", "aaben", "lucas", undefined, om16min), /kan ikke længere fortrydes/);
  // Låsen kan ikke omgås: "sprunget" oven i sendt afvises, og et nyt "sendt" genstarter ikke vinduet.
  await assert.rejects(saetLevering("ikastautoservice.dk", "2026-09", "sprunget", "lucas", "x"), /allerede sendt/);
  const igen = await saetLevering("ikastautoservice.dk", "2026-09", "sendt", "charlie", undefined, om16min);
  assert.notEqual(igen?.at, om16min.toISOString());
  await assert.rejects(saetLevering("ikastautoservice.dk", "2026-09", "aaben", "lucas", undefined, om16min), /kan ikke længere fortrydes/);
});

test("pilene peger mod den frosne måling, også hvis den levende senere bliver overskrevet", async () => {
  await gemMaaling(ikast);
  await saetLevering("ikastautoservice.dk", "2026-09", "sendt", "lucas");
  const frossen = await forrigeSendte("ikastautoservice.dk", "2026-10");
  // Simulér racet: en måling lander i lageret efter "sendt".
  await store.put("kunderapport/maaling/ikastautoservice.dk/2026-09", { modtaget: "x", maaling: { ...frossen, maalt: "2026-09-30T08:00:00+02:00" } });
  assert.equal((await forrigeSendte("ikastautoservice.dk", "2026-10"))?.maalt, frossen?.maalt);
});

test("oversigten dømmer den valgte måned ud fra kundelisten, ikke ud fra tidligere rapporter", async () => {
  // Ingen målinger overhovedet: alle SEO-kunder mangler (også dem der aldrig har fået en).
  let o = await oversigt(db, "2026-09");
  assert.deepEqual(o.taeller, { mangler: 3, klar: 0, sprunget: 0, sendt: 0 });
  assert.ok(!o.raekker.some((r) => r.kunde === "KT VVS" || r.kunde === "Lead med SEO"));
  assert.match(o.raekker.find((r) => r.kunde === "Jernbanecaféen")!.note, /ingen hjemmeside-adresse/);

  await gemMaaling(ikast);
  await gemMaaling(vida);
  await saetLevering("ikastautoservice.dk", "2026-09", "sendt", "lucas");
  o = await oversigt(db, "2026-09");
  assert.deepEqual(o.taeller, { mangler: 1, klar: 1, sprunget: 0, sendt: 1 });
  const ik = o.raekker.find((r) => r.domaene === "ikastautoservice.dk")!;
  assert.equal(ik.variant, "med-adgang"); // motorens egne Google-tal
  assert.equal(o.raekker.find((r) => r.domaene === "vida-klinik.dk")!.variant, "uden-adgang");

  // September er sendt, men oktober er en ny måned: alle mangler igen.
  assert.equal((await oversigt(db, "2026-10")).taeller.mangler, 3);
});

test("måling for en side uden SEO på profilen vises som ikke tilmeldt, tælles ikke med", async () => {
  await gemMaaling({ ...vida, url: "https://www.jbcafeen.dk/", navn: "Jernbanecafeen" });
  const o = await oversigt(db, "2026-09");
  const r = o.raekker.find((x) => x.domaene === "jbcafeen.dk")!;
  assert.equal(r.tilmeldt, false);
  assert.equal(r.status, "klar");
  assert.equal(o.taeller.klar, 0);
});

test("spring over kræver en grund; fortryd åbner igen; sendt kræver en måling", async () => {
  await assert.rejects(saetLevering("vida-klinik.dk", "2026-09", "sprunget", "lucas", "  "), /hvorfor/);
  await assert.rejects(saetLevering("vida-klinik.dk", "2026-09", "sendt", "lucas"), /ingen måling/);
  const lev = await saetLevering("vida-klinik.dk", "2026-09", "sprunget", "lucas", "lægges sammen med fakturaen");
  assert.equal(lev?.grund, "lægges sammen med fakturaen");
  assert.equal((await oversigt(db, "2026-09")).raekker.find((r) => r.domaene === "vida-klinik.dk")!.status, "sprunget");
  await saetLevering("vida-klinik.dk", "2026-09", "aaben", "lucas");
  assert.equal((await oversigt(db, "2026-09")).raekker.find((r) => r.domaene === "vida-klinik.dk")!.status, "mangler");
});

test("pilene peger mod den sidst SENDTE rapport, ikke en genkørsel eller en sprunget måned", async () => {
  await gemMaaling(ikast); // september
  await gemMaaling({ ...ikast, maalt: "2026-10-27T09:00:00+01:00" });
  assert.equal(await forrigeSendte("ikastautoservice.dk", "2026-10"), null, "september er aldrig sendt");
  await saetLevering("ikastautoservice.dk", "2026-09", "sendt", "lucas");
  assert.equal((await forrigeSendte("ikastautoservice.dk", "2026-10"))?.maalt, ikast.maalt);
  const r = await rapportFor(db, "ikastautoservice.dk", "2026-10");
  assert.equal(r?.nulpunkt, false);
});

test("rapporten henter kundens navn, fornavn og månedens kundesynlige arbejde fra HQ", async () => {
  await gemMaaling({ ...ikast, maalt: "2026-10-27T09:00:00+01:00" });
  await db.insert(activity).values([
    { companyId: ikastId, type: "arbejde", summary: "Ny side om lånebil", payload: { kundeSynlig: true }, at: new Date("2026-10-05T10:00:00Z") },
    { companyId: ikastId, type: "arbejde", summary: "Intern oprydning", payload: { kundeSynlig: false }, at: new Date("2026-10-06T10:00:00Z") },
    { companyId: ikastId, type: "arbejde", summary: "September-arbejde", payload: { kundeSynlig: true }, at: new Date("2026-09-20T10:00:00Z") },
  ]);
  const r = await rapportFor(db, "ikastautoservice.dk", "2026-10");
  assert.equal(r?.kunde, "Ikast AutoService");
  assert.deepEqual(r?.arbejde, ["Ny side om lånebil"]);
  assert.match(r?.mail.tekst ?? "", /^Hej Allan\./);
  assert.equal(await rapportFor(db, "ikastautoservice.dk", "2026-11"), null);
});

test("AI-nævninger valideres: gyldigt felt kommer med, ugyldigt droppes uden at vælte målingen", () => {
  const ok = validerMaaling({ ...fx("vida"), ai_naevninger: { spurgt: 5, naevnt: 4, tjekket: "2026-09-28T10:00:00+02:00", spoergsmaal: [{ q: "  skønhedsklinik   i Aalborg ", naevnt: true }] } });
  assert.deepEqual(ok.ai_naevninger, { spurgt: 5, naevnt: 4, tjekket: "2026-09-28T10:00:00+02:00", spoergsmaal: [{ q: "skønhedsklinik i Aalborg", naevnt: true }] });
  for (const bad of [{ spurgt: 5, naevnt: 6 }, { spurgt: 0, naevnt: 0 }, { spurgt: "5", naevnt: 2.5 }, "x"])
    assert.equal(validerMaaling({ ...fx("vida"), ai_naevninger: bad }).ai_naevninger, undefined);
});
