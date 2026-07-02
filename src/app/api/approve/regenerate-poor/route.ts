// Bulk: regenerate drafts that LACK meaningful data (no hooks, no achievements,
// low reviews). Uses composeColdEmail with the lead's branch + city to surface
// the new "lokation-baseret" opener (tone-mixer 5b) which reads as personal
// even when there's no review quote or detail to anchor on.
//
// Use case 2026-06-23: Beauty by NK and similar hooks-less leads fell back to
// the generic demo-hook opener (\"Med jeres kundebase…\") which sounded like
// template spam. The branch+city opener uses the lead's own branch/city
// (\"For en permanent makeup i Faaborg…\").
//
// Rules:
//   - Skips drafts that already have rich data (hooks.length >= 2 OR
//     achievements-like professionalism text). Don't break the personal
//     openings that already work.
//   - Only touches edited/pending. Sent/rejected/approved are NEVER touched.
//   - Validates via composeColdEmail (throws on voice violation → skip).
//
// Skips:
//   - drafts with sent/rejected/approved status (terminal)
//   - drafts with hooks.length >= 2 (already personal)
//   - drafts where composeColdEmail throws (e.g. validateDraft fails)

import { NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/queue";
import { composeColdEmail } from "@/lib/compose";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let payload: { dryRun?: boolean } = {};
  try {
    payload = await req.json();
  } catch {
    /* empty body is OK */
  }
  const dryRun = payload.dryRun ?? false;

  const drafts = await readQueue();
  const fixed: Array<{
    id: string;
    name: string;
    before: string;
    after: string;
    openerKind: string;
  }> = [];
  let skippedRich = 0;
  let skippedTerminal = 0;
  let skippedComposeFail = 0;
  let skippedNoBranchOrCity = 0;

  for (const d of drafts) {
    if (d.status === "sent" || d.status === "rejected" || d.status === "approved") {
      skippedTerminal++;
      continue;
    }
    // Skip drafts that already have rich data — don't break their openers.
    if ((d.hooks || []).length >= 2) {
      skippedRich++;
      continue;
    }
    if (!d.branch || !d.city) {
      skippedNoBranchOrCity++;
      continue;
    }

    let composed;
    try {
      composed = composeColdEmail({
        name: d.name,
        branch: d.branch,
        city: d.city,
        hooks: d.hooks || [],
      });
    } catch {
      skippedComposeFail++;
      continue;
    }

    if (!dryRun) {
      d.subject = composed.subject;
      d.body = composed.text;
      d.demoPair = composed.demoPair;
      d.comboId = composed.comboId;
      d.openerKind = composed.openerKind;
      d.updatedAt = new Date().toISOString();
    }
    if (fixed.length < 5) {
      fixed.push({
        id: d.id,
        name: d.name,
        before: (d.body || "").slice(0, 80),
        after: composed.text.slice(0, 80),
        openerKind: composed.openerKind,
      });
    }
  }

  if (!dryRun) await writeQueue(drafts);

  return NextResponse.json({
    ok: true,
    dryRun,
    fixedCount: fixed.length,
    fixedSample: fixed,
    skippedRich,
    skippedTerminal,
    skippedComposeFail,
    skippedNoBranchOrCity,
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST with optional { dryRun: boolean } — regenerates hooks-less drafts using branch+city opener",
  });
}
