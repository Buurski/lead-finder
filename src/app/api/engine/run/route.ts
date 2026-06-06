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
//
// Response is an NDJSON stream (one JSON object per line) so the UI can show the
// engine working — each line is either {type:"progress", ...EngineProgress} as a
// lead is researched/drafted, or a final {type:"summary"|"error"}. The loop is
// sequential (one Opus draft per lead), so without this the request looks frozen
// for a couple of minutes. maxDuration is raised so a full batch can't time out.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

  const note =
    mode === "preview"
      ? "preview only — nothing written, no mail sent"
      : "queue filled — no mail sent (approve to mark for the separate send path)";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
        } catch {
          /* client gone */
        }
      };
      try {
        const summary = await runEngine({
          dryRun: mode === "preview",
          persist: mode === "run",
          limit,
          leadName,
          onProgress: (ev) => send({ type: "progress", ...ev }),
        });
        send({ type: "summary", mode, persisted: mode === "run", summary, note });
      } catch (err) {
        send({ type: "error", error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
    },
  });
}
