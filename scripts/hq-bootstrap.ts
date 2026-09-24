// Admin-engangskode til første personlige login. Én kode kan gives til flere
// brugere ad gangen (samme kode, ét forbrug pr. bruger). Køres manuelt mod
// DATABASE_URL — appen sender ALDRIG koden selv:
//
//   node --experimental-strip-types scripts/hq-bootstrap.ts \
//     --email lucas@kinly.dk,charlie@kinly.dk [--groups 3] [--days 7] [--out /root/.hermes/hq-setup-koder.txt]
//
// Den rå kode printes ALDRIG til stdout; kun stien til kodefilen (mode 0600).
import { appendFile } from "node:fs/promises";
import { eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { generateSetupCode } from "../src/lib/auth/setup-codes.ts";
import { hashPassword } from "../src/lib/auth/password.ts";
import { appUser } from "../src/lib/db/schema.ts";

const args = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const emails = (arg("email") ?? "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);
const groups = Number(arg("groups") ?? 5);
const days = Number(arg("days") ?? 3);
const out = arg("out") ?? "/root/.hermes/hq-setup-koder.txt";

if (!emails.length) {
  console.error(
    "Brug: node --experimental-strip-types scripts/hq-bootstrap.ts --email <mail[,mail2]> [--groups 3] [--days 7] [--out <fil>]",
  );
  process.exit(1);
}
if (!Number.isFinite(days) || days <= 0) {
  console.error("--days skal være et positivt tal");
  process.exit(1);
}
if (!Number.isInteger(groups) || groups < 2 || groups > 6) {
  console.error("--groups skal være et heltal 2-6");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL mangler");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
const db = drizzle(sql);

const rows = await db.select().from(appUser).where(inArray(appUser.email, emails));
const missing = emails.filter((e) => !rows.some((r) => r.email === e));
if (missing.length) {
  console.error(`Ingen bruger med mailen ${missing.join(", ")}.`);
  await sql.end();
  process.exit(1);
}
const withPassword = rows.filter((r) => r.passwordHash).map((r) => r.email);
if (withPassword.length) {
  console.error(`${withPassword.join(", ")} har allerede en adgangskode — koden sættes ikke. Skift den i appen i stedet.`);
  await sql.end();
  process.exit(1);
}

const code = generateSetupCode(groups);
const setupHash = await hashPassword(code);
const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

for (const row of rows) {
  await db
    .update(appUser)
    .set({ setupHash, setupExpiresAt: expiresAt })
    .where(eq(appUser.id, row.id));
  await appendFile(
    out,
    `${new Date().toISOString()}\t${row.email}\tkode: ${code}\tudløber: ${expiresAt.toISOString()}\n`,
    { mode: 0o600 },
  );
}
await sql.end();

console.log(`Opsætningskode gemt for ${rows.map((r) => r.email).join(", ")} (udløber ${expiresAt.toISOString()}).`);
console.log(`Koden står i ${out}.`);
