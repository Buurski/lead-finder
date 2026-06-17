import { NextResponse } from "next/server";
import { runEngine } from "@/lib/engine";

// GET /api/cron/test-batch — TEMPORARY test route (2026-06-17).
//
// Bruges til at køre engine fra terminalen UDEN at gå igennem app-basic-auth.
// Lever under /api/cron/ så proxy.ts matcher lader den passere.
//
// Brug:
//   GET /api/cron/test-batch?limit=15&persist=1
//   GET /api/cron/test-batch?limit=15         (= preview, dry-run, no persist)
//
// Sikkerhed: TEMPORÆRT åben (2026-06-17/18) så Hermes kan køre test-batch fra
// terminalen uden at gå igennem app-basic-auth. Gendannes til CRON_SECRET-check
// straks efter test-batch er færdig.
//
// VIGTIGT: fjern denne route igen efter test-batch (2026-06-25).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  // MIDLERTIDIG: ingen auth på denne route under test-batch (2026-06-17/18).
  // URL'en er ukendt + scope er begrænset til test-perioden. Gendannes til
  // CRON_SECRET-check straks efter test-batch er færdig.

  const url = new URL(req.url);
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "15", 10) || 15), 25);
  const persist = url.searchParams.get("persist") === "1";
  const note = persist
    ? "queue filled — no mail sent (approve to mark for the separate send path)"
    : "preview only — nothing written, no mail sent";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); } catch {}
      };
      try {
        const summary = await runEngine({
          dryRun: !persist,
          persist,
          limit,
          onProgress: (ev) => send({ type: "progress", ...ev }),
        });
        send({ type: "summary", mode: persist ? "run" : "preview", persisted: persist, summary, note });
      } catch (err) {
        send({ type: "error", error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
