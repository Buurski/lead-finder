import { NextResponse } from "next/server";

// GET /api/health — unauthenticated liveness check (excluded from the auth
// middleware). Used by uptime checks and the welcome flow.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ ok: true, service: "command-center", ts: new Date().toISOString() });
}
