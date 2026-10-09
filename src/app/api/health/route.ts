import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, pgEnabled } from "@/lib/db/client";

// GET /api/health — unauthenticated liveness check (excluded from the auth
// middleware). Used by uptime checks and the welcome flow.
// `region` + `db_ms` (ét `select 1`) gør funktionsregion vs. Neon-region målbar.
export const dynamic = "force-dynamic";

export async function GET() {
  let dbMs: number | null = null;
  if (pgEnabled()) {
    try {
      const t0 = performance.now();
      await getDb().execute(sql`select 1`);
      dbMs = Math.round(performance.now() - t0);
    } catch {
      /* db_ms forbliver null — liveness må ikke falde på en db-fejl */
    }
  }
  return NextResponse.json({ ok: true, service: "command-center", ts: new Date().toISOString(), region: process.env.VERCEL_REGION ?? null, db_ms: dbMs });
}
