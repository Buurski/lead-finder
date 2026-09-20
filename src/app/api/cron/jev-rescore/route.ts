// GET /api/cron/jev-rescore — nightly shadow rescoring of leads with Jev.
// OBSERVES ONLY: writes to the jev-shadow/* store namespace, never to the
// Sheet, never to Lead.enrichedInfo, never sends/deletes/changes status.
// Skips quietly when TYPESAFE_API_KEY isn't set.

import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { withCronLog } from "@/lib/cron-log";
import { jevEnabled } from "@/lib/jev";
import { loadShadow, saveShadow, pickBatch, judgeLead, countUnjudged } from "@/lib/leads/jev-shadow";
import { readQueue } from "@/lib/queue";
import { loadDraftShadow, saveDraftShadow, judgeDraft } from "@/lib/leads/draft-judgments";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEFAULT_BATCH = 40;
const MAX_DRAFT_BATCH = 30;
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
    type Phase = { judged: number; errors: number; remaining: number };
    type RunResult = Phase & { drafts: Phase };
    const result = await withCronLog<RunResult>("jev-rescore", async () => {
      if (!jevEnabled()) {
        return {
          result: { judged: 0, errors: 0, remaining: 0, drafts: { judged: 0, errors: 0, remaining: 0 } },
          note: "TYPESAFE_API_KEY mangler",
          meta: {},
        };
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

      // Phase 2: pending outreach drafts (approve UI ranking). Same deadline
      // as phase 1 — a slow phase 1 simply leaves fewer drafts judged tonight,
      // never blows past maxDuration. OBSERVES ONLY, same as phase 1.
      const queue = await readQueue();
      const draftShadow = await loadDraftShadow();
      const draftJudgedAt = new Map(draftShadow.map((r) => [r.draftId, r.judgedAt]));
      const pendingDrafts = queue.filter((d) => d.status === "pending");
      const unjudgedDrafts = pendingDrafts.filter((d) => {
        const j = draftJudgedAt.get(d.id);
        return !j || j < d.updatedAt;
      });
      const draftBatch = unjudgedDrafts.slice(0, MAX_DRAFT_BATCH);

      let draftsJudged = 0;
      let draftsErrors = 0;
      let di = 0;
      async function draftWorker() {
        while (di < draftBatch.length && Date.now() < deadline) {
          const draft = draftBatch[di++];
          const rec = await judgeDraft(draft);
          await saveDraftShadow(rec);
          draftsJudged++;
          if (rec.error) draftsErrors++;
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, draftBatch.length) }, draftWorker));
      const draftsRemaining = Math.max(0, unjudgedDrafts.length - draftsJudged);

      return {
        result: {
          judged,
          errors,
          remaining,
          drafts: { judged: draftsJudged, errors: draftsErrors, remaining: draftsRemaining },
        },
        note: `${judged} leads vurderet (${errors} fejl), ${draftsJudged} kladder vurderet (${draftsErrors} fejl)`,
        meta: { judged, errors, draftsJudged, draftsErrors },
      };
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
