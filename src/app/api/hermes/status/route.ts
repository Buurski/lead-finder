import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { hermesHealth } from "@/lib/hermes";

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
  const url = process.env.HERMES_API_URL ?? "";
  return NextResponse.json({
    ok: true,
    ...health,
    debug: {
      urlHost: url ? url.replace(/^https?:\/\//, "").slice(0, 24) : null,
      urlScheme: url ? (url.startsWith("https") ? "https" : url.startsWith("http") ? "http" : "?") : null,
      secretFp: fingerprint(process.env.HERMES_API_SECRET),
      secretLen: (process.env.HERMES_API_SECRET ?? "").length || null,
    },
  });
}
