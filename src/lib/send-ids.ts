// ?ids=a,b på /api/approve/send — send KUN disse drafts. Mobil-fladen /send
// sender ét kort ad gangen; uden ids er adfærden uændret (alle godkendte).
//
// Sikkerhedsregel: er ids-parametret TIL STEDE men tomt/ugyldigt, matcher det
// INGEN drafts — aldrig "alle". En tastefejl må ikke blive til en masse-udsendelse.

export function parseIds(url: string): Set<string> | null {
  const raw = new URL(url).searchParams.get("ids");
  if (raw === null) return null;
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function onlyIds<T extends { id: string }>(drafts: T[], ids: Set<string> | null): T[] {
  return ids ? drafts.filter((d) => ids.has(d.id)) : drafts;
}
