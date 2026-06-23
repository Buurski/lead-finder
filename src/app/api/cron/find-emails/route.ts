// Admin endpoint: LIVE email-discovery backfill over the existing /approve queue.
//
// Why this exists (2026-06-15): the daily lead-gen runs queued drafts WITHOUT a
// recipientEmail (the scrape never discovered one), so /api/approve/send skipped
// every one with "ingen modtager-email" — Lucas couldn't send anything. The
// passive backfill-emails route only copies emails that already exist in
// leadgen.json; it can't find a NEW one. This route actively discovers an email
// per draft (Sheets column N first, then live website/kontakt/CVR scrape via the
// canonical email-finder) and writes recipientEmail back so the draft becomes
// sendable. Found addresses are also saved to the lead's Sheets row (col N).
//
// Runs on Vercel where DNS/MX works (the Cowork sandbox blocks resolveMx, which
// is why discovery must happen here, not only in the daily run script).
//
// NEVER sends mail. Idempotent + resumable: each call processes up to ?limit
// no-email drafts; drafts that get an email drop out of the next call's set.
// Call repeatedly until remaining = 0.
//
// Auth: ?key=<ADMIN_KEY> or Bearer ADMIN_KEY. No key set ⇒ open (local dev).

import { NextResponse } from "next/server";
import { readQueue, updateDraft } from "@/lib/queue";
import type { QueueDraft } from "@/lib/queue";
import { getLeads, saveLeadEmail } from "@/lib/sheets";
import type { Lead } from "@/lib/sheets";
import { hasUsableEmail } from "@/lib/leads/channel";
import { isExcludedBranch } from "@/lib/leads/branch-policy";
import { findEmailForLead } from "@/lib/email-finder";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REPO = "Buurski/KnowledgeOS";
const BRANCH = process.env.VAULT_BRANCH || "master";
const LEADGEN_PATH = "data/leadgen.json";

const DEFAULT_LIMIT = 30; // no-email drafts processed per call (fits maxDuration with the pool)
const POOL = 5;           // concurrent website scrapes

// A leadgen draft's leadId is the Google place_id (place_id || name in the ingest
// route). A real place_id is a long token with no spaces; a name has spaces.
function looksLikePlaceId(leadId: string | undefined): boolean {
  return !!leadId && /^[A-Za-z0-9_-]{20,}$/.test(leadId);
}

// Resolve a lead's website from Google Places Details by place_id. This is the
// fallback when the lead is gone from Sheets (e.g. the no-email cleanup deleted
// it) and absent from the latest leadgen.json — exactly the case for older
// approved drafts. Returns "" on any failure.
async function placeWebsite(placeId: string): Promise<string> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return "";
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "websiteUri" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const j = (await res.json()) as { websiteUri?: string };
    return (j.websiteUri || "").trim();
  } catch {
    return "";
  }
}

interface LeadgenItem {
  name?: string;
  email?: string | null;
  website?: string;
  place_id?: string;
}

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function checkAuth(req: Request): boolean {
  const expected = process.env.ADMIN_KEY || "";
  const cronSecret = process.env.CRON_SECRET || "";
  const h = req.headers.get("authorization") || "";
  const bearer = h.startsWith("Bearer ") ? h.slice(7) : "";
  // Vercel Cron injects "Bearer CRON_SECRET" — accept it so this route can be a cron (2026-06-22).
  if (cronSecret && bearer === cronSecret) return true;
  if (!expected) return true;
  const url = new URL(req.url);
  if ((url.searchParams.get("key") || "") === expected) return true;
  return bearer === expected;
}

async function fetchLeadgenItems(): Promise<LeadgenItem[]> {
  const token = process.env.GITHUB_TOKEN || process.env.VAULT_GITHUB_TOKEN;
  try {
    if (token) {
      const url = `https://api.github.com/repos/${REPO}/contents/${LEADGEN_PATH}?ref=${BRANCH}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "command-center", Accept: "application/vnd.github.raw" },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const j = JSON.parse(await res.text()) as { items?: LeadgenItem[] };
        return Array.isArray(j.items) ? j.items : [];
      }
    }
    const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${LEADGEN_PATH}`;
    const res = await fetch(url, { headers: { "User-Agent": "command-center" }, signal: AbortSignal.timeout(10000) });
    if (res.ok) {
      const j = JSON.parse(await res.text()) as { items?: LeadgenItem[] };
      return Array.isArray(j.items) ? j.items : [];
    }
  } catch { /* leadgen.json is an optional secondary website source */ }
  return [];
}

// Run an async fn over items with bounded concurrency, preserving order.
async function pool<T, R>(items: T[], n: number, fn: (it: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(60, parseInt(url.searchParams.get("limit") || "", 10) || DEFAULT_LIMIT));
  const dryRun = url.searchParams.get("dry") === "1";

  const queue = await readQueue();

  // Sheets is the authoritative website + existing-email source (the daily run
  // appends every selected lead with its website). Best-effort: no creds ⇒ we
  // can still discover via leadgen.json websites for the latest batch.
  let leads: Lead[] = [];
  try {
    leads = await getLeads();
  } catch (err) {
    console.warn(JSON.stringify({ evt: "find-emails.sheets_unavailable", err: String(err) }));
  }
  const leadByName = new Map<string, Lead>();
  for (const l of leads) {
    const k = norm(l.name);
    if (k && !leadByName.has(k)) leadByName.set(k, l);
  }

  // Secondary website lookup from the latest leadgen.json (covers a freshly
  // scraped lead not yet visible in the Sheets read).
  const lgItems = await fetchLeadgenItems();
  const siteByName = new Map<string, string>();
  for (const it of lgItems) {
    if (it.name && it.website) siteByName.set(norm(it.name), it.website);
  }

  // Target drafts: any non-sent draft without a usable recipientEmail, not a
  // hard-excluded medical branch (those never send anyway).
  //
  // Status rules (2026-06-23 fix):
  //   - sent      → skip (already sent)
  //   - rejected  → STILL process if no usable email (cleanup-rejected leads
  //                 can have email found later; manually-rejected leads just
  //                 have email filled, send will skip them via status check)
  //   - approved / edited / pending / cleanup-rejected → process
  //
  // This means `rejected` is no longer a hard skip — only "sent" is. Send-route
  // already blocks status === "rejected" from sending, so this is safe.
  const targets = queue.filter(
    (d) =>
      d.status !== "sent" &&
      !hasUsableEmail(d.recipientEmail) &&
      !isExcludedBranch(d.branch, d.name),
  );

  const batch = targets.slice(0, limit);

  let fromSheets = 0;
  let fromWeb = 0;
  let noWebsite = 0;
  let notFound = 0;
  const patches: { name: string; email: string; via: string }[] = [];

  type Result = { draft: QueueDraft; email: string | null; via: string; rowIndex?: number };
  const results = await pool<QueueDraft, Result>(batch, POOL, async (d) => {
    const lead = leadByName.get(norm(d.name));

    // 1. Email already on the Sheets row — free, no network.
    if (lead && hasUsableEmail(lead.email)) {
      return { draft: d, email: lead.email.trim(), via: "sheets" };
    }

    // 2. Live discovery from the lead's website (homepage → /kontakt → CVR).
    // Website source order: Sheets → latest leadgen.json → Google Places (by
    // place_id) for leads no longer in Sheets (cleanup) or in the latest run.
    let website = (lead?.website || siteByName.get(norm(d.name)) || "").trim();
    if (!website && looksLikePlaceId(d.leadId)) {
      website = await placeWebsite(d.leadId as string);
    }
    if (!website) return { draft: d, email: null, via: "no-website" };

    const websiteStatus = lead?.websiteStatus || "ok";
    const found = await findEmailForLead({ name: d.name, website, websiteStatus }).catch(() => null);
    const rowIndex = lead ? parseInt(lead.id, 10) - 2 : undefined;
    return { draft: d, email: found, via: found ? "web" : "not-found", rowIndex };
  });

  for (const r of results) {
    if (!r.email) {
      if (r.via === "no-website") noWebsite++;
      else notFound++;
      continue;
    }
    if (r.via === "sheets") fromSheets++;
    else fromWeb++;
    patches.push({ name: r.draft.name, email: r.email, via: r.via });
    if (dryRun) continue;
    await updateDraft(r.draft.id, { recipientEmail: r.email });
    // Persist a freshly-discovered address to the Sheets row so the lead record
    // is complete (best-effort; only when we have a row and it was a web find).
    if (r.via === "web" && Number.isFinite(r.rowIndex) && (r.rowIndex as number) >= 0) {
      await saveLeadEmail(r.rowIndex as number, r.email).catch(() => {});
    }
  }

  const patched = fromSheets + fromWeb;
  return NextResponse.json({
    ok: true,
    dryRun,
    totalNoEmail: targets.length,
    processed: batch.length,
    patched,
    fromSheets,
    fromWeb,
    noWebsite,
    notFound,
    remaining: Math.max(0, targets.length - patched),
    patches: patches.slice(0, 30),
    note: dryRun ? "tørkørsel — intet skrevet" : "recipientEmail udfyldt — ingen mail sendt. Kald igen til remaining = 0.",
  });
}
