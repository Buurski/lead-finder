import test from "node:test";
import assert from "node:assert/strict";
import { canonicalClientName, findClientByName, unmatchedNames, CLIENT_ALIASES } from "./client-alias.ts";

test("kanoniske navne: kendte aliaser mapper til Clients-arkets navn", () => {
  assert.equal(canonicalClientName("Vida"), "VIDA Skønhedsklinik");
  assert.equal(canonicalClientName("Henrik Korshøj - KT VVS"), "KT VVS");
  assert.equal(canonicalClientName("VIDA Skønhedsklinik"), "VIDA Skønhedsklinik");
  assert.equal(canonicalClientName("  KT VVS  "), "KT VVS");
});

test("ukendte navne røres ikke — de skal kunne flagges, ikke gættes", () => {
  assert.equal(canonicalClientName("Zaytoon – Mediterranean kitchen"), "Zaytoon – Mediterranean kitchen");
  assert.equal(canonicalClientName(""), "");
});

test("findClientByName: alias og kanonisk navn rammer samme kunde", () => {
  const clients = [{ name: "VIDA Skønhedsklinik" }, { name: "KT VVS" }];
  assert.equal(findClientByName(clients, "Vida")?.name, "VIDA Skønhedsklinik");
  assert.equal(findClientByName(clients, "Henrik Korshøj - KT VVS")?.name, "KT VVS");
  assert.equal(findClientByName(clients, "Ukendt Kunde"), undefined);
});

test("alias-tabellen peger aldrig på sig selv eller tomme værdier", () => {
  for (const [from, to] of Object.entries(CLIENT_ALIASES)) {
    assert.ok(to.trim().length > 0, `${from} → tomt navn`);
    assert.notEqual(canonicalClientName(from), from, `${from} mapper til sig selv`);
    assert.equal(canonicalClientName(to), to, "alias-mål skal være et fixpunkt");
  }
});

test("unmatchedNames finder faktura-navne uden kunde — også via alias", () => {
  const known = ["VIDA Skønhedsklinik", "KT VVS"];
  assert.deepEqual(unmatchedNames(["Vida", "KT VVS"], known), []);
  assert.deepEqual(
    unmatchedNames(["Henrik Korshøj - KT VVS", "Ukendt Firma ApS", "Ukendt Firma ApS"], known),
    ["Ukendt Firma ApS"],
  );
});
