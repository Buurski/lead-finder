import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { freshTestDb } from "./test-db.ts";
import * as schema from "./schema.ts";

// Konsistens mellem migrationsmappen og skemaet: journalen hænger sammen med filerne,
// og hver tabel i schema.ts findes efter at alle migrationer er kørt.
const DIR = path.join(process.cwd(), "drizzle");

test("journal: løbende idx, en .sql og en snapshot pr. migration, ingen løse filer", () => {
  const journal = JSON.parse(fs.readFileSync(path.join(DIR, "meta", "_journal.json"), "utf-8")) as { entries: Array<{ idx: number; tag: string }> };
  assert.ok(journal.entries.length > 0);
  journal.entries.forEach((e, i) => {
    assert.equal(e.idx, i, `idx ${e.idx} står forkert`);
    assert.ok(e.tag.startsWith(String(i).padStart(4, "0") + "_"), `${e.tag} har forkert nummer`);
    assert.ok(fs.existsSync(path.join(DIR, `${e.tag}.sql`)), `${e.tag}.sql mangler`);
    assert.ok(fs.existsSync(path.join(DIR, "meta", `${String(i).padStart(4, "0")}_snapshot.json`)), `snapshot ${i} mangler`);
  });
  const sqlFiles = fs.readdirSync(DIR).filter((f) => f.endsWith(".sql")).map((f) => f.replace(/\.sql$/, "")).sort();
  assert.deepEqual(sqlFiles, journal.entries.map((e) => e.tag).sort());
});

test("hver tabel i schema.ts findes efter migrationerne, med de samme kolonner", async () => {
  const db = await freshTestDb();
  const tables = Object.values(schema).filter((v): v is PgTable => typeof v === "object" && v !== null && Symbol.for("drizzle:IsDrizzleTable") in v);
  assert.ok(tables.length >= 3);
  for (const t of tables) {
    const cfg = getTableConfig(t);
    const rows = (await db.execute(sql`select column_name from information_schema.columns where table_name = ${cfg.name}`)) as unknown as { rows: Array<{ column_name: string }> };
    const have = new Set(rows.rows.map((r) => r.column_name));
    for (const c of cfg.columns) assert.ok(have.has(c.name), `${cfg.name}.${c.name} mangler i databasen efter migrationerne`);
  }
  const names = tables.map((t) => getTableConfig(t).name);
  for (const n of ["marketing_draft", "marketing_ref", "marketing_measure"]) assert.ok(names.includes(n), n);
});
