// Adgangskode-hashing til personligt login. scrypt fra node:crypto (ingen
// ny afhængighed), versionsmærket lagringsformat så parametrene kan hæves
// senere uden at gamle hashes knækker: scrypt$N$r$p$<saltB64>$<hashB64>.
// KEYLEN (32) står IKKE i formatet — skifter den, SKAL PREFIX bumpes
// (fx "scrypt2"), ellers læser verifyPassword gamle hashes som malformed.
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

export const MIN_PASSWORD_LENGTH = 8;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;
const SALT_BYTES = 16;
const PREFIX = "scrypt";

// Loft for parametre læst fra en gemt hash. En hash er ikke et betroet input
// (den kan komme fra en kompromitteret række), og scrypt med N=2^30 æder
// hukommelsen. 512 MiB rækker til enhver fornuftig N.
const MAX_MEM = 512 * 1024 * 1024;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // scrypt kræver ca. 128*r*n bytes; maxmem skal sættes eksplicit, ellers
    // afviser Node alt over 32 MiB.
    const maxmem = Math.min(MAX_MEM, 128 * r * n * 2);
    scrypt(password, salt, KEYLEN, { N: n, r, p, maxmem }, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Returnerer `scrypt$16384$8$1$<saltB64>$<hashB64>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const digest = await derive(password, salt, N, R, P);
  return [PREFIX, N, R, P, salt.toString("base64"), digest.toString("base64")].join("$");
}

/** false ved malformed/ukendt format — kaster aldrig. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6) return false;
  const [prefix, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  if (prefix !== PREFIX) return false;
  const n = Number(nRaw);
  const r = Number(rRaw);
  const p = Number(pRaw);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;
  if (n < 2 || r < 1 || p < 1 || p > 16 || n > MAX_MEM / (128 * r)) return false;
  const salt = Buffer.from(saltB64, "base64");
  const expected = Buffer.from(hashB64, "base64");
  if (salt.length === 0 || expected.length !== KEYLEN) return false;
  try {
    const actual = await derive(password, salt, n, r, p);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;

// Login verificerer mod denne når brugeren ikke findes, så svartiden ikke
// afslører om mailen er oprettet. Lazy singleton: scrypt er ikke gratis, og
// hashen skal kun laves én gang pr. proces.
export function getDummyHash(): Promise<string> {
  dummyHash ??= hashPassword("dummy-adgangskode-til-timing");
  return dummyHash;
}
