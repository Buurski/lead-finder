import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { applyNoThanks, createFollowUpDrafts } from "@/lib/hq/sequence";
import { loadDigest } from "@/lib/inbox-digest";
import { copenhagenNow } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// Dagligt: (1) "nej tak"-svar fra indbakke-digesten stopper deres sekvens,
// (2) modne opfølgninger lægges i godkendelseskøen. Sender ALDRIG.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || (req.headers.get("authorization") || "") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: true, skipped: "DATA_BACKEND er ikke pg" });
  try {
    const digest = await loadDigest();
    const noThanks = digest ? await applyNoThanks(digest.items) : 0;
    const followUps = await createFollowUpDrafts(getDb(), copenhagenNow().date);
    return NextResponse.json({ ok: true, noThanks, ...followUps });
  } catch (err) {
    console.error(JSON.stringify({ evt: "followups.failed", error: String(err).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "opfølgninger fejlede" }, { status: 500 });
  }
}
