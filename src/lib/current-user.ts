import "server-only";
import { headers } from "next/headers";
import { CC_AUTH_HEADER, CC_USER_HEADER, ccAuthMarker, ctEqual } from "./cc-auth.ts";

export type CurrentUser = "lucas" | "charlie" | "delt" | null;

// Hvem er logget ind? Proxyen sætter x-cc-user efter at have verificeret
// session-cookien. Headeren stoles KUN på sammen med proxyens HMAC-markør —
// på stier proxyen ikke kører på (matcher-undtagelser) kunne en klient ellers
// selv sende "x-cc-user: lucas". "delt" = gammelt fælles Basic-login.
export async function currentUser(): Promise<CurrentUser> {
  const h = await headers();
  const secret = process.env.AUTH_SESSION_SECRET;
  const marker = h.get(CC_AUTH_HEADER);
  if (!secret || !marker || !ctEqual(marker, await ccAuthMarker(secret))) return null;
  const v = h.get(CC_USER_HEADER);
  if (v === "lucas" || v === "charlie") return v;
  return v ? "delt" : null;
}
