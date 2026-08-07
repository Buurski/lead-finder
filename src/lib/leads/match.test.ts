// match.test.ts — matchLead: draft→Sheets-række-matching (leadkø-triage-fix).
// Det vigtigste scenarie: dublet-navn i to byer med forskellig score — matchen
// må IKKE ramme tilfældigt (første række), og aldrig sende en draft til en
// dublet den ikke er.

import test from "node:test";
import assert from "node:assert/strict";
import { matchLead } from "./match.ts";

const rows = [
  { id: 907, name: "Beauty by M", city: "Herning", score: 44, email: "herning@beauty.dk" },
  { id: 1228, name: "Beauty by M", city: "Ikast", score: 90, email: "ikast@beauty.dk" },
  { id: 15, name: "Mellow Café", city: "Silkeborg", score: 62, email: "hej@mellow.dk" },
];

test("numerisk leadId vinder altid", () => {
  const hit = matchLead(rows, { leadId: "1228", name: "Beauty by M" });
  assert.equal(hit?.id, 1228);
});

test("dublet-navn + by matcher den RIGTIGE række, ikke første", () => {
  const hit = matchLead(rows, { leadId: "", name: "Beauty by M", city: "Ikast" });
  assert.equal(hit?.id, 1228);
  assert.equal(hit?.score, 90);
});

test("dublet-navn uden by → undefined (aldrig tilfældig række)", () => {
  const hit = matchLead(rows, { leadId: "", name: "Beauty by M" });
  assert.equal(hit, undefined);
});

test("entydigt navn uden by matcher stadig", () => {
  const hit = matchLead(rows, { leadId: "", name: "Mellow Café" });
  assert.equal(hit?.id, 15);
});

test("ukendt draft → undefined", () => {
  const hit = matchLead(rows, { leadId: "", name: "Findes Ikke" });
  assert.equal(hit, undefined);
});
