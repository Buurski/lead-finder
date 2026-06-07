// engine.ts — the daily outreach engine (brief Del 4). ONE sequential loop:
//
//   PICK -> RESEARCH -> QUALIFY -> DRAFT -> COLLECT
//
// It writes 10-15 personal drafts into the approval queue (.send_queue/
// approval_queue.json) that the /approve UI reads. It NEVER sends mail — it only
// fills the queue; Lucas approves in /approve.
//
// Two entry shapes:
//   runEngine({ limit })            -> daily batch
//   runEngine({ leadName: "Vida" }) -> "skriv til X": research+draft one named lead
//
// Offline-safe: PICK tries Google Sheets, and on any failure (no creds / no net,
// e.g. the --dry-run proof) falls back to an embedded fixture so the loop always
// produces drafts. Google + googleapis are loaded lazily so the offline path
// never touches them.
//
// Strip-safe (no enums/namespaces) so the plain-node CLI can import it directly.

import fs from "node:fs";
import path from "node:path";

import { research_lead } from "./research.ts";
import type { ResearchLead } from "./research.ts";
import { draft_personal_message } from "./draft.ts";
import { hardDrop } from "./qualify.ts";
import { isBlacklisted } from "./tone-mixer.ts";
import { composeColdEmail } from "./compose.ts";
import { appendDrafts, newDraftId } from "./queue.ts";
import type { QueueDraft } from "./queue.ts";
import { compositeScore } from "./leads/composite-score.ts";
import type { CompositeSignals } from "./leads/composite-score.ts";
import { diversifyByFamily } from "./leads/diversify.ts";
import { isUnworkedStatus } from "./leads/pick-filter.ts";
import { isContactable } from "./leads/contactable.ts";
import type { Lead } from "./sheets.ts";

// Progress events emitted during a run so a UI can show the engine working
// (it's a slow sequential loop — one Opus draft per lead). Purely observational:
// the callback never changes engine behaviour, and a thrown callback is swallowed.
export interface EngineProgress {
  // "pick" once the candidate list is known (total = target draft count);
  // "research"/"draft" before each step; "skip" when a lead is filtered;
  // "collected" after a draft lands; "done" at the end.
  phase: "pick" | "research" | "draft" | "skip" | "collected" | "done";
  idx: number; // drafts collected so far
  total: number; // target draft count (the limit)
  name?: string; // current lead
  reason?: string; // for "skip"
}

export interface EngineOptions {
  limit?: number;
  dryRun?: boolean;
  leadName?: string;
  // When false, run the full loop but DO NOT write to the approval queue. Used by
  // the web "preview" action so Lucas can see what the engine would produce before
  // an explicit confirm. Defaults to true so the CLI keeps filling the queue.
  persist?: boolean;
  // Optional progress sink (web streaming UI). Never affects the result.
  onProgress?: (ev: EngineProgress) => void;
}

export interface EngineSummary {
  picked: number;
  qualifiedOut: number;
  drafted: number;
  written: number;
  source: "sheets" | "fixture";
  dryRun: boolean;
  skipped: Array<{ name: string; reason: string }>;
  drafts: QueueDraft[];
}

// Embedded fixture — guarantees the dry-run proof works with zero external files
// or credentials. A .send_queue/sample_leads.json, if present, overrides this.
const FIXTURE_LEADS: ResearchLead[] = [
  {
    name: "Salon Lumière", branch: "frisør / skønhed", city: "Aarhus",
    score: 81, website: "", websiteStatus: "none", websiteQualityTier: "",
    reviewsCount: 132, notes: "kendt for balayage og bryllupsstyling",
    enrichedInfo: '{"specialty":"balayage, extensions og bryllupsstyling"}',
  },
  {
    name: "Restaurant Nord", branch: "restaurant", city: "Aalborg",
    score: 76, website: "restaurantnord.dk", websiteStatus: "old", websiteQualityTier: "old",
    reviewsCount: 210, notes: "nordisk køkken, sæsonmenu", enrichedInfo: "",
  },
  {
    name: "Atelier Foto", branch: "fotograf", city: "Odense",
    score: 73, website: "", websiteStatus: "none", websiteQualityTier: "",
    reviewsCount: 64, notes: "portræt og bryllup", enrichedInfo: "",
  },
  {
    name: "Bryggens VVS", branch: "vvs", city: "København",
    score: 70, website: "bryggenvvs.dk", websiteStatus: "old", websiteQualityTier: "mediocre",
    reviewsCount: 95, notes: "døgnvagt, 20 års erfaring", enrichedInfo: "",
  },
  {
    name: "Studio Hud & Velvære", branch: "hudpleje / kosmetolog", city: "Vejle",
    score: 79, website: "", websiteStatus: "none", websiteQualityTier: "",
    reviewsCount: 88, notes: "ansigtsbehandlinger, microblading", enrichedInfo: "",
  },
  {
    name: "Den Lille Malermester", branch: "maler", city: "Herning",
    score: 68, website: "", websiteStatus: "none", websiteQualityTier: "",
    reviewsCount: 41, notes: "ind- og udvendigt malerarbejde", enrichedInfo: "",
  },
  // A deliberate hard-drop to prove QUALIFY filters (personal-name shop).
  {
    name: "Frisør Adnan", branch: "frisør", city: "Vejle",
    score: 38, website: "", websiteStatus: "none", websiteQualityTier: "",
    reviewsCount: 4, notes: "", enrichedInfo: "",
  },
  {
    name: "Pizzeria Bella Italia", branch: "pizza", city: "Randers",
    score: 72, website: "bellaitalia-rd.dk", websiteStatus: "old", websiteQualityTier: "old",
    reviewsCount: 156, notes: "stenovnspizza siden 1998", enrichedInfo: "",
  },
  {
    name: "Lounge Negle & Vipper", branch: "negle / vipper", city: "Esbjerg",
    score: 74, website: "", websiteStatus: "none", websiteQualityTier: "",
    reviewsCount: 67, notes: "vippeextensions og neglekunst", enrichedInfo: "",
  },
  {
    name: "Tømrerhuset", branch: "tømrer", city: "Silkeborg",
    score: 71, website: "tomrerhuset.dk", websiteStatus: "old", websiteQualityTier: "mediocre",
    reviewsCount: 83, notes: "tilbygninger og renovering", enrichedInfo: "",
  },
];

function loadVoiceGuide(): string {
  try {
    return fs.readFileSync(path.join(process.cwd(), "src", "lib", "voice-guide.md"), "utf-8");
  } catch {
    return "Voice: humble hobby salgselev, warm, no price/kr, no robot-CTA, 2 demos, end 'Mvh, Lucas'.";
  }
}

function loadFixture(): ResearchLead[] {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), ".send_queue", "sample_leads.json"), "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length) return parsed as ResearchLead[];
  } catch {
    /* use embedded */
  }
  return FIXTURE_LEADS;
}

// Map a sheets Lead (unknown extra fields) to the ResearchLead shape the
// pipeline needs.
function toResearchLead(l: Record<string, unknown>): ResearchLead {
  return {
    name: String(l.name ?? ""),
    branch: String(l.branch ?? ""),
    city: String(l.city ?? ""),
    score: Number(l.score ?? 0),
    website: String(l.website ?? ""),
    websiteStatus: String(l.websiteStatus ?? ""),
    websiteQualityTier: String(l.websiteQualityTier ?? ""),
    reviewsCount: Number(l.reviewsCount ?? 0),
    notes: String(l.notes ?? ""),
    enrichedInfo: String(l.enrichedInfo ?? ""),
  };
}

// Map a Cowork email-quality tier to the 0–1 term compositeScore expects.
const EMAIL_TIER_QUALITY: Record<string, number> = {
  personal: 1, kontakt: 0.6, info: 0.4, generic: 0.2, noreply: 0,
};

// Pull the deep-research enrichment a Cowork session wrote into a lead's
// enrichedInfo (column M, under the `deepResearch` key — see
// /api/leads/deep-research-result). Returns compositeScore signals + the manual
// score delta the session assigned, or null when the lead hasn't been
// deep-researched. Pure + defensive: bad/missing JSON just yields null.
export function deepResearchSignals(enrichedInfo: string): { signals: CompositeSignals; delta: number } | null {
  if (!enrichedInfo) return null;
  let dr: Record<string, unknown> | undefined;
  try {
    const parsed = JSON.parse(enrichedInfo) as Record<string, unknown>;
    const d = parsed?.deepResearch;
    if (d && typeof d === "object") dr = d as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!dr) return null;

  const num = (v: unknown): number | undefined => (typeof v === "number" && isFinite(v) ? v : undefined);
  const tier = typeof dr.emailQualityTier === "string" ? dr.emailQualityTier : undefined;
  const vel90 = num(dr.reviewVelocity90d);

  const signals: CompositeSignals = {
    madeByBureau: Boolean(dr.madeByBureau),
    emailQuality: tier ? EMAIL_TIER_QUALITY[tier] : undefined,
    reviewVelocity: typeof vel90 === "number" ? vel90 / 3 : undefined, // 90d → per-month
    mobileScore: num(dr.lighthouseScoreMobile),
  };
  const delta = num(dr.compositeScoreDelta) ?? 0;
  return { signals, delta };
}

// Composite score for a lead, lifted by any Cowork deep-research enrichment.
// clamp keeps the manual delta from pushing out of 0–100.
export function enrichedComposite(lead: Lead): number {
  const dr = deepResearchSignals(lead.enrichedInfo);
  const base = compositeScore(lead, undefined, dr?.signals ?? {}).score;
  const lifted = base + (dr?.delta ?? 0);
  return lifted < 0 ? 0 : lifted > 100 ? 100 : lifted;
}

// PICK — get candidate leads. Tries Sheets; falls back to fixture on any error.
async function pickLeads(
  leadName: string | undefined
): Promise<{ leads: Array<ResearchLead & { id?: string }>; source: "sheets" | "fixture" }> {
  try {
    const { getLeads } = await import("./sheets.ts");
    const all = await getLeads();
    let candidates = all
      .map((l, i) => ({ ...toResearchLead(l as unknown as Record<string, unknown>), id: String(i + 2) }))
      .filter((l) => l.name);

    if (leadName) {
      const needle = leadName.toLowerCase();
      candidates = candidates.filter((l) => l.name.toLowerCase().includes(needle));
    } else {
      // Daily batch: focus on un-worked leads, best composite score first.
      // Composite blends base score with review-velocity, email/mobile quality,
      // sleeping-beauty bonus and a branch-relevance multiplier (beauty ×1.2,
      // restaurants ×1.05, professional ×0.7) — so the PICK naturally favours
      // the mix Lucas wants (beauty weighted up) instead of raw base score.
      candidates = all
        .map((l, i) => ({ lead: l as Lead, id: String(i + 2) }))
        // Un-worked = blank or "new" status (Sheets returns "" for a blank cell
        // when a later column is filled, so a strict === "new" wrongly dropped
        // real un-worked leads). Normalized in isUnworkedStatus. PLUS isContactable —
        // status alone misses a lead that was emailed (emailSentAt/emailStatus set)
        // but whose status cell stayed "new"; that must never be re-drafted.
        .filter(({ lead }) => lead.name && isUnworkedStatus(lead.status) && isContactable(lead))
        .map(({ lead, id }) => ({ rl: { ...toResearchLead(lead as unknown as Record<string, unknown>), id }, comp: enrichedComposite(lead) }))
        .sort((a, b) => b.comp - a.comp)
        .map((x) => x.rl);
      // Spread the batch across branch families so it's a MIX, not all one
      // branch — the single best lead still leads, then picks rotate branches.
      candidates = diversifyByFamily(candidates, (c) => c.branch);
    }
    return { leads: candidates, source: "sheets" };
  } catch {
    let fixture = loadFixture();
    if (leadName) {
      const needle = leadName.toLowerCase();
      fixture = fixture.filter((l) => l.name.toLowerCase().includes(needle));
    }
    return { leads: fixture, source: "fixture" };
  }
}

export async function runEngine(opts: EngineOptions = {}): Promise<EngineSummary> {
  const limit = opts.leadName ? 1 : Math.max(1, opts.limit ?? 12);
  const dryRun = opts.dryRun ?? false;
  const useLLM = !dryRun; // LLM lift only on real runs (and only if a key is set; see ai.ts)
  const voice = loadVoiceGuide();

  const { leads, source } = await pickLeads(opts.leadName);

  // Safe progress emitter — never let an observer throw break a run.
  const emit = (ev: EngineProgress) => {
    try {
      opts.onProgress?.(ev);
    } catch {
      /* observation only */
    }
  };

  const skipped: Array<{ name: string; reason: string }> = [];
  const collected: QueueDraft[] = [];
  let picked = 0;

  emit({ phase: "pick", idx: 0, total: limit });

  for (const lead of leads) {
    if (collected.length >= limit) break;
    picked++;

    // Hostile blacklist — explicit "never again" responders (OUTREACH_ANALYSIS).
    // Applies even to "skriv til X", they should never be mailed.
    if (isBlacklisted(lead.name)) {
      skipped.push({ name: lead.name, reason: "hostile-blacklist" });
      emit({ phase: "skip", idx: collected.length, total: limit, name: lead.name, reason: "hostile-blacklist" });
      continue;
    }

    // Fast regex pre-filter (cheap QUALIFY layer).
    const dropped = hardDrop(lead.name);
    if (dropped && !opts.leadName) {
      // "skriv til X" bypasses the pre-filter (Lucas chose this lead on purpose).
      skipped.push({ name: lead.name, reason: dropped });
      emit({ phase: "skip", idx: collected.length, total: limit, name: lead.name, reason: dropped });
      continue;
    }

    // RESEARCH (hooks + professionalism verdict + demo pair).
    emit({ phase: "research", idx: collected.length, total: limit, name: lead.name });
    const research = await research_lead(lead, { useAI: useLLM, useNetwork: useLLM });

    // QUALIFY (LLM-style gate; here the establishment gate from qualify.ts).
    if (!research.professionalismVerdict.ok && !opts.leadName) {
      skipped.push({ name: lead.name, reason: research.professionalismVerdict.reason });
      emit({ phase: "skip", idx: collected.length, total: limit, name: lead.name, reason: research.professionalismVerdict.reason });
      continue;
    }

    // DRAFT.
    emit({ phase: "draft", idx: collected.length, total: limit, name: lead.name });
    const draft = await draft_personal_message(lead, research, voice, { useLLM });

    // COMPOSE METADATA (Del 3): record the deterministic tone-mixer combination
    // so a follow-up can deliberately vary the opener, and so send paths know
    // which kind was used. Compose itself shares the same mixer the draft uses.
    let comboId: string | undefined;
    let openerKind: string | undefined;
    try {
      const composed = composeColdEmail({
        name: lead.name,
        branch: lead.branch,
        city: lead.city,
        reviewsCount: lead.reviewsCount,
        websiteStatus: lead.websiteStatus,
        hooks: research.hooks,
        achievements: research.achievements,
      });
      comboId = composed.comboId;
      openerKind = composed.openerKind;
    } catch {
      // compose throws only on a voice violation; the draft path already
      // validated, so just leave the metadata unset.
    }

    // COLLECT.
    const now = new Date().toISOString();
    collected.push({
      id: newDraftId(),
      leadId: (lead as { id?: string }).id ?? "",
      name: lead.name,
      branch: lead.branch,
      city: lead.city,
      hooks: research.hooks,
      demoPair: research.demoPair,
      professionalism: research.professionalismVerdict.reason,
      subject: draft.subject,
      body: draft.body,
      status: "pending",
      source: opts.leadName ? "write-to-x" : "daily-engine",
      createdAt: now,
      updatedAt: now,
      comboId,
      openerKind,
    });
    emit({ phase: "collected", idx: collected.length, total: limit, name: lead.name });
  }

  emit({ phase: "done", idx: collected.length, total: limit });

  // Write to the queue (engine NEVER sends — it only fills the queue).
  // persist:false runs the full loop but writes nothing (web preview path).
  const persist = opts.persist ?? true;
  const written = persist ? collected.length : 0;
  if (written > 0) await appendDrafts(collected);

  return {
    picked,
    qualifiedOut: skipped.length,
    drafted: collected.length,
    written,
    source,
    dryRun,
    skipped,
    drafts: collected,
  };
}
