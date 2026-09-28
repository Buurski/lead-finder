import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildOversigt, flagFor, kortDato, laesMappe, loadKundeRapport, parseRapport, type KundeRapport } from "./kunde-rapport.ts";

// Samme form som rapport-jobbet skriver til ~/.hermes/state/kunde-rapport/.
const ikast = {
  kunde: "Ikast AutoService",
  domaene: "ikastautoservice.dk",
  maaned: "2026-09",
  variant: "med-adgang",
  pdf: "/root/.hermes/state/kunde-rapport/ikastautoservice-dk-2026-09.pdf",
  koert: "2026-09-28T21:00:00+00:00",
  status: "sendt",
  note: "",
  sendt: "2026-09-28T21:32:00+00:00",
};
const vida = { ...ikast, kunde: "VIDA", domaene: "vida-klinik.dk", variant: "uden-adgang", status: "kladde", pdf: "/root/.hermes/state/kunde-rapport/vida-klinik-dk-2026-09.pdf", sendt: undefined };
const kt = { ...ikast, kunde: "KT VVS", domaene: "ktvvs.dk", status: "sprunget", note: "ikke Hjemmesidepas endnu", pdf: "", sendt: undefined };
const jb = { ...ikast, kunde: "Jernbanecafeen", domaene: "jbcafeen.dk", maaned: "2026-08", status: "sendt", koert: "2026-08-28T21:00:00+00:00" };

const rows = [ikast, vida, kt, jb].map((r) => parseRapport(r) as KundeRapport);

test("parseRapport kræver domæne og måned, og beholder sendt-datoen", () => {
  assert.equal(parseRapport(null), null);
  assert.equal(parseRapport({ kunde: "X", maaned: "2026-09" }), null);
  assert.equal(parseRapport({ domaene: "x.dk", maaned: "september" }), null);
  const p = parseRapport(ikast);
  assert.equal(p?.status, "sendt");
  assert.equal(p?.sendt, "2026-09-28T21:32:00+00:00");
  // Manglende status er "kørt", ikke "sendt".
  assert.equal(parseRapport({ domaene: "x.dk", maaned: "2026-09" })?.status, "koert");
});

test("ukendt status tæller som ikke-sendt", () => {
  assert.equal(flagFor("sendt"), "sendt");
  assert.equal(flagFor("sprunget"), "sprunget");
  assert.equal(flagFor("kladde"), "afventer");
  assert.equal(flagFor("koert"), "afventer");
  assert.equal(flagFor("sfndt"), "afventer");
});

test("oversigten dømmer nyeste måned, viser manglere først og tæller rigtigt", () => {
  const o = buildOversigt(rows);
  assert.equal(o.maaned, "2026-09");
  assert.equal(o.raekker.length, 4); // 3 i måneden + 1 der kun har august
  assert.deepEqual(o.taeller, { mangler: 1, afventer: 1, sprunget: 1, sendt: 1 });

  // Den der burde have fået den, men ikke har, står øverst og peger på sidste måned.
  const første = o.raekker[0];
  assert.equal(første.domaene, "jbcafeen.dk");
  assert.equal(første.flag, "mangler");
  assert.equal(første.maaned, "2026-09");
  assert.match(første.note, /ingen rapport i 2026-09 \(sidst 2026-08\)/);

  const find = (d: string) => o.raekker.find((r) => r.domaene === d)!;
  assert.equal(find("ikastautoservice.dk").flag, "sendt");
  assert.equal(find("ikastautoservice.dk").sendt, "2026-09-28T21:32:00+00:00");
  assert.equal(find("vida-klinik.dk").flag, "afventer");
  assert.equal(find("ktvvs.dk").flag, "sprunget");
  assert.equal(find("ktvvs.dk").note, "ikke Hjemmesidepas endnu"); // grunden følger med
  assert.equal(find("ktvvs.dk").maaned, "2026-09");
});

test("en måned uden rapporter giver tom oversigt, ikke en kunde mere", () => {
  const o = buildOversigt(rows, "2026-10");
  assert.equal(o.maaned, "2026-10");
  assert.equal(o.taeller.mangler, 4); // alle fire har en tidligere rapport
  assert.equal(o.taeller.sendt, 0);
  assert.equal(o.raekker.length, 4);
});

test("mappen læses, og en halvskrevet fil vælter ikke listen", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kunde-rapport-"));
  fs.writeFileSync(path.join(dir, "ikastautoservice-dk-2026-09.json"), JSON.stringify(ikast));
  fs.writeFileSync(path.join(dir, "oedelagt-2026-09.json"), "{ ikke json");
  fs.writeFileSync(path.join(dir, "laes-mig.txt"), "ignoreres");
  const laest = laesMappe(dir);
  assert.equal(laest?.length, 1);
  assert.equal(laest?.[0].kunde, "Ikast AutoService");
  assert.equal(laesMappe(path.join(dir, "findes-ikke")), null);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("loaderen læser mappen og dømmer nyeste måned", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kunde-rapport-"));
  for (const r of [ikast, vida, kt, jb]) {
    fs.writeFileSync(path.join(dir, `${r.domaene.replace(/\./g, "-")}-${r.maaned}.json`), JSON.stringify(r));
  }
  const o = await loadKundeRapport(undefined, dir);
  assert.equal(o.kilde, "filer");
  assert.equal(o.maaned, "2026-09");
  assert.equal(o.raekker.length, 4);
  assert.equal(o.taeller.mangler, 1);
  assert.equal(o.raekker[0].domaene, "jbcafeen.dk");
  fs.rmSync(dir, { recursive: true, force: true });
});

test("kortDato tåler tom og ugyldig tid", () => {
  assert.equal(kortDato(undefined), "");
  assert.equal(kortDato("i går"), "");
  assert.match(kortDato("2026-09-28T21:32:00+00:00"), /2026/);
});
