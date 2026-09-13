import test from "node:test";
import assert from "node:assert/strict";
import { clientNoteRel, clientNoteFile, clientSlug } from "./client-notes.ts";

test("note-overrides rammer de rigtige filer", () => {
  assert.equal(clientNoteRel("VIDA Skønhedsklinik"), "wiki/kunder/kunde-info-vida.md");
  assert.equal(clientNoteRel("KT VVS"), "wiki/kunder/ktvvs.md");
});

test("øvrige kunder slugges som før", () => {
  assert.equal(clientNoteRel("Jernbanecaféen"), "wiki/kunder/jernbanecafeen.md");
  assert.equal(clientNoteRel("Ikast AutoService"), "wiki/kunder/ikast-autoservice.md");
  assert.equal(clientNoteFile("Ny Kunde ApS"), "ny-kunde-aps");
});

test("override slår kun til på eksakt navn — ikke varianter", () => {
  assert.equal(clientSlug("Vida"), "vida");
  assert.notEqual(clientNoteFile("Vida"), "kunde-info-vida");
});
