import { NextRequest, NextResponse } from "next/server";
import { appendLeads, getLeadNames } from "@/lib/sheets";
import { detectWebsiteStatus } from "@/lib/apify";
import { normalizeIngest, dedupeByName, saveRun, loadRun } from "@/lib/leadgen";
import type { IngestLead, LeadgenRun } from "@/lib/leadgen";
import { readVaultJson } from "@/lib/vault";

// /api/leads/ingest — the lead-gen artifact endpoint.
//   POST { leads: IngestLead[], source? }  append fresh leads to Sheets + save run.
//   GET                                     read the last run (for the /leadgen feed).
//
// Auth: Bearer LEADGEN_INGEST_SECRET (falls back to DEEP_RESEARCH_SECRET). When
// neither is set, POST is allowed (local dev only). The daily Cowork "daily ops"
// task posts the best ~30-40 deep-rated leads here; the in-app "kør nu" Places
// scrape uses the same pipe. Never sends mail — only fills the lead list.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function checkAuth(req: NextRequest): boolean {
  const expected = process.env.LEADGEN_INGEST_SECRET || process.env.DEEP_RESEARCH_SECRET;
  if (!expected) {
    console.warn(JSON.stringify({ evt: "leads-ingest.auth.no_secret_configured" }));
    return true;
  }
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return Boolean(m && ctEqual(m[1], expected));
}

export async function GET() {
  // Obsidian channel: prefer a fresher data/leadgen.json from the vault if a Cowork
  // task pushed one; else the KV run from the last in-app ingest.
  const [kv, vault] = await Promise.all([
    loadRun(),
    readVaultJson<LeadgenRun>("data/leadgen.json").catch(() => null),
  ]);
  const valid = (r: LeadgenRun | null): number | null => {
    const t = r?.at ? Date.parse(r.at) : NaN;
    return Number.isFinite(t) ? t : null;
  };
  const vt = valid(vault);
  const kt = valid(kv);
  // Prefer the vault run only when it has items AND is genuinely newer (or KV has
  // no valid run). GET doesn't persist, so this only chooses what to display.
  const useVault = vault && Array.isArray(vault.items) && vault.items.length > 0 && (kt == null || (vt != null && vt >= kt));
  return NextResponse.json({ ok: true, run: useVault ? vault : kv });
}

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: { leads?: unknown; source?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const leads: IngestLead[] = normalizeIngest(body.leads);
  if (leads.length === 0) return NextResponse.json({ error: "no valid leads" }, { status: 400 });

  // Dedupe against existing sheet names. Sheets failure → don't lose the run.
  let existingLower = new Set<string>();
  try {
    existingLower = new Set((await getLeadNames()).map((n) => n.toLowerCase().trim()));
  } catch (err) {
    return NextResponse.json({ ok: false, error: `sheets: ${String(err)}` }, { status: 200 });
  }
  const { fresh, skipped } = dedupeByName(leads, existingLower);

  const now = new Date().toISOString();
  if (fresh.length > 0) {
    await appendLeads(
      fresh.map((l) => ({
        name: l.name,
        branch: l.branch ?? "",
        phone: l.phone ?? "",
        city: l.city ?? "",
        score: l.fitScore ?? 0,
        source: l.source ?? body.source ?? "leadgen",
        website: l.website ?? "",
        websiteStatus: detectWebsiteStatus(l.website || null),
        status: "new",
        notes: l.gap ?? "",
        lastUpdated: now,
        websiteQualityTier: "",
        // Stash the deep-rating signals so compositeScore/engine + the feed reuse them.
        enrichedInfo: JSON.stringify({ leadgen: { gap: l.gap ?? "", fitScore: l.fitScore ?? 0, rating: l.rating ?? 0, source: l.source ?? "leadgen" } }),
        email: "",
        emailSentAt: "", emailOpenedAt: "", emailClickedAt: "", emailStatus: "",
        followupSentAt: "", reviewsCount: l.reviewsCount ?? 0, callbackDate: "",
      })),
    );
  }

  const run: LeadgenRun = {
    at: now,
    source: body.source ?? leads[0]?.source ?? "leadgen",
    ingested: fresh.length,
    skipped: skipped.length,
    items: [...fresh]
      .sort((a, b) => (b.fitScore ?? 0) - (a.fitScore ?? 0))
      .slice(0, 50)
      .map((l) => ({
        name: l.name, branch: l.branch ?? "", city: l.city ?? "",
        fitScore: l.fitScore ?? 0, gap: l.gap ?? "", website: l.website ?? "",
        rating: l.rating ?? 0, reviews: l.reviewsCount ?? 0,
      })),
  };
  await saveRun(run);

  return NextResponse.json({ ok: true, ingested: fresh.length, skipped: skipped.length, run });
}
