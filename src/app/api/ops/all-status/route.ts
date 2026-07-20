import { NextResponse } from "next/server";
import { getAllStatus } from "@/lib/all-status";

// GET /api/ops/all-status — Bundle K DEL 1. Aggregates task state across the
// three platforms Lucas's automations run on (Vercel crons, Cowork Scheduled
// Tasks, Hermes VPS). Grundlag for watchdogs + Mission Control UI. Read-only,
// never sends anything itself. CRON_SECRET-gated like the other /api/cron/* +
// /api/ops/* routes.
export const dynamic = "force-dynamic";
export const maxDuration = 20;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    const status = await getAllStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}
