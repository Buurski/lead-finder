import { NextResponse } from "next/server";
import { syncReplies } from "@/lib/sync-replies";

// POST /api/email/sync-replies — manual trigger from the dashboard
// (BulkEmailPanel). The actual scan logic lives in @/lib/sync-replies so the
// cron route shares identical behaviour. Nothing is sent; we only flip a lead's
// status to "replied" in the Sheet.
export const maxDuration = 60;

export async function POST() {
  try {
    const { synced, checked, names } = await syncReplies();
    return NextResponse.json({ synced, checked, names });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
