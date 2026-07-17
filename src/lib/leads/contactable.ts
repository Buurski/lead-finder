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

// ── email/domæne-blok (session 5, 2026-07-17) ────────────────────────────
// Navn+by-nøglen fanger ikke samme forretning under to stavninger/byer — men
// emailen er den samme. Derfor: all-time blok på eksakt email + på domæne når
// domænet er firma-ejet (ikke-freemail). Freemail (gmail/hotmail/…) blokerer
// kun eksakt adresse — to forskellige frisører kan begge bruge gmail.
// Regex spejler FREEMAIL_REGEX i email-finder.ts; inlinet her fordi
// email-finder trækker node:dns ind, og contactable skal forblive ren/strip-safe.
const FREEMAIL_REGEX = /^(gmail|hotmail|outlook|yahoo|live|msn|protonmail|proton|icloud|me|aol|mail|email)\.[a-z.]+$/i;

export const emailDomainOf = (email: string): string => {
  const e = norm(email);
  const at = e.lastIndexOf("@");
  return at > 0 ? e.slice(at + 1) : "";
};

export interface EmailBlock {
  emails: Set<string>;   // eksakte kontaktede adresser (lowercased)
  domains: Set<string>;  // kontaktede ikke-freemail-domæner
  blocks(email: string | undefined): boolean;
}

export function makeEmailBlock(): EmailBlock {
  const emails = new Set<string>();
  const domains = new Set<string>();
  return {
    emails,
    domains,
    blocks(email: string | undefined): boolean {
      const e = norm(email);
      if (!e || !e.includes("@")) return false;
      if (emails.has(e)) return true;
      const d = emailDomainOf(e);
      return Boolean(d) && domains.has(d);
    },
  };
}

/** Registrér én kontaktet email i blokken (eksakt + evt. domæne). */
export function addEmailToBlock(block: EmailBlock, email: string | undefined): void {
  const e = norm(email);
  if (!e || !e.includes("@")) return;
  block.emails.add(e);
  const d = emailDomainOf(e);
  if (d && !FREEMAIL_REGEX.test(d)) block.domains.add(d);
}

/** Email-blok bygget fra Sheets: alle !isContactable-leads' emails. */
export function contactedEmailBlock(leads: Lead[]): EmailBlock {
  const block = makeEmailBlock();
  for (const l of leads) {
    if (!isContactable(l)) addEmailToBlock(block, l.email);
  }
  return block;
}
