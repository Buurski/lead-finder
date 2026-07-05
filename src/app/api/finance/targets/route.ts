import { NextResponse } from "next/server";
import { getTargets, upsertTarget, type Target } from "@/lib/sheets";

// GET  → all quarter targets ({ targets: Target[] }).
// POST { quarter, target_new_clients, ... } → upsert one quarter's row in the
// Targets tab (created on first save). Same Sheets write path as the rest of the
// app — no vault file, no parallel store.
export const dynamic = "force-dynamic";

const QUARTER_RE = /^\d{4}-Q[1-4]$/;
const NUM_KEYS: (keyof Target)[] = [
  "target_new_clients", "target_setup_revenue", "target_mrr_added",
  "weekly_outreach_floor", "annual_mrr_goal",
];

export async function GET() {
  try {
    return NextResponse.json({ targets: await getTargets() });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to read targets" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const quarter = String(body.quarter ?? "").trim();
    if (!QUARTER_RE.test(quarter)) {
      return NextResponse.json({ error: "bad_quarter", message: "quarter must look like 2026-Q3" }, { status: 400 });
    }

    // Merge onto the existing row so a partial edit (one field) keeps the rest.
    const existing = (await getTargets()).find((t) => t.quarter === quarter);
    const target: Target = {
      quarter,
      target_new_clients: existing?.target_new_clients ?? 0,
      target_setup_revenue: existing?.target_setup_revenue ?? 0,
      target_mrr_added: existing?.target_mrr_added ?? 0,
      weekly_outreach_floor: existing?.weekly_outreach_floor ?? 0,
      annual_mrr_goal: existing?.annual_mrr_goal ?? 0,
    };
    for (const k of NUM_KEYS) {
      if (body[k] !== undefined) {
        const n = Number(body[k]);
        if (!Number.isFinite(n) || n < 0) {
          return NextResponse.json({ error: "bad_value", message: `${k} must be a non-negative number` }, { status: 400 });
        }
        (target[k] as number) = Math.round(n);
      }
    }

    await upsertTarget(target);
    return NextResponse.json({ ok: true, target });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to save target" }, { status: 500 });
  }
}
