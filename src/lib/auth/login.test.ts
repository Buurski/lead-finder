import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { appUser } from "../db/schema.ts";
import { hashPassword } from "./password.ts";
import { loginWithPassword, setupAccount } from "./login.ts";

let db: Db;

const CODE = "AB3D-EFGH-JKLM-NPQR-STUV";
const PASSWORD = "ny-adgangskode-2026";

// Migrationerne (0007) seeder lucas + charlie, så vi bruger on conflict do nothing
// og sætter opsætningsbeviset bagefter.
async function seedUsers() {
  await db
    .insert(appUser)
    .values([
      { id: "lucas", name: "Lucas", email: "lucas@kinly.dk" },
      { id: "charlie", name: "Charlie", email: "charlie@kinly.dk" },
    ])
    .onConflictDoNothing();
}

async function giveCode(email: string, code: string, expiresAt: Date) {
  await db.update(appUser).set({ setupHash: await hashPassword(code), setupExpiresAt: expiresAt }).where(eq(appUser.email, email));
}

const omLidt = () => new Date(Date.now() + 60 * 60 * 1000);

beforeEach(async () => {
  db = await freshTestDb();
  await seedUsers();
});

test("happy path: opsætning forbruger koden og login virker bagefter", async () => {
  await giveCode("lucas@kinly.dk", CODE, omLidt());

  const result = await setupAccount(db, { email: "Lucas@Kinly.dk ", code: CODE, password: PASSWORD });
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.user, { id: "lucas", name: "Lucas", email: "lucas@kinly.dk" });

  const [row] = await db.select().from(appUser).where(eq(appUser.id, "lucas"));
  assert.ok(row.passwordHash, "password_hash skal være sat");
  assert.equal(row.setupHash, null, "setup_hash skal være nulstillet");
  assert.equal(row.setupExpiresAt, null, "setup_expires_at skal være nulstillet");

  const login = await loginWithPassword(db, { email: "lucas@kinly.dk", password: PASSWORD });
  assert.equal(login.ok, true);
  assert.deepEqual(login.ok && login.user.id, "lucas");
});

test("forkert kode afvises og forbruges ikke", async () => {
  await giveCode("lucas@kinly.dk", CODE, omLidt());
  const wrong = await setupAccount(db, { email: "lucas@kinly.dk", code: "ZZZZ-ZZZZ-ZZZZ-ZZZZ-ZZZZ", password: PASSWORD });
  assert.deepEqual(wrong, { ok: false, reason: "ugyldig" });
  const [row] = await db.select().from(appUser).where(eq(appUser.id, "lucas"));
  assert.ok(row.setupHash, "koden må ikke være brugt op af et forkert forsøg");
});

test("udløbet bevis afvises med udloebet", async () => {
  await giveCode("lucas@kinly.dk", CODE, new Date(Date.now() - 1000));
  const res = await setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: PASSWORD });
  assert.deepEqual(res, { ok: false, reason: "udloebet" });
});

test("replay: samme kode kan kun bruges én gang", async () => {
  await giveCode("lucas@kinly.dk", CODE, omLidt());
  const first = await setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: PASSWORD });
  assert.equal(first.ok, true);
  const second = await setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: "en-anden-kode-2026" });
  assert.deepEqual(second, { ok: false, reason: "brugt" });
  const login = await loginWithPassword(db, { email: "lucas@kinly.dk", password: "en-anden-kode-2026" });
  assert.equal(login.ok, false, "det andet forsøg må ikke have ændret adgangskoden");
});

test("samtidige kald med samme kode: præcis ét kald lykkes", async () => {
  await giveCode("lucas@kinly.dk", CODE, omLidt());
  const results = await Promise.all([
    setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: PASSWORD }),
    setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: "en-anden-kode-2026" }),
  ]);
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.deepEqual(results.filter((r) => !r.ok), [{ ok: false, reason: "brugt" }]);
});

test("lucas' kode virker ikke for charlie", async () => {
  await giveCode("lucas@kinly.dk", CODE, omLidt());
  const res = await setupAccount(db, { email: "charlie@kinly.dk", code: CODE, password: PASSWORD });
  assert.deepEqual(res, { ok: false, reason: "ugyldig" });
});

test("for kort adgangskode giver svag uden at forbruge koden", async () => {
  await giveCode("lucas@kinly.dk", CODE, omLidt());
  const weak = await setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: "kort" });
  assert.deepEqual(weak, { ok: false, reason: "svag" });
  const [row] = await db.select().from(appUser).where(eq(appUser.id, "lucas"));
  assert.ok(row.setupHash, "koden skal stadig være der");
  const retry = await setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: PASSWORD });
  assert.equal(retry.ok, true, "samme kode skal virke bagefter");
});

test("ukendt mail giver ugyldig ved opsætning", async () => {
  const res = await setupAccount(db, { email: "ingen@kinly.dk", code: CODE, password: PASSWORD });
  assert.deepEqual(res, { ok: false, reason: "ugyldig" });
});

test("login: forkert adgangskode, ukendt mail og konto uden kode giver alle {ok:false}", async () => {
  await giveCode("lucas@kinly.dk", CODE, omLidt());
  await setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: PASSWORD });

  assert.deepEqual(await loginWithPassword(db, { email: "lucas@kinly.dk", password: "forkert-kode-999" }), { ok: false });
  assert.deepEqual(await loginWithPassword(db, { email: "ingen@kinly.dk", password: PASSWORD }), { ok: false });
  // charlie har aldrig sat en kode.
  assert.deepEqual(await loginWithPassword(db, { email: "charlie@kinly.dk", password: PASSWORD }), { ok: false });
});

test("login normaliserer mailen (trim + lowercase)", async () => {
  await giveCode("lucas@kinly.dk", CODE, omLidt());
  await setupAccount(db, { email: "LUCAS@kinly.dk", code: CODE, password: PASSWORD });
  const login = await loginWithPassword(db, { email: "  Lucas@Kinly.DK  ", password: PASSWORD });
  assert.equal(login.ok, true);
});
