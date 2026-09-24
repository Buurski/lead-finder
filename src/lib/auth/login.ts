// Kerne-logik for personligt login. HTTP-ruterne (del 2) er tynde kald hertil.
import { and, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { appUser } from "../db/schema.ts";
import { getDummyHash, hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from "./password.ts";
import { canonicalSetupCode } from "./setup-codes.ts";

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
  // Koden verificeres FØR længde-tjekket: ellers ville svaret "svag" afsløre,
  // at mailen har et aktivt opsætningsbevis (bruger-enumeration). Indtastningen
  // normaliseres (case/mellemrum/bindestreger), så kun selve tegnene skal ramme.
  if (!(await verifyPassword(canonicalSetupCode(input.code), user.setupHash))) return { ok: false, reason: "ugyldig" };
  if (input.password.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "svag" };

  const passwordHash = await hashPassword(input.password);
  const consumed = await db
    .update(appUser)
    .set({ passwordHash, setupHash: null, setupExpiresAt: null })
    .where(and(eq(appUser.id, user.id), eq(appUser.setupHash, user.setupHash)))
    .returning({ id: appUser.id });

  if (consumed.length !== 1) return { ok: false, reason: "brugt" };
  return { ok: true, user: publicUser(user) };
}

export type ChangeFailReason = "ikke-fundet" | "forkert" | "svag";

/**
 * Skift (eller sæt) adgangskode for en logget-ind bruger. Har kontoen allerede
 * en adgangskode, kræves den nuværende; har den ingen (fx en gammel
 * magic-link-session), sættes koden uden — den signerede session er beviset.
 * Et ubrugt opsætningsbevis ryddes samtidig, så en gammel bootstrap-kode ikke
 * overlever et kodeskift.
 */
export async function changePassword(
  db: Db,
  userId: string,
  input: { currentPassword: string; nextPassword: string },
): Promise<{ ok: true } | { ok: false; reason: ChangeFailReason }> {
  const [user] = await db.select().from(appUser).where(eq(appUser.id, userId)).limit(1);
  if (!user) return { ok: false, reason: "ikke-fundet" };
  if (user.passwordHash && !(await verifyPassword(input.currentPassword, user.passwordHash))) {
    return { ok: false, reason: "forkert" };
  }
  if (input.nextPassword.length < MIN_PASSWORD_LENGTH) return { ok: false, reason: "svag" };
  await db
    .update(appUser)
    .set({ passwordHash: await hashPassword(input.nextPassword), setupHash: null, setupExpiresAt: null })
    .where(eq(appUser.id, user.id));
  return { ok: true };
}
