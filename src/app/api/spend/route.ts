import { NextResponse } from "next/server";
import { loadSpendSummary } from "@/lib/spend-log";

// GET /api/spend — aggregated AI spend (estimated). Read-only.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await loadSpendSummary());
}
