// Engangs-opsætningsbevis til personligt login. Admin-kommandoen genererer
// koden offline og giver den videre mundtligt; appen sender den aldrig selv.
import { randomInt } from "node:crypto";

// Uden 0/O/1/I — koden læses højt eller skrives af fra et stykke papir.
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const GROUPS = 5;
const GROUP_LEN = 4;

/** 20 tegn i 5 grupper af 4, fx `AB3D-EFGH-JKLM-NPQR-STUV`. */
export function generateSetupCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g++) {
    let group = "";
    for (let i = 0; i < GROUP_LEN; i++) group += ALPHABET[randomInt(ALPHABET.length)];
    groups.push(group);
  }
  return groups.join("-");
}
