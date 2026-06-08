import { NextRequest, NextResponse } from "next/server";
import { appendLeads, getLeadNames, getLeads } from "@/lib/sheets";
import type { Lead } from "@/lib/sheets";
import { detectWebsiteStatus } from "@/lib/apify";
import { normalizeIngest, dedupeByName, saveRun, loadRun } from "@/lib/leadgen";
import type { IngestLead, LeadgenRun, LeadgenItem } from "@/lib/leadgen";
import { readVaultJson } from "@/lib/vault";
import { isContactable } from "@/lib/leads/contactable";
import { isUnworkedStatus } from "@/lib/leads/pick-filter";
import { leadChannel } from "@/lib/leads/channel";
import { placesBudget } from "@/lib/places-budget";

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

// A Sheets lead → the feed item shape. fitScore = the stored composite score; gap +
// rating come from the deep-research slice (enrichedInfo.leadgen) when present.
function leadToItem(l: Lead): LeadgenItem {
  let gap = "";
  let rating = 0;
  try {
    const e = l.enrichedInfo ? (JSON.parse(l.enrichedInfo) as { leadgen?: { gap?: unknown; rating?: unknown } }) : null;
    if (e?.leadgen) {
      gap = e.leadgen.gap ? String(e.leadgen.gap) : "";
      rating = Number(e.leadgen.rating) || 0;
    }
  } catch { /* enrichedInfo isn't valid JSON — leave defaults */ }
  return {
    name: l.name,
    branch: l.branch || "",
    city: l.city || "",
    fitScore: Math.round(l.score || 0),
    gap,
    website: l.website || "",
    rating,
    reviews: l.reviewsCount || 0,
    channel: leadChannel(l),
  };
}

export async function GET() {
  // The feed's TRUTH is Sheets — both the in-app scrape and the Cowork ingest append
  // there, so reading Sheets reflects every source immediately (no decoupled artifact
  // that can claim "2300 nye" while showing nothing). The run artifact (KV or vault,
  // fresher-of) is kept only as "last fetch" metadata for the sublabel.
  const [kv, vault, leads, budget] = await Promise.all([
    loadRun(),
    readVaultJson<LeadgenRun>("data/leadgen.json").catch(() => null),
    getLeads().catch(() => null),
    placesBudget().catch(() => null),
  ]);
  const valid = (r: LeadgenRun | null): number | null => {
    const t = r?.at ? Date.parse(r.at) : NaN;
    return Number.isFinite(t) ? t : null;
  };
  const vt = valid(vault);
  const kt = valid(kv);
  // Pick the genuinely-newer run for the "last fetch" metadata only.
  const useVault = vault && (kt == null || (vt != null && vt >= kt));
  const lastRun = (useVault ? vault : kv) ?? null;

  // Feed = top contactable, un-worked leads from Sheets, ranked by composite score.
  // isContactable enforces the never-contact-twice rule directly (no name-set needed).
  let feed: LeadgenItem[] = [];
  let totalContactable = 0;
  if (leads) {
    const contactable = leads
      .filter((l) => l.name && isUnworkedStatus(l.status) && isContactable(l))
      .sort((a, b) => (b.score || 0) - (a.score || 0));
    totalContactable = contactable.length;
    feed = contactable.slice(0, 40).map(leadToItem);
  }

  return NextResponse.json({
    ok: true,
    leads: feed,
    count: feed.length,
    totalContactable,
    placesBudget: budget,
    lastRun: lastRun ? { at: lastRun.at, source: lastRun.source, ingested: lastRun.ingested, skipped: lastRun.skipped } : null,
    // Back-compat: keep a `run`-shaped object so any old caller still parses.
    run: lastRun ? { ...lastRun, items: feed } : (feed.length ? { at: "", source: "sheets", ingested: 0, skipped: 0, items: feed } : null),
  });
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
