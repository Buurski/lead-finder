import { NextRequest, NextResponse } from "next/server";
import { appendDrafts, newDraftId } from "@/lib/queue";
import type { QueueDraft } from "@/lib/queue";
import type { Demo } from "@/lib/demos";
import { validateDraft } from "@/lib/draft";

// POST /api/approve/add — secret-guarded endpoint so a Cowork lead-gen task can push
// ready-made, deep-rated DRAFTS straight into the approval queue (the in-app engine is
// the other writer). Body: { drafts: PartialDraft[] }. Each draft's body is run through
// validateDraft (voice rules); violators are skipped + counted, never queued. Dedupe by
// leadId happens in appendDrafts. NEVER sends mail — only fills the queue.
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

  for (const d of raw) {
    const name = (d.name || "").trim();
    const body = (d.body || "").trim();
    if (!name || !body) { skipped.push({ name: name || "(uden navn)", reason: "mangler navn/body" }); continue; }
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
      createdAt: now,
      updatedAt: now,
    });
  }

  if (valid.length > 0) await appendDrafts(valid);
  return NextResponse.json({ ok: true, added: valid.length, skipped: skipped.length, skippedDetail: skipped });
}
