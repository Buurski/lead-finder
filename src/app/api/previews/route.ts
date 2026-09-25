import { NextRequest, NextResponse } from "next/server";
import {
  createPreviewRequest,
  readPreviewRequests,
  updatePreviewStatus,
  PREVIEW_STATUSES,
  type PreviewChannel,
  type PreviewRequest,
  type PreviewStatus,
} from "@/lib/preview-queue";
import { ctEqual, isCommandCenterRequest } from "@/lib/cc-auth";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Hermes contract: GET reads the queue; POST creates an inbound request;
// PATCH attaches research/build/draft results or moves the manual approval point.
// All writes are data-only. This route never sends email.
async function authorized(req: NextRequest): Promise<boolean> {
  if (await isCommandCenterRequest(req)) return true;
  const expected = process.env.PREVIEW_QUEUE_SECRET || process.env.DEEP_RESEARCH_SECRET;
  if (!expected) return false; // fail-closed: missing secret must never mean open (2026-08-19)
  const got = req.headers.get("authorization") || "";
  return ctEqual(got, `Bearer ${expected}`);
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const status = req.nextUrl.searchParams.get("status") as PreviewStatus | null;
  const all = await readPreviewRequests();
  // Afsendelseskrav (Postgres) så UI'et kan vise afstemning efter et usikkert forsøg — også efter reload (Sol R4-2).
  const claims = await import("@/lib/hq/preview-send")
    .then(async (m) => m.previewClaims((await import("@/lib/db/client")).getDb()))
    .catch(() => new Map<string, "sending" | "uncertain" | "sent">());
  const requests = all.map((r) => (claims.has(r.id) ? { ...r, sendClaim: claims.get(r.id) } : r));
  return NextResponse.json({
    requests: status && PREVIEW_STATUSES.includes(status) ? requests.filter((r) => r.status === status) : requests,
    statuses: PREVIEW_STATUSES,
  });
}

export async function POST(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { company?: string; channel?: PreviewChannel; email?: string; website?: string; phone?: string; contactName?: string; branch?: string; questionnaire?: string; sourceMessageId?: string; demoKey?: string; seoTjek?: unknown; newsletterConsent?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (body.channel !== "formular" && body.channel !== "mail") {
    return NextResponse.json({ error: "channel skal være formular eller mail" }, { status: 400 });
  }
  try {
    const request = await createPreviewRequest({ company: body.company || "", channel: body.channel, email: body.email || "", website: body.website, phone: typeof body.phone === "string" ? body.phone : undefined, contactName: body.contactName, branch: body.branch, questionnaire: body.questionnaire, sourceMessageId: body.sourceMessageId, demoKey: body.demoKey, seoTjek: body.seoTjek as never, newsletterConsent: body.newsletterConsent as never });
    await linkToCrm(request);
    const { attachProfile } = await import("@/lib/hq/draft-profile");
    await attachProfile(request.id, request);
    return NextResponse.json({ ok: true, request }, { status: 201 });
  } catch (error) {
    const { PreviewStorageError } = await import("@/lib/preview-queue");
    const status = error instanceof PreviewStorageError ? 503 : 400;
    return NextResponse.json({ error: error instanceof Error ? error.message : "invalid_request" }, { status });
  }
}

// Henvendelsen kobles på virksomheden i CRM'et (fase 6). Må aldrig vælte formularen —
// fejler den, samler den timelige kv-crm-bridge-cron den op igen (idempotent).
async function linkToCrm(request: PreviewRequest): Promise<void> {
  try {
    const { getDb, pgEnabled } = await import("@/lib/db/client");
    if (!pgEnabled()) return;
    const { linkPreview } = await import("@/lib/hq/inbound");
    await linkPreview(getDb(), request);
  } catch (error) {
    console.error(JSON.stringify({ evt: "inbound.crm.failed", error: String(error).slice(0, 300) }));
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { id?: string; status?: PreviewStatus; research?: string; previewUrl?: string; screenshotUrl?: string; mailDraft?: string; contactName?: string; branch?: string; questionnaire?: string; company?: string; demoKey?: string; reviewNotes?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  if (!body.id || !body.status || !PREVIEW_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "id og gyldig status er påkrævet", statuses: PREVIEW_STATUSES }, { status: 400 });
  }
  // Et uafklaret afsendelseskrav skal afstemmes før status/link ændres (Sol R6-F3). Tjek og skrivning
  // sker under udkastets lås, så en send ikke kan reservere imellem (R7-02); fejler opslaget, afvises (R7-01).
  const id = body.id;
  const { getDb, pgEnabled } = await import("@/lib/db/client");
  const { claimBlocksStatus, previewLockName } = await import("@/lib/hq/preview-send");
  const { withLock, LockBusyError } = await import("@/lib/send-safety");
  let result: { busy: true } | { request: Awaited<ReturnType<typeof updatePreviewStatus>> };
  try {
    result = await withLock(previewLockName(id), async () => {
      const edits = (["research", "previewUrl", "screenshotUrl", "mailDraft", "contactName", "branch", "questionnaire", "company", "demoKey", "reviewNotes"] as const).some((k) => body[k] !== undefined);
      if (pgEnabled() && (await claimBlocksStatus(getDb(), id, body.status!, edits))) return { busy: true as const };
      return { request: await updatePreviewStatus(id, body.status!, {
    research: body.research,
    previewUrl: body.previewUrl,
    screenshotUrl: body.screenshotUrl,
    mailDraft: body.mailDraft,
    contactName: body.contactName,
    branch: body.branch,
    questionnaire: body.questionnaire,
    company: body.company,
    demoKey: body.demoKey,
    reviewNotes: body.reviewNotes,
      }) };
    });
  } catch (error) {
    const busy = error instanceof LockBusyError;
    console.error(JSON.stringify({ evt: "preview.patch_failed", id, error: String(error).slice(0, 200) }));
    return NextResponse.json({ error: busy ? "udkastet er ved at blive sendt — prøv igen om lidt" : "kunne ikke tjekke afsendelsen — prøv igen" }, { status: busy ? 409 : 503 });
  }
  if ("busy" in result) return NextResponse.json({ error: "udkastet har et afsendelsesforsøg — er det uafklaret, så afstem det (Gmail Sendt); er det sendt, kan status ikke ændres" }, { status: 409 });
  const request = result.request;
  return request ? NextResponse.json({ ok: true, request }) : NextResponse.json({ error: "request_not_found" }, { status: 404 });
}
