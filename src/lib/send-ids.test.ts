import { test } from "node:test";
import assert from "node:assert/strict";
import { parseIds, onlyIds } from "./send-ids.ts";

const drafts = [{ id: "a" }, { id: "b" }, { id: "c" }];

test("uden ids → alle drafts (uændret adfærd)", () => {
  assert.equal(parseIds("http://x/api/approve/send"), null);
  assert.deepEqual(onlyIds(drafts, null), drafts);
});

test("ids=a,c → kun a og c", () => {
  const ids = parseIds("http://x/api/approve/send?ids=a,%20c");
  assert.deepEqual(onlyIds(drafts, ids).map((d) => d.id), ["a", "c"]);
});

test("ids til stede men tomt → INGEN drafts, aldrig alle", () => {
  assert.deepEqual(onlyIds(drafts, parseIds("http://x/s?ids=")), []);
  assert.deepEqual(onlyIds(drafts, parseIds("http://x/s?ids=,%20,")), []);
});

test("ukendt id → ingen match", () => {
  assert.deepEqual(onlyIds(drafts, parseIds("http://x/s?ids=zzz")), []);
});
