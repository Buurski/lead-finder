import { NextResponse } from "next/server";
import { appendDrafts, newDraftId, readQueue } from "@/lib/queue";
import type { QueueDraft } from "@/lib/queue";
import { composeColdEmail } from "@/lib/compose";
import type { ComposeLead } from "@/lib/compose";
import { getLeads } from "@/lib/sheets";

// GET /api/cron/ingest-leadgen — pulls the raw lead-gen candidates produced by the
// Cowork/sandbox lead-gen run (KnowledgeOS:data/leadgen.json) and turns them into
// PENDING drafts in the /approve queue. The sandbox can't reach Sheets or compose
// drafts itself (no service-account key, no Anthropic), so it only writes raw
// candidates — this route is the bridge that drafts them and fills the queue.
//
// NEVER sends mail. Two dedup gates before drafting:
//   1. pending drafts already in the queue (by leadId) — also enforced by appendDrafts.
//   2. leads already CONTACTED in Sheets (status ≠ "new", or an email was sent) — by name.
// Then composeColdEmail() renders subject+body once (throws on a voice violation →
// that candidate is skipped, never queued).
//
// Auth: Bearer CRON_SECRET (Vercel Cron injects it automatically). With no secret
// set the route is open (local dev only).
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REPO = "Buurski/KnowledgeOS";
const BRANCH = process.env.VAULT_BRANCH || "master";
const LEADGEN_PATH = "data/leadgen.json";
const TTL_MS = 5 * 60 * 1000;

interface LeadgenItem {
  name?: string;
  branch?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string | null;
  website?: string;
  rating?: number;
  reviews?: number;
  fitScore?: number;
  gap?: string;
  place_id?: string;
  site_issues?: string[];
}
interface LeadgenFile {
  at?: string;
  items?: LeadgenItem[];
}

// 5-min in-memory cache so repeat triggers (or a cron retry) don't re-hit GitHub.
let cache: { at: number; data: LeadgenFile } | null = null;

// Read leadgen.json from the PRIVATE KnowledgeOS repo. Mirrors vault.ts: with a
// token, raw.githubusercontent.com 404s on private repos, so use the contents API
// with the raw media type; fall back to the raw host for the public/no-token case.
async function fetchLeadgen(now: number): Promise<LeadgenFile> {
  if (cache && now - cache.at < TTL_MS) return cache.data;

  const token = process.env.GITHUB_TOKEN || process.env.VAULT_GITHUB_TOKEN;
  let text: string | null = null;

  if (token) {
    try {
      const url = `https://api.github.com/repos/${REPO}/contents/${LEADGEN_PATH}?ref=${BRANCH}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, "User-Agent": "command-center", Accept: "application/vnd.github.raw" },
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) text = await res.text();
    } catch {
      /* fall through to raw host */
    }
  }
  if (text === null) {
    try {
      const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${LEADGEN_PATH}`;
      const res = await fetch(url, { headers: { "User-Agent": "command-center" }, signal: AbortSignal.timeout(8000) });
      if (res.ok) text = await res.text();
    } catch {
      /* leave null → throw below */
    }
  }
  if (text === null) throw new Error("leadgen.json utilgængelig (token mangler eller GitHub-fejl)");

  const data = JSON.parse(text) as LeadgenFile;
  cache = { at: now, data };
  return data;
}

function norm(s: string): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Map the sandbox's site_issues/website into the tone-mixer's websiteStatus enum.
function websiteStatusFor(it: LeadgenItem): string {
  if (!it.website) return "none";
  const issues = (it.site_issues || []).join(" ").toLowerCase();
  if (/unreachable|not-?responsive|dead|timeout|down/.test(issues)) return "dead";
  return "old";
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const now = Date.now();

  let file: LeadgenFile;
  try {
    file = await fetchLeadgen(now);
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err) }, { status: 502 });
  }
  const items = Array.isArray(file.items) ? file.items : [];

  // Gate 1: leadIds already PENDING in the queue (appendDrafts also enforces this,
  // but skipping here keeps the counters honest + avoids needless composes).
  const queue = await readQueue();
  const pendingLeadIds = new Set<string>();
  for (const d of queue) {
    if (d.status === "pending" && d.leadId) pendingLeadIds.add(d.leadId);
  }

  // Gate 2: names already CONTACTED in Sheets. Sandbox couldn't dedup against the
  // ~5000 Sheets rows, so we do it here. "Contacted" = status moved off "new", or
  // an email was sent / a reply tracked. Best-effort: no Sheets creds ⇒ skip gate.
  const contactedNames = new Set<string>();
  let sheetsOk = true;
  try {
    const leads = await getLeads();
    for (const l of leads) {
      const contacted = l.status !== "new" || Boolean(l.emailSentAt) || Boolean(l.emailStatus);
      if (contacted && l.name) contactedNames.add(norm(l.name));
    }
  } catch (err) {
    sheetsOk = false;
    console.warn(JSON.stringify({ evt: "ingest-leadgen.sheets_unavailable", err: String(err) }));
  }

  const nowIso = new Date(now).toISOString();
  const drafts: QueueDraft[] = [];
  let skippedPending = 0;
  let skippedContacted = 0;
  let skippedVoice = 0;
  let skippedInvalid = 0;
  const seen = new Set<string>();

  for (const it of items) {
    const name = (it.name || "").trim();
    if (!name || !it.branch) {
      skippedInvalid++;
      continue;
    }
    const leadId = (it.place_id || name).toString();
    if (pendingLeadIds.has(leadId) || seen.has(leadId)) {
      skippedPending++;
      continue;
    }
    if (contactedNames.has(norm(name))) {
      skippedContacted++;
      continue;
    }

    const composeLead: ComposeLead = {
      name,
      branch: it.branch,
      city: it.city || "",
      reviewsCount: typeof it.reviews === "number" ? it.reviews : undefined,
      websiteStatus: websiteStatusFor(it),
      hooks: it.gap ? [it.gap] : [],
    };

    let composed;
    try {
      composed = composeColdEmail(composeLead);
    } catch (err) {
      skippedVoice++;
      console.warn(JSON.stringify({ evt: "ingest-leadgen.voice_skip", name, err: String(err) }));
      continue;
    }

    seen.add(leadId);
    drafts.push({
      id: newDraftId(),
      leadId,
      name,
      branch: it.branch,
      city: it.city || "",
      hooks: it.gap ? [it.gap] : [],
      demoPair: composed.demoPair,
      professionalism: `leadgen fitScore ${it.fitScore ?? "?"} — ${it.gap || ""}`.trim(),
      subject: composed.subject,
      body: composed.text,
      status: "pending",
      source: "leadgen-ingest",
      createdAt: nowIso,
      updatedAt: nowIso,
      comboId: composed.comboId,
      openerKind: composed.openerKind,
    });
  }

  if (drafts.length > 0) await appendDrafts(drafts, now);

  return NextResponse.json({
    ok: true,
    fetchedAt: file.at ?? null,
    candidates: items.length,
    added: drafts.length,
    skippedPending,
    skippedContacted,
    skippedVoice,
    skippedInvalid,
    sheetsDedup: sheetsOk,
    note: "kø fyldt — ingen mail sendt",
  });
}
