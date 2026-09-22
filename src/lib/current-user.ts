import "server-only";
import { headers } from "next/headers";
import { CC_USER_HEADER } from "./cc-auth.ts";

export type CurrentUser = "lucas" | "charlie" | "delt" | null;

// Hvem er logget ind? Proxyen sætter headeren efter at have verificeret
// session-cookien og stripper enhver indgående kopi, så værdien er til at stole på.
// "delt" = gammelt fælles Basic-login (udfases i fase 2).
export async function currentUser(): Promise<CurrentUser> {
  const v = (await headers()).get(CC_USER_HEADER);
  if (v === "lucas" || v === "charlie") return v;
  return v ? "delt" : null;
}
