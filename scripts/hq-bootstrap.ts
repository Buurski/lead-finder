// Admin-engangskode til første personlige login. Køres manuelt af Lucas mod
// DATABASE_URL — appen sender ALDRIG koden selv:
//
//   node --experimental-strip-types scripts/hq-bootstrap.ts \
//     --email lucas@kinly.dk [--days 3] [--out /root/.hermes/hq-setup-koder.txt]
//
// Den rå kode printes ALDRIG til stdout; kun stien til kodefilen (mode 0600)
// skrives ud, så koden kan gives videre mundtligt.
import { appendFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
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

const email = arg("email")?.trim().toLowerCase();
const days = Number(arg("days") ?? 3);
const out = arg("out") ?? "/root/.hermes/hq-setup-koder.txt";

if (!email) {
  console.error("Brug: node --experimental-strip-types scripts/hq-bootstrap.ts --email <mail> [--days 3] [--out <fil>]");
  process.exit(1);
}
if (!Number.isFinite(days) || days <= 0) {
  console.error("--days skal være et positivt tal");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL mangler");
  process.exit(1);
}

const sql = postgres(url, { prepare: false, max: 1 });
const db = drizzle(sql);

const [user] = await db.select().from(appUser).where(eq(appUser.email, email)).limit(1);
if (!user) {
  console.error(`Ingen bruger med mailen ${email}.`);
  await sql.end();
  process.exit(1);
}
if (user.passwordHash) {
  console.error(`${email} har allerede en adgangskode — koden sættes ikke igen. Skift den i appen i stedet.`);
  await sql.end();
  process.exit(1);
}

const code = generateSetupCode();
const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
await db
  .update(appUser)
  .set({ setupHash: await hashPassword(code), setupExpiresAt: expiresAt })
  .where(eq(appUser.id, user.id));
await appendFile(
  out,
  `${new Date().toISOString()}\t${email}\tkode: ${code}\tudløber: ${expiresAt.toISOString()}\n`,
  { mode: 0o600 },
);
await sql.end();

console.log(`Opsætningskode gemt for ${email} (udløber ${expiresAt.toISOString()}).`);
console.log(`Koden står i ${out} — giv den videre mundtligt, ikke på mail.`);
