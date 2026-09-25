import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import test from "node:test";

function declaredSchedule(): Record<string, string> {
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const block = source.match(/const SCHEDULE[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
  return Object.fromEntries(
    [...block.matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map((match) => [match[1], match[2]]),
  );
}

// Health følger kun jobs der skriver til cron-loggen (withCronLog) — ellers ville
// et job uden log altid stå som "mangler". Men hvert logget job i vercel.json SKAL
// være med, og ingen udfaset job må blive hængende (Sol w4a-r4 R4-01).
test("cron health = de loggende jobs i vercel.json, med samme tider", () => {
  const config = JSON.parse(readFileSync(new URL("../../../../../vercel.json", import.meta.url), "utf8")) as {
    crons: Array<{ path: string; schedule: string }>;
  };
  const vercel = Object.fromEntries(config.crons.map(({ path, schedule }) => [path.replace("/api/cron/", ""), schedule]));
  const declared = declaredSchedule();
  for (const [name, schedule] of Object.entries(declared)) {
    assert.equal(vercel[name], schedule, `health kender "${name}", men vercel.json har ${vercel[name] ?? "intet job"}`);
  }
  const cronDir = new URL("../", import.meta.url);
  for (const name of Object.keys(vercel)) {
    const file = new URL(`./${name}/route.ts`, cronDir);
    if (existsSync(file) && readFileSync(file, "utf8").includes("withCronLog(")) {
      assert.ok(name in declared, `"${name}" logger til cron-loggen men mangler i health`);
    }
  }
  assert.ok(readdirSync(cronDir).length > 0);
});
