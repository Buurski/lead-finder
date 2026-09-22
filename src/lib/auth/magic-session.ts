// Edge-safe (bruges af proxyen): oversættelse mellem cookie-bruger og person.
// Præfikset "m:" kan aldrig forekomme i et Basic-brugernavn (Basic splitter på
// første kolon), så en gammel delt cookie kan aldrig blive læst som en person.

export type Person = "lucas" | "charlie";

export const sessionUserFor = (id: Person) => `m:${id}`;

export function personFromSessionUser(u: string | null): Person | null {
  return u === "m:lucas" ? "lucas" : u === "m:charlie" ? "charlie" : null;
}
