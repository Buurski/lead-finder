import { NextResponse } from "next/server";
import { validateDraft } from "@/lib/draft";
import { applySignature, applySignatureHtml, formatFrom, getTransporter, isSenderAvailable, type SenderId } from "@/lib/senders";
import { assertWriteRequest } from "@/lib/cc-auth";
import { currentUser } from "@/lib/current-user";
import { getDb } from "@/lib/db/client";
import { recordReplyOutcome, type ReplyOutcome } from "@/lib/hq/reply-outcome";
import { markReplyHandled } from "@/lib/inbox-digest";

// POST /api/replies/[leadId]/send-reply — send et svar til leadet direkte fra CRM'et.
//
// Sikkerhed (Lucas 23/9: "det ville være lækkert at kunne"): kun når LIVE_SEND_ARMED=1
// i miljøet, kun med confirm:true fra UI'ets bekræft-trin, kun bag write-vagten. Efter
// afsendelse registreres svaret som besvaret (tidslinje, kolde mails stoppes, klokken).
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const OUTCOMES: ReplyOutcome[] = ["interesseret", "ikke-interesseret", "ring-op", "kunde-spoergsmaal", "andet"];
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

interface Body {
  reply?: string;
  subject?: string;
  toEmail?: string;
  sender?: SenderId;
  confirm?: boolean;
  outcome?: ReplyOutcome;
  replyDate?: string;
}

export async function POST(req: Request, { params }: { params: Promise<{ leadId: string }> }) {
  try {
    await assertWriteRequest(req);
  } catch (err) {
    return NextResponse.json({ ok: false, message: (err as Error).message }, { status: 403 });
  }
  const { leadId } = await params;
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body) return NextResponse.json({ ok: false, message: "ugyldig forespørgsel" }, { status: 400 });

  if (process.env.LIVE_SEND_ARMED !== "1") {
    return NextResponse.json({ ok: false, needsArm: true, message: "Afsendelse fra CRM'et er slået fra. Brug \"Åbn i Gmail\"." }, { status: 412 });
  }
  if (body.confirm !== true) return NextResponse.json({ ok: false, message: "Bekræft svaret før det sendes." }, { status: 412 });

  const reply = (body.reply ?? "").trim();
  if (!reply) return NextResponse.json({ ok: false, message: "Svaret er tomt." }, { status: 400 });
  if (reply.length > 5000) return NextResponse.json({ ok: false, message: "Svaret er for langt." }, { status: 400 });
  // Stemme-reglerne gælder også svar — men et svar må gerne nævne en pris, når kunden spørger.
  const errors = validateDraft(reply).errors.filter((e) => !e.startsWith("pris/penge"));
  if (errors.length) return NextResponse.json({ ok: false, message: `Ret svaret: ${errors.join("; ")}` }, { status: 422 });

  const to = (body.toEmail ?? "").trim();
  if (!EMAIL.test(to)) return NextResponse.json({ ok: false, message: "Ingen gyldig modtager-mail." }, { status: 400 });
  const senderId: SenderId = body.sender === "charlie" ? "charlie" : "lucas";
  if (!isSenderAvailable(senderId)) return NextResponse.json({ ok: false, message: `${senderId === "charlie" ? "Charlies" : "Lucas'"} mailkonto er ikke forbundet.` }, { status: 400 });
  const subject = (body.subject ?? "").trim().slice(0, 200) || "Re: din henvendelse";

  // Dobbeltklik/to faner: samme svar til samme modtager sendes højst én gang pr. 10 min.
  const { store } = await import("@/lib/store");
  const dedupKey = `reply-sent/${leadId}/${await sha256(`${to}|${reply}`)}`;
  const prev = await store.get<{ at: number }>(dedupKey);
  if (prev && Date.now() - prev.at < 600_000) return NextResponse.json({ ok: false, message: "Det svar er allerede sendt." }, { status: 409 });
  await store.put(dedupKey, { at: Date.now() });

  try {
    await getTransporter(senderId).sendMail({
      from: formatFrom(senderId),
      to,
      subject: /^re:/i.test(subject) ? subject : `Re: ${subject}`,
      text: applySignature(reply, senderId),
      html: applySignatureHtml(reply, senderId),
    });
  } catch (err) {
    await store.delete(dedupKey).catch(() => {});
    return NextResponse.json({ ok: false, message: `Mailen kunne ikke sendes: ${String(err).slice(0, 160)}` }, { status: 502 });
  }

  // Mailen er sendt — resten er bogføring og må aldrig få UI'et til at tro, at den fejlede.
  let recorded = true;
  try {
    const actor = (await currentUser()) ?? senderId;
    const outcome = body.outcome && OUTCOMES.includes(body.outcome) ? body.outcome : "andet";
    const note = `svar sendt fra CRM: ${reply.replace(/\s+/g, " ").slice(0, 140)}`;
    await recordReplyOutcome(getDb(), { leadId, outcome, note, owner: senderId, actor });
    const upTo = body.replyDate && !Number.isNaN(Date.parse(body.replyDate)) ? new Date(body.replyDate).toISOString() : undefined;
    await markReplyHandled(leadId, upTo);
  } catch (err) {
    recorded = false;
    console.error(JSON.stringify({ evt: "reply.record.failed", leadId, error: String(err).slice(0, 200) }));
  }
  return NextResponse.json({ ok: true, sent: true, to, recorded });
}

async function sha256(t: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("").slice(0, 24);
}
