import { NextRequest, NextResponse } from "next/server";
import {
  createPreviewRequest,
  readPreviewRequests,
  updatePreviewStatus,
  PREVIEW_STATUSES,
  type PreviewChannel,
  type PreviewStatus,
} from "@/lib/preview-queue";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Hermes contract: GET reads the queue; POST creates an inbound request;
// PATCH attaches research/build/draft results or moves the manual approval point.
// All writes are data-only. This route never sends email.
function authorized(req: NextRequest): boolean {
  if (req.headers.get("x-command-center-auth") === "1") return true;
  const expected = process.env.PREVIEW_QUEUE_SECRET || process.env.DEEP_RESEARCH_SECRET;
  if (!expected) return false; // fail-closed: missing secret must never mean open (2026-08-19)
  const got = req.headers.get("authorization") || "";
  return got === `Bearer ${expected}`;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = req.nextUrl.searchParams.get("status") as PreviewStatus | null;
  const requests = await readPreviewRequests();
  return NextResponse.json({
    requests: status && PREVIEW_STATUSES.includes(status) ? requests.filter((r) => r.status === status) : requests,
    statuses: PREVIEW_STATUSES,
  });
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { company?: string; channel?: PreviewChannel; email?: string; website?: string; contactName?: string; branch?: string; questionnaire?: string; sourceMessageId?: string; demoKey?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (body.channel !== "formular" && body.channel !== "mail") {
    return NextResponse.json({ error: "channel skal være formular eller mail" }, { status: 400 });
  }
  try {
    const request = await createPreviewRequest({ company: body.company || "", channel: body.channel, email: body.email || "", website: body.website, contactName: body.contactName, branch: body.branch, questionnaire: body.questionnaire, sourceMessageId: body.sourceMessageId, demoKey: body.demoKey });
    return NextResponse.json({ ok: true, request }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid_request" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { id?: string; status?: PreviewStatus; research?: string; previewUrl?: string; screenshotUrl?: string; mailDraft?: string; contactName?: string; branch?: string; questionnaire?: string; company?: string; demoKey?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body.id || !body.status || !PREVIEW_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "id og gyldig status er påkrævet", statuses: PREVIEW_STATUSES }, { status: 400 });
  }
  const request = await updatePreviewStatus(body.id, body.status, {
    research: body.research,
    previewUrl: body.previewUrl,
    screenshotUrl: body.screenshotUrl,
    mailDraft: body.mailDraft,
    contactName: body.contactName,
    branch: body.branch,
    questionnaire: body.questionnaire,
    company: body.company,
    demoKey: body.demoKey,
  });
  return request ? NextResponse.json({ ok: true, request }) : NextResponse.json({ error: "request_not_found" }, { status: 404 });
}
