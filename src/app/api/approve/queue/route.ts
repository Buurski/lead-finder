import { NextResponse } from "next/server";
import { readQueue, updateDraft, writeQueue } from "@/lib/queue";
import type { Demo } from "@/lib/demos";
import { validateDraft } from "@/lib/draft";
import { registerDraftApproved, unregisterDraftApproved } from "@/lib/datalayer";
import { getLeads } from "@/lib/sheets";
import { leadChannel, hasUsableEmail, isBlockedEmail } from "@/lib/leads/channel";
import { buildContactIndex } from "@/lib/leads/contact-history";

// Reads/writes the engine's approval queue at request time — never cache.
export const dynamic = "force-dynamic";
// approve-many på en stor kø: én kø-skrivning + op til flere hundrede
// best-effort Sheets-registreringer i hold — skal have luft til at løbe færdig.
export const maxDuration = 300;

// Badge-historikken tåler 60s forsinkelse — modul-cache så gentagne refreshes
// af køen ikke hamrer Sheets-API'et (council-fund 2026-07-17). Kun for GET-badgen;
// POST-actions læser aldrig herfra.
let leadsCache: { at: number; leads: Awaited<ReturnType<typeof getLeads>> } | null = null;
async function getLeadsCached() {
  if (leadsCache && Date.now() - leadsCache.at < 60_000) return leadsCache.leads;
  const leads = await getLeads();
  leadsCache = { at: Date.now(), leads };
  return leads;
}

// GET /api/approve/queue — return all drafts (newest first), each enriched with
// a `history` badge (session 5, 2026-07-17): har vi set/kontaktet denne
// forretning før, all-time i Sheets? Matcher på navn+by-nøgle OG email/domæne.
// Best-effort: kan Sheets ikke nås, kommer køen stadig — historyOk=false så
// UI'en kan vise at badgen er degraderet i stedet for at lyve "aldrig set".
export async function GET() {
  const drafts = await readQueue();
  drafts.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

  let historyOk = false;
  let index: ReturnType<typeof buildContactIndex> | null = null;
  try {
    index = buildContactIndex(await getLeadsCached());
    historyOk = true;
  } catch {
    // Sheets nede — badge degraderet, køen leveres alligevel.
  }

  const enriched = drafts.map((d) => {
    const rec = index?.lookup(d.name, d.city, d.recipientEmail);
    return rec ? { ...d, history: { seenBefore: true, ...rec } } : d;
  });

  return NextResponse.json({ drafts: enriched, count: enriched.length, historyOk });
}

interface ActionBody {
  id?: string;
  action?:
    | "approve"
    | "approve-many"
    | "reject-many"
    | "edit"
    | "reject"
    | "unapprove"
    | "set-demos"
    | "set-sender"
    | "reset-sent"
    | "reset-approved"
    | "cleanup-no-email"
    | "reject-seen";
  ids?: string[];
  subject?: string;
  body?: string;
  demoPair?: Demo[];
  sender?: "lucas" | "charlie";
}

// POST /api/approve/queue — approve | edit | reject a draft.
// "approve" only marks status=approved (mark-for-send). NO mail is sent here.
export async function POST(req: Request) {
  let payload: ActionBody;
  try {
    payload = (await req.json()) as ActionBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { id, action } = payload;

  // One-time cleanup (no id needed): the old test-mode marked drafts "sent" without
  // really mailing. Flip those back to "approved" so they show under Godkendt + can
  // be sent for real.
  if (action === "reset-sent") {
    const drafts = await readQueue();
    let reset = 0;
    for (const d of drafts) {
      if (d.status === "sent") { d.status = "approved"; d.updatedAt = new Date().toISOString(); reset++; }
    }
    await writeQueue(drafts);
    return NextResponse.json({ ok: true, reset });
  }

  // Bulk-fortryd (no id): flyt ALLE godkendte (approved + legacy "edited")
  // tilbage til afventer. Lucas's nødbremse mod gamle masse-godkendelser
  // (fx de 221 "redigeret · godkendt" fra en tidligere test-session) — så
  // intet sendes ved en fejl, og han kan re-godkende selektivt.
  // Bevidst pending (ikke rejected): rejected udløser 14-dages engine-blok.
  if (action === "reset-approved") {
    const drafts = await readQueue();
    let reset = 0;
    const now = new Date().toISOString();
    for (const d of drafts) {
      if (d.status === "approved" || d.status === "edited") {
        d.status = "pending";
        d.updatedAt = now;
        reset++;
      }
    }
    await writeQueue(drafts);
    return NextResponse.json({ ok: true, reset, note: "godkendte flyttet til afventer — intet sendt" });
  }

  // One-time cleanup (no id): reject any pending/approved draft whose
  // recipientEmail is set-but-blocked (bureau mail, placeholder, junk). Drafts
  // WITHOUT any email stay in the queue so find-emails cron can fill them later.
  // See /api/cron/cleanup-no-email/route.ts for full rationale.
  if (action === "cleanup-no-email") {
    const drafts = await readQueue();
    let rejected = 0;
    for (const d of drafts) {
      if (d.status !== "pending" && d.status !== "approved") continue;
      const email = (d.recipientEmail || "").trim();
      if (!email) continue;                       // no email → keep for find-emails
      if (hasUsableEmail(email)) continue;       // good email → keep
      if (!isBlockedEmail(email)) continue;      // malformed but not blocked → keep
      d.status = "rejected";
      d.updatedAt = new Date().toISOString();
      rejected++;
    }
    await writeQueue(drafts);
    return NextResponse.json({ ok: true, rejected });
  }

  // Oprydning (Lucas, 2026-07-18): afvis ALLE pending drafts hvis forretning
  // allerede findes i kontakt-historikken (Sheets, all-time — navn+by ELLER
  // email/domæne). Rejected, ikke slettet: reversibelt, og rejected giver
  // 14-dages engine-blok så motoren ikke re-drafter dem i morgen.
  // Fresh Sheets-read (ikke 60s-cachen): oprydning må aldrig køre på stale data.
  if (action === "reject-seen") {
    const index = buildContactIndex(await getLeads());
    const drafts = await readQueue();
    const now = new Date().toISOString();
    const rejected: string[] = [];
    for (const d of drafts) {
      if (d.status !== "pending") continue;
      if (!index.lookup(d.name, d.city, d.recipientEmail)) continue;
      d.status = "rejected";
      d.updatedAt = now;
      rejected.push(d.name);
    }
    await writeQueue(drafts);
    return NextResponse.json({ ok: true, rejected: rejected.length, names: rejected.slice(0, 50) });
  }

  // Bulk-godkend: klienten sendte før ét POST pr. draft ("Godkend alle" på 490
  // udkast = 490 requests = minutter). Én kø-skrivning her; Sheets-registrering
  // er best-effort i hold af 10 så en rate-limit aldrig blokerer godkendelsen.
  if (action === "approve-many") {
    const ids = Array.isArray(payload.ids) ? payload.ids.filter((x): x is string => typeof x === "string") : [];
    if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
    const drafts = await readQueue();
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    const approved = drafts.filter((d) => idSet.has(d.id) && d.status === "pending");
    for (const d of approved) {
      d.status = "approved";
      d.updatedAt = now;
    }
    await writeQueue(drafts);
    let synced = 0;
    for (let i = 0; i < approved.length; i += 10) {
      const chunk = approved.slice(i, i + 10);
      const res = await Promise.allSettled(chunk.map((d) => registerDraftApproved(d)));
      synced += res.filter((r) => r.status === "fulfilled").length;
    }
    return NextResponse.json({ ok: true, approved: approved.length, synced, note: "marked approved — not sent" });
  }

  // Bulk-afvis (symmetri med approve-many, council-fund): 30 dårlige leads
  // skal ikke afvises ét klik ad gangen. Kun pending kan bulk-afvises —
  // godkendte skal gennem unapprove-flowet (Sheets-cleanup + 14-dages-blok).
  if (action === "reject-many") {
    const ids = Array.isArray(payload.ids) ? payload.ids.filter((x): x is string => typeof x === "string") : [];
    if (ids.length === 0) return NextResponse.json({ error: "ids required" }, { status: 400 });
    const drafts = await readQueue();
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    let rejected = 0;
    for (const d of drafts) {
      if (idSet.has(d.id) && d.status === "pending") {
        d.status = "rejected";
        d.updatedAt = now;
        rejected++;
      }
    }
    await writeQueue(drafts);
    return NextResponse.json({ ok: true, rejected });
  }

  if (!id || !action) {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  if (action === "reject") {
    const updated = await updateDraft(id, { status: "rejected" });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
  }

  // Lucas fortrød en godkendelse — fjern den. Vi flytter draften til
  // "rejected" (så queue.ts's 14-dages reject-blok kicker ind), og sætter
  // lead-status i Sheets til "skip" så engine'en aldrig re-picker.
  // Bevidste valg:
  // - status="sent" kan IKKE unapproves: vi kan ikke un-sende en mail.
  // - kun approved/edited drafts kan unapproves (det er dem der vises som
  //   "godkendt" i UI'en). Pending/rejected → 400.
  if (action === "unapprove") {
    const existing = await readQueue();
    const target = existing.find((d) => d.id === id);
    if (!target) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    if (target.status === "sent") {
      return NextResponse.json(
        { error: "draft is already sent — cannot un-send", status: target.status },
        { status: 409 },
      );
    }
    if (target.status !== "approved" && target.status !== "edited") {
      return NextResponse.json(
        { error: `cannot unapprove from status "${target.status}"`, status: target.status },
        { status: 400 },
      );
    }
    const updated = await updateDraft(id, { status: "rejected" });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    // Sheets-cleanup: best-effort. En Sheets-fejl må aldrig blokere unapprove
    // — queue-laget er stadig sandheden, og 14-dages-blokken virker uanset.
    const sync = await unregisterDraftApproved(updated);
    return NextResponse.json({
      draft: updated,
      sync,
      note: "moved to rejected — lead blocked from engine for 14 days",
    });
  }

  if (action === "edit") {
    // Enforce the HARD RULES on edited copy too — a human edit must not
    // reintroduce price/kr or a robot CTA.
    const candidate = payload.body ?? "";
    const check = validateDraft(candidate);
    if (!check.ok) {
      return NextResponse.json(
        { error: "voice-guide violation", violations: check.errors },
        { status: 422 }
      );
    }
    // FIX A: "Gem rettelse + godkend" skal lande i godkendt-tab'en, ikke
    // forsvinde som "edited". Status="approved" så den vises under
    // Godkendt og kan sendes uden yderligere klik.
    const updated = await updateDraft(id, {
      status: "approved",
      subject: payload.subject,
      body: payload.body,
    });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
  }

  if (action === "set-demos") {
    // Lucas picked different demos for this draft. The client sends the new pair
    // (2 from the catalog) + the body with the URLs already swapped. We validate
    // the body and persist demoPair + body WITHOUT changing status (still pending).
    const pair = Array.isArray(payload.demoPair) ? payload.demoPair.filter((d) => d && typeof d.url === "string" && d.url) : [];
    if (pair.length === 0) return NextResponse.json({ error: "demoPair required" }, { status: 400 });
    const candidate = payload.body ?? "";
    const check = validateDraft(candidate);
    if (!check.ok) {
      return NextResponse.json({ error: "voice-guide violation", violations: check.errors }, { status: 422 });
    }
    const updated = await updateDraft(id, { demoPair: pair, body: payload.body });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
  }

  if (action === "set-sender") {
    // Per-lead afsender-valg (Lucas/Charlie) på /godkendelse. Ændrer KUN hvem
    // mailen sendes fra + underskriften ved afsendelse — ikke draft-status. Må
    // vælges på pending/approved/edited (også efter godkendelse), aldrig sent.
    const sender = payload.sender === "charlie" ? "charlie" : "lucas";
    const existing = await readQueue();
    const target = existing.find((d) => d.id === id);
    if (!target) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    if (target.status === "sent") {
      return NextResponse.json({ error: "draft already sent — afsender kan ikke ændres", status: target.status }, { status: 409 });
    }
    const updated = await updateDraft(id, { sender });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
  }

  if (action === "approve") {
    const updated = await updateDraft(id, { status: "approved" });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    // Register back to Sheets so the lead leaves the engine's "new" pool — the
    // single-data-layer bridge. Best-effort: a Sheets failure never blocks the
    // approval (the queue is still the source of truth for the draft itself).
    const sync = await registerDraftApproved(updated);
    return NextResponse.json({
      draft: updated,
      sync,
      note: "marked approved — not sent (sending is a later layer)",
    });
  }

  return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 });
}
