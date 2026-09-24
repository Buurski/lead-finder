import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSseBuffer } from "./sse.ts";

test("parser komplette events og beholder den uafsluttede rest", () => {
  const buf = 'data: {"status":"thinking"}\n\ndata: {"text":"Hej"}\n\ndata: {"text":" ver';
  const { events, rest } = parseSseBuffer(buf);
  assert.deepEqual(events, [{ status: "thinking" }, { text: "Hej" }]);
  assert.equal(rest, 'data: {"text":" ver');
});

test("deler hen over chunk-grænser når resten sendes med igen", () => {
  const a = parseSseBuffer('data: {"text":"Hej"}\n\ndata: {"text":" med"}\n\ndata: {"te');
  assert.equal(a.events.length, 2);
  const b = parseSseBuffer(a.rest + 'xt":" dig"}\n\ndata: {"done":true,"full_text":"Hej med dig"}\n\n');
  assert.deepEqual(b.events, [{ text: " dig" }, { done: true, full_text: "Hej med dig" }]);
  assert.equal(b.rest, "");
});

test("ignorerer heartbeats og ugyldig JSON uden at tabe de gyldige", () => {
  const { events } = parseSseBuffer(': hb\n\ndata: not-json\n\ndata: {"error":"timeout","done":true}\n\n');
  assert.deepEqual(events, [{ error: "timeout", done: true }]);
});
