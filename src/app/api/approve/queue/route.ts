import { NextResponse } from "next/server";
import { finishSend, readQueue, updateDraft, writeQueue } from "@/lib/queue";
import { sendLockHeld } from "@/lib/send-safety";
import type { Demo } from "@/lib/demos";
import { validateDraft } from "@/lib/draft";
import { registerDraftApproved, unregisterDraftApproved } from "@/lib/datalayer";
import { getLeads, updateLeadEmailStatus } from "@/lib/sheets";
import { matchLead } from "@/lib/leads/match";
import { leadChannel, hasUsableEmail, isBlockedEmail } from "@/lib/leads/channel";
import { buildContactIndex } from "@/lib/leads/contact-history";
import { loadShadow, type JevShadowRecord } from "@/lib/leads/jev-shadow";
import { loadDraftShadow } from "@/lib/leads/draft-judgments";
import { loadSocialStats, followerBucket } from "@/lib/leads/social-stats";
import { priority, grade, businessLinks, factLine } from "@/lib/leads/lead-grade";
import { isAgency } from "@/lib/chains";

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
  let leads: Awaited<ReturnType<typeof getLeads>> = [];
  try {
    leads = await getLeadsCached();
    index = buildContactIndex(leads, new Date(), drafts);
    historyOk = true;
  } catch {
    // Sheets nede — badge degraderet, køen leveres alligevel.
  }

  // Jev-badges (2026-09-20): lead-attraktivitet (site-judgments, natlig shadow)
  // + kladde-kvalitet (draft-judgments, samme cron fase 2). Best-effort — en
  // tom/manglende shadow giver bare null-badges, aldrig en fejlet request.
  let leadJev = new Map<string, number | null>();
  let leadShadow = new Map<string, JevShadowRecord>();
  let draftJev = new Map<string, { quality: number | null; flags: string[] }>();
  try {
    const shadow = await loadShadow();
    leadJev = new Map(shadow.map((r) => [r.leadId, r.attractiveness]));
    leadShadow = new Map(shadow.map((r) => [r.leadId, r]));
  } catch {
    // shadow store nede — lead-badge udelades
  }
  try {
    draftJev = new Map((await loadDraftShadow()).map((r) => [r.draftId, { quality: r.quality, flags: r.flags }]));
  } catch {
    // shadow store nede — kladde-badge udelades
  }

  // Følgertal (2026-09-20, bag pris-gate): kun sat når Lucas selv har trukket
  // dem via "Hent følgertal" (/api/jev-social) — best-effort, tom = udeladt.
  let socialByLead = new Map<string, number | null>();
  try {
    socialByLead = new Map((await loadSocialStats()).map((r) => [r.leadId, r.followers]));
  } catch {
    // social-store nede — følgertal udelades
  }

  const enriched = drafts.map((d) => {
    const rec = index?.lookup(d.name, d.city, d.recipientEmail);
    const dj = draftJev.get(d.id);
    const leadAttr = leadJev.get(d.leadId) ?? null;
    const draftQuality = dj?.quality ?? null;
    const sh = leadShadow.get(d.leadId);
    const shSocials = sh?.socials;
    // Bureauer sælger selv det vi sælger (Lucas 2026-09-21: "Social Boost skal
    // også fjernes"). Navnet afgør det her, uafhængigt af om forretningen
    // nogensinde er blevet Jev-vurderet — mange kladder i køen har ingen
    // Sheets-række og kan derfor aldrig få en lead-score.
    const bureau = isAgency(d.name, d.branch);
    const p = bureau ? 0 : priority(leadAttr, draftQuality);
    // Kun en komplet vurdering (både forretning og kladde) kan give A —
    // ellers ville en ikke-vurderet forretning arve kladdens karakter.
    const withJev = {
      ...d,
      jev: {
        lead: leadAttr,
        draft: draftQuality,
        flags: bureau ? ["bureau/konkurrent", "send ikke", ...(dj?.flags ?? [])] : (dj?.flags ?? []),
        grade: bureau ? ("C" as const) : grade(p, leadAttr != null && draftQuality != null),
        priority: p,
        links: businessLinks(sh?.name ?? d.name, sh?.city ?? d.city, sh?.url ?? "", d.recipientEmail, shSocials),
        facts: factLine({ reviewsCount: sh?.reviewsCount, isChain: sh?.isChain, sheetTier: sh?.sheetTier, judgment: sh?.judgment }),
        followers: followerBucket(socialByLead.get(d.leadId)),
      },
    };
    // Modtageren præcis som send-ruten vælger den (kladdens egen adresse vinder,
    // ellers leadets) — så "Mangler mail" i UI'et er sandt, ikke et gæt.
    const to = (d.recipientEmail || "").trim() || (matchLead(leads, d)?.email || "").trim();
    const withTo = { ...withJev, to: hasUsableEmail(to) ? to : "" };
    return rec ? { ...withTo, history: { seenBefore: true, ...rec } } : withTo;
  });

  // no-store: mailadresser + kladdetekst må ikke ligge i en mobil-browsers HTTP-cache.
  return NextResponse.json(
    { drafts: enriched, count: enriched.length, historyOk },
    { headers: { "Cache-Control": "no-store" } },
  );
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
    | "reset-approved"
    | "cleanup-no-email"
    | "reject-seen"
    | "set-recipient"
    | "reconcile";
  ids?: string[];
  subject?: string;
  body?: string;
  demoPair?: Demo[];
  sender?: "lucas" | "charlie";
  recipientEmail?: string;
  result?: "sent" | "not-sent";
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

  // Afstemning af en kladde der står i "sending" (SMTP-svaret gik tabt eller kunne ikke
  // bogføres): Lucas har tjekket Gmail Sendt og siger om den gik ud.
  if (action === "reconcile") {
    if (!id) return NextResponse.json({ error: "id mangler" }, { status: 400 });
    const d = (await readQueue()).find((x) => x.id === id);
    if (!d || d.status !== "sending") return NextResponse.json({ error: "kladden venter ikke på afstemning" }, { status: 409 });
    if (payload.result !== "sent" && payload.result !== "not-sent") return NextResponse.json({ error: "result skal være sent eller not-sent" }, { status: 400 });
    // Aldrig mens en send-kørsel er aktiv: SMTP kan stadig være i gang for netop denne kladde (Sol R3).
    if (await sendLockHeld()) return NextResponse.json({ error: "afsendelse kører — prøv igen om et par minutter" }, { status: 409 });
    const ok = await finishSend(id, payload.result === "sent" ? "sent" : "approved", payload.result === "sent" ? (d.sender ?? null) : null);
    if (!ok) return NextResponse.json({ error: "kladden er allerede afstemt" }, { status: 409 });
    // Sendt ⇒ stempl også kontakten, så ingen anden vej ser leadet som ukontaktet.
    if (payload.result === "sent" && /^\d+$/.test(d.leadId)) {
      await updateLeadEmailStatus(Number(d.leadId) - 2, { emailSentAt: new Date().toISOString(), emailStatus: "sent" }).catch((err: unknown) =>
        console.error(JSON.stringify({ evt: "reconcile.stamp_failed", leadId: d.leadId, error: String(err as unknown).slice(0, 200) })));
    }
    return NextResponse.json({ ok: true, status: payload.result === "sent" ? "sent" : "approved" });
  }
  // En kladde under afsendelse kan ikke ændres fra UI'et (stale faner) — kun afstemmes.
  if (id && (await readQueue()).some((x) => x.id === id && x.status === "sending")) {
    return NextResponse.json({ error: "under afsendelse — afstem den først", status: "sending" }, { status: 409 });
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
  // Cron-ruten /api/cron/cleanup-no-email blev fjernet 2026-09-02 (kørte dagligt trods "one-time"); logikken lever kun her som manuel action.
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
    const drafts = await readQueue();
    const index = buildContactIndex(await getLeads(), new Date(), drafts);
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

  // Sendt eller system-stoppet (svar/nej tak) er endeligt: en forældet fane må
  // aldrig kunne godkende/rette den tilbage i køen (council 23/9).
  const finalBlock = async (): Promise<NextResponse | null> => {
    const d = (await readQueue()).find((x) => x.id === id);
    if (!d) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    if (d.status === "sent") return NextResponse.json({ error: "allerede sendt — kan ikke ændres", status: d.status }, { status: 409 });
    if (d.status === "rejected" && d.stoppedReason) {
      return NextResponse.json({ error: `stoppet (${d.stoppedReason}) — kan ikke genoplives`, status: d.status }, { status: 409 });
    }
    return null;
  };

  if (action === "edit") {
    const blocked = await finalBlock();
    if (blocked) return blocked;
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
    const blocked = await finalBlock();
    if (blocked) return blocked;
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

  if (action === "set-recipient") {
    const blocked = await finalBlock();
    if (blocked) return blocked;
    const email = (payload.recipientEmail || "").trim().toLowerCase();
    if (!hasUsableEmail(email)) {
      return NextResponse.json({ error: "Ugyldig eller blokeret mailadresse" }, { status: 400 });
    }
    const updated = await updateDraft(id, { recipientEmail: email });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: { ...updated, to: email } });
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
    // Præsentationen følger afsenderen: Lucas' "salgselev"-historie må aldrig gå ud fra Charlie.
    const { adaptToSender } = await import("@/lib/tone-mixer");
    const updated = await updateDraft(id, { sender, body: adaptToSender(target.body ?? "", sender) });
    if (!updated) return NextResponse.json({ error: "draft not found" }, { status: 404 });
    return NextResponse.json({ draft: updated });
  }

  if (action === "approve") {
    // Council-fund 2026-09-02: uden denne guard kunne en stale fane (fx /send på
    // to enheder) approve et allerede SENDT draft tilbage til "approved" og sende
    // det igen — ingest-leads uden Sheets-række har ingen anden aldrig-igen-guard.
    const blocked = await finalBlock();
    if (blocked) return blocked;
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
