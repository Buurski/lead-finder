import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cleanEnv, hermesHealth } from "@/lib/hermes";
import { readVaultJson } from "@/lib/vault";

// GET /api/hermes/status — configured? reachable? gateway running? cron count.
// Undtaget fra basic auth (se proxy.ts) så VPS-forbindelsen kan fejlsøges
// udefra. Indeholder ingen hemmeligheder — kun health + et secret-FINGERPRINT
// (sha256-prefix) til at sammenligne med VPS'ens uden at afsløre værdien.
export const dynamic = "force-dynamic";

function fingerprint(value: string | undefined): string | null {
  if (!value) return null;
  return crypto.createHash("sha256").update(value, "utf-8").digest("hex").slice(0, 8);
}

export async function GET() {
  const health = await hermesHealth();
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
  const url = cleanEnv(process.env.HERMES_API_URL);
  const secret = cleanEnv(process.env.HERMES_API_SECRET);
  return NextResponse.json({
    ok: true,
    ...health,
    omverdenAt,
    omverdenStaleHours,
    debug: {
      urlHost: url ? url.replace(/^https?:\/\//, "").slice(0, 24) : null,
      urlScheme: url ? (url.startsWith("https") ? "https" : url.startsWith("http") ? "http" : "?") : null,
      secretFp: fingerprint(secret),
      secretLen: secret.length || null,
      // rå længder afslører copy-paste-støj (BOM/newline) i Vercel-env
      rawUrlLen: (process.env.HERMES_API_URL ?? "").length || null,
      rawSecretLen: (process.env.HERMES_API_SECRET ?? "").length || null,
    },
  });
}
