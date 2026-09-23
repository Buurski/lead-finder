import { test } from "node:test";
import assert from "node:assert/strict";
import { wantsDraftRegex } from "./draft-requests.ts";

test("fanger ja til udkast, ikke nej", () => {
  assert.equal(wantsDraftRegex("Ja tak, send gerne et udkast"), true);
  assert.equal(wantsDraftRegex("Det lyder spændende, vil gerne se hvad I kan lave"), true);
  assert.equal(wantsDraftRegex("Nej tak, vi har allerede en side"), false);
  assert.equal(wantsDraftRegex("Hvem er I?"), false);
});
