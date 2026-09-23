import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.ts";

// Én Drizzle-instans for hele appen. Prod/preview = Neon via DATABASE_URL
// (pooled URL; prepare:false fordi pgbouncer ikke tåler prepared statements).
// Tests bytter en PGlite-instans ind med __setDb (samme query-API).
export type Db = ReturnType<typeof drizzle<typeof schema>>;

let _db: Db | null = null;

// Ikke "usePg": use*-navne tolkes som React-hooks af lint (rules-of-hooks).
export function pgEnabled(): boolean {
  return (process.env.DATA_BACKEND || "").toLowerCase() === "pg";
}


export function getDb(): Db {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATA_BACKEND=pg men DATABASE_URL mangler");
  // DB_POOL_MAX=1 lokalt: pglite-server tåler ikke flere samtidige forbindelser.
  _db = drizzle(postgres(url, { prepare: false, max: Number(process.env.DB_POOL_MAX) || 5 }), { schema });
  return _db;
}

export function __setDb(db: Db | null): void {
  _db = db;
}
