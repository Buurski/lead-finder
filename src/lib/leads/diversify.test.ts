import { test } from "node:test";
import assert from "node:assert/strict";
import { capPerCity, diversifyByFamily } from "./diversify.ts";

// --- by-loft (Lucas 2026-09-21: "når alle sammen ligger i København") ---

const cityRow = (name: string, city: string, branch = "frisør") => ({ name, city, branch });

test("capPerCity holder rækkefølgen og skærer ved loftet", () => {
  const sorted = [
    cityRow("a", "København"), cityRow("b", "København"), cityRow("c", "København"),
    cityRow("d", "København"), cityRow("e", "Herning"), cityRow("f", "København"),
    cityRow("g", "Odense"),
  ];
  assert.deepEqual(capPerCity(sorted, (r) => r.city, 3).map((r) => r.name), ["a", "b", "c", "e", "g"]);
});

test("capPerCity er ligeglad med store bogstaver og mellemrum", () => {
  const out = capPerCity([cityRow("a", "København"), cityRow("b", " københavn "), cityRow("c", "KØBENHAVN")], (r) => r.city, 1);
  assert.equal(out.length, 1);
});

test("capPerCity samler tomme bynavne i én pulje", () => {
  assert.equal(capPerCity([cityRow("a", ""), cityRow("b", ""), cityRow("c", "")], (r) => r.city, 2).length, 2);
});

test("by-loft før brancherotation giver både geografisk og faglig spredning", () => {
  const sorted = [
    cityRow("kbh1", "København", "frisør"), cityRow("kbh2", "København", "frisør"),
    cityRow("kbh3", "København", "frisør"), cityRow("kbh4", "København", "frisør"),
    cityRow("hern1", "Herning", "tømrer"), cityRow("ode1", "Odense", "café"),
  ];
  const out = diversifyByFamily(capPerCity(sorted, (r) => r.city, 2), (r) => r.branch).map((r) => r.name);
  assert.equal(out.filter((n) => n.startsWith("kbh")).length, 2, "højst to fra København");
  assert.ok(out.includes("hern1") && out.includes("ode1"));
});

test("diversifyByFamily roterer mellem branchefamilier", () => {
  const sorted = [
    cityRow("f1", "Herning", "frisør"), cityRow("f2", "Skive", "frisør"),
    cityRow("t1", "Viborg", "tømrer"),
  ];
  const out = diversifyByFamily(sorted, (r) => r.branch).map((r) => r.name);
  assert.equal(out[0], "f1", "den bedste fører stadig");
  assert.equal(out[1], "t1", "derefter roteres der til en anden familie");
});
