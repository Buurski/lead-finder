// messenger/vault-gate.ts — fail-closed værn ved API-grænsen (/api/messenger).
//
// Vault-vejen (data/messenger.json, skrevet af en Cowork-opgave) springer
// compose.ts over: Cowork klassificerer selv og skriver både category og draft,
// og MessengerPanel viser og kopierer c.draft 1:1. En forkert kladde er derfor ét
// paste fra at blive sendt.
//
// Gaten ER et sidste filter: den dropper en kandidat når branch/navn tyder på
// fitness/træning OG kandidaten enten er filed som beauty eller bærer beauty-ord
// (inkl. VIDA-linket) i kladden. Den RETTER ikke klassificeringen: på denne gren
// (udgået fra origin/main) er compose.ts stadig utæt (wellness → beauty +
// VIDA-demo + "frisørsalon"), så den dropper også en legitim fitness-lead på
// Sheets-vejen. Det er med vilje — en manglende kandidat er billigere end en
// forkert kladde der er ét paste fra at blive sendt. Antallet står i svaret som
// pool.gated. Efter merge af 478013e fanger den kun reelle fejlklassificeringer.
//
// Bevidst grænse: gaten fyrer KUN på fitness-ord i branch/navn. En ren
// wellness/spa/massage-virksomhed med beauty-kladde fanges ikke her — ordene er
// også beauty-ord, og en bredere liste ville droppe legitime beauty-kladder.
// Massage-/wellness-routing hører til compose-kortet.
//
// Fail-closed: alt andet end den ene kombination går uændret igennem.

import type { MessengerCandidate } from "./select.ts";

// Skal holdes i takt med FITNESS i ../demos.ts: brancher uden egen demo må ikke
// falde i klinik-looket. Ændres den ene liste, skal den anden med.
const FITNESS = /fitness|træningscenter|traeningscenter|crossfit|\bgym\b|personlig træner|personlig traener|\bpt\b|yoga|pilates|spinning|bootcamp|kampsport|boksning/i;

// Beauty-ord der intet har med træning at gøre. Bruges kun til at afsløre en
// kladde der taler om en helt anden branche (inkl. VIDA-casen).
const BEAUTY_LEAK = /frisør|frisor|salon|skønhed|skonhed|hudklinik|kosmetolog|beautyclinic|vida-klinik|vidaKlinik/i;

type GatedShape = Pick<MessengerCandidate, "name" | "branch" | "category" | "draft">;

/** Fail-closed: true = kandidaten må vises og kopieres. Se headeren for hvad den
 *  rammer på denne gren (også legitim fitness, så længe compose.ts er utæt). */
export function gatedMessengerCandidate(c: GatedShape): boolean {
  const text = `${c.branch || ""} ${c.name || ""}`;
  if (!FITNESS.test(text)) return true;       // ikke fitness → urørt
  if (c.category === "beauty") return false;  // fejlklassificeret som beauty
  return !BEAUTY_LEAK.test(c.draft || "");    // ... eller kladden lækker beauty-ord/VIDA
}

/** Filtrerer en liste af vault-kandidater. Tåler tom/undefined liste og dropper
 *  null-elementer (fail-closed: en tom plads i filen skal ikke igennem som kandidat). */
export function gateMessengerCandidates<T extends GatedShape>(
  list: readonly T[] | null | undefined,
): T[] {
  if (!Array.isArray(list)) return [];
  return list.filter((c): c is T => Boolean(c) && gatedMessengerCandidate(c));
}
