// Single source of truth for "is this lead OK to email?"
//
// Previously these predicates were duplicated across:
//   - src/lib/queue.ts          (today's review-queue computation)
//   - src/app/api/email/bulk-send/route.ts        (manual bulk send)
//   - src/app/api/email/send-followups/route.ts   (follow-up batch)
//
// Drift between copies caused subtle bugs where the review UI showed one set
// of eligible leads and the actual send path filtered a different set. Both
// paths now import from here.

import type { Lead } from "./sheets.ts";
import { isChain, isPublicSector } from "./chains.ts";

export const PROFESSIONAL_BRANCHES = [
  "advokat", "revisor", "fysioterapi", "tandlæge", "optiker", "kiropraktor", "apotek",
] as const;

export const FOLLOWUP_DAYS = 5;

// Placeholder regex / banned domains used to catch obviously fake emails that
// slipped through earlier scrapes. Defense-in-depth: bulk-find-emails already
// filters these, but a bad row may have been saved before the filter existed.
const PLACEHOLDER_REGEX = /noreply|no-reply|donotreply|do-not-reply|example\.|@example|sentry|w3\.org|schema|jquery|googletagmanager|googleapis|@google\.com|facebook\.com|instagram\.com|linkedin|twitter|name@domain|user@domain|email@email|your@|youremail|test@test|@test\.dk$|@test\.com$|eksempel|firstname|lastname|sample@|placeholder|john\.doe|jane\.doe|@yourcompany|@yourdomain|@goodresto|@eksempel|@domain\.com$|@email\.com$|wixpress|cloudflare|wordpress\.com|sentry\.io|godaddy|hostnet|simply\.com/i;

const BANNED_DOMAINS = new Set([
  "example.com", "example.dk", "example.org",
  "domain.com", "domain.dk", "email.com",
  "test.com", "test.dk",
  "yourcompany.com", "yourdomain.com",
  "eksempel.dk", "eksempel.com",
  "goodresto.com", "placeholder.com", "sample.com",
]);

export function isCleanEmail(email: string): boolean {
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

export function isProfessional(branch: string): boolean {
  const b = branch.toLowerCase();
  return PROFESSIONAL_BRANCHES.some((p) => b.includes(p));
}

// Sheets status/tier values carry stray whitespace/casing — normalize before any
// suppression check, or a "bounced "/"replied "/"Skip" value slips the gate and
// the lead gets (re-)mailed. Same class as canSendTo.
const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

export function isEligibleForCold(lead: Lead): boolean {
  if (!isCleanEmail(lead.email)) return false;
  if (lead.emailSentAt) return false;
  if (norm(lead.emailStatus) === "bounced") return false;
  if (norm(lead.status) === "skip" || norm(lead.status) === "client") return false;
  if (norm(lead.websiteQualityTier) === "modern") return false;
  if (isChain(lead.name)) return false;
  if (isPublicSector(lead.name)) return false;
  if (lead.skipReason) return false;
  if (/kommune@|kommunen@|\.kommune\.|^visit[a-z]+@/i.test(lead.email)) return false;
  if (/offentligt kontor|skulptur|forening \/ organisation/i.test(lead.branch)) return false;
  const minScore = isProfessional(lead.branch) ? 70 : 50;
  return lead.score >= minScore;
}

// isEligibleForFollowup blev fjernet sammen med /api/email/send-followups
// (ruten mistede sit UI-indgangspunkt da followup-review blev arkiveret).
// Historikken har implementeringen hvis follow-ups genopstår.
