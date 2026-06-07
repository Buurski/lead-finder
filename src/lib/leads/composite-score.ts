// src/lib/leads/composite-score.ts
//
// Composite lead score — a single 0–100 number that blends the existing base
// score with the richer signals we gather during research/enrichment.
//
// PURE FUNCTION. No I/O, no Sheets, no network, no Date.now() — fully
// deterministic so it is trivial to unit-test and safe to call anywhere
// (scrape pipeline, verify-all, UI sort). All "live" data is passed in.
//
// Weighting (Lucas's decision, handoff 2026-06-05):
//   base ................ 40%  (existing scoreLead 0–100)
//   review-velocity ..... 15%  (reviews/month momentum)
//   email-quality ....... 10%  (deliverable, non-role inbox)
//   mobile-score ........ 10%  (PageSpeed mobile, weak site = opportunity-neutral)
//   sleeping-beauty ..... +15  flat bonus (great business, weak/no website)
//   made-by-bureau ...... −20  cap penalty (NOT a hard drop — bureaus switch)
//   branch-relevance .... ×0.5–1.2 multiplier (beauty up, professional down)
//
// Combination order:
//   positives = 40·base + 15·velocity + 10·email + 10·mobile  (each term 0–1)
//   positives += 15  if sleeping-beauty
//   relevanced = positives · branchMultiplier
//   final = relevanced − bureauPenalty
//   clamp 0–100, round
//
// The headroom (positives max 90, ×1.2 = 108) is intentional: it lets a
// stand-out beauty lead reach a true 100 after the relevance lift.

import type { Lead } from "../sheets";
import type { ResearchResult } from "../research";

/** Extra live signals that don't live on the Lead row yet. All optional. */
export interface CompositeSignals {
  /** Google rating 0–5. Falls back to deriving from base if absent. */
  rating?: number;
  /** Reviews gained per month, if we have a time series. */
  reviewVelocity?: number;
  /** Email deliverability/quality 0–1 (1 = personal deliverable inbox). */
  emailQuality?: number;
  /** PageSpeed mobile score 0–100. */
  mobileScore?: number;
  /** Site/email fingerprint matched a known agency/bureau footer. */
  madeByBureau?: boolean;
  /** Override branch (e.g. research re-classified it). */
  branch?: string;
  // --- Deep-research signals (Cowork supplies these in enrichedInfo; optional,
  //     neutral when absent so existing scores are unchanged). ---
  /** Website tech generation. legacy/dated platform = clear upgrade opportunity. */
  websiteTechAge?: "modern" | "dated" | "legacy";
  /** Days since last social (FB/IG) post. Fresh = active business missing a site. */
  socialRecencyDays?: number;
  /** 0–1: opportunity gap vs local same-branch competitors (1 = big gap). */
  competitorGap?: number;
}

export interface CompositeBreakdown {
  base: number;
  reviewVelocity: number;
  emailQuality: number;
  mobile: number;
  sleepingBeautyBonus: number;
  techAgeBonus: number;
  socialRecencyBonus: number;
  competitorGapBonus: number;
  branchMultiplier: number;
  bureauPenalty: number;
  positivesBeforeMultiplier: number;
}

export interface CompositeScoreResult {
  /** Final 0–100 integer. */
  score: number;
  breakdown: CompositeBreakdown;
}

const clamp01 = (n: number): number => (n < 0 ? 0 : n > 1 ? 1 : n);
const clamp = (n: number, lo: number, hi: number): number =>
  n < lo ? lo : n > hi ? hi : n;

/**
 * Branch-relevance multiplier (0.5–1.2).
 * Lucas's targeting preference (CLAUDE.md 2026-06-03): mix of branches, beauty
 * weighted UP, restaurants kept (they work), service/trades/retail in the
 * middle, professional services down (harder to win, higher bar required).
 */
export function branchRelevanceMultiplier(branch: string | undefined): number {
  const b = (branch ?? "").toLowerCase();
  if (!b) return 0.85; // unknown → slightly below neutral

  // Beauty & personal care — weighted up
  if (/(skønhed|hud|negle|vippe|frisør|frisor|barber|klinik|hudpleje|massage|spa|wellness|kosmet|brow|lash|tatover)/.test(b))
    return 1.2;

  // Food & experience — kept, they convert
  if (/(restaurant|café|cafe|bistro|pizzeria|bageri|konditori|catering|food|spiseri|kro)/.test(b))
    return 1.05;

  // Service & trades — solid mid
  if (/(tømrer|tomrer|maler|elektriker|vvs|blikkenslager|tagdækker|tagdaekker|murer|rengøring|rengoring|vinduespudser|gartner|handyman|smed|snedker|montør|montor|flytte|kloak)/.test(b))
    return 0.95;

  // Retail & misc local
  if (/(butik|shop|forretning|fotograf|blomster|frugt|deli)/.test(b))
    return 0.9;

  // Professional services — down (need score ≥70 anyway, harder, pricier sites)
  if (/(advokat|revisor|fysioterapeut|fysio|tandlæge|tandlaege|optiker|ejendomsmægler|maegler|mægler|konsulent|bogholder)/.test(b))
    return 0.7;

  return 0.85; // unmatched local SMB → neutral-ish
}

export type BranchFamily = "beauty" | "food" | "trade" | "retail" | "professional" | "other";

/** Coarse branch family — used to diversify a PICK batch so it isn't all one
 *  branch (Lucas: keep a MIX, beauty weighted up). Mirrors the multiplier buckets. */
export function branchFamily(branch: string | undefined): BranchFamily {
  const b = (branch ?? "").toLowerCase();
  if (/(skønhed|hud|negle|vippe|frisør|frisor|barber|klinik|hudpleje|massage|spa|wellness|kosmet|brow|lash|tatover)/.test(b)) return "beauty";
  if (/(restaurant|café|cafe|bistro|pizzeria|bageri|konditori|catering|food|spiseri|kro)/.test(b)) return "food";
  if (/(tømrer|tomrer|maler|elektriker|vvs|blikkenslager|tagdækker|tagdaekker|murer|rengøring|rengoring|vinduespudser|gartner|handyman|smed|snedker|montør|montor|flytte|kloak)/.test(b)) return "trade";
  if (/(butik|shop|forretning|fotograf|blomster|frugt|deli)/.test(b)) return "retail";
  if (/(advokat|revisor|fysioterapeut|fysio|tandlæge|tandlaege|optiker|ejendomsmægler|maegler|mægler|konsulent|bogholder)/.test(b)) return "professional";
  return "other";
}

/** Sleeping beauty: strong reputation, weak/no website = our ideal target. */
export function isSleepingBeauty(
  rating: number,
  reviewsCount: number,
  websiteStatus: Lead["websiteStatus"],
): boolean {
  const weakSite = websiteStatus === "none" || websiteStatus === "dead" || websiteStatus === "old";
  return rating >= 4.5 && reviewsCount >= 20 && weakSite;
}

/**
 * Derive a 0–1 review-velocity term. Prefer a real reviews/month figure; a
 * velocity of ≥5/month saturates to 1.0. When no time series exists, fall back
 * to a log proxy on raw review count (more reviews ⇒ likely more momentum).
 */
function velocityTerm(reviewsCount: number, reviewVelocity?: number): number {
  if (typeof reviewVelocity === "number" && reviewVelocity >= 0) {
    return clamp01(reviewVelocity / 5);
  }
  // proxy: log10(reviews+1)/2 → ~100 reviews ≈ 1.0, ~10 reviews ≈ 0.5
  return clamp01(Math.log10(reviewsCount + 1) / 2);
}

/**
 * Derive a 0–1 email-quality term when no explicit score is given.
 * Personal/named inbox > role inbox (info@/kontakt@/mail@) > none.
 */
function emailTerm(email: string, emailQuality?: number): number {
  if (typeof emailQuality === "number") return clamp01(emailQuality);
  const e = (email ?? "").trim().toLowerCase();
  if (!e || !e.includes("@")) return 0;
  const local = e.split("@")[0];
  const role = /^(info|kontakt|mail|post|hello|hej|booking|salg|admin|noreply|no-reply|firma|kontor)$/.test(local);
  return role ? 0.4 : 0.6;
}

// Deep-research bonuses (all neutral/0 when the signal is absent).
//   tech-age:        legacy +6, dated +3, modern 0  (older platform = upgrade pitch)
//   social-recency:  ≤30d +4, ≤120d +1, else −2     (active social = engaged target)
//   competitor-gap:  0–1 × 6                          (bigger gap = bigger opportunity)
function techAgeBonus(t?: "modern" | "dated" | "legacy"): number {
  return t === "legacy" ? 6 : t === "dated" ? 3 : 0;
}
function socialRecencyBonus(days?: number): number {
  if (typeof days !== "number" || days < 0) return 0;
  if (days <= 30) return 4;
  if (days <= 120) return 1;
  return -2;
}
function competitorGapBonus(gap?: number): number {
  if (typeof gap !== "number") return 0;
  return clamp01(gap) * 6;
}

/**
 * Compute the composite score for a lead.
 *
 * @param lead     The lead row (provides base score, reviews, website status, email, branch).
 * @param research Optional research result (may re-classify branch).
 * @param signals  Optional live signals (rating, velocity, mobile, bureau flag, deep-research).
 */
export function compositeScore(
  lead: Lead,
  research?: ResearchResult,
  signals: CompositeSignals = {},
): CompositeScoreResult {
  const branch = signals.branch ?? research?.branch ?? lead.branch;
  const rating =
    typeof signals.rating === "number"
      ? signals.rating
      : // crude fallback: map base 0–100 onto a 0–5 rating proxy
        clamp((lead.score / 100) * 5, 0, 5);

  // --- normalized 0–1 terms ---
  const base01 = clamp01(lead.score / 100);
  const vel01 = velocityTerm(lead.reviewsCount, signals.reviewVelocity);
  const email01 = emailTerm(lead.email, signals.emailQuality);
  const noSite = lead.websiteStatus === "none" || lead.websiteStatus === "dead";
  const mobile01 =
    typeof signals.mobileScore === "number"
      ? clamp01(signals.mobileScore / 100)
      : noSite
        ? 0 // no live site ⇒ no mobile experience to credit
        : 0.5; // site exists but unmeasured ⇒ neutral

  // --- weighted positives (max 75) ---
  let positives = 40 * base01 + 15 * vel01 + 10 * email01 + 10 * mobile01;

  // --- sleeping-beauty flat bonus (max +15 → 90) ---
  const sleeping = isSleepingBeauty(rating, lead.reviewsCount, lead.websiteStatus);
  const sleepingBeautyBonus = sleeping ? 15 : 0;
  positives += sleepingBeautyBonus;

  // --- deep-research bonuses (0 unless Cowork supplied the signal) ---
  const techBonus = techAgeBonus(signals.websiteTechAge);
  const socialBonus = socialRecencyBonus(signals.socialRecencyDays);
  const compBonus = competitorGapBonus(signals.competitorGap);
  positives += techBonus + socialBonus + compBonus;

  // --- branch-relevance multiplier (0.5–1.2) ---
  const branchMultiplier = branchRelevanceMultiplier(branch);
  let final = positives * branchMultiplier;

  // --- made-by-bureau penalty (cap −20, never a hard drop) ---
  const bureauPenalty = signals.madeByBureau ? 20 : 0;
  final -= bureauPenalty;

  const score = Math.round(clamp(final, 0, 100));

  return {
    score,
    breakdown: {
      base: 40 * base01,
      reviewVelocity: 15 * vel01,
      emailQuality: 10 * email01,
      mobile: 10 * mobile01,
      sleepingBeautyBonus,
      techAgeBonus: techBonus,
      socialRecencyBonus: socialBonus,
      competitorGapBonus: compBonus,
      branchMultiplier,
      bureauPenalty,
      positivesBeforeMultiplier: positives,
    },
  };
}
