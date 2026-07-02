import { NextResponse } from "next/server";
import { buildInboxTriagePrompt } from "@/lib/inbox-cowork-prompt";
import type { SenderId } from "@/lib/senders";

// GET /api/inbox/cowork-prompt — returns the Markdown triage prompt a local
// Cowork/Opus task runs to produce the inbox digest. ?account=charlie &days=7.
// The secret is NOT embedded here (the local task adds it from its env); this is
// just the instructions. Read-only.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const account: SenderId = (url.searchParams.get("account") === "charlie" ? "charlie" : "lucas");
  const windowDays = Math.min(30, Math.max(1, parseInt(url.searchParams.get("days") || "7", 10) || 7));
  const appUrl = process.env.APP_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);
  const text = buildInboxTriagePrompt({ account, windowDays, appUrl });
  return new NextResponse(text, { headers: { "Content-Type": "text/markdown; charset=utf-8" } });
}
