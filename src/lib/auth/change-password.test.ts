import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { appUser } from "../db/schema.ts";
import { hashPassword } from "./password.ts";
import { changePassword, loginWithPassword, setupAccount } from "./login.ts";

let db: Db;

const CODE = "AB3D-EFGH-JKLM-NPQR-STUV";
const PASSWORD = "ny-adgangskode-2026";
const NY = "helt-ny-kode-2026";

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

test("changePassword: kræver nuværende kode og skifter til den nye", async () => {
  await giveCode("lucas@kinly.dk", CODE, omLidt());
  await setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: PASSWORD });

  assert.deepEqual(
    await changePassword(db, "lucas", { currentPassword: "forkert-999", nextPassword: NY }),
    { ok: false, reason: "forkert" },
  );
  assert.deepEqual(
    await changePassword(db, "lucas", { currentPassword: PASSWORD, nextPassword: "kort" }),
    { ok: false, reason: "svag" },
  );
  assert.deepEqual(await changePassword(db, "lucas", { currentPassword: PASSWORD, nextPassword: NY }), { ok: true });

  assert.equal((await loginWithPassword(db, { email: "lucas@kinly.dk", password: PASSWORD })).ok, false, "den gamle kode må ikke virke");
  assert.equal((await loginWithPassword(db, { email: "lucas@kinly.dk", password: NY })).ok, true);
});

test("changePassword: ukendt bruger afvises", async () => {
  assert.deepEqual(await changePassword(db, "nobody", { currentPassword: "", nextPassword: NY }), {
    ok: false,
    reason: "ikke-fundet",
  });
});

test("changePassword: sætter kode uden nuværende når ingen findes, og rydder et liggende bevis", async () => {
  // lucas har endnu ingen adgangskode (fx en gammel magic-link-session), men et
  // ubrugt opsætningsbevis ligger klar.
  await giveCode("lucas@kinly.dk", CODE, omLidt());
  assert.deepEqual(await changePassword(db, "lucas", { currentPassword: "", nextPassword: PASSWORD }), { ok: true });

  const [row] = await db.select().from(appUser).where(eq(appUser.id, "lucas"));
  assert.equal(row.setupHash, null, "beviset skal være ryddet i samme hug");
  assert.equal(row.setupExpiresAt, null);
  assert.equal((await loginWithPassword(db, { email: "lucas@kinly.dk", password: PASSWORD })).ok, true);

  // Den gamle kode kan ikke længere bruges til opsætning.
  assert.deepEqual(await setupAccount(db, { email: "lucas@kinly.dk", code: CODE, password: "tredje-kode-2026" }), {
    ok: false,
    reason: "brugt",
  });

  // Og næste skift kræver den nuværende kode og virker.
  assert.deepEqual(await changePassword(db, "lucas", { currentPassword: PASSWORD, nextPassword: NY }), { ok: true });
  assert.equal((await loginWithPassword(db, { email: "lucas@kinly.dk", password: NY })).ok, true);
});
