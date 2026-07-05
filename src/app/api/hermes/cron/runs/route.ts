import { NextResponse } from "next/server";
import { hermesFetch } from "@/lib/hermes";

// GET /api/hermes/cron/runs?limit=10 — returnerer alle Hermes-jobs med seneste N kørsler.
// Proxy til hermes-api'ets /api/cron/runs endpoint.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit")) || 10));
  const { status, data } = await hermesFetch<{ jobs?: unknown; error?: string }>(
    "GET", `/api/cron/runs?limit=${limit}`, undefined, 10_000,
  );
  if (status !== 200 || !data) {
    return NextResponse.json(
      { ok: false, error: data?.error ?? `hermes-api svarede ${status || "ikke"}` },
      { status: 502 },
    );
  }
  return NextResponse.json({ ok: true, ...(data as Record<string, unknown>) });
}
