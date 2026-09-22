import "server-only";
import { store } from "../store.ts";
import { getSenderCreds, type SenderId } from "../senders.ts";

// Magic-link-login for Lucas og Charlie. Kun SHA-256 af tokenet gemmes;
// tokenet selv findes kun i mailen. 15 min levetid, engangs.

export const TOKEN_TTL_MS = 15 * 60 * 1000;
const KEY = (hash: string) => `login-token/${hash}`;

export interface AppUser {
  id: SenderId;
  email: string;
}

/** Brugere fra CC_USERS="lucas:a@x.dk,charlie:b@y.dk", ellers afsender-kontoernes adresser. */
export function appUsers(): AppUser[] {
  const raw = process.env.CC_USERS?.trim();
  if (raw) {
    return raw
      .split(",")
      .map((p) => p.trim().split(":"))
      .filter(([id, email]) => (id === "lucas" || id === "charlie") && email?.includes("@"))
      .map(([id, email]) => ({ id: id as SenderId, email: email.trim().toLowerCase() }));
  }
  return (["lucas", "charlie"] as const)
    .map((id) => ({ id, email: getSenderCreds(id)?.email?.toLowerCase() ?? "" }))
    .filter((u) => u.email.includes("@"));
}

export function userForEmail(email: string): AppUser | null {
  const want = email.trim().toLowerCase();
  return appUsers().find((u) => u.email === want) ?? null;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Buffer.from(bytes).toString("base64url");
}

export async function issueLoginToken(user: AppUser, now = Date.now()): Promise<string> {
  const token = randomToken();
  await store.put(KEY(await sha256Hex(token)), { userId: user.id, exp: now + TOKEN_TTL_MS });
  return token;
}

/** Engangs: returnerer bruger-id og sletter tokenet, eller null. */
export async function redeemLoginToken(token: string, now = Date.now()): Promise<SenderId | null> {
  if (!/^[A-Za-z0-9_-]{40,50}$/.test(token)) return null;
  const key = KEY(await sha256Hex(token));
  const rec = await store.get<{ userId: SenderId; exp: number }>(key);
  if (!rec) return null;
  // ponytail: get+delete er ikke atomisk; et 256-bit token der kun står i ejerens
  // egen mail gør dobbelt-indløsning inden for ms irrelevant. PG-tabellen login_token
  // kan give UPDATE..WHERE used_at IS NULL hvis det nogensinde bliver et krav.
  await store.delete(key);
  if (rec.exp < now) return null;
  return rec.userId === "lucas" || rec.userId === "charlie" ? rec.userId : null;
}
