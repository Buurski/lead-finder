// contactable.ts — the single "may we contact this lead (again)?" predicate.
//
// Hard rule (Lucas): if we've ever emailed/messaged/contacted a business, or they
// said no, or they're already a client/maybe-later — they must NOT resurface as a
// fresh lead anywhere (lead-gen feed, Messenger, /leads default, the engine). One
// predicate, used everywhere, so the rule can't drift between surfaces.
//
// Pure. Strip-safe so the node engine + scheduled tooling can import it.

import type { Lead } from "../sheets.ts";

const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

// Any status that means "already worked / handled / off-limits".
const WORKED_STATUS = new Set([
  "client", "kunde", "skip", "frasorteret",
  "not-interested", "ikke-interesseret", "ikke interesseret", "nej",
  "interested", "interesseret", "called", "ringet",
  "messenger", "messenger-queued", "contacted", "kontaktet", "replied",
]);

// Any emailStatus that means an email already went out (or got a reply).
const CONTACTED_EMAIL = new Set(["sent", "opened", "clicked", "replied", "followup"]);

/**
 * True only when a lead has NEVER been contacted and is free to approach:
 * blank/"new" status, no sent email, no reply. False for everything we've touched.
 * (callbackDate / maybe-later is handled by the caller when it wants to resurface
 * those on their due date — by default this treats a set callbackDate as "leave it".)
 */
export function isContactable(lead: Lead): boolean {
  if (WORKED_STATUS.has(norm(lead.status))) return false;
  if (lead.emailSentAt && lead.emailSentAt.trim()) return false;
  if (CONTACTED_EMAIL.has(norm(lead.emailStatus))) return false;
  if (lead.followupSentAt && lead.followupSentAt.trim()) return false;
  // A future callback means "we're already waiting on this one" → not a fresh lead.
  if (lead.callbackDate && lead.callbackDate.trim()) return false;
  return true;
}

/**
 * Lowercased names of every lead we must NOT re-surface (i.e. !isContactable).
 * Used to filter the Cowork vault feeds (data/leadgen.json, data/messenger.json)
 * against the live Sheets contacted-state — a Cowork task sources businesses fresh
 * and doesn't know we've already emailed/messaged some of them. Match by name.
 */
export function suppressedNameSet(leads: Lead[]): Set<string> {
  const s = new Set<string>();
  for (const l of leads) {
    if (!isContactable(l)) {
      const n = norm(l.name);
      if (n) s.add(n);
    }
  }
  return s;
}
