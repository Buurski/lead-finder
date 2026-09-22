// Lokal, sikker kopi af CRM-databasen til UI-arbejde og browser-tests.
// Læser fra SOURCE_DATABASE_URL (Neon, kun SELECT) og skriver til en PGlite-
// mappe (default .pglite-dev, gitignored). Kør derefter:
//   npx pglite-server --db=.pglite-dev --port=5433 -m 8
//   DATA_BACKEND=pg DATABASE_URL=postgres://postgres@127.0.0.1:5433/postgres npx next start
// Så kan man klikke "Opret aftale", "Flet" osv. uden at røre de rigtige data.
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import postgres from "postgres";
import fs from "node:fs";

const src = process.env.SOURCE_DATABASE_URL;
const dir = process.argv[2] || ".pglite-dev";
if (!src) {
  console.error("SOURCE_DATABASE_URL mangler");
  process.exit(1);
}
fs.rmSync(dir, { recursive: true, force: true });
const pg = new PGlite(dir);
await migrate(drizzle(pg), { migrationsFolder: "drizzle" });

const source = postgres(src, { max: 1, prepare: false });
// Rækkefølge efter fremmednøgler.
const TABLES = ["app_user", "company", "deal", "site", "contact", "activity", "task", "outreach", "invoice", "subscription_plan", "counter"];
for (const table of TABLES) {
  const jsonCols = new Set(
    (await source`select column_name from information_schema.columns where table_name = ${table} and data_type = 'jsonb'`).map((r) => r.column_name),
  );
  const rows = await source.unsafe(`select * from "${table}"`);
  for (const row of rows) {
    const cols = Object.keys(row);
    const vals = cols.map((c) => (row[c] === null ? null : jsonCols.has(c) ? JSON.stringify(row[c]) : row[c] instanceof Date ? row[c].toISOString() : row[c]));
    await pg.query(`insert into "${table}" (${cols.map((c) => `"${c}"`).join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")})`, vals);
  }
  console.log(`${table}: ${rows.length}`);
}
await source.end();
await pg.close();
console.log(`snapshot klar i ${dir}`);
