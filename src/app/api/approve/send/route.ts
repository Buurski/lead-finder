import { NextResponse } from "next/server";
import { readQueue, updateDraft } from "@/lib/queue";
import { store } from "@/lib/store";
import { getLeads, getPauseStatus, updateLeadEmailStatus } from "@/lib/sheets";
import { canSendTo } from "@/lib/canSendTo";
import { hasUsableEmail } from "@/lib/leads/channel";
import { bizKey } from "@/lib/leads/suppress";
import { isExcludedBranch } from "@/lib/leads/branch-policy";
import { getTransporter, formatFrom, defaultSender, isSenderAvailable, applySignature, type SenderId } from "@/lib/senders";

// POST /api/approve/send — send the approved drafts FOR REAL (Lucas authorized
// go-live 2026-06-07/08). Human, paced sending — NEVER a burst.
//
// Streams progress as Server-Sent Events (text/event-stream) so the UI can show
// "1/N · sender…" while it works (a run takes minutes — SEND_CAP × 22–45s gaps).
// Pre-flight guards (pause / busy / no-creds / nothing-to-send) still return plain
// JSON; only the actual send loop streams. The client checks the content-type.
//
// Safety, in order:
//   1. PAUSE / halt-flag — if PauseSchedule is active, send NOTHING and report it.
//   2. NEVER re-contact — skip any lead that already has emailSentAt set, plus
//      canSendTo (chain/public/hostile/bounced/replied/unsubscribed/no-email).
//   3. PER-RUN CAP — at most SEND_CAP per click; the rest wait for the next click.
//   4. HUMAN SPACING — a randomised pause between each send (never all at once).
//   5. On success — mark the draft "sent" + stamp the lead emailSentAt + emailStatus
//      "sent" so it can never be contacted again.
//
// Recipient resolution: a draft's recipientEmail wins (set for Cowork/leadgen-ingest
// leads that have NO Sheets row); otherwise the matched Sheets lead's email. This is
// the fix for the "lead ikke fundet"/"no email" skips on ingest leads.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const SEND_CAP = 6;            // most per click — paced, not a blast (fits maxDuration with gaps)
const GAP_MIN_MS = 22_000;    // human spacing between sends: 22–45s
const GAP_MAX_MS = 45_000;

// Send-lock: a single send run can take minutes (SEND_CAP × gaps). Without a lock
// a second click / a page reload + click starts a CONCURRENT run that re-sends the
// same drafts before the first run stamped them → the "5 mails to the same person"
// bug Lucas hit. The lock makes "click 5 times" send exactly once: while a run holds
// the lock, every other call is rejected with busy:true. TTL > maxDuration so a
// crashed run self-heals instead of jamming sending forever.
const LOCK_KEY = "send/lock";
const LOCK_TTL_MS = 6 * 60 * 1000;  // 6 min — longer than maxDuration (300s)

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const randGap = () => GAP_MIN_MS + Math.floor(Math.random() * (GAP_MAX_MS - GAP_MIN_MS));
// "Already contacted" = a REAL send happened: emailSentAt is stamped, OR a real
// outcome status (replied/bounced/unsubscribed). A bare emailStatus "sent" WITHOUT
// emailSentAt is a stale/queued marker from the May limit-hit batch (mails were
// queued, marked, but never actually went out) — those are still sendable.
const alreadyEmailed = (l: { emailSentAt?: string; emailStatus?: string }) =>
  Boolean(l.emailSentAt && l.emailSentAt.trim()) ||
  /^(replied|bounced|unsubscribed)$/i.test((l.emailStatus || "").trim());

// GET /api/approve/send — PREFLIGHT. Sender INTET. Kører de samme guards som
// send-løkken (samme rækkefølge, samme ledger-seeding) og svarer med hvad et
// klik ville gøre: hvor mange sendes nu (SEND_CAP), hvor mange venter, hvem
// springes over og hvorfor, samt pause/lås/afsender-status. UI'et bruger det
// til at vise en ærlig bekræftelses-dialog i stedet for et rundt tal.
// Holdes bevidst i samme fil som POST så guard-logikken ikke driver fra
// hinanden — ændrer du en guard i løkken, så ændr den også her.
export async function GET(req: Request) {
  // Spejler POST'ens ?force=1 (legacy re-run): samme kandidat-udvælgelse og
  // samme !force-gating af re-contact-guards, ellers under-rapporterer
  // dialogen på et force-run.
  const force = new URL(req.url).searchParams.get("force") === "1";
  const senders = { lucas: isSenderAvailable("lucas"), charlie: isSenderAvailable("charlie") };
  const pause = await getPauseStatus("cold").catch(() => ({ paused: false as const, until: undefined as string | undefined }));
  const now = Date.now();
  const lock = await store.get<{ until: number }>(LOCK_KEY).catch(() => null);
  const busy = Boolean(lock && typeof lock.until === "number" && lock.until > now);

  const drafts = await readQueue();
  const candidates = force
    ? drafts.filter((d) => d.status === "approved" || d.status === "sent")
    : drafts.filter((d) => d.status === "approved");

  const sentIds = new Set<string>();
  const sentKeys = new Set<string>();
  const sentEmails = new Set<string>();
  for (const d of drafts) {
    if (d.status !== "sent") continue;
    if (d.leadId) sentIds.add(d.leadId);
    const k = bizKey(d.name, d.city);
    if (k) sentKeys.add(k);
    if (d.recipientEmail) sentEmails.add(d.recipientEmail.trim().toLowerCase());
  }

  let leads: Awaited<ReturnType<typeof getLeads>> = [];
  let sheetsOk = true;
  try {
    leads = await getLeads();
  } catch {
    sheetsOk = false;
    leads = [];
  }
  const byId = new Map(leads.map((l) => [l.id, l]));
  for (const l of leads) {
    if (l.email && alreadyEmailed(l)) sentEmails.add(l.email.trim().toLowerCase());
  }

  let wouldSend = 0;
  let capped = 0;
  const skipped: { name: string; reason: string }[] = [];
  for (const d of candidates) {
    const lead = (d.leadId && byId.get(d.leadId)) ||
      leads.find((l) => l.name.trim().toLowerCase() === d.name.trim().toLowerCase());
    const target = (d.recipientEmail && d.recipientEmail.trim()) || (lead?.email || "").trim();
    if (!hasUsableEmail(target)) {
      skipped.push({ name: d.name, reason: lead ? "no email" : "ingen modtager-email" });
      continue;
    }
    const targetKey = target.toLowerCase();
    if (lead && !force && alreadyEmailed(lead)) {
      skipped.push({ name: d.name, reason: "allerede kontaktet" });
      continue;
    }
    if (isExcludedBranch(d.branch, d.name)) {
      skipped.push({ name: d.name, reason: "branche ekskluderet (medicinsk/sundhed)" });
      continue;
    }
    if (!force && ((d.leadId && sentIds.has(d.leadId)) || sentKeys.has(bizKey(d.name, d.city)))) {
      skipped.push({ name: d.name, reason: "allerede sendt (kø-historik)" });
      continue;
    }
    if (!force && sentEmails.has(targetKey)) {
      skipped.push({ name: d.name, reason: "allerede kontaktet (samme mail)" });
      continue;
    }
    const decision = canSendTo({
      name: lead?.name ?? d.name,
      branch: lead?.branch ?? d.branch,
      email: target,
      emailStatus: lead?.emailStatus,
      status: lead?.status,
    });
    if (!decision.ok) {
      skipped.push({ name: d.name, reason: decision.reason ?? "blokeret" });
      continue;
    }
    if (wouldSend >= SEND_CAP) {
      capped++;
      continue;
    }
    wouldSend++;
    // Spejl send-løkkens in-run ledger så en sibling-draft for samme
    // virksomhed/adresse tælles som skip, præcis som i et rigtigt run.
    if (d.leadId) sentIds.add(d.leadId);
    const sk = bizKey(d.name, d.city);
    if (sk) sentKeys.add(sk);
    sentEmails.add(targetKey);
  }

  return NextResponse.json({
    ok: true,
    senders,
    paused: pause.paused,
    until: pause.paused ? pause.until : undefined,
    busy,
    sheetsOk,
    approved: candidates.length,
    wouldSend,
    capped,
    cap: SEND_CAP,
    skipped,
  });
}

export async function POST(req: Request) {
  // ?force=1 overrides ONLY the never-re-contact guard (emailSentAt) — used for the
  // May limit-hit batch where emailSentAt was stamped optimistically but the mail
  // never actually went out (verified via Gmail). pause + canSendTo still apply.
  const force = new URL(req.url).searchParams.get("force") === "1";
  // Accepter EITHER Lucas- eller Charlie-creds (hybrid allokering 2026-06-17).
  // Helt uden creds er eneste tilfælde hvor vi nægter at starte.
  if (!isSenderAvailable("lucas") && !isSenderAvailable("charlie")) {
    return NextResponse.json({ ok: false, error: "Ingen mail-creds (hverken GMAIL_USER eller CHARLIE_GMAIL_USER er sat)." }, { status: 200 });
  }

  // 1. Never send while paused / halted.
  const pause = await getPauseStatus("cold");
  if (pause.paused) {
    return NextResponse.json({
      ok: false, paused: true, until: pause.until, sent: 0,
      error: `Afsendelse er på pause${pause.until ? ` til ${pause.until}` : ""}.`,
    });
  }

  // 1b. CONCURRENCY LOCK — refuse to start a second run while one is in flight.
  // This is the core fix for double-sending: a run takes minutes, so a reload +
  // re-click would otherwise spin up a parallel run that re-sends the same leads.
  const now = Date.now();
  const lock = await store.get<{ until: number; startedAt: string }>(LOCK_KEY).catch(() => null);
  if (lock && typeof lock.until === "number" && lock.until > now) {
    return NextResponse.json({
      ok: false, busy: true, sent: 0,
      error: "Afsendelse kører allerede — vent til den er færdig (et par minutter). Den sender kun én gang, uanset hvor mange gange du trykker.",
    });
  }
  await store.put(LOCK_KEY, { until: now + LOCK_TTL_MS, startedAt: new Date().toISOString() });

  const drafts = await readQueue();
  // Only "approved" drafts are sent. A draft flips to "sent" the instant its mail
  // goes out, so it can never be picked again — the draft status itself is now an
  // idempotency guard (in addition to the lead's emailSentAt stamp). The old code
  // also re-included "sent" drafts (a one-time May-migration hack); that is what let
  // an already-sent draft go out again, so it is gone. Use ?force=1 to re-run the
  // legacy migration if ever needed.
  const candidates = force
    ? drafts.filter((d) => d.status === "approved" || d.status === "sent")
    : drafts.filter((d) => d.status === "approved");

  // Already-sent ledger from the queue itself: a business with a "sent" draft must
  // never be mailed again, even via a different draft. Covers ingest/leadgen leads
  // that have NO Sheets row (so the emailSentAt guard below can't see them) and the
  // place_id↔Sheets-row leadId mismatch. Keyed by leadId + normalized name+city.
  const sentIds = new Set<string>();
  const sentKeys = new Set<string>();
  const sentEmails = new Set<string>();   // global by-address ledger (cross-sender)
  for (const d of drafts) {
    if (d.status !== "sent") continue;
    if (d.leadId) sentIds.add(d.leadId);
    const k = bizKey(d.name, d.city);
    if (k) sentKeys.add(k);
    if (d.recipientEmail) sentEmails.add(d.recipientEmail.trim().toLowerCase());
  }

  if (candidates.length === 0) {
    await store.delete(LOCK_KEY).catch(() => {});
    return NextResponse.json({ ok: true, sent: 0, failed: 0, skipped: [], note: "Ingen udkast at sende." });
  }

  let leads: Awaited<ReturnType<typeof getLeads>> = [];
  try {
    leads = await getLeads();
  } catch (err) {
    // No Sheets ≠ fatal: ingest drafts carry recipientEmail and don't need a row.
    // Only fatal if a draft has neither a row nor a recipientEmail (handled per-draft).
    console.warn(JSON.stringify({ evt: "approve-send.sheets_unavailable", err: String(err) }));
    leads = [];
  }
  const byId = new Map(leads.map((l) => [l.id, l]));

  // Seed the by-address ledger from Sheets too: any lead already emailed (by
  // EITHER Lucas or Charlie) blocks a fresh cold send to that address. Cold-only
  // route — follow-ups/replies run elsewhere, so this never blocks them.
  for (const l of leads) {
    if (l.email && alreadyEmailed(l)) sentEmails.add(l.email.trim().toLowerCase());
  }

  // Hybrid allokering (2026-06-17): en transport pr draft, valgt ud fra
  // draft.sender (sat af engine via pickHybridSender ELLER manuelt via
  // /godkendelse-knappen). Manglende sender (legacy drafts) falder tilbage på
  // defaultSender(). Returnerer også det valgte id så vi kan re-signere body'en.
  const transportFor = (sender?: string) => {
    const id: SenderId = (sender === "lucas" || sender === "charlie") ? sender : defaultSender();
    return { id, transport: getTransporter(id), from: formatFrom(id) };
  };

  // SSE plumbing. The loop runs inside the stream so each send/skip is reported live.
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => {
        try { controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`)); } catch { /* client gone */ }
      };

      let sent = 0;
      let failed = 0;
      let remaining = 0;
      let processed = 0;
      const total = candidates.length;
      const skipped: { name: string; reason: string }[] = [];

      send({ type: "start", total });

      try {
        for (const d of candidates) {
          processed++;
          const lead = (d.leadId && byId.get(d.leadId)) ||
            leads.find((l) => l.name.trim().toLowerCase() === d.name.trim().toLowerCase());

          // Recipient: the draft's own email wins (ingest leads have no Sheets row),
          // else the matched lead's email.
          const target = (d.recipientEmail && d.recipientEmail.trim()) || (lead?.email || "").trim();
          if (!hasUsableEmail(target)) {
            const reason = lead ? "no email" : "ingen modtager-email";
            skipped.push({ name: d.name, reason });
            send({ type: "skipped", index: processed, total, name: d.name, reason });
            continue;
          }
          const targetKey = target.toLowerCase();

          // 2. NEVER re-contact (only meaningful when we have a Sheets row to check).
          if (lead && !force && alreadyEmailed(lead)) {
            skipped.push({ name: d.name, reason: "allerede kontaktet" });
            send({ type: "skipped", index: processed, total, name: d.name, reason: "allerede kontaktet" });
            continue;
          }
          // 2a. Hard branch exclude — medical/health (tandlæge/læge/…). Catches drafts
          // already queued BEFORE the ingress gate existed, so they can never go out.
          if (isExcludedBranch(d.branch, d.name)) {
            skipped.push({ name: d.name, reason: "branche ekskluderet (medicinsk/sundhed)" });
            send({ type: "skipped", index: processed, total, name: d.name, reason: "branche ekskluderet (medicinsk/sundhed)" });
            continue;
          }
          // 2b. Already-sent ledger — a sibling draft for this business already went
          // out (catches ingest leads with no Sheets row + place_id mismatch).
          if (!force && ((d.leadId && sentIds.has(d.leadId)) || sentKeys.has(bizKey(d.name, d.city)))) {
            skipped.push({ name: d.name, reason: "allerede sendt (kø-historik)" });
            send({ type: "skipped", index: processed, total, name: d.name, reason: "allerede sendt (kø-historik)" });
            continue;
          }
          // 2c. Global by-address ledger — NEVER mail the same address twice,
          // across BOTH Lucas and Charlie (Lucas's krav: jeg må ikke sende til en
          // mail Charlie allerede har skrevet til, og omvendt). Cold-only route.
          if (!force && sentEmails.has(targetKey)) {
            skipped.push({ name: d.name, reason: "allerede kontaktet (samme mail)" });
            send({ type: "skipped", index: processed, total, name: d.name, reason: "allerede kontaktet (samme mail)" });
            continue;
          }
          const decision = canSendTo({
            name: lead?.name ?? d.name,
            branch: lead?.branch ?? d.branch,
            email: target,
            emailStatus: lead?.emailStatus,
            status: lead?.status,
          });
          if (!decision.ok) {
            skipped.push({ name: d.name, reason: decision.reason ?? "blokeret" });
            send({ type: "skipped", index: processed, total, name: d.name, reason: decision.reason ?? "blokeret" });
            continue;
          }

          // 3. Per-run cap — leave the rest for the next click.
          if (sent >= SEND_CAP) {
            remaining++;
            send({ type: "capped", index: processed, total, name: d.name });
            continue;
          }

          // 4. Human spacing before each send (except the first).
          if (sent > 0) await sleep(randGap());

          const { id: senderId, transport, from } = transportFor(d.sender);
          send({ type: "sending", index: processed, total, name: d.name, n: sent + 1, sender: senderId });
          try {
            await transport.sendMail({
              from,
              to: target,
              subject: d.subject,
              text: applySignature(d.body, senderId),
            });
            await updateDraft(d.id, { status: "sent", sentBy: senderId });
            // Add to the in-run ledgers so a same-business / same-address sibling
            // later in this run skips — across BOTH senders.
            if (d.leadId) sentIds.add(d.leadId);
            const sk = bizKey(d.name, d.city);
            if (sk) sentKeys.add(sk);
            sentEmails.add(targetKey);
            // Stamp Sheets only when there IS a row (ingest leads have none).
            if (lead) {
              const rowIndex = parseInt(lead.id, 10) - 2;
              if (Number.isFinite(rowIndex) && rowIndex >= 0) {
                await updateLeadEmailStatus(rowIndex, { emailSentAt: new Date().toISOString(), emailStatus: "sent" }).catch(() => {});
              }
            }
            sent++;
            send({ type: "sent", index: processed, total, name: d.name, n: sent, sender: d.sender ?? defaultSender() });
          } catch (err) {
            failed++;
            send({ type: "failed", index: processed, total, name: d.name, sender: d.sender ?? defaultSender(), error: String(err) });
          }
        }
      } finally {
        await store.delete(LOCK_KEY).catch(() => {});
      }

      send({ type: "done", ok: true, sent, failed, remaining, skipped, mode: "live" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
