import { NextResponse } from "next/server";
import { getLeads, getPauseStatus, updateLeadSkipReason, logSkipReason, enqueueSend, updateLeadEmailStatus } from "@/lib/sheets";
import { buildLeadEmail, NoMatchingTemplateError } from "@/lib/email";
import { isEligibleForCold } from "@/lib/eligibility";

export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "0", 10);
  const leads = await getLeads();
  const eligible = leads
    .filter(isEligibleForCold)
    .sort((a, b) => b.score - a.score);
  const sliced = limit > 0 ? eligible.slice(0, limit) : eligible;
  return NextResponse.json({
    eligible: eligible.length,
    returning: sliced.length,
    leads: sliced.map((l) => ({
      id: l.id,
      name: l.name,
      score: l.score,
      branch: l.branch,
      city: l.city,
      email: l.email,
      websiteQualityTier: l.websiteQualityTier,
    })),
  });
}

export async function POST(req: Request) {
  // Phase 2 kill switch — if Lucas pressed "Stop alt i dag" the PauseSchedule
  // tab will have a future timestamp. Bail out before touching Gmail. Granular:
  // bulk-send is cold-mail only, so check the cold scope (which also folds in
  // the master kill).
  const pause = await getPauseStatus("cold");
  if (pause.paused) {
    return NextResponse.json({ paused: true, pausedUntil: pause.until, sent: 0, failed: 0 });
  }

  const url = new URL(req.url);
  const delayMs = Math.max(0, Math.min(180000, parseInt(url.searchParams.get("delayMs") || "500", 10)));
  const limit = Math.max(0, parseInt(url.searchParams.get("limit") || "0", 10));
  const jitterMs = Math.max(0, Math.min(120000, parseInt(url.searchParams.get("jitterMs") || "0", 10)));

  const leads = await getLeads();
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => isEligibleForCold(lead))
    .sort((a, b) => b.lead.score - a.lead.score);
  const targets = limit > 0 ? eligible.slice(0, limit) : eligible;

  const results: { name: string; email: string; ok: boolean; error?: string }[] = [];
  const seenEmails = new Set<string>();

  let processed = 0;
  for (const { lead, rowIndex } of targets) {
    // Re-check pause every 5 iterations so mid-run halt stops us.
    if (processed > 0 && processed % 5 === 0) {
      const recheck = await getPauseStatus("cold");
      if (recheck.paused) {
        return NextResponse.json({
          paused: true,
          pausedUntil: recheck.until,
          haltedMidRun: true,
          sent: results.filter(r=>r.ok).length, failed: results.filter(r=>!r.ok).length,
          results,
        });
      }
    }
    processed++;
    if (seenEmails.has(lead.email.toLowerCase())) {
      results.push({ name: lead.name, email: lead.email, ok: false, error: "duplicate email address" });
      continue;
    }
    seenEmails.add(lead.email.toLowerCase());
    try {
      // Spacing-guarantee: every Vercel send-path enqueues to SendQueue
      // instead of calling Gmail directly. send.mjs is the sole Gmail caller
      // and enforces the 4-14 min triangular spacing.
      const tpl = buildLeadEmail(lead, "cold");
      const id = await enqueueSend({
        leadId: lead.id,
        toEmail: lead.email,
        kind: "cold",
        subject: tpl.subject,
        body: tpl.text,
        htmlBody: tpl.html,
      });
      results.push({ name: lead.name, email: lead.email, ok: true, error: `enqueued:${id}` });
      const wait = delayMs + (jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    } catch (err) {
      if (err instanceof NoMatchingTemplateError) {
        try {
          await updateLeadSkipReason(rowIndex, "wrong_template");
          await logSkipReason(lead.id, "wrong_template", `no matching template for branch="${lead.branch}" name="${lead.name}"`);
        } catch {}
        results.push({ name: lead.name, email: lead.email, ok: false, error: "skipped: no matching template" });
        continue;
      }
      results.push({ name: lead.name, email: lead.email, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    remaining: Math.max(0, eligible.length - targets.length),
    results,
  });
}

// Mark specific lead IDs as sent (used to recover from partial Sheets quota failures)
export async function PATCH(req: Request) {
  const { ids } = await req.json() as { ids: string[] };
  const now = new Date().toISOString();
  const updates = await Promise.allSettled(
    ids.map(async (id) => {
      const rowIndex = Number(id) - 2;
      await updateLeadEmailStatus(rowIndex, { emailSentAt: now, emailStatus: "sent" });
      return id;
    })
  );
  const ok = updates.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ marked: ok, total: ids.length });
}
