import { NextResponse } from "next/server";
import { buildDeckSummary } from "@/lib/deck";

// Composes the Mission Control read model at request time from Sheets + the local
// approval queue. Read-only — never mutates, never sends. Offline-safe: a Sheets
// outage yields ok:false and a queue-only view rather than an error.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await buildDeckSummary();
    return NextResponse.json(summary);
  } catch (err) {
    // Last-resort guard: never 500 the home screen. Surface the failure inline.
    return NextResponse.json(
      { ok: false, error: String(err), generatedAt: new Date().toISOString() },
      { status: 200 }
    );
  }
}
