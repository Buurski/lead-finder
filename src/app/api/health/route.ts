import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { getDb, pgEnabled } from "@/lib/db/client";

// GET /api/health — unauthenticated liveness check (excluded from the auth
// middleware). Used by uptime checks and the welcome flow.
// `region` + `db_ms` (ét `select 1`) gør funktionsregion vs. Neon-region målbar.
// DB-tjekket kun ved ?db=1: et offentligt endpoint må ikke kunne holde Neon vågen (kvote 19/10).
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let dbMs: number | null = null;
  // ?db=1 uden pg-backend er fejlkonfiguration, ikke "ok": dbMs forbliver null → 503.
  const wantDb = new URL(req.url).searchParams.get("db") === "1";
  if (wantDb && pgEnabled()) {
    try {
      const t0 = performance.now();
      await getDb().execute(sql`select 1`);
      dbMs = Math.round(performance.now() - t0);
    } catch {
      /* db_ms forbliver null */
    }
  }
  // Uden ?db=1 er det ren liveness (altid ok). Med ?db=1 beder kalderen om DB-readiness: fejl = 503.
  const ok = !wantDb || dbMs !== null;
  return NextResponse.json({ ok, service: "command-center", ts: new Date().toISOString(), region: process.env.VERCEL_REGION ?? null, db_ms: dbMs }, { status: ok ? 200 : 503 });
}
