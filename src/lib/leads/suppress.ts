// suppress.ts — the deterministic "never contact this business twice" gate for the
// COLD-OUTREACH ingress points (/api/approve/add used by the daily-lead-gen Cowork
// task, and /api/cron/ingest-leadgen). The Cowork agent re-scrapes Google Places
// fresh every day and was relied on to dedup MANUALLY against Sheets — which it
// can't do reliably (LLM, place_id leadIds that never map to a Sheets row, danish
// name variants). This module makes the rule code, not a prompt.
//
// What blocks an incoming cold draft:
//   1. An existing queue draft for the same business that is in-flight or already
//      contacted (status pending/approved/edited/sent), OR rejected within 14 days.
//   2. A Sheets lead for the same business that is no longer contactable
//      (emailSentAt set, status moved off "new", reply/followup, callback).
//   3. An excluded branch (medical/health — see branch-policy.ts).
//
// Matching is by Google place_id (exact) AND by a normalized name+city key, so a
// business survives both re-scrapes (same place_id) and the place_id↔Sheets-row
// leadId mismatch (name+city). Over-suppression beats double-sending: Lucas has a
// ~5000-lead backlog, so dropping a rare same-name collision costs nothing; a
// duplicate cold email costs trust.
//
// NOTE: the in-app engine (engine.ts → appendDrafts) is intentionally NOT routed
// through here — it picks from Sheets, already enforces isContactable at PICK, and
// relies on "sent" NOT blocking so it can do follow-up rounds. This gate is only for
// the externally-sourced cold ingress.
//
// Strip-safe so node tooling can import it.

import type { QueueDraft } from "../queue.ts";
import type { Lead } from "../sheets.ts";
import { isContactable } from "./contactable.ts";
import { isExcludedBranch } from "./branch-policy.ts";

const REJECT_BLOCK_MS = 14 * 24 * 60 * 60 * 1000;

// Strong business key: fold danish chars, strip apostrophes/punctuation, collapse
// whitespace. "Pinseria C´ho Fame" / "Pinseria C'ho Fame" / "pinseria cho fame" all
// collapse to "pinseria cho fame".
export function bizKey(name: string | undefined, city?: string | undefined): string {
  const norm = (s: string | undefined): string =>
    (s ?? "")
      .toLowerCase()
      .replace(/æ/g, "ae")
      .replace(/ø/g, "oe")
      .replace(/å/g, "aa")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/['´`‘’]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  const n = norm(name);
  const c = norm(city);
  return c ? `${n}|${c}` : n;
}

export interface BlockSets {
  ids: Set<string>;   // place_id / leadId of blocked businesses
  keys: Set<string>;  // bizKey(name, city) of blocked businesses
  contactedAvailable: boolean; // false when Sheets couldn't be read (gate degraded)
}

function rejectedAt(d: QueueDraft): number {
  const t = d.updatedAt ?? d.createdAt;
  const n = t ? new Date(t).getTime() : 0;
  return Number.isFinite(n) ? n : 0;
}

// Build the block sets from the current queue + (optional) Sheets leads. Pass
// sheetsLeads=null when Sheets is unreachable — the queue half of the gate still
// works and contactedAvailable is reported false so callers can log the degrade.
export function buildBlockSets(
  queue: QueueDraft[],
  sheetsLeads: Lead[] | null,
  now: number = Date.now(),
): BlockSets {
  const ids = new Set<string>();
  const keys = new Set<string>();
  const cutoff = now - REJECT_BLOCK_MS;

  for (const d of queue) {
    const inFlightOrSent =
      d.status === "pending" || d.status === "approved" || d.status === "edited" || d.status === "sent";
    const recentlyRejected = d.status === "rejected" && rejectedAt(d) > cutoff;
    if (!inFlightOrSent && !recentlyRejected) continue;
    if (d.leadId) ids.add(d.leadId);
    const k = bizKey(d.name, d.city);
    if (k) keys.add(k);
  }

  for (const l of sheetsLeads ?? []) {
    if (isContactable(l)) continue;
    const k = bizKey(l.name, l.city);
    if (k) keys.add(k);
  }

  return { ids, keys, contactedAvailable: sheetsLeads !== null };
}

export interface IncomingBiz {
  leadId?: string;
  name?: string;
  city?: string;
  branch?: string;
}

// Decide whether one incoming cold draft must be skipped. Returns a reason string
// (for the agent's summary / logs) or null when it's clear to queue.
export function suppressionReason(b: IncomingBiz, sets: BlockSets): string | null {
  if (isExcludedBranch(b.branch, b.name)) return "branche ekskluderet (medicinsk/sundhed)";
  if (b.leadId && sets.ids.has(b.leadId)) return "allerede i kø/kontaktet (place_id)";
  const k = bizKey(b.name, b.city);
  if (k && sets.keys.has(k)) return "allerede i kø/kontaktet (navn)";
  return null;
}
