import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function declaredSchedule(): Record<string, string> {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const block = source.match(/const SCHEDULE[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map((match) => [match[1], match[2]]),
  );
}

test("cron health tracks exactly the jobs in vercel.json", () => {
  const config = JSON.parse(readFileSync(new URL("../../../../../vercel.json", import.meta.url), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  const expected = Object.fromEntries(
    config.crons.map(({ path, schedule }) => [path.replace("/api/cron/", ""), schedule]),
  );

  assert.deepEqual(declaredSchedule(), expected);
});
