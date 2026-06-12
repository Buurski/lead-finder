// One-shot admin endpoint: backfill recipientEmail on queued drafts from the
// current leadgen.json on GitHub. Idempotent — safe to call multiple times.
//
// Why this exists: the 75 historical "cowork-leadgen" drafts have empty leadId
// + no recipientEmail, so /api/approve/send skips them as "ingen modtager-email"
// (0 sendt). The proper backfill runs inside /api/cron/ingest-leadgen, but that
// route requires CRON_SECRET which is awkward to invoke manually. This endpoint
// runs ONLY the backfill (no new drafts queued, no mail sent) and uses a simpler
// query-key auth so Lucas can curl it from anywhere.
//
// Auth: ?key=<ADMIN_KEY> OR Bearer ADMIN_KEY header. Falls back to CRON_SECRET if
// ADMIN_KEY is unset. With BOTH unset the route is open (local dev only).

import { NextResponse } from "next/server";
import { readQueue, updateDraft } from "@/lib/queue";
import { hasUsableEmail } from "@/lib/leads/channel";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const REPO = "Buurski/KnowledgeOS";
const BRANCH = process.env.VAULT_BRANCH || "master";
const LEADGEN_PATH = "data/leadgen.json";

interface LeadgenItem {
  name?: string;
  email?: string | null;
  place_id?: string;
}
interface LeadgenFile {
  items?: LeadgenItem[];
}

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

async function fetchLeadgen(): Promise<LeadgenFile> {
  const token = process.env.GITHUB_TOKEN || process.env.VAULT_GITHUB_TOKEN;
  if (token) {
    const url = `https://api.github.com/repos/${REPO}/contents/${LEADGEN_PATH}?ref=${BRANCH}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "command-center",
        Accept: "application/vnd.github.raw",
      },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) return JSON.parse(await res.text());
  }
  const url = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${LEADGEN_PATH}`;
  const res = await fetch(url, {
    headers: { "User-Agent": "command-center" },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`leadgen.json fetch ${res.status}`);
  return JSON.parse(await res.text());
}

function checkAuth(req: Request): boolean {
  const expected = process.env.ADMIN_KEY || process.env.CRON_SECRET || "";
  if (!expected) return true; // open in dev — no secret set
  const url = new URL(req.url);
  const key = url.searchParams.get("key") || "";
  if (key && key === expected) return true;
  const h = req.headers.get("authorization") || "";
  if (h.startsWith("Bearer ") && h.slice(7) === expected) return true;
  return false;
}

export async function GET(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const file = await fetchLeadgen();
  const items = Array.isArray(file.items) ? file.items : [];

  const emailByLeadId = new Map<string, string>();
  const emailByName = new Map<string, string>();
  for (const it of items) {
    if (!hasUsableEmail(it.email ?? undefined)) continue;
    const email = (it.email as string).trim();
    const lid = (it.place_id || it.name || "").toString();
    if (lid) emailByLeadId.set(lid, email);
    if (it.name) emailByName.set(norm(it.name), email);
  }

  const queue = await readQueue();
  let scanned = 0;
  let patched = 0;
  const patches: { id: string; name: string; email: string }[] = [];

  for (const d of queue) {
    if (d.source !== "leadgen-ingest" && d.source !== "cowork-leadgen") continue;
    if (d.status === "sent" || d.status === "rejected") continue;
    scanned++;
    if (d.recipientEmail && d.recipientEmail.trim()) continue;
    let email = d.leadId ? emailByLeadId.get(d.leadId) : undefined;
    if (!email && d.name) email = emailByName.get(norm(d.name));
    if (email) {
      await updateDraft(d.id, { recipientEmail: email });
      patched++;
      patches.push({ id: d.id, name: d.name, email });
    }
  }

  return NextResponse.json({
    ok: true,
    candidates: items.length,
    scanned,
    patched,
    patches: patches.slice(0, 20),
  });
}
