import { NextResponse } from "next/server";
import { getOpsStatus } from "@/lib/ops-status";

// GET /api/ops/status — the morgen-vitals heartbeat for Mission Control. Derives
// "did each daily task run?" from the 3 outputs' own artifacts. Read-only, never sends.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET() {
  try {
    const vitals = await getOpsStatus();
    return NextResponse.json({ ok: true, vitals });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err), vitals: [] }, { status: 200 });
  }
}
