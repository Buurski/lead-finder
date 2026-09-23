import { test } from "node:test";
import assert from "node:assert/strict";
import { safeHref } from "./safe-href.ts";

test("kun http(s) slipper igennem", () => {
  assert.equal(safeHref("https://kinly.dk"), "https://kinly.dk");
  assert.equal(safeHref("salonlux.dk"), "https://salonlux.dk");
  assert.equal(safeHref("javascript:alert(1)"), undefined);
  assert.equal(safeHref(" JavaScript:alert(1)"), undefined);
  assert.equal(safeHref("data:text/html,x"), undefined);
  assert.equal(safeHref(""), undefined);
});
