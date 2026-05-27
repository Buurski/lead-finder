import { NextResponse } from "next/server";
import { computeTodaysQueue } from "@/lib/queue";
import {
  getPauseStatus,
  updateLeadEmailStatus,
  updateLeadStatus,
} from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";

export const maxDuration = 300;

// 10:00 UTC daily — actually sends the queue prepared by morning-review.
// Skips any lead that:
//   • is in a paused state (kill switch)
//   • has skipReason set (Lucas pressed skip in the review UI)
//   • is on the TreatAsAlive list AND the mail would claim broken website
//
// Sleeps 8-15s between sends to avoid Gmail flagging us for blasting.

const MIN_DELAY_MS = 8000;
const MAX_DELAY_MS = 15000;

function jitteredDelay(): number {
  return MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
}

export async function GET() {
  try {
    const pause = await getPauseStatus();
    if (pause.paused) {
      return NextResponse.json({
        paused: true,
        pausedUntil: pause.until,
        sentCold: 0,
        sentFollowups: 0,
        failed: 0,
        skippedByReview: 0,
      });
    }

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
        const recheck = await getPauseStatus();
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
        await sendLeadEmail(lead, kind);
        const now = new Date().toISOString();
        if (kind === "cold") {
          await updateLeadEmailStatus(rowIndex, { emailSentAt: now, emailStatus: "sent" });
          if (lead.status === "new") await updateLeadStatus(rowIndex, "called");
          sentCold++;
        } else {
          await updateLeadEmailStatus(rowIndex, { followupSentAt: now });
          if (lead.status === "new") await updateLeadStatus(rowIndex, "called");
          sentFollowups++;
        }
      } catch (err) {
        failed++;
        failures.push({
          id: lead.id,
          name: lead.name,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Pace ourselves — Gmail will throttle / spam-flag us if we blast 75
      // identical-template mails in 30 seconds. Skip the wait after the last
      // entry to free the Vercel function early.
      if (i < queue.entries.length - 1) {
        await new Promise((r) => setTimeout(r, jitteredDelay()));
      }
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
