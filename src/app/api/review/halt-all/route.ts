import { NextResponse } from "next/server";
import { setPauseUntil, getPauseStatus } from "@/lib/sheets";

// Sets the global pause flag for 24h from now. Both cron scheduled-send and
// the manual bulk-send / send-followups routes check this flag before
// dispatching, so this is the kill switch for everything.
//
// Accepts both POST (from the review UI fetch) and GET (for the link in the
// notification email, so Lucas can tap it on his phone with no JS needed).

const PAUSE_HOURS = 24;

async function doHalt() {
  const until = new Date(Date.now() + PAUSE_HOURS * 60 * 60 * 1000).toISOString();
  await setPauseUntil(until);
  return until;
}

export async function POST() {
  try {
    const until = await doHalt();
    return NextResponse.json({ paused: true, until });
  } catch (err) {
    console.error("review/halt-all failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const until = await doHalt();
    return NextResponse.json({ paused: true, until });
  } catch (err) {
    console.error("review/halt-all failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Optional helper for a future "current pause status" check from the UI.
export async function HEAD() {
  const status = await getPauseStatus();
  return new Response(null, {
    status: status.paused ? 200 : 204,
    headers: status.until ? { "X-Paused-Until": status.until } : {},
  });
}
