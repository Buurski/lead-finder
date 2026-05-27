// Shared "today's send queue" logic.
//
// Used by three things:
//   • /api/cron/morning-review   — inspects the queue and emails Lucas
//   • /api/cron/scheduled-send   — sends the queue
//   • /app/review                — renders the queue for human review
//
// Keeping this in one place ensures all three agree on which leads would
// actually go out — otherwise the review UI could show one set and the
// 10:00 sender could send a different set.

import type { Lead } from "@/lib/sheets";
import { getLeads, getTreatAsAliveDomains } from "@/lib/sheets";
import { isChain } from "@/lib/chains";
import { isInTreatAsAliveList } from "@/lib/website-verify";

// Match bulk-send / send-followups behaviour as closely as possible — these
// thresholds are intentionally duplicated rather than imported because the
// existing routes don't export them, and changing those is out of scope.

const PROFESSIONAL_BRANCHES = ["advokat", "revisor", "fysioterapi", "tandlæge", "optiker", "kiropraktor", "apotek"];
const FOLLOWUP_DAYS = 5;
const DAILY_CAP = 75;

const PLACEHOLDER_REGEX = /noreply|no-reply|donotreply|do-not-reply|example\.|@example|sentry|w3\.org|schema|jquery|googletagmanager|googleapis|@google\.com|facebook\.com|instagram\.com|linkedin|twitter|name@domain|user@domain|email@email|your@|youremail|test@test|@test\.dk$|@test\.com$|eksempel|firstname|lastname|sample@|placeholder|john\.doe|jane\.doe|@yourcompany|@yourdomain|@goodresto|@eksempel|@domain\.com$|@email\.com$|wixpress|cloudflare|wordpress\.com|sentry\.io|godaddy|hostnet|simply\.com/i;

const BANNED_DOMAINS = new Set([
  "example.com", "example.dk", "example.org",
  "domain.com", "domain.dk", "email.com",
  "test.com", "test.dk",
  "yourcompany.com", "yourdomain.com",
  "eksempel.dk", "eksempel.com",
  "goodresto.com", "placeholder.com", "sample.com",
]);

function isCleanEmail(email: string): boolean {
  if (!email) return false;
  if (/%[0-9a-fA-F]{2}/.test(email)) return false;
  try { if (decodeURIComponent(email) !== email) return false; } catch { return false; }
  if (/\s/.test(email)) return false;
  if (email.length > 80 || email.length < 5) return false;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  if (PLACEHOLDER_REGEX.test(email)) return false;
  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1).toLowerCase();
  if (BANNED_DOMAINS.has(domain)) return false;
  return true;
}

function isColdEligible(lead: Lead): boolean {
  if (!isCleanEmail(lead.email)) return false;
  if (lead.emailSentAt) return false;
  if (lead.emailStatus === "bounced") return false;
  if (lead.status === "skip" || lead.status === "client") return false;
  if (lead.websiteQualityTier === "modern") return false;
  if (isChain(lead.name)) return false;
  if (/kommune@|kommunen@|\.kommune\.|^visit[a-z]+@/i.test(lead.email)) return false;
  if (/offentligt kontor|skulptur|forening \/ organisation/i.test(lead.branch)) return false;
  const isProfessional = PROFESSIONAL_BRANCHES.some((b) => lead.branch.toLowerCase().includes(b));
  const minScore = isProfessional ? 70 : 50;
  return lead.score >= minScore;
}

function isFollowupEligible(lead: Lead): boolean {
  if (!lead.email) return false;
  if (!lead.emailSentAt) return false;
  if (lead.emailOpenedAt) return false;
  if (lead.emailStatus === "replied") return false;
  if (lead.emailStatus === "bounced") return false;
  if (lead.followupSentAt) return false;
  if (lead.status === "skip" || lead.status === "client") return false;
  const sentDate = new Date(lead.emailSentAt);
  const daysSince = (Date.now() - sentDate.getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= FOLLOWUP_DAYS;
}

export type QueueKind = "cold" | "followup";
export type Concern = "chain" | "broken-website" | "standard";

export interface QueueEntry {
  lead: Lead;
  rowIndex: number;       // 0-based, ready for updateLead* helpers
  kind: QueueKind;
  concern: Concern;
  willClaimBroken: boolean;   // mail copy will mention broken hjemmeside
  treatedAsAlive: boolean;    // root domain on TreatAsAlive list
  daysSinceSent: number;      // 0 for cold, real number for followup
}

export interface QueueSummary {
  cap: number;
  total: number;
  cold: number;
  followups: number;
  concerning: number;
  chains: number;
  brokenClaim: number;
  standard: number;
}

export interface TodaysQueue {
  entries: QueueEntry[];
  summary: QueueSummary;
  overflow: { cold: number; followups: number };
}

function classifyConcern(lead: Lead, willClaimBroken: boolean): Concern {
  if (isChain(lead.name)) return "chain";
  if (willClaimBroken) return "broken-website";
  return "standard";
}

// Mirrors the websiteLine() switch inside email.ts: the only branch that
// outputs the "der ser ud til at være nogle tekniske udfordringer" copy is
// when websiteQualityTier === "dead" (or websiteStatus === "dead"). Everything
// else is either "no website" (different copy) or "old/mediocre" (mild copy).
//
// Per the spec: only tier === "dead" counts as concerning. websiteStatus
// can be stale, but tier is what the email copy actually keys off.
function mailWillClaimBroken(lead: Lead): boolean {
  return lead.websiteQualityTier === "dead";
}

/**
 * Computes today's combined cold + followup queue, sorted and capped at 75.
 *
 * Cold leads are sorted by score (best first), followups FIFO by send date.
 * Cold gets priority — if cold alone exceeds the cap, no followups go out
 * today. Otherwise we fill the remainder with followups.
 */
export async function computeTodaysQueue(opts?: { cap?: number }): Promise<TodaysQueue> {
  const cap = opts?.cap ?? DAILY_CAP;

  const [leads, treatList] = await Promise.all([
    getLeads(),
    getTreatAsAliveDomains(),
  ]);

  const cold = leads
    .map((lead, rowIndex) => ({ lead, rowIndex }))
    .filter(({ lead }) => isColdEligible(lead))
    .sort((a, b) => b.lead.score - a.lead.score);

  const followups = leads
    .map((lead, rowIndex) => ({ lead, rowIndex }))
    .filter(({ lead }) => isFollowupEligible(lead))
    .sort((a, b) => new Date(a.lead.emailSentAt).getTime() - new Date(b.lead.emailSentAt).getTime());

  // Cold first, then followups, up to the daily cap.
  const coldSlots = Math.min(cold.length, cap);
  const followupSlots = Math.min(followups.length, Math.max(0, cap - coldSlots));

  const entries: QueueEntry[] = [];
  for (const { lead, rowIndex } of cold.slice(0, coldSlots)) {
    const willClaimBroken = mailWillClaimBroken(lead);
    entries.push({
      lead,
      rowIndex,
      kind: "cold",
      concern: classifyConcern(lead, willClaimBroken),
      willClaimBroken,
      treatedAsAlive: isInTreatAsAliveList(lead.website, treatList),
      daysSinceSent: 0,
    });
  }
  for (const { lead, rowIndex } of followups.slice(0, followupSlots)) {
    const willClaimBroken = mailWillClaimBroken(lead);
    const days = Math.round(
      (Date.now() - new Date(lead.emailSentAt).getTime()) / (1000 * 60 * 60 * 24)
    );
    entries.push({
      lead,
      rowIndex,
      kind: "followup",
      concern: classifyConcern(lead, willClaimBroken),
      willClaimBroken,
      treatedAsAlive: isInTreatAsAliveList(lead.website, treatList),
      daysSinceSent: days,
    });
  }

  const summary: QueueSummary = {
    cap,
    total: entries.length,
    cold: entries.filter((e) => e.kind === "cold").length,
    followups: entries.filter((e) => e.kind === "followup").length,
    concerning: entries.filter((e) => e.concern !== "standard").length,
    chains: entries.filter((e) => e.concern === "chain").length,
    brokenClaim: entries.filter((e) => e.concern === "broken-website").length,
    standard: entries.filter((e) => e.concern === "standard").length,
  };

  return {
    entries,
    summary,
    overflow: {
      cold: Math.max(0, cold.length - coldSlots),
      followups: Math.max(0, followups.length - followupSlots),
    },
  };
}

// Used by /api/review/skip to figure out the rowIndex for a leadId without
// recomputing the whole queue. leadId equals the sheet row number (per
// sheets.ts: id = String(i + 2)) so rowIndex = parseInt(leadId) - 2.
export function leadIdToRowIndex(leadId: string): number {
  return parseInt(leadId, 10) - 2;
}

export const QUEUE_DAILY_CAP = DAILY_CAP;
