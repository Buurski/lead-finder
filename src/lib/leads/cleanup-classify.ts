// src/lib/leads/cleanup-classify.ts
//
// Pure classifier for the aggressive-cleanup endpoint (P0.2). Decides, per lead,
// whether to KEEP, ARCHIVE (to Dead Leads, recoverable) or DELETE (gone).
//
// PURE: no Sheets, no network. All decisions from the lead row + isChain().
// Lucas's rules (2026-06-05, aggressive-cleanup-spec):
//   KEEP always   — any engaged lead (contacted status OR has email history).
//   DELETE if uncontacted AND (no email OR chain OR reviews < 15).
//   ARCHIVE        — the rest of the uncontacted leads (mid-quality, kept for later).
//
// Note: Google rating (<4.0) is in the spec but not stored on the Lead row, so
// it is not checked here. reviews<15 + chain + no-email carry the deletion.

import { isChain } from "../chains.ts";
import type { Lead } from "../sheets.ts";

export type CleanupDecision = "keep" | "archive" | "delete";

export interface CleanupClassification {
  decision: CleanupDecision;
  reason: string;
}

const ENGAGED_STATUSES = ["kontaktet", "sendt", "replied", "bounced", "interesseret", "interested", "called", "client"];
const MIN_REVIEWS = 15;

/** A lead is "engaged" (sacred — never touched) if its status shows any contact
 *  or it carries email-send history / an inbound reply. */
export function isEngaged(lead: Pick<Lead, "status" | "emailSentAt" | "emailStatus">): boolean {
  const status = (lead.status || "").toLowerCase();
  if (ENGAGED_STATUSES.some((s) => status.includes(s))) return true;
  if ((lead.emailSentAt || "").trim()) return true;
  const es = (lead.emailStatus || "").trim().toLowerCase();
  if (es && es !== "new") return true; // sent/opened/replied/bounced/messenger-queued
  return false;
}

export function classifyLeadForCleanup(lead: Lead): CleanupClassification {
  if (isEngaged(lead)) return { decision: "keep", reason: "engaged/has-history" };

  // Uncontacted — hard-delete triggers (any one).
  if (!(lead.email || "").trim()) return { decision: "delete", reason: "no-email" };
  if (isChain(lead.name)) return { decision: "delete", reason: "chain" };
  if ((lead.reviewsCount || 0) < MIN_REVIEWS) return { decision: "delete", reason: `few-reviews (<${MIN_REVIEWS})` };

  // Uncontacted but decent — archive (recoverable) rather than delete.
  return { decision: "archive", reason: "uncontacted-mid-quality" };
}

export interface CleanupSummary {
  total: number;
  wouldDelete: number;
  wouldArchive: number;
  wouldKeep: number;
  byReason: Record<string, number>;
}

/** Roll a classified list into counts (used by both dryRun and execute paths). */
export function summarizeCleanup(classified: CleanupClassification[]): CleanupSummary {
  const byReason: Record<string, number> = {};
  let wouldDelete = 0, wouldArchive = 0, wouldKeep = 0;
  for (const c of classified) {
    byReason[c.reason] = (byReason[c.reason] || 0) + 1;
    if (c.decision === "delete") wouldDelete++;
    else if (c.decision === "archive") wouldArchive++;
    else wouldKeep++;
  }
  return { total: classified.length, wouldDelete, wouldArchive, wouldKeep, byReason };
}
