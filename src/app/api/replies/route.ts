import { NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { getLeads } from "@/lib/sheets";
import type { Lead } from "@/lib/sheets";
import { classifyReply, draftReply } from "@/lib/reply";
import {
  loadDigest, summarizeDigest, scoreImportance, isActionable,
} from "@/lib/inbox-digest";
import type { InboxDigest, InboxItem, InboxCategory } from "@/lib/inbox-digest";

// GET /api/replies — inbox triage for the "Svar" page.
//
// Artifact-first: returns the ranked digest a local Opus/Cowork task pushed to
// /api/inbox/digest (preferred — the model call ran on Lucas's subscription, not
// Vercel budget). When no digest exists yet, falls back to a LIVE, deterministic
// scan of lead-matched IMAP replies so the page is never empty before the first
// scheduled run. Nothing is sent and nothing is written back.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function previewOf(text: string, n = 280): string {
  return (text || "").replace(/\s+/g, " ").trim().slice(0, n);
}

function gmailSearchLink(email: string): string {
  return `https://mail.google.com/mail/u/0/#search/from:${encodeURIComponent(email)}`;
}

// Map the reply.ts classifier category onto the inbox-digest category vocabulary.
function toInboxCategory(c: string, becameClient: boolean): InboxCategory {
  if (becameClient) return "client";
  switch (c) {
    case "interested": return "interested";
    case "question": return "question";
    case "objection": return "objection";
    case "not-interested": return "not-interested";
    case "auto-reply": return "auto-reply";
    case "wrong-person": return "other";
    case "unsubscribe": return "not-interested";
    default: return "other";
  }
}

export async function GET() {
  // 1) Artifact path — the digest a scheduled task produced.
  const stored = await loadDigest();
  if (stored && Array.isArray(stored.items) && stored.items.length > 0) {
    return NextResponse.json({ ok: true, source: "artifact", digest: stored, summary: summarizeDigest(stored) });
  }

  // 2) Live fallback — lead-matched IMAP replies, deterministic.
  let leads: Lead[];
  try {
    leads = await getLeads();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `sheets: ${String(err)}`, source: "none", digest: null }, { status: 200 });
  }

  const emailed = leads.filter((l) => l.email);
  if (emailed.length === 0) {
    const empty: InboxDigest = { generatedAt: new Date().toISOString(), generatedBy: "live-fallback", account: "all", items: [] };
    return NextResponse.json({ ok: true, source: "live-fallback", digest: empty, summary: summarizeDigest(empty), checked: 0 });
  }

  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    return NextResponse.json({ ok: false, error: "imap not configured", source: "none", digest: null }, { status: 200 });
  }

  const byEmail = new Map(emailed.map((l) => [l.email.toLowerCase().trim(), l]));
  const sendDates = emailed.map((l) => new Date(l.emailSentAt)).filter((d) => !Number.isNaN(d.getTime()));
  const since = new Date();
  if (sendDates.length > 0) {
    const earliest = sendDates.reduce((a, b) => (a < b ? a : b));
    since.setTime(earliest.getTime());
    since.setDate(since.getDate() - 1);
  } else {
    since.setDate(since.getDate() - 30);
  }
  const floor = new Date();
  floor.setDate(floor.getDate() - 60);
  if (since < floor) since.setTime(floor.getTime());

  const client = new ImapFlow({
    host: "imap.gmail.com",
    port: 993,
    secure: true,
    ...(process.env.IMAP_ALLOW_SELFSIGNED === "1" ? { tls: { rejectUnauthorized: false } } : {}),
    auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    logger: false,
  });

  const latest = new Map<string, { lead: Lead; subject: string; date: string; text: string }>();
  try {
    await client.connect();
    await client.mailboxOpen("INBOX");
    for await (const msg of client.fetch({ since }, { envelope: true, source: true })) {
      const from = msg.envelope?.from?.[0]?.address?.toLowerCase().trim();
      if (!from || !byEmail.has(from)) continue;
      const lead = byEmail.get(from)!;
      const when = msg.envelope?.date?.toISOString() ?? "";
      const prev = latest.get(lead.id);
      if (prev && prev.date >= when) continue;
      const raw = msg.source ? msg.source.toString("utf-8") : "";
      const body = raw.split(/\r?\n\r?\n/).slice(1).join("\n\n");
      latest.set(lead.id, { lead, subject: msg.envelope?.subject ?? "(intet emne)", date: when, text: body || raw });
    }
    await client.logout();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `imap: ${String(err)}`, source: "none", digest: null }, { status: 200 });
  }

  const items: InboxItem[] = [];
  for (const { lead, subject, date, text } of latest.values()) {
    const draft = await draftReply(text, { leadName: lead.name, branch: lead.branch, city: lead.city }, "", { useAI: false });
    const cls = draft.classification ?? classifyReply(text);
    const category = toInboxCategory(cls.category, cls.becameClient);
    items.push({
      id: lead.id,
      account: process.env.GMAIL_USER || "lucas",
      from: lead.email,
      fromName: lead.name,
      subject,
      snippet: previewOf(text),
      date,
      category,
      importance: scoreImportance(category, true),
      needsReply: cls.isInterested || isActionable(category),
      reason: cls.becameClient ? "Eksplicit ja — blev kunde" : cls.isInterested ? "Viste interesse" : "Svar fra lead",
      gmailLink: gmailSearchLink(lead.email),
      leadId: lead.id,
      suggestedReply: draft.suggestedReply,
    });
  }
  items.sort((a, b) => b.importance - a.importance);

  const digest: InboxDigest = {
    generatedAt: new Date().toISOString(),
    generatedBy: "live-fallback",
    account: process.env.GMAIL_USER || "lucas",
    items,
    windowDays: 30,
    note: `live fallback — ${items.length} lead-matchede svar (kun kendte leads). Kør indbakke-scan for fuld triage.`,
  };
  return NextResponse.json({ ok: true, source: "live-fallback", digest, summary: summarizeDigest(digest), checked: emailed.length });
}
