import { NextResponse } from "next/server";
import { setPauseUntil, getPauseStatus } from "@/lib/sheets";

// Clears the global pause flag — i.e. re-enables cold sends, follow-ups,
// scheduled cron, and manual single-sends. The counterpart of /api/review/halt-all.
//
// Requires an explicit confirmation token in the body so a stray fetch from
// the review UI can never accidentally re-enable automation. The token is
// intentionally Danish + caps + underscore to make muscle-memory clicks
// effectively impossible: { "confirm": "JEG_VED_HVAD_JEG_GOER" }

const CONFIRM_TOKEN = "JEG_VED_HVAD_JEG_GOER";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== CONFIRM_TOKEN) {
      return NextResponse.json(
        {
          error: "missing or invalid confirm token",
          required: { confirm: CONFIRM_TOKEN },
        },
        { status: 400 }
      );
    }
    // Empty string in column A clears the pause — getPauseStatus() treats
    // empty as { paused: false } and that's the explicit "resume" signal.
    await setPauseUntil("");
    const status = await getPauseStatus();
    return NextResponse.json({
      ok: true,
      paused: status.paused,
      pausedUntil: status.until,
      resumedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("review/resume failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
