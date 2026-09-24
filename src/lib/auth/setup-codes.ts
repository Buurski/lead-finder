// Engangs-opsætningsbevis til personligt login. Admin-kommandoen genererer
// koden offline og giver den videre mundtligt; appen sender den aldrig selv.
import { randomInt } from "node:crypto";

// Uden 0/O/1/I — koden læses højt eller skrives af fra et stykke papir.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const GROUPS = 5;
const GROUP_LEN = 4;

/** Grupper af 4 tegn, fx `AB3D-EFGH-JKLM-NPQR-STUV` (default 5 grupper).
 * Færre grupper = nemmere at taste; 3 grupper (60 bit) er stadig rigeligt
 * med rate limit + udløb + ét forbrug. */
export function generateSetupCode(groups = GROUPS): string {
  const parts: string[] = [];
  for (let g = 0; g < groups; g++) {
    let group = "";
    for (let i = 0; i < GROUP_LEN; i++) group += ALPHABET[randomInt(ALPHABET.length)];
    parts.push(group);
  }
  return parts.join("-");
}
