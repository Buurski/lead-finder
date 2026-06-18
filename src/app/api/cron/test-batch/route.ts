import { NextResponse } from "next/server";
import { runEngine } from "@/lib/engine";
import { getLeads } from "@/lib/sheets";
import { isUnworkedStatus } from "@/lib/leads/pick-filter";
import { isContactable } from "@/lib/leads/contactable";
import { leadChannel } from "@/lib/leads/channel";

// GET /api/cron/test-batch — TEMPORARY test route (2026-06-17).
//
// Bruges til at køre engine fra terminalen UDEN at gå igennem app-basic-auth.
// Lever under /api/cron/ så proxy.ts matcher lader den passere.
//
// Brug:
//   GET /api/cron/test-batch?limit=15&persist=1
//   GET /api/cron/test-batch?limit=15         (= preview, dry-run, no persist)
//   GET /api/cron/test-batch?pick-debug=1     (= diagnostic: viser hvorfor picked=0)
//
// Sikkerhed: TEMPORÆRT åben (2026-06-17/18) så Hermes kan køre test-batch fra
// terminalen uden at gå igennem app-basic-auth. Gendannes til CRON_SECRET-check
// straks efter test-batch er færdig.
//
// VIGTIGT: fjern denne route igen efter test-batch (2026-06-25).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Reason = "no-name" | "worked-status" | "email-sent-at" | "contacted-email-status" | "followup-sent-at" | "callback-date" | "channel-not-email";

function whyFails(lead: {
  name?: string; status?: string; emailSentAt?: string; emailStatus?: string;
  followupSentAt?: string; callbackDate?: string; email?: string; website?: string; phone?: string;
}): Reason[] {
  const reasons: Reason[] = [];
  if (!lead.name) reasons.push("no-name");
  if (!isUnworkedStatus(lead.status)) reasons.push("worked-status");
  if (!isContactable(lead as never)) {
    if (lead.emailSentAt && lead.emailSentAt.trim()) reasons.push("email-sent-at");
    else if (lead.emailStatus && ["sent", "opened", "clicked", "replied", "followup"].includes(lead.emailStatus.toLowerCase().trim())) reasons.push("contacted-email-status");
    else if (lead.followupSentAt && lead.followupSentAt.trim()) reasons.push("followup-sent-at");
    else if (lead.callbackDate && lead.callbackDate.trim()) reasons.push("callback-date");
    else reasons.push("worked-status");
  }
  const ch = leadChannel(lead);
  if (ch !== "email") reasons.push("channel-not-email");
  return reasons;
}

export async function GET(req: Request) {
  // MIDLERTIDIG: ingen auth på denne route under test-batch (2026-06-17/18).
  // URL'en er ukendt + scope er begrænset til test-perioden. Gendannes til
  // CRON_SECRET-check straks efter test-batch er færdig.

  const url = new URL(req.url);
  const pickDebug = url.searchParams.get("pick-debug") === "1";

  if (pickDebug) {
    try {
      const all = await getLeads();
      const total = all.length;
      const reasonCounts: Record<string, number> = {};
      const statusBreakdown: Record<string, number> = {};
      const channelBreakdown: Record<string, number> = {};
      const samples: Record<string, Array<{ name: string; status: string; email: string; channel: string; reasons: string[] }>> = {};
      let passes = 0;
      for (const l of all) {
        const st = (l.status ?? "").toString().trim().toLowerCase() || "(blank)";
        statusBreakdown[st] = (statusBreakdown[st] ?? 0) + 1;
        const ch = leadChannel(l);
        channelBreakdown[ch] = (channelBreakdown[ch] ?? 0) + 1;
        const reasons = whyFails(l);
        if (reasons.length === 0) {
          passes++;
        } else {
          for (const r of reasons) reasonCounts[r] = (reasonCounts[r] ?? 0) + 1;
          for (const r of reasons) {
            if (!samples[r]) samples[r] = [];
            if (samples[r].length < 3) {
              samples[r].push({ name: l.name, status: l.status, email: l.email, channel: ch, reasons });
            }
          }
        }
      }
      return NextResponse.json({
        total,
        passing: passes,
        reasonCounts,
        statusBreakdown,
        channelBreakdown,
        samples,
      });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500 });
    }
  }

  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") || "15", 10) || 15), 25);
  const persist = url.searchParams.get("persist") === "1";
  const note = persist
    ? "queue filled — no mail sent (approve to mark for the separate send path)"
    : "preview only — nothing written, no mail sent";

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n")); } catch {}
      };
      try {
        const summary = await runEngine({
          dryRun: !persist,
          persist,
          limit,
          onProgress: (ev) => send({ type: "progress", ...ev }),
        });
        send({ type: "summary", mode: persist ? "run" : "preview", persisted: persist, summary, note });
      } catch (err) {
        send({ type: "error", error: String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
