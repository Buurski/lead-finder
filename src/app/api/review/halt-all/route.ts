import { NextResponse } from "next/server";
import { setPauseUntil, getPauseStatus, type PauseScope } from "@/lib/sheets";

// Sets the master kill (or a specific scope) for 24h from now. Used by the
// review UI fetch and by the link in the morning notification email (so
// Lucas can tap "🛑 Stop alt i dag" on his phone with no JS needed).
//
// scope is read from the ?scope=... query (GET) or from the body (POST).
// Defaults to "all" for backward compatibility with the existing email links.

const PAUSE_HOURS = 24;
const VALID: Set<PauseScope> = new Set(["all", "cold", "followup", "manual"]);

function parseScope(raw: string | null | undefined): PauseScope {
  if (!raw) return "all";
  return VALID.has(raw as PauseScope) ? (raw as PauseScope) : "all";
}

async function doHalt(scope: PauseScope) {
  const until = new Date(Date.now() + PAUSE_HOURS * 60 * 60 * 1000).toISOString();
  await setPauseUntil(scope, until);
  return until;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const scope = parseScope(body?.scope);
    const until = await doHalt(scope);
    return NextResponse.json({ paused: true, until, scope });
  } catch (err) {
    console.error("review/halt-all failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const scope = parseScope(url.searchParams.get("scope"));
    const until = await doHalt(scope);
    return NextResponse.json({ paused: true, until, scope });
  } catch (err) {
    console.error("review/halt-all failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// Optional helper for a future "current pause status" check from the UI.
export async function HEAD() {
  const status = await getPauseStatus("all");
  return new Response(null, {
    status: status.paused ? 200 : 204,
    headers: status.until ? { "X-Paused-Until": status.until } : {},
  });
}
