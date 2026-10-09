import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

// Skallens tæller må aldrig trække Sheets/GitHub ind igen — det var hele pointen (H2c).
test("skal-tælleren importerer hverken sheets.ts eller vault.ts, og skallen bruger den", () => {
  const route = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  assert.doesNotMatch(route, /sheets|vault|deck\.ts|"@\/lib\/deck"/);
  const shell = readFileSync(new URL("../../../../components/shell/AppShell.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(shell, /api\/deck\/summary/);
  assert.match(shell, /api\/deck\/counts/);
});
