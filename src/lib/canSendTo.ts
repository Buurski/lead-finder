// canSendTo.ts — the single send-gate. Every send path (bulk, follow-up, single)
// runs a lead through this before mailing, so the "never mail a chain / public
// body / hostile responder / bounced address" rules live in ONE place instead of
// being re-implemented per route. Pure + synchronous + fully testable.

import { isChain } from "./chains.ts";
import { isPublicEntity } from "./qualify.ts";
import { isBlacklisted } from "./tone-mixer.ts";

export type BlockReason =
  | "hostile"
  | "chain"
  | "public"
  | "no-email"
  | "bad-email"
  | "bounced"
  | "replied"
  | "unsubscribed"
  | "duplicate"
  | "skip";

export interface SendCandidate {
  name: string;
  branch?: string;
  email?: string;
  emailStatus?: string; // "" | "sent" | "replied" | "bounced" | "unsubscribed" | ...
  status?: string; // lead status: "skip" excludes
}

export interface SendDecision {
  ok: boolean;
  reason?: BlockReason;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function canSendTo(lead: SendCandidate, opts: { seenEmails?: Set<string> } = {}): SendDecision {
  if (isBlacklisted(lead.name)) return { ok: false, reason: "hostile" };
  // Normalize lead status: Sheets values arrive with stray whitespace/casing
  // ("Skip", "skip "), so trim+lowercase before the equality gate — otherwise a
  // skip-marked lead slips through and gets mailed.
  if ((lead.status || "").trim().toLowerCase() === "skip") return { ok: false, reason: "skip" };
  if (isChain(lead.name, lead.branch ? [lead.branch] : undefined)) return { ok: false, reason: "chain" };
  if (isPublicEntity(lead)) return { ok: false, reason: "public" };

  const email = (lead.email || "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "no-email" };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "bad-email" };

  // Same normalization for emailStatus — a "bounced "/"Replied"/"unsubscribed "
  // value from the sheet must still block. Untrimmed it would re-mail a replier
  // or, worse, an unsubscriber (compliance breach).
  const st = (lead.emailStatus || "").trim().toLowerCase();
  if (st === "bounced") return { ok: false, reason: "bounced" };
  if (st === "replied") return { ok: false, reason: "replied" };
  if (st === "unsubscribed" || st === "unsubscribe") return { ok: false, reason: "unsubscribed" };

  if (opts.seenEmails) {
    if (opts.seenEmails.has(email)) return { ok: false, reason: "duplicate" };
    opts.seenEmails.add(email);
  }

  return { ok: true };
}
