// sms/select.ts — pick the SMS-channel leads (phone, no email, no Facebook) to text,
// ranked by attractiveness (stored composite score), best first. Mirrors the
// Messenger select pattern. Pure.

import type { Lead } from "../sheets.ts";
import { leadChannel, normalizePhone } from "../leads/channel.ts";
import { isContactable } from "../leads/contactable.ts";
import { isUnworkedStatus } from "../leads/pick-filter.ts";
import { buildSmsDraft } from "./compose.ts";

export interface SmsCandidate {
  id: string;
  name: string;
  branch: string;
  city: string;
  reviews: number;
  score: number;
  phone: string;   // raw
  tel: string;     // normalized +45…
  draft: string;
}

export function isSmsEligible(lead: Lead): boolean {
  return Boolean(lead.name) && isUnworkedStatus(lead.status) && isContactable(lead) && leadChannel(lead) === "sms";
}

export function selectSmsCandidates(leads: Lead[], opts: { limit?: number; excludeIds?: Set<string> } = {}): SmsCandidate[] {
  const limit = opts.limit ?? 20;
  const exclude = opts.excludeIds ?? new Set<string>();
  return leads
    .filter((l) => isSmsEligible(l) && !exclude.has(l.id))
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, limit)
    .map((l) => ({
      id: l.id,
      name: l.name,
      branch: l.branch,
      city: l.city,
      reviews: l.reviewsCount || 0,
      score: Math.round(l.score || 0),
      phone: l.phone,
      tel: normalizePhone(l.phone) || "",
      draft: buildSmsDraft({ name: l.name, branch: l.branch, city: l.city, reviews: l.reviewsCount || 0 }),
    }));
}
