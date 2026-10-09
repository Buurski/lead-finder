import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { outreach } from "@/lib/db/schema";

// Skallens badge-tæller: kun det AppShell viser (kladder der venter). Ét count —
// ingen Sheets, ingen GitHub, ingen lead-rækker. Erstatter /api/deck/summary i skallen.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [row] = await getDb().select({ n: sql<number>`count(*)::int` }).from(outreach).where(eq(outreach.status, "pending"));
    return NextResponse.json({ queue: row.n }, { headers: { "Cache-Control": "private, max-age=30, stale-while-revalidate" } });
  } catch {
    // Badget er best-effort — skallen må aldrig vælte på en tæller.
    return NextResponse.json({ queue: null });
  }
}
