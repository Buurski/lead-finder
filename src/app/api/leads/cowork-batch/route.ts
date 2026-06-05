// /api/leads/cowork-batch — GET returns a Markdown prompt for a Cowork session
// to process the next N pending leads from the deep-research queue.
//
// Query params:
//   ?n=10           batch size (default 10, max 25)
//
// Response: text/markdown (Cowork can paste directly into a chat).
//
// Marks the returned entries as "in_progress" so the same batch isn't sent to
// two parallel Cowork sessions. If a session abandons mid-batch, the entries
// stay in_progress until either a result POST or a manual reset.

import { NextRequest } from "next/server";
import { peekPending, updateStatus } from "@/lib/deep-research-queue";
import { buildCoworkPrompt } from "@/lib/cowork-prompt";

export const dynamic = "force-dynamic";

const MAX_BATCH = 25;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const n = Math.min(Math.max(1, Number(url.searchParams.get("n")) || 10), MAX_BATCH);
  const dryRun = url.searchParams.get("dry") === "1";

  const pending = await peekPending(n);

  if (pending.length === 0) {
    return new Response(
      "# Ingen leads i kø\n\nKøen er tom. Brug /leads i Command Center → 'Start deep batch' for at tilføje leads.",
      { headers: { "Content-Type": "text/markdown; charset=utf-8" } },
    );
  }

  const appUrl =
    process.env.APP_URL ||
    `https://${process.env.VERCEL_URL || "lead-finder-three-beta.vercel.app"}`;
  const apiSecret = process.env.DEEP_RESEARCH_SECRET;

  // Mark as in_progress unless dry-run.
  if (!dryRun) {
    for (const e of pending) {
      await updateStatus(e.leadId, "in_progress").catch(() => null);
    }
  }

  const prompt = buildCoworkPrompt(pending, {
    batchSize: n,
    appUrl,
    apiSecret,
  });

  return new Response(prompt, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
