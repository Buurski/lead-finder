import { NextResponse } from "next/server";
import { hermesHealth } from "@/lib/hermes";

// GET /api/hermes/status — configured? reachable? gateway running? cron count.
export const dynamic = "force-dynamic";

export async function GET() {
  const health = await hermesHealth();
  return NextResponse.json({ ok: true, ...health });
}
