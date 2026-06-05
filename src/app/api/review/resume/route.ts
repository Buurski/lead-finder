import { NextResponse } from "next/server";
import { setPauseUntil, getPauseSnapshot, type PauseScope } from "@/lib/sheets";

// Clears the pause flag for a scope. Counterpart of /api/review/halt-all.
// Body: { confirm: "JEG_VED_HVAD_JEG_GOER", scope?: "all"|"cold"|"followup"|"manual" }
//
// scope defaults to "all" — clears MASTER + cold + followup + manual in one
// shot, which is the "fully resume everything" intent. Passing a specific
// scope clears only that cell so Lucas can selectively re-enable e.g.
// follow-ups while keeping cold paused.
//
// The confirmation token is intentionally caps + Danish + underscore so a
// stray fetch from the UI cannot accidentally re-enable automation. The
// review UI also gates the button behind a checkbox and a window.confirm.

const CONFIRM_TOKEN = "JEG_VED_HVAD_JEG_GOER";
const VALID: Set<PauseScope> = new Set(["all", "cold", "followup", "manual"]);

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.confirm !== CONFIRM_TOKEN) {
      return NextResponse.json(
        {
          error: "missing or invalid confirm token",
          required: { confirm: CONFIRM_TOKEN, scope: "all|cold|followup|manual (default all)" },
        },
        { status: 400 }
      );
    }
    const raw = body?.scope;
    const scope: PauseScope = VALID.has(raw) ? raw : "all";

    if (scope === "all") {
      // Clear master + all three specific cells in one batch.
      await Promise.all([
        setPauseUntil("all", ""),
        setPauseUntil("cold", ""),
        setPauseUntil("followup", ""),
        setPauseUntil("manual", ""),
      ]);
    } else {
      // Clear only the specific cell. Master stays untouched — if the
      // master is set, the resume of a specific scope has no effect until
      // master is also cleared, which is intentional safety.
      await setPauseUntil(scope, "");
    }

    const snapshot = await getPauseSnapshot();
    return NextResponse.json({
      ok: true,
      resumedAt: new Date().toISOString(),
      scope,
      snapshot,
    });
  } catch (err) {
    console.error("review/resume failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
