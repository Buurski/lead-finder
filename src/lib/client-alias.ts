// client-alias.ts — kanoniske kundenavne.
//
// Kundenavne er fri tekst på tværs af systemerne (sheet, fakturaer, CRM).
// Denne tabel mapper historiske varianter til det kanoniske navn, så joins
// ikke hviler på rå strenge alene (council-krav 13/9: stabilt kunde-ID +
// alias-tabel; ukendte navne skal FLAGES, ikke forsvinde stille).
//
// Navnet i Clients-arket er kanonisk. Tilføj en linje her når et historisk
// navn dukker op — frem for at ændre i faktura-dokumenter (de er revisionsspor).

export const CLIENT_ALIASES: Record<string, string> = {
  "Vida": "VIDA Skønhedsklinik",
  "Henrik Korshøj - KT VVS": "KT VVS",
};

export function canonicalClientName(name: string): string {
  const clean = (name ?? "").trim();
  return CLIENT_ALIASES[clean] ?? clean;
}

/** Find den kanoniske kunde bag et navn (alias-normaliseret). */
export function findClientByName<T extends { name: string }>(clients: T[], name: string): T | undefined {
  return clients.find((c) => canonicalClientName(c.name) === canonicalClientName(name));
}

/** Navne (fx på fakturaer) der ikke kan kobles til nogen kendt kunde. Returnerer kanoniske navne uden match. */
export function unmatchedNames(names: string[], knownClients: string[]): string[] {
  const known = new Set(knownClients.map(canonicalClientName));
  return [...new Set(names.map(canonicalClientName))].filter((name) => name && !known.has(name));
}
