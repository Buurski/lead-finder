// Tests for Annonce-studiet: tekstregler, kunde-ja-gate, versionsbundet godkendelse, A/B-vurdering og bestillinger.
import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryStore, __setStore } from "../store.ts";
import {
  afslutTest, bestil, fortrydResultat, gemTekster, loadAnnoncer, loadStudie, opretTest, setBeslutning, setBestillingStatus, setKundeJa,
  studieOversigt, tilfoejResultat,
} from "./annoncer.ts";
import {
  foldTests, manglerJa, pVaerdi, tekstFejl, validerTekster, versionAf, vurderTest, type AbTest,
} from "./annonce-studie-types.ts";
import { tolkSvar } from "./annonce-tekster-ai.ts";
import { annonceTal } from "../lucas-os-read.ts";

const fri = () => loadAnnoncer().filter((a) => a.kunder.length === 0);
const medKunde = () => loadAnnoncer().find((a) => a.kunder.length > 0)!;
const ny = () => __setStore(new InMemoryStore());

test("tekstregler: længde, tal uden kilde, pris uden moms, forbudte ord og kundenavne", () => {
  assert.deepEqual(tekstFejl("Ny hjemmeside fra 3.997 kr. ekskl. moms", 40), []);
  assert.ok(tekstFejl("Fra 2.999 kr. ekskl. moms", 40).some((f) => f.includes("2.999")));
  assert.ok(tekstFejl("Fra 3.997 kr.", 40).some((f) => f.includes("ekskl. moms")));
  assert.ok(tekstFejl("Klar på 1-2 uger", 40).length > 0);
  assert.ok(tekstFejl("Ingen binding", 40).some((f) => f.includes("binding")));
  assert.ok(tekstFejl("Danmarks bedste side", 40).length > 0);
  assert.ok(tekstFejl("Som hos Ikast Autoservice", 40).some((f) => f.includes("kunden")));
  assert.ok(tekstFejl("Se den nu!", 40).includes("udråbstegn"));
  assert.ok(tekstFejl("x".repeat(41), 40).some((f) => f.includes("41 af 40")));
});

test("validerTekster: 1 til 5 pr. felt, ingen dubletter, fakta_id kun fra listen", () => {
  const v = validerTekster({ overskrifter: [" Se jeres side,  før I betaler "], primaere: ["I ejer siden 100 %."], fakta_id: ["ejer", "findes-ikke"] });
  assert.deepEqual(v.overskrifter, ["Se jeres side, før I betaler"]);
  assert.deepEqual(v.fakta_id, ["ejer"]);
  assert.throws(() => validerTekster({ overskrifter: [], primaere: ["a"] }), /1 til 5/);
  assert.throws(() => validerTekster({ overskrifter: ["Hej", "hej"], primaere: ["a"] }), /ens/);
  assert.throws(() => validerTekster({ overskrifter: ["Fra 1.000 kr. ekskl. moms"], primaere: ["a"] }), /1.000/);
});

test("AI-svar: ugyldige forslag sorteres fra med grund, gyldige beholdes", () => {
  const f = tolkSvar('blabla {"overskrifter":["Se jeres side, før I betaler","Klar på 1-2 uger!"],"primaere":["I ejer siden 100 %."],"fakta_id":["ejer","x"]}');
  assert.deepEqual(f.overskrifter, ["Se jeres side, før I betaler"]);
  assert.equal(f.afvist.length, 1);
  assert.deepEqual(f.fakta_id, ["ejer"]);
  assert.deepEqual(tolkSvar("ikke json").overskrifter, []);
});

test("kunde-ja: annonce med kundeside kan ikke godkendes, før hver kunde har sagt ja med en note", async () => {
  ny();
  const a = medKunde();
  await assert.rejects(() => setBeslutning(a.slug, "godkendt", "lucas"), /KRÆVER KUNDE-OK/);
  await assert.rejects(() => setKundeJa(a.kunder[0], true, "", "lucas"), /Note mangler/);
  await assert.rejects(() => setKundeJa("Findes ikke", true, "x", "lucas"), /Ukendt kunde/);
  for (const k of a.kunder) await setKundeJa(k, true, "Mail 16/10 fra ejeren", "lucas");
  assert.deepEqual(manglerJa(a, (await loadStudie()).kundeJa), []);
  assert.equal((await setBeslutning(a.slug, "godkendt", "lucas"))[a.slug].status, "godkendt");
  assert.ok((await studieOversigt()).godkendte.some((g) => g.slug === a.slug));
  await setKundeJa(a.kunder[0], false, "trak ja tilbage", "lucas");
  await assert.rejects(() => setBeslutning(a.slug, "godkendt", "lucas"), /KRÆVER KUNDE-OK/);
  assert.ok(!(await studieOversigt()).godkendte.some((g) => g.slug === a.slug), "trukket ja: ikke længere brugbar, selvom den stod som godkendt");
  const fri1 = fri()[0];
  await setBeslutning(fri1.slug, "godkendt", "lucas");
  await assert.rejects(() => opretTest({ navn: "T", start: "2026-10-20", arme: [a.slug, fri1.slug] }, "lucas"), /kundens ja mangler/);
});

test("version: nye tekster gør en godkendt annonce ikke-godkendt, og test kræver godkendt version", async () => {
  ny();
  const [a, b] = fri().filter((x, i, arr) => arr.findIndex((y) => y.gruppe === x.gruppe) === i);
  await setBeslutning(a.slug, "godkendt", "lucas");
  await setBeslutning(b.slug, "godkendt", "lucas");
  assert.equal((await studieOversigt()).godkendte.length, 2);
  await gemTekster(a.gruppe, { overskrifter: ["Se jeres side, før I betaler"], primaere: ["I ejer siden 100 %."] }, "manuel", "lucas");
  assert.equal((await studieOversigt()).godkendte.length, 1, "a skal godkendes igen efter nye tekster");
  await assert.rejects(() => opretTest({ navn: "T", start: "2026-10-20", arme: [a.slug, b.slug] }, "lucas"), /ikke godkendt/);
  await setBeslutning(a.slug, "godkendt", "lucas");
  const tests = await opretTest({ navn: "Hånd mod pris", hypotese: "Pris i billedet giver billigere henvendelser", start: "2026-10-20", arme: [a.slug, b.slug] }, "lucas");
  assert.equal(tests.length, 1);
  await assert.rejects(() => opretTest({ navn: "T2", start: "2026-10-20", arme: [a.slug, b.slug] }, "lucas"), /allerede med/);
  await assert.rejects(() => opretTest({ navn: "T3", start: "2026-10-20", arme: [a.slug] }, "lucas"), /2 eller 3/);
});

test("resultater: validering, fortryd, afslut og stopregler", async () => {
  ny();
  const [a, b] = fri().filter((x, i, arr) => arr.findIndex((y) => y.gruppe === x.gruppe) === i);
  await setBeslutning(a.slug, "godkendt", "lucas");
  await setBeslutning(b.slug, "godkendt", "lucas");
  const [t] = await opretTest({ navn: "T", start: "2026-10-20", arme: [a.slug, b.slug] }, "lucas");
  const r = { id: t.id, fra: "2026-10-20", til: "2026-10-26" };
  await assert.rejects(() => tilfoejResultat({ ...r, slug: a.slug, forbrug: 100, leads: 1, kunder: 2 }, "lucas"), /flere end henvendelserne/);
  await assert.rejects(() => tilfoejResultat({ ...r, slug: a.slug, forbrug: -1, leads: 0 }, "lucas"), /Forbrug/);
  await assert.rejects(() => tilfoejResultat({ ...r, slug: "x", forbrug: 1, leads: 0 }, "lucas"), /ikke med i testen/);
  let ts = await tilfoejResultat({ ...r, slug: a.slug, forbrug: "650", leads: 0 }, "charlie");
  await tilfoejResultat({ ...r, slug: b.slug, forbrug: 640, leads: 3 }, "charlie");
  const v = vurderTest((await loadStudie()).tests[0]);
  assert.match(v.arme.find((x) => x.slug === a.slug)!.stop!, /uden en eneste henvendelse/);
  assert.equal(v.fører, b.slug);
  assert.equal(v.sikker, false, "3 henvendelser er for få til at være sikker");
  ts = await fortrydResultat(t.id, ts[0].resultater[0].rid, "lucas");
  assert.equal(ts[0].resultater.length, 1);
  assert.match(vurderTest(ts[0]).tekst, /For tidligt/);
  ts = await afslutTest(t.id, b.slug, "b vandt", "lucas");
  assert.equal(ts[0].status, "afsluttet");
  await assert.rejects(() => tilfoejResultat({ ...r, slug: a.slug, forbrug: 1, leads: 0 }, "lucas"), /afsluttet/);
  const tal = annonceTal(await studieOversigt());
  assert.equal(tal.testsKoerer, 0);
  assert.equal(tal.href, "/marketing/annoncer");
  assert.ok(!JSON.stringify(tal).includes("b vandt"), "Lucas OS-tallene har ingen noter");
});

test("vurderTest: tydelig fører kun ved stor forskel og mindst 6 henvendelser", () => {
  const base = { id: "t", navn: "t", hypotese: "", start: "", status: "kører" as const, vinder: null, slutnote: "", by: "", at: "", versioner: {} };
  const res = (slug: string, forbrug: number, leads: number) => ({ rid: slug, slug, fra: "", til: "", forbrug, visninger: 0, klik: 0, leads, kvalificerede: 0, kunder: 0, by: "", at: "" });
  const t = (ra: [number, number], rb: [number, number]): AbTest => ({ ...base, arme: ["a", "b"], resultater: [res("a", ...ra), res("b", ...rb)] });
  assert.equal(vurderTest(t([1000, 10], [1000, 1])).sikker, true);
  assert.equal(vurderTest(t([1000, 3], [1000, 2])).sikker, false);
  assert.match(vurderTest(t([100, 0], [100, 0])).tekst, /For tidligt/);
  assert.ok(pVaerdi(5, 5, 100, 100) > 0.9);
  assert.ok(pVaerdi(10, 0, 100, 100) < 0.01);
});

test("foldTests: ukendte og ødelagte rækker springes over", () => {
  assert.deepEqual(foldTests([null, "x", { type: "resultat", id: "ukendt" }]), []);
});

test("bestillinger: ny, status, og agenten kan kun markere", async () => {
  ny();
  await assert.rejects(() => bestil({ gruppe: "findes-ikke" }, "lucas"), /koncept/);
  await assert.rejects(() => bestil({ gruppe: "ny" }, "lucas"), /ønske/);
  const [b] = await bestil({ gruppe: fri()[0].gruppe, skaerme: ["kinly.dk/webbureau-herning"], onske: "Herning-siden på telefonen" }, "lucas");
  assert.equal((await studieOversigt()).bestillinger.length, 1);
  const ud = await setBestillingStatus(b.id, "lavet", "ligger klar", "hermes");
  assert.equal(ud[0].status, "lavet");
  assert.equal((await studieOversigt()).bestillinger.length, 0);
});

// Codex-review 16/10: regressionstests
test("version: ændret standardtekst i annoncer.json kræver ny godkendelse", () => {
  const a = fri()[0];
  assert.notEqual(versionAf(a, {}), versionAf({ ...a, overskrift: a.overskrift + " x" }, {}));
});

test("kørende test: tekster kan ikke ændres, og tal for en ændret version afvises", async () => {
  ny();
  const [a, b] = fri().filter((x, i, arr) => arr.findIndex((y) => y.gruppe === x.gruppe) === i);
  await setBeslutning(a.slug, "godkendt", "lucas");
  await setBeslutning(b.slug, "godkendt", "lucas");
  const [t] = await opretTest({ navn: "T", start: "2026-10-20", arme: [a.slug, b.slug] }, "lucas");
  await assert.rejects(() => gemTekster(a.gruppe, { overskrifter: ["Se jeres side, før I betaler"], primaere: ["I ejer siden 100 %."] }, "manuel", "lucas"), /test, der kører/);
  const { store } = await import("../store.ts");
  await store.append("marketing-annonce-tests", { type: "opret", id: "v", navn: "V", hypotese: "", arme: [a.slug, b.slug], versioner: { [a.slug]: "gammel" }, start: "2026-10-20", by: "x", at: "2026-10-20T00:00:00Z" });
  await assert.rejects(() => tilfoejResultat({ id: "v", slug: a.slug, fra: "2026-10-20", til: "2026-10-21", forbrug: 1, leads: 0 }, "lucas"), /ændret, siden testen startede/);
  const efter = await tilfoejResultat({ id: t.id, slug: a.slug, fra: "2026-10-20", til: "2026-10-21", forbrug: 1, leads: 0 }, "lucas");
  assert.equal(efter.find((x) => x.id === t.id)!.resultater.length, 1);
});

test("vurderTest: sikker kun mod ALLE andre arme, ikke kun nummer to", () => {
  const res = (slug: string, forbrug: number, leads: number) => ({ rid: slug, slug, fra: "", til: "", forbrug, visninger: 0, klik: 0, leads, kvalificerede: 0, kunder: 0, by: "", at: "" });
  const t: AbTest = { id: "t", navn: "t", hypotese: "", start: "", status: "kører", vinder: null, slutnote: "", by: "", at: "", versioner: {}, arme: ["a", "b", "c"],
    resultater: [res("a", 600, 6), res("b", 1200, 4), res("c", 600, 1)] };
  const v = vurderTest(t);
  assert.equal(v.fører, "a");
  assert.equal(v.sikker, false, "A mod C er ikke sikker");
});

test("defekte gemte rækker vælter ikke visningen", () => {
  assert.deepEqual(foldTests([{ type: "opret", id: "bad", arme: [], at: "2026-10-01" }]), []);
  const t = foldTests([{ type: "opret", id: "ok", navn: "n", arme: ["a", "b"], start: "2026-10-01", at: "2026-10-01" }, { type: "resultat", id: "ok", slug: "a", forbrug: "x", leads: null }]);
  assert.equal(t.length, 1);
  assert.doesNotThrow(() => vurderTest(t[0]));
});

test("pVaerdi: store tal giver ikke 0 for ens arme", () => {
  assert.ok(pVaerdi(1100, 1100, 600, 600) > 0.9);
  assert.ok(pVaerdi(3000, 1000, 600, 600) < 0.001);
});
