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
  | "shared-email"
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

// En adresse der står på 3+ forskellige virksomheder er næsten altid en platform,
// et bureau eller en tilfældig person — ikke forretningen (22/9: 25 kold-mails var
// gået til info@grouponline.dk, 12 til én privat gmail). Aldrig mail dem.
export const SHARED_EMAIL_MIN = 3;

/** Adresser der optræder på mindst SHARED_EMAIL_MIN leads med forskellige navne. */
export function sharedEmailSet(leads: Array<{ name: string; email?: string }>): Set<string> {
  const names = new Map<string, Set<string>>();
  for (const l of leads) {
    const e = (l.email || "").trim().toLowerCase();
    if (!e.includes("@")) continue;
    const set = names.get(e) ?? new Set<string>();
    set.add(l.name.trim().toLowerCase());
    names.set(e, set);
  }
  return new Set([...names].filter(([, n]) => n.size >= SHARED_EMAIL_MIN).map(([e]) => e));
}

// Pladsholder-adresser fra scrapet (demo-skabeloner, "user@domain.com" osv.).
const PLACEHOLDER_EMAIL = /@(domain\.com|example\.(com|org|dk)|demolink\.org|email\.com)$/;

export function canSendTo(
  lead: SendCandidate,
  opts: { seenEmails?: Set<string>; sharedEmails?: Set<string> } = {},
): SendDecision {
  if (isBlacklisted(lead.name)) return { ok: false, reason: "hostile" };
  // Normalize lead status: Sheets values arrive with stray whitespace/casing
  // ("Skip", "skip "), so trim+lowercase before the equality gate — otherwise a
  // skip-marked lead slips through and gets mailed.
  if ((lead.status || "").trim().toLowerCase() === "skip") return { ok: false, reason: "skip" };
  // Chain check on the NAME only. (Do NOT pass branch as `extra` — isChain treats
  // extra entries as chain-name substrings, so a branch like "Frisør"/"café" would
  // false-flag every salon/café as a chain. The original bug behind 0-sent.)
  if (isChain(lead.name)) return { ok: false, reason: "chain" };
  if (isPublicEntity(lead)) return { ok: false, reason: "public" };

  const email = (lead.email || "").trim().toLowerCase();
  if (!email) return { ok: false, reason: "no-email" };
  if (!EMAIL_RE.test(email)) return { ok: false, reason: "bad-email" };
  if (PLACEHOLDER_EMAIL.test(email)) return { ok: false, reason: "bad-email" };
  if (opts.sharedEmails?.has(email)) return { ok: false, reason: "shared-email" };

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
