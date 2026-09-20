// jev-shadow.ts — nightly shadow scoring of leads with Jev. OBSERVES ONLY:
// writes go to a separate store namespace, never to the Sheet, never to
// Lead.enrichedInfo. Jev is never the sole decision maker for anything that
// sends/deletes/changes lead status — this just records a judgment for a
// human (or later, a gated automation) to look at.

import crypto from "node:crypto";
import { store } from "../store.ts";
import type { Lead } from "../sheets.ts";
import { fetchPageText } from "../fetch-page.ts";
import { jevAsk, type JevAnswers } from "../jev.ts";
import { SITE_QUESTIONS, MIN_WORDS_FOR_JUDGMENT, THIN_WORDS, siteState, toJudgment, attractiveness, type SiteJudgment } from "./site-judgments.ts";
import { isChain } from "../chains.ts";

export interface JevShadowRecord {
  leadId: string;
  name: string;
  city: string;
  branch: string;
  url: string;
  sheetScore: number;
  sheetTier: string;
  sheetStatus: string;
  /** Google review count at scrape time (sheet column T); size signal for the policy. */
  reviewsCount?: number;
  /** Facebook/Instagram profil-URL'er fundet på forsiden (gratis, samme fetch). */
  socials?: { facebook?: string; instagram?: string };
  /** Raw Jev answers (distributions + confidence) for later calibration. */
  answers?: JevAnswers | null;
  judgment: SiteJudgment | null;
  attractiveness: number | null;
  reasons: string[];
  isChain: boolean;
  model: string | null;
  judgedAt: string;
  inputFingerprint: string | null;
  error?: string;
}

export const SHADOW_PREFIX = "jev-shadow/";
const LOG_KEY = "jev-shadow-log";

export async function loadShadow(): Promise<JevShadowRecord[]> {
  const keys = await store.list(SHADOW_PREFIX);
  const recs = await Promise.all(keys.map((k) => store.get<JevShadowRecord>(k)));
  // Policy is code, judgments are data: recompute chain flag + attractiveness
  // at read time so a weight or heuristic fix applies to stored records
  // without re-running Jev (council 2026-09-20).
  return recs.filter((r): r is JevShadowRecord => !!r).map(rescore);
}

export function rescore(rec: JevShadowRecord): JevShadowRecord {
  const chain = isChain(rec.name);
  if (!rec.judgment) return { ...rec, isChain: chain };
  const attr = attractiveness(rec.judgment, { isChain: chain, reviewsCount: rec.reviewsCount });
  return { ...rec, isChain: chain, attractiveness: attr.score, reasons: attr.reasons };
}

export async function saveShadow(rec: JevShadowRecord): Promise<void> {
  // Append-only log FIRST (audit source of truth, Codex JEV-REV-005). If the
  // put then fails, the lead simply has no current record and is re-judged
  // next night; the reverse order could leave an unlogged visible record.
  await store.append(LOG_KEY, rec);
  await store.put(SHADOW_PREFIX + rec.leadId, rec);
}

const INELIGIBLE_STATUS = new Set(["client", "dead"]);

/** Leads eligible for (re)scoring: has a live-ish website, not a client/dead lead. */
export function pickBatch(leads: Lead[], existing: JevShadowRecord[], max: number): Lead[] {
  const judgedAt = new Map(existing.map((r) => [r.leadId, r.judgedAt]));
  const eligible = leads.filter(
    (l) => l.websiteStatus === "ok" && l.website.trim() !== "" && !INELIGIBLE_STATUS.has(l.status),
  );
  const sorted = [...eligible].sort((a, b) => {
    const ja = judgedAt.get(a.id);
    const jb = judgedAt.get(b.id);
    if (!ja && !jb) return 0;
    if (!ja) return -1; // never-judged first
    if (!jb) return 1;
    return ja < jb ? -1 : ja > jb ? 1 : 0; // oldest judgedAt first
  });
  return sorted.slice(0, max);
}

/** Eligible leads that have never been judged (what the nightly cron still has to cover). */
export function countUnjudged(leads: Lead[], existing: JevShadowRecord[]): number {
  const seen = new Set(existing.map((r) => r.leadId));
  return pickBatch(leads, [], Number.MAX_SAFE_INTEGER).filter((l) => !seen.has(l.id)).length;
}

export async function judgeLead(lead: Lead): Promise<JevShadowRecord> {
  const base: Omit<JevShadowRecord, "judgment" | "attractiveness" | "reasons" | "model" | "inputFingerprint" | "error"> = {
    leadId: lead.id,
    name: lead.name,
    city: lead.city,
    branch: lead.branch,
    url: lead.website,
    sheetScore: lead.score,
    sheetTier: lead.websiteQualityTier,
    sheetStatus: lead.status,
    reviewsCount: lead.reviewsCount,
    // Name only. `extra` extends the CHAIN_CONTAINS list, so passing the branch
    // ("Frisør") flagged every salon as a chain (seen in the first shadow run).
    isChain: isChain(lead.name),
    judgedAt: new Date().toISOString(),
  };

  const page = await fetchPageText(lead.website);
  if (!page) {
    return { ...base, judgment: null, attractiveness: null, reasons: [], model: null, inputFingerprint: null, error: "fetch" };
  }
  // Input-quality gate (Lucas 2026-09-20, the Alchemist case): a JavaScript-
  // rendered shell has almost no text, and Jev would confidently judge the
  // shell as "dated". No text, no judgment.
  if (page.wordCount < MIN_WORDS_FOR_JUDGMENT) {
    return { ...base, judgment: null, attractiveness: null, reasons: [`kun ${page.wordCount} ord i HTML (JavaScript-side?) — vurder manuelt`], model: null, inputFingerprint: null, error: "thin-page" };
  }

  const result = await jevAsk(siteState(page, lead), SITE_QUESTIONS, { timeoutMs: 15_000 });
  const judgment = toJudgment(result?.answers);
  const fingerprint = crypto.createHash("sha256").update(page.text).digest("hex");
  if (!judgment) {
    return { ...base, judgment: null, attractiveness: null, reasons: [], model: result?.model ?? null, inputFingerprint: fingerprint, error: "no-judgment" };
  }
  const attr = attractiveness(judgment, { isChain: base.isChain, reviewsCount: lead.reviewsCount });
  const socials = page.socials && (page.socials.facebook || page.socials.instagram) ? page.socials : undefined;
  const reasons = page.wordCount < THIN_WORDS ? [...attr.reasons, `tynd side (${page.wordCount} ord) — lav sikkerhed`] : attr.reasons;
  return {
    ...base,
    socials,
    answers: result?.answers ?? null, // full distributions + confidence, for calibration later
    judgment,
    attractiveness: attr.score,
    reasons,
    model: result?.model ?? null,
    inputFingerprint: fingerprint,
  };
}
