// messenger/select.ts — choose the best FB-only leads to DM on Messenger.
// Ported from the live digest script's v4/v5 heuristics: FB-page leads with no
// usable email, ≥50 reviews, brand-ish names (drop cheap-keyword / known personal
// names), quota-balanced across branch groups. Pure — takes a Lead[], returns
// ranked candidates with a resolved handle + a ready draft.

import type { Lead } from "../sheets.ts";
import { handleFromWebsite } from "./handle.ts";
import { branchGroupFor, buildMessengerDraft, MSG_PATTERNS } from "./compose.ts";
import type { MsgGroup, MsgPattern } from "./compose.ts";

export interface MessengerCandidate {
  id: string;            // sheet row id (lead.id)
  name: string;
  branch: string;
  city: string;
  reviews: number;
  category: MsgGroup;
  qualityScore: number;
  handle: string;
  fbPageUrl: string;
  messengerUrl: string;
  draft: string;
  pattern: MsgPattern;
  status: "pending" | "sent" | "skipped";
}

const V4_MIN_REVIEWS = 50;
const QUOTAS: Record<MsgGroup, number> = { beauty: 4, food: 5, photo: 2, craftUtility: 2, craft: 2, service: 2 };
const DROP_BRANCHES = /(kommune|bibliotek|skole|gymnasium|hospital|region|borgerservice|jobcenter|politi|kirke|menighed|forening|klub)/i;
const SKIP_STATUSES = new Set(["client", "kunde", "interested", "interesseret", "skip", "frasorteret", "messenger", "messenger-queued", "contacted", "kontaktet", "replied"]);

const CHEAP_RE = /\b(cheap|billig|quick|express|discount|hurtig|low.?cost)\b/i;
const HARD_PERSONAL_NAMES = new Set(["adnan", "walid", "essam", "asim", "sharwan", "shahin", "jonas", "ali", "azar", "therese", "ghariba", "simon", "adnans", "walids", "simons", "alan", "alans", "nermin", "don", "poshya", "arabella", "zin", "ahmad", "hassan", "khaled", "omar", "yusuf", "ibrahim", "mohamed", "muhammad", "mustafa", "peter", "lars", "kenneth", "michael", "anders"]);
const DK_CITIES = new Set(["aalborg", "aarhus", "århus", "odense", "københavn", "esbjerg", "randers", "kolding", "horsens", "vejle", "herning", "silkeborg", "næstved", "fredericia", "viborg", "køge", "holstebro", "taastrup", "slagelse", "hillerød", "helsingør", "sønderborg", "svendborg", "frederiksberg", "tønder", "thisted", "hjørring", "holbæk", "varde", "vejen", "give", "middelfart", "frederikshavn", "nyborg", "aabenraa", "billund", "ringsted", "skive", "skagen", "ribe"]);

interface NameVerdict { hardDrop: boolean; reason: string; boost: number }

export function nameVerdict(name: string): NameVerdict {
  if (!name) return { hardDrop: true, reason: "empty", boost: 0 };
  if (CHEAP_RE.test(name)) return { hardDrop: true, reason: "cheap-keyword", boost: 0 };
  const stripped = name
    .replace(/^(Frisør|Salon|Barber|Barbershop|Hair|Herrefrisør|Frisøren|Hos)\s+/i, "")
    .replace(/\s+(Frisør|Frisørsalon|Herrefrisør|Barbershop|Salon|Hair|Hairstyle)$/i, "")
    .replace(/\s+og\s+Barbershop\b.*$/i, "")
    .replace(/\s+v\/.*$/i, "").trim();
  const words = stripped.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const w = words[0].toLowerCase().replace(/['’']s$/, "");
    if (HARD_PERSONAL_NAMES.has(w)) return { hardDrop: true, reason: "known-personal-name", boost: 0 };
    if (DK_CITIES.has(w)) return { hardDrop: false, reason: "city-as-brand", boost: 2 };
    return { hardDrop: false, reason: "single-word-unknown", boost: -2 };
  }
  let boost = 0;
  if (/\b(studio|lounge|koncept|concept|house|huset|salonen|klippehuset|atelier|lab)\b/i.test(name)) boost += 2;
  if (/\bby\s+[A-ZÆØÅ]/.test(name)) boost += 2;
  if (/\b(klippe|klippet|krølle|skønhed|hår|håret|saksen|fletning|værk)\b/i.test(name)) boost += 1;
  return { hardDrop: false, reason: "multi-word", boost };
}

function hasUsableEmail(email: string): boolean {
  const e = (email || "").trim().toLowerCase();
  return Boolean(e) && e.includes("@") && e !== "none";
}

/** Is this lead eligible for a Messenger DM? (FB-only, no email, enough reviews,
 *  brand-ish name, resolvable handle, not already worked.) */
export function isMessengerEligible(lead: Lead): boolean {
  const branch = (lead.branch || "").toLowerCase();
  const website = (lead.website || "").toLowerCase();
  if (DROP_BRANCHES.test(branch) || DROP_BRANCHES.test(lead.name || "")) return false;
  if (website && !website.includes("facebook.com")) return false; // has a real site already
  if (hasUsableEmail(lead.email)) return false;                    // reachable by email → not this channel
  if ((lead.reviewsCount || 0) < V4_MIN_REVIEWS) return false;
  if (SKIP_STATUSES.has((lead.status || "").toLowerCase())) return false;
  if (SKIP_STATUSES.has((lead.emailStatus || "").toLowerCase())) return false;
  if (nameVerdict(lead.name).hardDrop) return false;
  return handleFromWebsite(lead.website) != null;
}

/**
 * Select up to `limit` Messenger candidates from a lead list, quota-balanced
 * across branch groups, ranked by quality score, excluding ids in `excludeIds`
 * (already sent/skipped).
 */
export function selectMessengerCandidates(
  leads: Lead[],
  opts: { limit?: number; excludeIds?: Set<string> } = {},
): MessengerCandidate[] {
  const limit = opts.limit ?? 12;
  const exclude = opts.excludeIds ?? new Set<string>();

  const scored = leads
    .filter((l) => l.id && !exclude.has(l.id) && isMessengerEligible(l))
    .map((l) => {
      const v = nameVerdict(l.name);
      let qBoost = v.boost;
      if (l.city && l.name.toLowerCase().includes(l.city.toLowerCase())) qBoost += 2;
      const qualityScore = (l.reviewsCount || 0) * (1 + 0.15 * qBoost);
      const category = branchGroupFor(l.branch, l.name);
      return { lead: l, qualityScore, category };
    })
    .sort((a, b) => b.qualityScore - a.qualityScore);

  // Quota-aware pick: cap per category, then allow overflow to hit the target.
  const counts: Partial<Record<MsgGroup, number>> = {};
  const picked: typeof scored = [];
  for (const s of scored) {
    if (picked.length >= limit) break;
    const cap = QUOTAS[s.category] ?? 2;
    if ((counts[s.category] ?? 0) < cap) {
      counts[s.category] = (counts[s.category] ?? 0) + 1;
      picked.push(s);
    }
  }
  if (picked.length < limit) {
    for (const s of scored) {
      if (picked.length >= limit) break;
      if (!picked.includes(s)) picked.push(s);
    }
  }

  return picked.map((s, idx) => {
    const resolved = handleFromWebsite(s.lead.website)!; // eligibility guaranteed non-null
    const pattern = MSG_PATTERNS[idx % MSG_PATTERNS.length] as MsgPattern;
    const draft = buildMessengerDraft({
      name: s.lead.name, branch: s.lead.branch, city: s.lead.city,
      reviews: s.lead.reviewsCount || 0, pattern,
    });
    return {
      id: s.lead.id,
      name: s.lead.name,
      branch: s.lead.branch,
      city: s.lead.city,
      reviews: s.lead.reviewsCount || 0,
      category: s.category,
      qualityScore: Math.round(s.qualityScore),
      handle: resolved.handle,
      fbPageUrl: resolved.fbPageUrl,
      messengerUrl: resolved.messengerUrl,
      draft: draft.text,
      pattern,
      status: "pending" as const,
    };
  });
}
