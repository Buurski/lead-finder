import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { bridgeKvCrm, loadKvCrm } from "@/lib/pg/kv-bridge";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Timelig bro: CRM-poster Hermes (crm-mail-sync) stadig skriver i KV → Postgres.
// Fail-closed på CRON_SECRET som de andre crons.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  try {
    const added = await bridgeKvCrm(getDb(), await loadKvCrm());
    // Genkobl henvendelser fra de sidste 30 dage: en fejl ved modtagelsen må aldrig
    // efterlade en kinly.dk-henvendelse uden for CRM'et (Sol 23/9). Idempotent.
    const { readPreviewRequests } = await import("@/lib/preview-queue");
    const { linkPreview } = await import("@/lib/hq/inbound");
    const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
    let relinked = 0;
    for (const r of await readPreviewRequests()) {
      if (r.createdAt < since) continue;
      try { await linkPreview(getDb(), r); relinked++; } catch (e) {
        console.error(JSON.stringify({ evt: "inbound.relink.failed", id: r.id, error: String(e).slice(0, 200) }));
      }
    }
    return NextResponse.json({ ok: true, added, relinked });
  } catch (err) {
    console.error(JSON.stringify({ evt: "kv-crm-bridge.failed", error: String(err).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "bro fejlede" }, { status: 500 });
  }
}
