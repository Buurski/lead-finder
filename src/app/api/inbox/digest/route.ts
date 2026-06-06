// /api/inbox/digest — the inbox-triage artifact endpoint.
//
//   POST  push a ranked digest (a local Opus/Cowork task produces it from Gmail).
//   GET   read the current digest + summary (debug / the local task can verify).
//
// Auth: Bearer INBOX_DIGEST_SECRET (falls back to DEEP_RESEARCH_SECRET so the same
// shared secret the deep-research producer uses works here too). When NEITHER is
// set, POST is allowed — only acceptable in local dev; production MUST set one.
//
// This is the preferred producer channel: the model call happens on Lucas's
// subscription (free), and the deployed app just reads + renders the result.

import { NextRequest, NextResponse } from "next/server";
import { saveDigest, loadDigest, summarizeDigest, normalizeDigest } from "@/lib/inbox-digest";
import type { InboxDigest } from "@/lib/inbox-digest";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Edge-safe constant-time compare (matches proxy.ts / deep-research-result).
function ctEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function checkAuth(req: NextRequest): { ok: boolean; reason?: string } {
  const expected = process.env.INBOX_DIGEST_SECRET || process.env.DEEP_RESEARCH_SECRET;
  if (!expected) {
    console.warn(JSON.stringify({ evt: "inbox-digest.auth.no_secret_configured" }));
    return { ok: true };
  }
  const got = req.headers.get("authorization") || "";
  const m = got.match(/^Bearer\s+(.+)$/i);
  if (!m) return { ok: false, reason: "missing_bearer" };
  return ctEqual(m[1], expected) ? { ok: true } : { ok: false, reason: "bad_secret" };
}

export async function POST(req: NextRequest) {
  const auth = checkAuth(req);
  if (!auth.ok) return NextResponse.json({ error: "unauthorized", reason: auth.reason }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const digest: InboxDigest = normalizeDigest(body as Partial<InboxDigest>, "cowork-opus");
  await saveDigest(digest);
  return NextResponse.json({ ok: true, summary: summarizeDigest(digest) });
}

export async function GET() {
  const digest = await loadDigest();
  return NextResponse.json({ ok: true, digest, summary: summarizeDigest(digest) });
}
