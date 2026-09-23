// Datogenveje til "Flyt"-menuen (opgaver + virksomhedsprofil). Rene
// funktioner på ISO-datostrenge (YYYY-MM-DD), samme stil som summary.ts.
export function addDays(today: string, n: number): string {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Altid en dato senere end i dag — også hvis i dag er mandag. */
export function nextMonday(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const add = ((8 - d.getUTCDay()) % 7) || 7;
  d.setUTCDate(d.getUTCDate() + add);
  return d.toISOString().slice(0, 10);
}
