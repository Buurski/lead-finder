import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, getDummyHash, MIN_PASSWORD_LENGTH } from "./password.ts";

test("hash og verify roundtripper", async () => {
  const stored = await hashPassword("hemmelig-kode-42");
  assert.match(stored, /^scrypt\$16384\$8\$1\$[^$]+\$[^$]+$/);
  assert.equal(await verifyPassword("hemmelig-kode-42", stored), true);
  assert.equal(MIN_PASSWORD_LENGTH, 8);
});

test("forkert adgangskode giver false", async () => {
  const stored = await hashPassword("hemmelig-kode-42");
  assert.equal(await verifyPassword("hemmelig-kode-43", stored), false);
  assert.equal(await verifyPassword("", stored), false);
});

test("malformed lagringsformat giver false uden kast", async () => {
  for (const stored of ["", "abc", "scrypt$16384$8$1$salt", "scrypt$16384$8$1$a$b$c", "bcrypt$16384$8$1$AA$AA", "scrypt$x$8$1$AA$AA"]) {
    assert.equal(await verifyPassword("hemmelig-kode-42", stored), false, `skulle være false: ${stored}`);
  }
});

test("to hashes af samme adgangskode er forskellige (tilfældigt salt)", async () => {
  const a = await hashPassword("hemmelig-kode-42");
  const b = await hashPassword("hemmelig-kode-42");
  assert.notEqual(a, b);
  assert.equal(await verifyPassword("hemmelig-kode-42", b), true);
});

test("ændret parameterdel i den gemte hash giver false", async () => {
  const stored = await hashPassword("hemmelig-kode-42");
  const tampered = stored.replace("$16384$8$1$", "$32768$8$1$");
  assert.notEqual(tampered, stored);
  assert.equal(await verifyPassword("hemmelig-kode-42", tampered), false);
});

test("absurd scrypt-p afvises (CPU-loft)", async () => {
  const stored = await hashPassword("hemmelig-kode-42");
  const tampered = stored.replace("$16384$8$1$", "$16384$8$99$");
  assert.notEqual(tampered, stored);
  assert.equal(await verifyPassword("hemmelig-kode-42", tampered), false);
});

test("getDummyHash er stabil og et rigtigt hash-format", async () => {
  const a = await getDummyHash();
  const b = await getDummyHash();
  assert.equal(a, b, "skal være en lazy singleton");
  assert.match(a, /^scrypt\$16384\$8\$1\$/);
});
