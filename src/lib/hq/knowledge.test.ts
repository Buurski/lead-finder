import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanModelNote, kbPathFor, lineDiff, validKbPath } from "./knowledge.ts";

test("kun noter direkte i wiki/kunder kan gemmes", () => {
  assert.equal(validKbPath("wiki/kunder/ktvvs.md"), true);
  assert.equal(validKbPath("wiki/kunder/../os/claude.md"), false);
  assert.equal(validKbPath("wiki/os/x.md"), false);
  assert.equal(validKbPath("wiki/kunder/sub/x.md"), false);
  assert.equal(kbPathFor("Jernbanecaféen"), "wiki/kunder/jernbanecafeen.md");
  assert.equal(kbPathFor("KT VVS ApS"), "wiki/kunder/kt-vvs-aps.md");
});

test("linje-diff og kodeblok-indpakning", () => {
  assert.deepEqual(lineDiff("a\nb\nc", "a\nx\nc"), [
    { t: " ", line: "a" }, { t: "-", line: "b" }, { t: "+", line: "x" }, { t: " ", line: "c" },
  ]);
  assert.equal(cleanModelNote("```markdown\n# VIDA\nok\n```"), "# VIDA\nok\n");
});
