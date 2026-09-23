import { NextResponse } from "next/server";
import { getDb, pgEnabled } from "@/lib/db/client";
import { AgentLogError, logAgentEntry } from "@/lib/hq/agent-log";
import { verifyHermesRequest } from "@/lib/hermes-hmac";
import { cleanEnv } from "@/lib/hermes";

export const runtime = "nodejs";

// POST { actor, type: session|checkin|deploy, summary, company?, url? }
// Undtaget fra proxyens login; beskyttet af HMAC med HERMES_API_SECRET (samme
// skema som /api/hermes/crm-dossier): X-Timestamp + Bearer hmac(`${ts}.POST.${path}.${body}`).
export async function POST(req: Request) {
  const body = await req.text();
  if (body.length > 4000) return NextResponse.json({ ok: false, error: "for stor" }, { status: 413 });
  if (!verifyHermesRequest(req, cleanEnv(process.env.HERMES_API_SECRET), body)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!pgEnabled()) return NextResponse.json({ ok: false, error: "CRM kører ikke på Postgres" }, { status: 503 });
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "ugyldig JSON" }, { status: 400 });
  }
  try {
    return NextResponse.json({ ok: true, ...(await logAgentEntry(getDb(), input as never)) });
  } catch (err) {
    if (err instanceof AgentLogError) return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    console.error(JSON.stringify({ evt: "agent.log.failed", error: String(err).slice(0, 300) }));
    return NextResponse.json({ ok: false, error: "noget gik galt" }, { status: 500 });
  }
}
