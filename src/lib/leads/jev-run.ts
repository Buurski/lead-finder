// jev-run.ts — the three Jev-rescoring phases (leads, drafts, replies), shared
// between the nightly cron (src/app/api/cron/jev-rescore/route.ts) and the
// on-demand route (src/app/api/jev-run/route.ts) so Lucas can run a batch
// himself instead of waiting for 03:30. OBSERVES ONLY, same as both callers.

import { getLeads, getClients } from "../sheets.ts";
import { jevEnabled } from "../jev.ts";
import { loadShadow, saveShadow, pickBatch, judgeLead, countUnjudged } from "./jev-shadow.ts";
import { readQueue } from "../queue.ts";
import { classifyCities } from "./city-region.ts";
import { loadDraftShadow, saveDraftShadow, judgeDraft } from "./draft-judgments.ts";
import { loadReplyShadow, saveReplyShadow, judgeReply, type ReplyInfo } from "./reply-judgments.ts";
import { classifyReply } from "../reply.ts";
import { loadDigest } from "../inbox-digest.ts";
import { liveScanDigest } from "../inbox-live.ts";

const DEFAULT_BATCH = 40;
const MAX_DRAFT_BATCH = 150;
const MAX_REPLY_BATCH = 30;
// Fase 1 (leads) må højst bruge denne andel af vinduet. Uden den kunne et stort
// lead-hold æde hele deadline og efterlade kladderne uvurderede — præcis det
// der gav "?" og falske karakterer i /godkendelse.
const LEAD_PHASE_SHARE = 0.6;
// Hard ceiling regardless of ?limit / env (Codex JEV-005). One lead worst case is
// fetch 9 s + Jev 15 s = 24 s; with CONCURRENCY 5 and a 95 s wall-clock deadline
// the route always returns inside maxDuration (Codex JEV-003) — leftover leads
// are simply "remaining" and picked up next night (oldest-judged-first order).
// 1.288 leads i 60'er-hold = 22 klik, så produktionen stod reelt uvurderet
// (Lucas 2026-09-20). Ruterne kører nu på maxDuration 300, så loftet er hævet
// og deadline sat til 270 s: worst case pr. lead er fetch 9 s + Jev 15 s = 24 s,
// og med CONCURRENCY 8 når et hold altid at returnere inden for maxDuration.
// Resten bliver "remaining" og tages i næste kørsel (ældst-vurderet først).
const MAX_BATCH = 250;
const CONCURRENCY = 8;
const DEADLINE_MS = 270_000;
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

export function clampBatch(raw: string | number | null | undefined): number {
  const n = typeof raw === "number" ? raw : parseInt(String(raw ?? ""), 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_BATCH;
  return Math.min(MAX_BATCH, Math.floor(n));
}

export interface Phase {
  judged: number;
  errors: number;
  remaining: number;
}

export interface RunJevBatchResult {
  leads: Phase;
  drafts: Phase;
  replies: Phase;
}

const EMPTY_PHASE: Phase = { judged: 0, errors: 0, remaining: 0 };

export async function runJevBatch(opts: { limit: number; deadlineMs?: number; includeReplies?: boolean }): Promise<RunJevBatchResult> {
  if (!jevEnabled()) {
    return { leads: EMPTY_PHASE, drafts: EMPTY_PHASE, replies: EMPTY_PHASE };
  }
  const max = clampBatch(opts.limit);
  const window = opts.deadlineMs ?? DEADLINE_MS;
  const deadline = Date.now() + window;
  const leadDeadline = Date.now() + Math.round(window * LEAD_PHASE_SHARE);
  const includeReplies = opts.includeReplies ?? true;

  // Phase 0: landsdel for de byer vi ikke har klassificeret endnu (Lucas
  // 2026-09-21: København er uden for området). Ét billigt Choice pr. NY by,
  // cachet for evigt — byer flytter sig ikke. Skal ligge før fase 1, så
  // straffen er med i den attraktivitet der gemmes i nat.
  const leads = await getLeads();
  await classifyCities(leads.map((l) => l.city), Date.now() + 45_000).catch(() => ({}));

  // Phase 1: leads (site attractiveness). Leads med en ventende kladde kommer
  // først: uden en vurdering af FORRETNINGEN kan /godkendelse aldrig vise andet
  // end B, uanset hvor god kladden er.
  const queue = await readQueue();
  const draftLeadIds = new Set(queue.filter((d) => d.status === "pending").map((d) => d.leadId));
  const existing = await loadShadow();
  const batch = pickBatch(leads, existing, max, draftLeadIds);
  // Kinlys faktiske kunder som ICP-anker i `ligner_kinlys_kunder`. Best-effort:
  // kan Clients-arket ikke læses, falder spørgsmålet tilbage på sin egen
  // brancheopremsning i stedet for at vælte hele kørslen.
  const clients = await getClients().catch(() => []);

  let judged = 0;
  let errors = 0;
  let i = 0;
  async function worker() {
    while (i < batch.length && Date.now() < leadDeadline) {
      const lead = batch[i++];
      const rec = await judgeLead(lead, clients);
      await saveShadow(rec);
      judged++;
      if (rec.error) errors++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batch.length) }, worker));

  // Never-judged leads left after this run (re-judging old records is a bonus, not backlog).
  const remaining = Math.max(0, countUnjudged(leads, existing) - judged);

  // Phase 2: pending outreach drafts (approve UI ranking). Same deadline
  // as phase 1 — a slow phase 1 simply leaves fewer drafts judged tonight,
  // never blows past maxDuration. OBSERVES ONLY, same as phase 1.
  const draftShadow = await loadDraftShadow();
  const draftJudgedAt = new Map(draftShadow.map((r) => [r.draftId, r.judgedAt]));
  const pendingDrafts = queue.filter((d) => d.status === "pending");
  // Retryable errors (Codex TSJ-003): a record with `error` is re-judged
  // once it is older than RETRY_AFTER_MS, so a transient Jev failure never
  // leaves a draft/reply unscored for good.
  const draftErrorAt = new Map(draftShadow.filter((r) => r.error).map((r) => [r.draftId, r.judgedAt]));
  const retryDue = (iso: string | undefined) => !!iso && Date.now() - new Date(iso).getTime() > RETRY_AFTER_MS;
  const unjudgedDrafts = pendingDrafts.filter((d) => {
    const j = draftJudgedAt.get(d.id);
    return !j || j < d.updatedAt || retryDue(draftErrorAt.get(d.id));
  });
  const draftBatch = unjudgedDrafts.slice(0, MAX_DRAFT_BATCH);

  let draftsJudged = 0;
  let draftsErrors = 0;
  let di = 0;
  async function draftWorker() {
    while (di < draftBatch.length && Date.now() < deadline) {
      const draft = draftBatch[di++];
      const rec = await judgeDraft(draft);
      await saveDraftShadow(rec);
      draftsJudged++;
      if (rec.error) draftsErrors++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, draftBatch.length) }, draftWorker));
  const draftsRemaining = Math.max(0, unjudgedDrafts.length - draftsJudged);

  // DPA gate (council TSJ-001): reply text is customer correspondence. Phase 3
  // stays OFF until Lucas has documented TypeSafe as data processor; then
  // JEV_REPLIES=1 in Vercel env turns it on. Built, reviewed, not active.
  const repliesEnabled = includeReplies && process.env.JEV_REPLIES === "1";
  // Phase 3: warm replies that need a "what now?" suggestion. Same
  // deadline as phase 1+2, OBSERVES ONLY. Reply body text isn't stored on
  // the Lead row (sync-replies.ts only stamps emailStatus="replied") — the
  // best available text is the inbox digest snapshot (inbox-digest.ts),
  // keyed by leadId; falls back to notes/enrichedInfo in reply-judgments.ts
  // when a lead isn't in the digest.
  const REPLY_INELIGIBLE_STATUS = new Set(["client", "dead"]);
  const digest = await loadDigest().catch(() => null);
  const digestByLead = new Map((digest?.items ?? []).filter((it) => it.leadId).map((it) => [it.leadId as string, it]));
  const repliedLeads = repliesEnabled ? leads.filter((l) => l.emailStatus === "replied" && !REPLY_INELIGIBLE_STATUS.has(l.status)) : [];
  const replyShadow = await loadReplyShadow();
  const replyJudgedAt = new Map(replyShadow.map((r) => [r.leadId, r.judgedAt]));
  const noTextYet = new Set(replyShadow.filter((r) => r.error === "no-reply-text").map((r) => r.leadId));
  // The stored digest is a single snapshot; replied leads outside it have no
  // text. Scan IMAP once (read-only, same code path as /api/replies) when at
  // least one candidate lacks a snippet, so Jev judges the actual reply.
  const needsLive = repliedLeads.some((l) => !digestByLead.get(l.id)?.snippet && (!replyJudgedAt.has(l.id) || noTextYet.has(l.id)));
  if (needsLive && Date.now() < deadline - 30_000) {
    const live = await liveScanDigest().catch(() => null);
    for (const it of live?.digest?.items ?? []) {
      if (it.leadId && it.snippet && !digestByLead.get(it.leadId)?.snippet) digestByLead.set(it.leadId, it);
    }
  }
  const replyErrorAt = new Map(replyShadow.filter((r) => r.error && r.error !== "no-reply-text").map((r) => [r.leadId, r.judgedAt]));
  const unjudgedReplies = repliedLeads.filter((l) => {
    const j = replyJudgedAt.get(l.id);
    if (!j) return true; // never judged
    if (retryDue(replyErrorAt.get(l.id))) return true; // transient error, retry
    const item = digestByLead.get(l.id);
    if (noTextYet.has(l.id) && item?.snippet) return true; // text arrived since the no-text record
    return !!item?.date && item.date > j; // a newer reply came in since the last judgment
  });
  const replyBatch = unjudgedReplies.slice(0, MAX_REPLY_BATCH);

  let repliesJudged = 0;
  let repliesErrors = 0;
  let ri = 0;
  async function replyWorker() {
    while (ri < replyBatch.length && Date.now() < deadline) {
      const lead = replyBatch[ri++];
      const item = digestByLead.get(lead.id);
      const info: ReplyInfo = item
        ? { bodyText: item.snippet, category: item.snippet ? classifyReply(item.snippet).category : undefined, repliedAt: item.date }
        : {};
      const rec = await judgeReply(lead, info);
      await saveReplyShadow(rec);
      repliesJudged++;
      if (rec.error) repliesErrors++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, replyBatch.length) }, replyWorker));
  const repliesRemaining = Math.max(0, unjudgedReplies.length - repliesJudged);

  return {
    leads: { judged, errors, remaining },
    drafts: { judged: draftsJudged, errors: draftsErrors, remaining: draftsRemaining },
    replies: { judged: repliesJudged, errors: repliesErrors, remaining: repliesRemaining },
  };
}
