// Klient-kald til /api/marketing (menneske-vejen). Kaster en dansk fejltekst, så formularen kan vise den.
export async function mk<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch("/api/marketing", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  } catch {
    throw new Error("Kunne ikke nå serveren. Prøv igen.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(data.error || "Noget gik galt. Prøv igen.");
  return data as T;
}

const DA_MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const DA_DAYS = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
/** "2026-10-16" → "fre 16. okt" (uden tidszone-spring: regnet på UTC). */
export function niceDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  return `${DA_DAYS[d.getUTCDay()]} ${d.getUTCDate()}. ${DA_MONTHS[d.getUTCMonth()]}`;
}
