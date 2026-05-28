import { NextResponse } from "next/server";
import { setPauseUntil, getPauseSnapshot, type PauseScope } from "@/lib/sheets";

// Pauses a specific send-scope for a given duration. Body:
//   {
//     scope: "all" | "cold" | "followup" | "manual",
//     hours?: number,   // default 24
//     until?: string,   // ISO timestamp — overrides hours if present
//   }
//
// This is the granular counterpart of /api/review/halt-all (which still
// exists for backward compat with the morning-notification email links).
// Resuming a scope is done via POST /api/review/resume.
//
// No confirm token here — pausing is the safe direction (it only ever
// stops sends, never starts them). Resuming requires the explicit token.

const VALID: Set<PauseScope> = new Set(["all", "cold", "followup", "manual"]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const raw = body?.scope;
    if (!VALID.has(raw)) {
      return NextResponse.json(
        { error: "scope must be one of all|cold|followup|manual" },
        { status: 400 }
      );
    }
    const scope: PauseScope = raw;

    let until: string;
    if (typeof body?.until === "string" && body.until) {
      const t = Date.parse(body.until);
      if (Number.isNaN(t)) {
        return NextResponse.json({ error: "invalid 'until' — must be ISO" }, { status: 400 });
      }
      until = body.until;
    } else {
      const hours = typeof body?.hours === "number" && body.hours > 0 ? body.hours : 24;
      until = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
    }

    await setPauseUntil(scope, until);
    const snapshot = await getPauseSnapshot();
    return NextResponse.json({
      ok: true,
      paused: true,
      scope,
      until,
      snapshot,
    });
  } catch (err) {
    console.error("review/pause failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
