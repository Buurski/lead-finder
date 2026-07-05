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
  // Two shapes:
  //   POST ?limit=N            → draft the top-N contactable un-worked leads.
  //   POST { names: string[] } → draft EXACTLY these hand-picked rows (the /leadgen
  //                              "Lav udkast på valgte" button). Email-channel only.
  let names: string[] | undefined;
  try {
    const body = await req.json().catch(() => null);
    if (body && Array.isArray(body.names)) {
      names = body.names.map((n: unknown) => String(n)).filter((n: string) => n.trim()).slice(0, 25);
    }
  } catch { /* no body → top-N path */ }

  const limit = names && names.length
    ? names.length
    : Math.min(25, Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") || "12", 10) || 12));
  try {
    const summary = await runEngine(
      names && names.length ? { limit, allowNames: names, persist: true } : { limit, persist: true }
    );
    return NextResponse.json({
      ok: true,
      drafted: summary.drafted,
      written: summary.written,
      requested: names ? names.length : limit,
      skipped: summary.skipped,
      note: "udkast lagt i godkendelse — ingen mail sendt",
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
