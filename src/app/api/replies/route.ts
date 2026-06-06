import { NextResponse } from "next/server";
import { loadDigest, saveDigest, summarizeDigest } from "@/lib/inbox-digest";
import { liveScanDigest } from "@/lib/inbox-live";

// GET /api/replies — inbox triage for the "Svar" page.
//
// Artifact-first: returns the ranked digest a Cowork/Opus task pushed to
// /api/inbox/digest (preferred — model ran on Lucas's subscription). When none
// exists yet, runs a LIVE, deterministic lead-matched scan (inbox-live.ts), saves
// it so it's cached + Mission Control's "needs reply" reflects it, and returns it.
// Read-only; nothing sent.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const stored = await loadDigest();
  if (stored && Array.isArray(stored.items) && stored.items.length > 0) {
    return NextResponse.json({ ok: true, source: "artifact", digest: stored, summary: summarizeDigest(stored) });
  }

  const live = await liveScanDigest();
  if (!live.ok || !live.digest) {
    return NextResponse.json({ ok: false, error: live.error ?? "scan failed", source: "none", digest: null }, { status: 200 });
  }
  // Cache the fallback so the page + deck don't re-scan every load (a Cowork POST
  // to /api/inbox/digest overwrites it with the richer AI digest).
  if (live.digest.items.length > 0) await saveDigest(live.digest);
  return NextResponse.json({ ok: true, source: "live-fallback", digest: live.digest, summary: summarizeDigest(live.digest) });
}
