import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema.ts";
import { __setDb, type Db } from "./client.ts";

// In-memory Postgres med alle migrationer kørt. Installeres som app-db, så
// kode der kalder getDb() rammer den. Kun til tests.
export async function freshTestDb(): Promise<Db> {
  const db = drizzle(new PGlite(), { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  const asDb = db as unknown as Db; // samme query-builder-API som postgres-js
  __setDb(asDb);
  return asDb;
}
