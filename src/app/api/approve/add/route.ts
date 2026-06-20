import { NextRequest, NextResponse } from "next/server";
import { appendDrafts, newDraftId, readQueue } from "@/lib/queue";
import type { QueueDraft } from "@/lib/queue";
import type { Demo } from "@/lib/demos";
import { validateDraft } from "@/lib/draft";
import { getLeads } from "@/lib/sheets";
import { buildBlockSets, suppressionReason, bizKey } from "@/lib/leads/suppress";

// POST /api/approve/add — secret-guarded endpoint so a Cowork lead-gen task can push
// ready-made, deep-rated DRAFTS straight into the approval queue (the in-app engine is
// the other writer). Body: { drafts: PartialDraft[] }. Each draft's body is run through
// validateDraft (voice rules); violators are skipped + counted, never queued.
//
// Deterministic never-twice gate (suppress.ts): every incoming draft is checked
// against the live queue (in-flight/sent/recently-rejected) AND Sheets (already
// contacted), by place_id + normalized name+city — plus a hard medical/health branch
// exclude. This is the real fix for the Cowork task re-drafting businesses we've
// already mailed (it can't reliably self-dedup). NEVER sends mail — only fills the queue.
//
// Auth: Bearer APPROVE_INGEST_SECRET (falls back to DEEP_RESEARCH_SECRET). With neither
// set, POST is allowed (local dev only).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
function checkAuth(req: NextRequest): boolean {
  const expected = process.env.APPROVE_INGEST_SECRET || process.env.DEEP_RESEARCH_SECRET;
  if (!expected) {
    console.warn(JSON.stringify({ evt: "approve-add.auth.no_secret_configured" }));
    return true;
  }
  const m = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return Boolean(m && ctEqual(m[1], expected));
}

interface InDraft {
  leadId?: string;
  name?: string;
  branch?: string;
  city?: string;
  hooks?: string[];
  demoPair?: Demo[];
  professionalism?: string;
  subject?: string;
  body?: string;
  recipientEmail?: string;
  source?: string;
  sender?: string; // optional "lucas" | "charlie"; unset ⇒ chosen on /approve (default lucas)
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  if (!checkAuth(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let payload: { drafts?: unknown };
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const raw = Array.isArray(payload.drafts) ? (payload.drafts as InDraft[]) : [];
  if (raw.length === 0) return NextResponse.json({ error: "no drafts" }, { status: 400 });

  const now = new Date().toISOString();
  const valid: QueueDraft[] = [];
  const skipped: { name: string; reason: string }[] = [];

  // Build the never-twice block sets once: live queue (always) + Sheets contacted-state
  // (best-effort — no creds ⇒ queue half still guards). Incoming drafts are also deduped
  // against EACH OTHER within this batch via the same key (added to `seenKeys`/`seenIds`).
  const queue = await readQueue();
  let sheetsLeads: Awaited<ReturnType<typeof getLeads>> | null = null;
  try {
    sheetsLeads = await getLeads();
  } catch (err) {
    console.warn(JSON.stringify({ evt: "approve-add.sheets_unavailable", err: String(err) }));
  }
  const blockSets = buildBlockSets(queue, sheetsLeads, Date.now());

  for (const d of raw) {
    const name = (d.name || "").trim();
    const body = (d.body || "").trim();
    if (!name || !body) { skipped.push({ name: name || "(uden navn)", reason: "mangler navn/body" }); continue; }
    const supp = suppressionReason({ leadId: d.leadId, name, city: d.city, branch: d.branch }, blockSets);
    if (supp) { skipped.push({ name, reason: supp }); continue; }
    const check = validateDraft(body);
    if (!check.ok) { skipped.push({ name, reason: `voice: ${check.errors.join(", ")}` }); continue; }
    const pair = Array.isArray(d.demoPair) ? d.demoPair.filter((x) => x && typeof x.url === "string" && x.url) : [];
    valid.push({
      id: newDraftId(),
      leadId: (d.leadId || "").toString(),
      name,
      branch: d.branch || "",
      city: d.city || "",
      hooks: Array.isArray(d.hooks) ? d.hooks.filter((h) => typeof h === "string") : [],
      demoPair: pair,
      professionalism: d.professionalism || "",
      subject: (d.subject || `En idé til ${name}`).trim(),
      body,
      recipientEmail: d.recipientEmail && EMAIL_RE.test(d.recipientEmail.trim()) ? d.recipientEmail.trim() : undefined,
      status: "pending",
      source: d.source || "cowork-leadgen",
      ...(d.sender === "charlie" ? { sender: "charlie" as const } : d.sender === "lucas" ? { sender: "lucas" as const } : {}),
      createdAt: now,
      updatedAt: now,
    });
    // Block the rest of THIS batch from re-adding the same business (the agent can
    // emit the same place under two queries with different/empty leadId).
    if (d.leadId) blockSets.ids.add(d.leadId.toString());
    const k = bizKey(name, d.city);
    if (k) blockSets.keys.add(k);
  }

  if (valid.length > 0) await appendDrafts(valid);
  return NextResponse.json({ ok: true, added: valid.length, skipped: skipped.length, skippedDetail: skipped });
}
