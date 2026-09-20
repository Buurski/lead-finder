// GET /api/cron/jev-rescore — nightly shadow rescoring of leads with Jev.
// OBSERVES ONLY: writes to the jev-shadow/* store namespace, never to the
// Sheet, never to Lead.enrichedInfo, never sends/deletes/changes status.
// Skips quietly when TYPESAFE_API_KEY isn't set.

import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { withCronLog } from "@/lib/cron-log";
import { jevEnabled } from "@/lib/jev";
import { loadShadow, saveShadow, pickBatch, judgeLead, countUnjudged } from "@/lib/leads/jev-shadow";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_BATCH = 40;
// Hard ceiling regardless of ?limit / env (Codex JEV-005). One lead worst case is
// fetch 9 s + Jev 15 s = 24 s; with CONCURRENCY 5 and a 95 s wall-clock deadline
// the route always returns inside maxDuration (Codex JEV-003) — leftover leads
// are simply "remaining" and picked up next night (oldest-judged-first order).
const MAX_BATCH = 60;
const CONCURRENCY = 5;
const DEADLINE_MS = 95_000;

export function clampBatch(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH;
  return Math.min(MAX_BATCH, Math.floor(n));
}

export async function GET(req: Request): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  if (!secret && process.env.VERCEL) {
    return NextResponse.json({ ok: false, error: "CRON_SECRET mangler — nægter at køre uden auth" }, { status: 401 });
  }
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  try {
    type RunResult = { judged: number; errors: number; remaining: number };
    const result = await withCronLog<RunResult>("jev-rescore", async () => {
      if (!jevEnabled()) {
        return { result: { judged: 0, errors: 0, remaining: 0 }, note: "TYPESAFE_API_KEY mangler", meta: {} };
      }
      const url = new URL(req.url);
      const limitParam = url.searchParams.get("limit");
      const max = clampBatch(limitParam ?? process.env.JEV_RESCORE_BATCH);

      const leads = await getLeads();
      const existing = await loadShadow();
      const batch = pickBatch(leads, existing, max);

      const deadline = Date.now() + DEADLINE_MS;
      let judged = 0;
      let errors = 0;
      let i = 0;
      async function worker() {
        while (i < batch.length && Date.now() < deadline) {
          const lead = batch[i++];
          const rec = await judgeLead(lead);
          await saveShadow(rec);
          judged++;
          if (rec.error) errors++;
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

      // Never-judged leads left after this run (re-judging old records is a bonus, not backlog).
      const remaining = Math.max(0, countUnjudged(leads, existing) - judged);
      return {
        result: { judged, errors, remaining },
        note: `${judged} leads vurderet (${errors} fejl)`,
        meta: { judged, errors },
      };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
