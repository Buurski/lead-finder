import { NextResponse } from "next/server";
import { computeTodaysQueue } from "@/lib/queue";
import {
  getPauseStatus,
  enqueueSend,
} from "@/lib/sheets";
import { buildLeadEmail, NoMatchingTemplateError } from "@/lib/email";

export const maxDuration = 300;

// 10:00 UTC daily — enqueues today's planned queue into the SendQueue tab.
// The actual Gmail dispatch happens in send.mjs (local), which polls
// SendQueue and sends with 4-14 min triangular spacing. This route does
// NOT call Gmail itself.
//
// Skips any lead that:
//   • is in a paused state (kill switch — master OR specific scope)
//   • has skipReason set (Lucas pressed skip in the review UI)
//   • is on the TreatAsAlive list AND the mail would claim broken website

export async function GET() {
  try {
    // Master kill — if A2 is set, do nothing at all.
    const masterPause = await getPauseStatus("all");
    if (masterPause.paused) {
      return NextResponse.json({
        paused: true,
        pausedUntil: masterPause.until,
        sentCold: 0,
        sentFollowups: 0,
        failed: 0,
        skippedByReview: 0,
      });
    }
    // Granular: read the cold + followup specific cells once up-front so the
    // loop doesn't hit Sheets on every iteration.
    const coldPause = await getPauseStatus("cold");
    const followupPause = await getPauseStatus("followup");

    const queue = await computeTodaysQueue();

    let sentCold = 0;
    let sentFollowups = 0;
    let failed = 0;
    let skippedByReview = 0;
    const failures: { id: string; name: string; error: string }[] = [];
    const skipped: { id: string; name: string; reason: string }[] = [];
    const seenEmails = new Set<string>();

    for (let i = 0; i < queue.entries.length; i++) {
      const entry = queue.entries[i];
      const { lead, rowIndex, kind, willClaimBroken, treatedAsAlive } = entry;

      // 1. Lucas marked skip in the review UI — drop.
      if (lead.skipReason) {
        skippedByReview++;
        skipped.push({ id: lead.id, name: lead.name, reason: `skipReason=${lead.skipReason}` });
        continue;
      }

      // 1b. Granular pause — cold and followup can be paused independently
      //     of the master kill. The scope-specific cells already fold in the
      //     master state, but we already filtered master above so these read
      //     only the specific cell.
      if (kind === "cold" && coldPause.paused) {
        skippedByReview++;
        skipped.push({ id: lead.id, name: lead.name, reason: "cold-pause active" });
        continue;
      }
      if (kind === "followup" && followupPause.paused) {
        skippedByReview++;
        skipped.push({ id: lead.id, name: lead.name, reason: "followup-pause active" });
        continue;
      }

      // 2. Domain is on the manual "this site IS alive" list AND the mail
      //    would claim it's broken. Drop — better to miss the lead than send
      //    another false-positive.
      if (treatedAsAlive && willClaimBroken) {
        skippedByReview++;
        skipped.push({ id: lead.id, name: lead.name, reason: "treat-as-alive + broken-claim" });
        continue;
      }

      // 3. De-dupe across the queue — same email address shouldn't get two
      //    sends in the same run. Match bulk-send behaviour.
      const emailKey = lead.email.toLowerCase();
      if (seenEmails.has(emailKey)) {
        skipped.push({ id: lead.id, name: lead.name, reason: "duplicate email in queue" });
        continue;
      }
      seenEmails.add(emailKey);

      // 4. Re-check pause every 5 iterations so a mid-run halt actually stops us.
      //    The Vercel function won't re-enter the top handler — so without this,
      //    once we start sending we can't be stopped until the loop drains.
      if (i > 0 && i % 5 === 0) {
        const recheck = await getPauseStatus("all");
        if (recheck.paused) {
          return NextResponse.json({
            paused: true,
            pausedUntil: recheck.until,
            haltedMidRun: true,
            sentCold,
            sentFollowups,
            failed,
            skippedByReview,
            summary: queue.summary,
            failures: failures.slice(0, 20),
            skipped: skipped.slice(0, 30),
          });
        }
      }

      try {
        const tpl = buildLeadEmail(lead, kind);
        await enqueueSend({
          leadId: lead.id,
          toEmail: lead.email,
          kind,
          subject: tpl.subject,
          body: tpl.text,
          htmlBody: tpl.html,
        });
        if (kind === "cold") sentCold++; else sentFollowups++;
      } catch (err) {
        failed++;
        failures.push({
          id: lead.id,
          name: lead.name,
          error: err instanceof Error ? err.message : (err instanceof NoMatchingTemplateError ? err.message : String(err)),
        });
      }
      // No inter-iteration sleep — enqueue is a fast Sheets append, not
      // Gmail. send.mjs enforces the actual sending pace.
    }

    return NextResponse.json({
      paused: false,
      sentCold,
      sentFollowups,
      failed,
      skippedByReview,
      summary: queue.summary,
      failures: failures.slice(0, 20),
      skipped: skipped.slice(0, 30),
    });
  } catch (err) {
    console.error("scheduled-send failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
