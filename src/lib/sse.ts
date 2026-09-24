// sse.ts — minimal parser for Server-Sent Events (data-linjer med JSON).
// Bruges af HermesDock til at læse /api/hermes/ask-streamen, så delsvaret kan
// vises mens agenten arbejder. Klient-safe (ingen imports), så den kan testes
// direkte med node:test.

/**
 * Del en SSE-buffer i færdige events + rest.
 * Events adskilles af en tom linje ("\n\n"); kommentar-/heartbeat-linjer
 * (": hb") og linjer der ikke starter med "data: " ignoreres. Ugyldig JSON
 * i en data-linje droppes — én dårlig event må ikke dræbe streamen.
 */
export function parseSseBuffer(buf: string): { events: unknown[]; rest: string } {
  const parts = buf.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: unknown[] = [];
  for (const part of parts) {
    const line = part.split("\n").find((l) => l.startsWith("data:"));
    if (!line) continue;
    const payload = line.slice(5).trim();
    if (!payload) continue;
    try {
      events.push(JSON.parse(payload));
    } catch {
      // ignorér ugyldig JSON i én event — streamen fortsætter.
    }
  }
  return { events, rest };
}
