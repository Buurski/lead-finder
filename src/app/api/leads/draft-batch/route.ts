import { NextResponse } from "next/server";
import { runEngine } from "@/lib/engine";

// POST /api/leads/draft-batch?limit=N — the in-app bridge from the lead pool to the
// approval queue. Runs the engine (PICK→RESEARCH→QUALIFY→DRAFT→COLLECT) on the top-N
// contactable un-worked leads and appends the drafts to /approve. NEVER sends mail —
// the queue is the only output. This is what turns /lead-gen's pool into godkendelse-
// drafts beyond the daily cron's dailyLimit.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request) {
  const limit = Math.min(25, Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") || "12", 10) || 12));
  try {
    const summary = await runEngine({ limit, persist: true });
    return NextResponse.json({ ok: true, drafted: summary.drafted, written: summary.written, note: "udkast lagt i godkendelse — ingen mail sendt" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
