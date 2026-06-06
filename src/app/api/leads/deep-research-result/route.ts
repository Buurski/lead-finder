// /api/leads/deep-research-result — POST a ResearchResult from a Cowork session.
//
// Auth: Bearer DEEP_RESEARCH_SECRET (if set in env). When not set, accepts
// anything — that's only OK for local dev. Production MUST set the secret.
//
// Body: ResearchResult (see deep-research-queue.ts)
//
// Side-effects:
//   1. Save result to store under deep-research/result/{leadId}
//   2. Mark queue entry as complete (or failed if .notes contains "Failed:")
//   3. Optionally: write a small slice back to Sheets so the lead-row shows
//      pitch-angle + composite-delta inline.
//
// Returns: { ok: true, leadId, queueSummary }

import { NextRequest, NextResponse } from "next/server";
import { saveResult, updateStatus, summary } from "@/lib/deep-research-queue";
import type { ResearchResult } from "@/lib/deep-research-queue";
import { getLeads, saveEnrichedInfo } from "@/lib/sheets";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// The engine-consumable slice of a Cowork research result. Persisted into the
// lead row's enrichedInfo (column M) under a `deepResearch` key so engine.ts can
// feed it into compositeScore on the next PICK — this is what makes Cowork work
// actually improve the picks/drafts instead of vanishing into the store.
interface DeepResearchSlice {
  compositeScoreDelta?: number;
  pitchAngle?: string;
  madeByBureau?: string | null;
  emailQualityTier?: ResearchResult["emailQualityTier"];
  reviewVelocity90d?: number;
  lighthouseScoreMobile?: number;
  recommendedDemos?: ResearchResult["recommendedDemos"];
  achievementsFound?: string[];
  generatedAt: string;
  generatedBy: string;
}

// Merge the deep-research slice into the lead row's enrichedInfo JSON without
// clobbering anything already there. Best-effort: a Sheets failure must NOT fail
// the POST (the result is already saved to the store). leadId is the sheet row
// number (getLeads sets id = String(rowIndex + 2)).
async function writeSliceToSheets(result: ResearchResult): Promise<void> {
  const row = parseInt(result.leadId, 10);
  if (!Number.isFinite(row) || row < 2) return; // not a sheet-row id → skip
  const leads = await getLeads();
  const lead = leads.find((l) => l.id === result.leadId);
  if (!lead) return;

  let existing: Record<string, unknown> = {};
  try {
    const parsed = lead.enrichedInfo ? JSON.parse(lead.enrichedInfo) : {};
    if (parsed && typeof parsed === "object") existing = parsed as Record<string, unknown>;
  } catch {
    /* enrichedInfo wasn't JSON — start fresh but keep nothing to lose */
  }

  const slice: DeepResearchSlice = {
    compositeScoreDelta: result.compositeScoreDelta,
    pitchAngle: result.pitchAngle,
    madeByBureau: result.madeByBureau ?? null,
    emailQualityTier: result.emailQualityTier,
    reviewVelocity90d: result.reviewVelocity90d,
    lighthouseScoreMobile: result.lighthouseScoreMobile,
    recommendedDemos: result.recommendedDemos,
    achievementsFound: result.achievementsFound,
    generatedAt: result.generatedAt,
    generatedBy: result.generatedBy,
  };

  existing.deepResearch = slice;
  await saveEnrichedInfo(row - 2, JSON.stringify(existing));
}

// Edge-safe constant-time compare (matches proxy.ts pattern).
function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function checkAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const expected = process.env.DEEP_RESEARCH_SECRET;
  if (!expected) {
    // Allow during local dev when no secret is configured. Loud warn so prod
    // misconfig is visible in logs.
    console.warn(JSON.stringify({ evt: "deep-research-result.auth.no_secret_configured" }));
    return { ok: true };
  }
  const got = req.headers.get("authorization") || "";
  const m = got.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, reason: "missing_bearer" };
  return ctEqual(m[1], expected) ? { ok: true } : { ok: false, reason: "bad_secret" };
}

function isValid(r: unknown): r is ResearchResult {
  if (!r || typeof r !== "object") return false;
  const x = r as Record<string, unknown>;
  return typeof x.leadId === "string" && x.leadId.length > 0;
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) {
    return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!isValid(body)) {
    return NextResponse.json({ error: "invalid_body", message: "leadId is required" }, { status: 400 });
  }

  const result = body as ResearchResult;
  if (!result.generatedAt) result.generatedAt = new Date().toISOString();
  if (!result.generatedBy) result.generatedBy = "unknown";

  await saveResult(result);

  // Mark as complete unless notes signal failure.
  const failed = (result.notes || "").toLowerCase().startsWith("failed:");
  await updateStatus(
    result.leadId,
    failed ? "failed" : "complete",
    failed ? result.notes : undefined,
  );

  // Wire the enrichment back into the lead row so the engine actually uses it.
  // Only for successful results — a failure has no signal worth feeding PICK.
  // Best-effort: never let a Sheets hiccup fail an already-saved result.
  if (!failed) {
    try {
      await writeSliceToSheets(result);
    } catch (err) {
      console.warn(JSON.stringify({ evt: "deep-research-result.sheets_writeback_failed", leadId: result.leadId, err: String(err).slice(0, 120) }));
    }
  }

  const sum = await summary();
  return NextResponse.json({ ok: true, leadId: result.leadId, queueSummary: sum });
}
