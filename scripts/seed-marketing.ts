// Seed til /marketing: læser reel-system-mappen i vaulten og lægger kladder, hooks, A/B-tests,
// inspiration og noter i databasen. Nægter en database, der ikke ligger på localhost, medmindre
// --prod er givet eksplicit. Idempotent (samme nøgle sættes aldrig to gange; kun INSERT).
//
//   node --experimental-strip-types scripts/seed-marketing.ts --dry            (kun parse + tal)
//   DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres \
//     node --experimental-strip-types scripts/seed-marketing.ts [vault-mappe]
//   Prod: DATABASE_URL=<prod unpooled> node --experimental-strip-types scripts/seed-marketing.ts --prod
//
// Lokal pglite-server: npx pglite-server --db=.pglite-dev --port=5433 -m 8 (se dev-db-snapshot.mjs).
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../src/lib/db/schema.ts";
import type { Db } from "../src/lib/db/client.ts";
import { MAALING_COLUMNS, buildSeed, scanSeed, seedMarketing, type SeedFiles } from "../src/lib/hq/marketing-seed.ts";

const DEFAULT_DIR = "C:/Users/Buur/Documents/KnowledgeOS/wiki/vaekst/reel-system-2026-10";
const args = process.argv.slice(2);
const dry = args.includes("--dry");
const dir = args.find((a) => !a.startsWith("--")) ?? DEFAULT_DIR;

const read = (rel: string) => fs.readFileSync(path.join(dir, rel), "utf-8");
const kinly = "05-LEVERANCER/kinly";
const manus: Record<string, string> = {};
for (const f of fs.readdirSync(path.join(dir, kinly)).sort()) {
  if (/^(faceless|duo)-manus-\d\.md$/.test(f)) manus[f] = read(`${kinly}/${f}`);
}
const files: SeedFiles = {
  council: read("03-COUNCIL-KINLY.md"),
  manus,
  shotLists: read(`${kinly}/shot-lists.md`),
  charlie: read(`${kinly}/FORSLAG-TIL-CHARLIE.md`),
  hooksMaster: read("hooks-master.md"),
  abTest: read("07-AB-TEST.md"),
  maalingCsv: read("maaling.csv"),
  w2: read("wave-2/W2-kinly-lignende.md"),
  w4: read("wave-2/W4-ai-formater.md"),
  w5: read("wave-2/W5-musik-rettigheder.md"),
};

const seed = buildSeed(files);
const byKind: Record<string, number> = {};
for (const r of seed.refs) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
console.log(JSON.stringify({ drafts: seed.drafts.length, refs: byKind, measureRowsSkipped: seed.measureRowsSkipped }));
if (seed.measureHeader.join(",") !== MAALING_COLUMNS.join(",")) {
  console.error("maaling.csv har andre kolonner end formularen forventer:", seed.measureHeader.join(","));
  process.exit(1);
}
const findings = scanSeed(seed);
if (findings.length) {
  console.error("seed afvist:\n" + findings.join("\n"));
  process.exit(1);
}
if (dry) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL mangler (lokal pglite-server)");
  process.exit(1);
}
const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
if (!["localhost", "127.0.0.1", "::1"].includes(host) && !args.includes("--prod")) {
  console.error(`nægter at seede mod ${host}: kun localhost (eller eksplicit --prod)`);
  process.exit(1);
}
const client = postgres(url, { prepare: false, max: 1 });
const db = drizzle(client, { schema }) as unknown as Db;
console.log(JSON.stringify(await seedMarketing(db, seed)));
await client.end();
