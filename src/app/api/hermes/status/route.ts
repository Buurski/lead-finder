import { NextResponse } from "next/server";
import { hermesHealth } from "@/lib/hermes";
import { readVaultJson } from "@/lib/vault";

// GET /api/hermes/status — configured? reachable? gateway running? cron count.
// Undtaget fra basic auth (se proxy.ts) så VPS-forbindelsen kan fejlsøges
// udefra. Ruten er OFFENTLIG: kun health-tal. Ingen URL'er, hostnavne, secret-
// fingerprints eller længder (E17, 9/10: debug + webuiUrl lækkede tunnel-adressen
// til en root-WebUI). Fejlsøg env-værdier via `vercel env` eller den beskyttede /hermes.
export const dynamic = "force-dynamic";

export async function GET() {
  // webuiUrl hører kun til den beskyttede /hermes-side — aldrig her.
  const { webuiUrl: _webuiUrl, ...health } = await hermesHealth();
  // Omverden-heartbeat (2026-07-18): Hermes' VPS-cron læser omverdenStaleHours
  // her og pinger Lucas på Telegram hvis den lokale omverden-daily-task ikke
  // har kørt (>30 t). Kun en timestamp — ingen indhold, ingen hemmeligheder.
  let omverdenAt: string | null = null;
  let omverdenStaleHours: number | null = null;
  try {
    const f = await readVaultJson<{ at?: string }>("data/omverden.json");
    omverdenAt = f?.at ?? null;
    const ms = Date.parse(omverdenAt ?? "");
    if (Number.isFinite(ms)) omverdenStaleHours = Math.round((Date.now() - ms) / 3_600_000);
  } catch { /* vault utilgængelig — felter forbliver null */ }
  return NextResponse.json({
    ok: true,
    // Kort commit-SHA for den udrulning der svarer. Ruten er offentlig (undtaget
    // basic auth i proxy.ts), så en serverside-ændring ellers ikke kan
    // verificeres udefra — og "pushet" er ikke det samme som "udrullet".
    // Syv tegn af en commit-hash afslører intet fra et privat repo.
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    ...health,
    omverdenAt,
    omverdenStaleHours,
  });
}
