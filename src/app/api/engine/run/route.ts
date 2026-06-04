import { NextResponse } from "next/server";
import { runEngine } from "@/lib/engine";

// POST /api/engine/run — the Fase B engine action.
//
//   { mode: "preview", limit? }            run the full PICK→DRAFT loop but write
//                                          NOTHING. Returns the drafts it would
//                                          add, so Lucas can eyeball before commit.
//   { mode: "run", confirm: true, limit? } actually fill the approval queue.
//
// The engine NEVER sends mail in either mode — it only ever fills the queue, and
// only the explicitly-confirmed "run" mode persists. "run" without confirm:true
// is rejected, so a stray click can't mutate the live queue.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface Body {
  mode?: "preview" | "run";
  limit?: number;
  leadName?: string;
  confirm?: boolean;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const mode = body.mode ?? "preview";
  const limit = Math.min(Math.max(1, body.limit ?? 12), 25);
  const leadName = body.leadName?.trim() || undefined;

  if (mode === "run" && body.confirm !== true) {
    return NextResponse.json(
      { error: "run mode requires confirm:true — preview first, then confirm" },
      { status: 412 }
    );
  }

  try {
    const summary =
      mode === "preview"
        ? await runEngine({ dryRun: true, persist: false, limit, leadName })
        : await runEngine({ dryRun: false, persist: true, limit, leadName });

    return NextResponse.json({
      mode,
      persisted: mode === "run",
      summary,
      note:
        mode === "preview"
          ? "preview only — nothing written, no mail sent"
          : "queue filled — no mail sent (approve to mark for the separate send path)",
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
