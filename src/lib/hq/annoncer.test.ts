// Tests for annonce-stills: annoncer.json er skemaet, som galleriet og Meta-teksterne bygger på,
// og godkend/drop gemmes som en log i `store`. Kører mod de rigtige filer (PNG'erne ligger i public/annoncer).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { InMemoryStore, __setStore } from "../store.ts";
import { listBeslutninger, loadAnnoncer, setBeslutning } from "./annoncer.ts";
import {
  HEADLINE_MAX, META_CTA, PLAN, PLAN_TAL, PRIMARY_MAX, foldBeslutninger, motiver, venterPaaKunde, type Annonce,
} from "./annoncer-types.ts";
import { mentionsCustomer } from "./marketing-types.ts";

const ROOT = process.cwd();
const rows = JSON.parse(fs.readFileSync(path.join(ROOT, "src", "data", "annoncer.json"), "utf8")) as Annonce[];
const FELTER = [
  "id", "slug", "format", "billede", "overskrift", "primaer_tekst", "beskrivelse", "cta", "still_tekst", "kilde_fakta",
  "billede_kilder", "kunde", "kunder", "kunde_ja", "gruppe", "skaerm", "billede_hash", "skabelon", "test_celle", "koncept", "anbefalet_start", "advarsler",
] as const;
const tekster = (a: Annonce) => [a.overskrift, a.primaer_tekst, a.beskrivelse, a.still_tekst];

test("annoncer.json: 8 til 40 stills, og hver har alle felter med den rigtige type", () => {
  assert.ok(rows.length >= 8 && rows.length <= 40, `antal: ${rows.length}`);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length, "id skal være unikke");
  for (const r of rows) {
    for (const f of FELTER) assert.ok(f in r, `${r.id}: mangler ${f}`);
    for (const f of ["id", "slug", "format", "billede", "overskrift", "primaer_tekst", "beskrivelse", "cta", "still_tekst", "skabelon", "test_celle", "koncept"] as const) {
      assert.equal(typeof r[f], "string", `${r.id}: ${f} skal være tekst`);
      assert.ok(r[f].trim() !== "", `${r.id}: ${f} er tom`);
    }
    assert.ok(r.kunde === null || (typeof r.kunde === "string" && r.kunde !== ""), `${r.id}: kunde er navn eller null`);
    assert.equal(typeof r.kunde_ja, "boolean");
    assert.equal(typeof r.anbefalet_start, "boolean");
    assert.ok(Array.isArray(r.advarsler) && r.advarsler.every((w) => typeof w === "string"));
    assert.ok(Array.isArray(r.billede_kilder));
  }
});

test("annoncer.json: grænser for tekst, knap og tegn", () => {
  for (const r of rows) {
    assert.ok(r.overskrift.length <= HEADLINE_MAX, `${r.id}: overskrift ${r.overskrift.length} tegn`);
    assert.ok(r.primaer_tekst.split("\n")[0].length <= PRIMARY_MAX, `${r.id}: primær tekst for lang`);
    assert.ok((META_CTA as readonly string[]).includes(r.cta), `${r.id}: knappen ${r.cta} findes ikke hos Meta`);
    for (const t of tekster(r)) {
      assert.ok(!/[—–]/.test(t), `${r.id}: tankestreg i "${t}"`);
      assert.ok(!t.includes("!"), `${r.id}: udråbstegn i "${t}"`);
    }
  }
  assert.ok(rows.some((r) => r.cta === "Få tilbud"), "Få tilbud er standardknappen");
});

test("annoncer.json: hver pris står med ekskl. moms", () => {
  let priser = 0;
  for (const r of rows) {
    for (const t of tekster(r)) {
      if (/\bkr\b\.?|\d\.\d{3}/.test(t)) {
        priser++;
        assert.ok(t.includes("ekskl. moms"), `${r.id}: pris uden "ekskl. moms" i "${t}"`);
      }
    }
  }
  assert.ok(priser > 0, "mindst én still viser en pris");
});

test("annoncer.json: kilder med fil:linje, og kunde-ja er falsk for alle", () => {
  for (const r of rows) {
    assert.ok(r.kilde_fakta.length > 0, `${r.id}: ingen kilder`);
    for (const k of r.kilde_fakta) {
      assert.match(k.fil, /\.md:\d+$/, `${r.id}: kilden skal være fil:linje (${k.fil})`);
      assert.ok(k.fakta.trim() !== "");
    }
    assert.equal(r.kunde_ja, false, `${r.id}: kunde_ja må ikke sættes uden Lucas`);
    if (mentionsCustomer(...tekster(r))) assert.ok(r.kunde !== null, `${r.id}: teksten nævner en kunde, men kunde er null`);
    if (r.kunde !== null) assert.ok(venterPaaKunde(r), `${r.id}: kunde uden ja skal vente`);
    assert.equal(r.kunde === null, r.kunder.length === 0, `${r.id}: kunde og kunder skal passe sammen`);
    assert.match(r.billede_hash, /^[0-9a-f]{16}$/);
  }
});

test("annoncer.json: 4:5 pr. motiv (GPT-annoncer kun 4:5, Metas feed-format), ens tekst, og billederne findes i den rigtige størrelse", () => {
  for (const m of motiver(rows)) {
    const formater = m.formater.map((f) => f.format).sort();
    const gpt = rows.find((x) => x.slug === m.slug)!.skabelon === "gpt";
    assert.deepEqual(formater, gpt ? ["1080x1350"] : ["1080x1080", "1080x1350"], `${m.slug}: formater`);
    for (const r of rows.filter((x) => x.slug === m.slug)) {
      assert.equal(r.overskrift, m.tekst.overskrift);
      assert.equal(r.primaer_tekst, m.tekst.primaer_tekst);
      assert.equal(r.test_celle, m.tekst.test_celle);
      const file = path.join(ROOT, "public", r.billede);
      const b = fs.readFileSync(file);
      assert.equal(b.subarray(1, 4).toString(), "PNG", `${r.id}: ikke en PNG`);
      const [w, h] = r.format.split("x").map(Number);
      assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [w, h], `${r.id}: forkert størrelse`);
    }
  }
});

test("annoncer.json: 4 til 5 helt forskellige koncepter i startsættet, og test-cellen står på hver", () => {
  const start = rows.filter((r) => r.anbefalet_start);
  const celler = new Set(start.map((r) => r.test_celle));
  assert.ok(celler.size >= 4 && celler.size <= 5, `startsættet har ${celler.size} koncepter`);
  for (const r of rows) assert.match(r.test_celle, /^K\d$/);
  assert.equal(new Set(start.map((r) => r.slug)).size, celler.size, "højst ét motiv pr. koncept i startsættet");
});

test("trin 1-planen: tallene stemmer med beslutningen og kill-reglerne er med", () => {
  const alt = JSON.stringify([PLAN, PLAN_TAL]);
  for (const t of ["150 kr", "4 uger", "4.500 kr", "300 kr", "600 kr", "1.200 kr"]) assert.ok(alt.includes(t), `planen mangler ${t}`);
  assert.ok(!/[—–]/.test(alt), "tankestreg i planen");
  const ids = PLAN.flatMap((g) => g.punkter.map((p) => p.id));
  assert.equal(new Set(ids).size, ids.length, "punkt-id'er skal være unikke");
});

test("foldBeslutninger: sidste række pr. motiv vinder, og ugyldige rækker springes over", () => {
  const f = foldBeslutninger([
    { slug: "a", status: "godkendt", by: "lucas", at: "1" },
    "skrald",
    null,
    { slug: "a", status: "droppet", by: "charlie", at: "2" },
    { slug: "b", status: "findes-ikke", by: "x", at: "3" },
    { slug: "c", status: "afventer", by: "lucas", at: "4" },
  ]);
  assert.equal(f.a.status, "droppet");
  assert.equal(f.a.by, "charlie");
  assert.equal(f.b, undefined);
  assert.equal(f.c.status, "afventer");
});

test("godkend og drop gemmes i store, nulstilles, og afviser ukendt motiv og status", async () => {
  __setStore(new InMemoryStore());
  try {
    const slug = loadAnnoncer().find((a) => a.kunde === null)!.slug;
    const kundeSlug = loadAnnoncer().find((a) => venterPaaKunde(a))!.slug;
    assert.deepEqual(await listBeslutninger(), {});
    await assert.rejects(() => setBeslutning(kundeSlug, "godkendt", "lucas"), /KRÆVER KUNDE-OK/);
    assert.equal((await setBeslutning(kundeSlug, "droppet", "lucas"))[kundeSlug].status, "droppet");
    let r = await setBeslutning(slug, "godkendt", "lucas");
    assert.equal(r[slug].status, "godkendt");
    r = await setBeslutning(slug, "droppet", "charlie");
    assert.equal(r[slug].status, "droppet");
    assert.equal((await listBeslutninger())[slug].by, "charlie");
    r = await setBeslutning(slug, "afventer", "lucas");
    assert.equal(r[slug].status, "afventer");
    await assert.rejects(() => setBeslutning("findes-ikke", "godkendt", "lucas"), /Ukendt annonce/);
    await assert.rejects(() => setBeslutning(slug, "postet", "lucas"), /Ukendt status/);
    await assert.rejects(() => setBeslutning(42, "godkendt", "lucas"), /Ukendt annonce/);
  } finally {
    __setStore(null);
  }
});
