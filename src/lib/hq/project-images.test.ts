import { test } from "node:test";
import assert from "node:assert/strict";
import { projectImageFor } from "./project-images.ts";

const list = [
  { name: "VIDA Skønhedsklinik", host: "vida-klinik.dk", image: "https://kinly.dk/img/cases/vida-hero.webp" },
  { name: "KT VVS", host: "ktvvs.vercel.app", image: "https://kinly.dk/img/cases/kt-vvs.webp" },
];

test("kundebillede: domæne, så navn, ellers null (⇒ skærmbillede)", () => {
  assert.equal(projectImageFor(list, "www.vida-klinik.dk", "Vida"), list[0].image);
  assert.equal(projectImageFor(list, "ktvvs.dk", "KT VVS ApS"), list[1].image);
  assert.equal(projectImageFor([...list, { name: "Jernbanecafeen", host: "jbcafeen.dk", image: "x" }], null, "Jernbanecaféen"), "x");
  assert.equal(projectImageFor(list, "nykunde.dk", "Ny Kunde"), null);
  assert.equal(projectImageFor(list, null, "KT"), null); // for kort navn matcher ikke
});
