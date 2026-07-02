// Bulk: rewrite demoPair for drafts where the order is wrong (e.g. VIDA
// should be first for skønhed/klinik but salonArtec was first).
//
// Use case 2026-06-23: Lucas asked for VIDA (reel kunde) to be the main
// demo reference for skønhed-drafts. pickDemos() now returns VIDA first
// for BEAUTY/CLINIC, but the 196 existing BEAUTY drafts still have the
// old [salonArtec, vida] order. This endpoint rewrites them.
//
// Rules:
//   - Only touches drafts where the FIRST demo is salon-artec AND the
//     SECOND is vida-klinik (i.e. BEAUTY drafts that were generated before
//     the demo-ordering fix).
//   - Optionally accepts { ids: [...] } to fix a subset.
//   - Without { ids }, fixes all matching drafts.
//   - Does NOT touch sent/rejected/approved (only edited/pending).
//   - Auth: Basic via middleware.

import { NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/queue";

export const dynamic = "force-dynamic";

function needsFlip(d: { demoPair?: Array<{ url?: string }> }): boolean {
  const pair = d.demoPair || [];
  if (pair.length < 2) return false;
  const first = pair[0]?.url || "";
  const second = pair[1]?.url || "";
  return first.includes("salon-artec") && second.includes("vida-klinik");
}

export async function POST(req: Request) {
  let payload: { ids?: string[]; dryRun?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    /* empty body is OK */
  }
  const dryRun = payload.dryRun ?? false;
  const idsSet = payload.ids ? new Set(payload.ids) : null;

  const drafts = await readQueue();
  const fixed: Array<{ id: string; name: string; before: string[]; after: string[] }> = [];
  let skippedNotMatching = 0;
  let skippedTerminal = 0;

  for (const d of drafts) {
    if (idsSet && !idsSet.has(d.id)) continue;
    if (d.status === "sent" || d.status === "rejected" || d.status === "approved") {
      skippedTerminal++;
      continue;
    }
    if (!needsFlip(d)) {
      skippedNotMatching++;
      continue;
    }
    const before = (d.demoPair || []).map((x) => x.url || "");
    const after = [before[1], before[0]]; // flip
    if (!dryRun) {
      d.demoPair = [
        { label: d.demoPair![1].label || "Skønhedsklinik", url: before[1] },
        { label: d.demoPair![0].label || "Salon / skønhed", url: before[0] },
      ];
      d.updatedAt = new Date().toISOString();
    }
    if (fixed.length < 20) {
      fixed.push({ id: d.id, name: d.name, before, after });
    }
  }

  if (!dryRun) await writeQueue(drafts);

  return NextResponse.json({
    ok: true,
    dryRun,
    fixedCount: fixed.length,
    fixedSample: fixed,
    skippedNotMatching,
    skippedTerminal,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST with optional { ids: string[], dryRun: boolean }",
  });
}
