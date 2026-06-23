// Bulk: re-run composeColdEmail on drafts that the standard regenerate-route
// would skip (they were already regenerated today, but we want a fresh pick
// after tone-mixer changes — e.g. new branch+city opener for data-poor leads).
//
// Use case 2026-06-23: Lucas noticed Beauty by NK had the generic
// "kundebase"-frase even after regeneration. Cause: it had no hooks/achiev-
// ements/reviewsCount/websiteStatus, so the only eligible opener was the
// demo-hook fallback. tone-mixer was extended with a branch+city opener
// (5b). recompose re-runs compose on the existing draft data so the new
// opener logic kicks in.
//
// Rules:
//   - Does NOT skip on hasOldHook (unlike /regenerate).
//   - Only touches edited/pending (never sent/rejected/approved).
//   - Optionally accepts { ids: [...] } to recompose a subset.
//   - Without { ids }, recomposes ALL editable drafts.
//   - Always sends only `composed.text` (HTML bug from regenerate-route is
//     fixed; this route has the same fix from day one).
//   - If the composed opener equals the existing body opener (no change),
//     the draft is reported as `unchanged` and NOT rewritten.

import { NextResponse } from "next/server";
import { readQueue, writeQueue } from "@/lib/queue";
import { composeColdEmail, type ComposeLead } from "@/lib/compose";

export const dynamic = "force-dynamic";

function leadFromDraft(d: { name: string; branch: string; city: string; hooks: string[]; professionalism?: string }): ComposeLead {
  // professionalism sometimes encodes reviewsCount ("53 reviews") or leadgen
  // fitScore. Try to extract a number; otherwise leave undefined.
  let reviewsCount: number | undefined;
  const m = (d.professionalism || "").match(/(\d+)\s+reviews?/i);
  if (m) reviewsCount = parseInt(m[1], 10);

  // Heuristic websiteStatus from professionalism if it mentions "ingen hjemmeside"
  let websiteStatus: ComposeLead["websiteStatus"];
  const p = (d.professionalism || "").toLowerCase();
  if (p.includes("ingen hjemmeside") || p.includes("facebook-side")) websiteStatus = "none";

  return {
    name: d.name,
    branch: d.branch || "",
    city: d.city || "",
    hooks: d.hooks || [],
    reviewsCount,
    websiteStatus,
  };
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
  const results: Array<{
    id: string;
    name: string;
    action: "rewrote" | "unchanged" | "voice-violation" | "skipped";
    openerSample?: string;
    error?: string;
  }> = [];
  let skipped = 0;

  for (const d of drafts) {
    if (idsSet && !idsSet.has(d.id)) continue;
    if (d.status !== "edited" && d.status !== "pending") {
      skipped++;
      continue;
    }

    let composed;
    try {
      composed = composeColdEmail(leadFromDraft(d));
    } catch (e) {
      results.push({
        id: d.id,
        name: d.name,
        action: "voice-violation",
        error: e instanceof Error ? e.message : String(e),
      });
      if (results.length < 20) {
        // ok, already pushed
      }
      continue;
    }

    const newOpener = composed.text.split("\n\n")[1] || composed.text;
    const oldOpener = (d.body || "").split("\n\n")[1] || d.body || "";

    if (newOpener.trim() === oldOpener.trim()) {
      results.push({ id: d.id, name: d.name, action: "unchanged" });
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
    results.push({
      id: d.id,
      name: d.name,
      action: "rewrote",
      openerSample: newOpener.slice(0, 100),
    });
  }

  if (!dryRun) await writeQueue(drafts);

  const summary = {
    rewrote: results.filter((r) => r.action === "rewrote").length,
    unchanged: results.filter((r) => r.action === "unchanged").length,
    voiceViolation: results.filter((r) => r.action === "voice-violation").length,
    skipped,
  };

  return NextResponse.json({
    ok: true,
    dryRun,
    summary,
    samples: results
      .filter((r) => r.action === "rewrote")
      .slice(0, 10),
  });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    info: "POST with optional { ids: string[], dryRun: boolean } — re-runs composeColdEmail to pick up tone-mixer changes (e.g. new branch+city opener)",
  });
}
