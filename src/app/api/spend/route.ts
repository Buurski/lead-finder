import { NextResponse } from "next/server";
import { summarize } from "@/lib/spend-log";

// GET /api/spend — aggregated AI spend (estimated). Read-only.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(summarize());
}
