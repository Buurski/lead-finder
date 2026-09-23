// Kerne-logik for personligt login. HTTP-ruterne (del 2) er tynde kald hertil.
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { appUser } from "../db/schema.ts";
import { getDummyHash, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password.ts";

export interface PublicUser {
  id: string;
  name: string;
  email: string;
}

export type SetupFailReason = "ugyldig" | "udloebet" | "brugt" | "svag";

const normalizeEmail = (email: string) => email.trim().toLowerCase();

async function findByEmail(db: Db, email: string) {
  const [user] = await db.select().from(appUser).where(eq(appUser.email, normalizeEmail(email))).limit(1);
  return user ?? null;
}

const publicUser = (u: { id: string; name: string; email: string }): PublicUser => ({ id: u.id, name: u.name, email: u.email });

/**
 * Ukendt mail og forkert adgangskode giver samme svar OG samme tidsforbrug:
 * vi kører altid et scrypt-verify, også når brugeren ikke findes.
 */
export async function loginWithPassword(
  db: Db,
  input: { email: string; password: string },
): Promise<{ ok: true; user: PublicUser } | { ok: false }> {
  const user = await findByEmail(db, input.email);
  if (!user?.passwordHash) {
    await verifyPassword(input.password, await getDummyHash());
    return { ok: false };
  }
  if (!(await verifyPassword(input.password, user.passwordHash))) return { ok: false };
  return { ok: true, user: publicUser(user) };
}

/**
 * Sætter adgangskoden med et engangs-opsætningsbevis. Forbruget sker som en
 * betinget update (CAS på den læste setup_hash), så koden kun kan bruges én
 * gang — også hvis to kald rammer samtidig.
 */
export async function setupAccount(
  db: Db,
  input: { email: string; code: string; password: string },
): Promise<{ ok: true; user: PublicUser } | { ok: false; reason: SetupFailReason }> {
  // Afvisninger med ensartet tidsforbrug: alle tidlige udgange kører et rigtigt
  // scrypt-verify, så svartiden ikke afslører om kontoen har et aktivt bevis.
  const afvis = async (reason: SetupFailReason) => {
    await verifyPassword(input.code, await getDummyHash());
    return { ok: false as const, reason };
  };

  const user = await findByEmail(db, input.email);
  if (!user) return afvis("ugyldig");

  // Allerede opsat konto uden aktiv kode = beviset er brugt op.
  if (user.passwordHash && !user.setupHash) return afvis("brugt");
  if (!user.setupHash || !user.setupExpiresAt) return afvis("ugyldig");
  if (user.setupExpiresAt.getTime() <= Date.now()) return afvis("udloebet");
  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "svag" };
  if (!(await verifyPassword(input.code, user.setupHash))) return { ok: false, reason: "ugyldig" };

  const passwordHash = await hashPassword(input.password);
  const consumed = await db
    .update(appUser)
    .set({ passwordHash, setupHash: null, setupExpiresAt: null })
    .where(and(eq(appUser.id, user.id), eq(appUser.setupHash, user.setupHash)))
    .returning({ id: appUser.id });

  if (consumed.length !== 1) return { ok: false, reason: "brugt" };
  return { ok: true, user: publicUser(user) };
}
