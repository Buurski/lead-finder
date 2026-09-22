// Kører drizzle/-migrationerne mod DATABASE_URL. Brug: npm run db:migrate
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL mangler");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "drizzle" });
await sql.end();
console.log("migrationer kørt");
