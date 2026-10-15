import { NextResponse } from "next/server";
import { syncReplies, syncSentFolders } from "@/lib/sync-replies";
import { captureReplies } from "@/lib/capture-replies";
import { safeError } from "@/lib/hq/lead-replies";
import { withCronLog } from "@/lib/cron-log";

// GET /api/cron/sync-replies — the automatic reply-sync hook for Vercel Cron.
export const dynamic = "force-dynamic";
// 120→300 (council-fund 2026-07-18): svar-scan + sendt-scan = op til 4 IMAP-
// forbindelser sekventielt; 120s kunne hard-killes midt i løbet.
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 }); // fail-closed (2026-08-19)
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }
  try {
    const { synced, checked, names, sent } = await withCronLog("sync-replies", async () => {
      const r = await syncReplies();
      // Sendt-mappe-scan (2026-07-18): fang manuelle mails sendt uden om
      // systemet så dedup-gate + kø-badge kender dem. Best-effort — en fejl
      // her må aldrig vælte svar-synken.
      let sent: Awaited<ReturnType<typeof syncSentFolders>> | null = null;
      try { sent = await syncSentFolders(); } catch (err) { console.warn("[sync-replies] sent-scan fejlede:", err); }
      // Svar-uddrag til HQ's "Har svaret" (spec 2026-10-15). Slået fra indtil REPLY_CAPTURE=1 og migration 0017
      // er kørt i prod. Best-effort som sendt-scanningen; 14 dages vindue dækker et par udeblevne kørsler.
      let captured: Awaited<ReturnType<typeof captureReplies>> | null = null;
      if (process.env.REPLY_CAPTURE === "1") {
        try { captured = await captureReplies({ since: new Date(Date.now() - 14 * 86_400_000) }); } catch (err) { console.warn("[sync-replies] svar-indsamling fejlede:", safeError(err)); }
      }
      return {
        result: { ...r, sent, captured },
        note: `tjekket ${r.checked} · ${r.synced} nye svar · ${sent?.stamped ?? "?"} manuelle kontakter stemplet${captured ? ` · ${captured.inserted} svar-uddrag gemt` : ""}`,
        meta: { synced: r.synced, checked: r.checked, sentStamped: sent?.stamped ?? -1, captured: captured?.inserted ?? -1 },
      };
    });
    return NextResponse.json({ ok: true, synced, checked, names, sent, note: "svar + sendt-mapper synket — ingen mail sendt" });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
