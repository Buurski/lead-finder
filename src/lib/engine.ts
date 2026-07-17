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
import { isChain } from "./chains.ts";
import { isBlacklisted } from "./tone-mixer.ts";
import { composeColdEmail } from "./compose.ts";
import { appendDrafts, newDraftId, readQueue } from "./queue.ts";
import type { QueueDraft } from "./queue.ts";
import { pickHybridSender } from "./senders.ts";
import type { SenderId } from "./senders.ts";
import { compositeScore } from "./leads/composite-score.ts";
import type { CompositeSignals } from "./leads/composite-score.ts";
import { diversifyByFamily } from "./leads/diversify.ts";
import { isUnworkedStatus } from "./leads/pick-filter.ts";
import { isContactable, contactedEmailBlock } from "./leads/contactable.ts";
import { leadChannel } from "./leads/channel.ts";
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
  // Which Gmail identity the engine just assigned to this draft (hybrid
  // allocation, see senders.ts). Populated on "collected" only.
  sender?: SenderId;
}

export interface EngineOptions {
  limit?: number;
  dryRun?: boolean;
  leadName?: string;
  // Restrict the daily-batch PICK to these exact lead names (lower-cased match).
  // Used by /leadgen's "Lav udkast på valgte" — Lucas hand-picks rows in the feed
  // and only those become drafts. Still email-channel only (the engine drafts emails).
  allowNames?: string[];
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
    return "Voice: humble hobby salgselev, warm, no price/kr, no robot-CTA, 2 demos. Do NOT sign — the pipeline appends the sender's signature.";
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
  // New deep-research signals (optional). Cowork writes these into enrichedInfo.deepResearch:
  //   websiteTechAge: "modern" | "dated" | "legacy"
  //   socialRecencyDays: number (days since last FB/IG post)
  //   competitorGap: number 0–1 (opportunity vs local same-branch competitors)
  const techAge = dr.websiteTechAge === "modern" || dr.websiteTechAge === "dated" || dr.websiteTechAge === "legacy"
    ? dr.websiteTechAge : undefined;

  const signals: CompositeSignals = {
    madeByBureau: Boolean(dr.madeByBureau),
    emailQuality: tier ? EMAIL_TIER_QUALITY[tier] : undefined,
    reviewVelocity: typeof vel90 === "number" ? vel90 / 3 : undefined, // 90d → per-month
    mobileScore: num(dr.lighthouseScoreMobile),
    websiteTechAge: techAge,
    socialRecencyDays: num(dr.socialRecencyDays),
    competitorGap: num(dr.competitorGap),
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
  leadName: string | undefined,
  allowNames?: string[]
): Promise<{ leads: Array<ResearchLead & { id?: string }>; source: "sheets" | "fixture" }> {
  // Exact-name allowlist (lower-cased) for the "draft selected" path.
  const allow = allowNames && allowNames.length
    ? new Set(allowNames.map((n) => n.trim().toLowerCase()))
    : null;
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
      // Email/domæne-blok (2026-07-17): samme forretning kan stå i to rækker med
      // forskellig stavning/by men samme email — isContactable pr. række fanger
      // det ikke. Blokér kandidater hvis email/firma-domæne matcher en kontaktet.
      const emailBlock = contactedEmailBlock(all as Lead[]);
      candidates = all
        .map((l, i) => ({ lead: l as Lead, id: String(i + 2) }))
        // Un-worked = blank or "new" status (Sheets returns "" for a blank cell
        // when a later column is filled, so a strict === "new" wrongly dropped
        // real un-worked leads). Normalized in isUnworkedStatus. PLUS isContactable —
        // status alone misses a lead that was emailed (emailSentAt/emailStatus set)
        // but whose status cell stayed "new"; that must never be re-drafted.
        // + email-channel only: the engine drafts EMAILS, so a lead must have a
        // usable email. No-email leads (Facebook → Messenger, phone → SMS) are
        // handled by their own channels and must never become an email draft.
        .filter(({ lead }) => lead.name && isUnworkedStatus(lead.status) && isContactable(lead) && leadChannel(lead) === "email"
          && !emailBlock.blocks(lead.email)
          && (!allow || allow.has(lead.name.trim().toLowerCase())))
        .map(({ lead, id }) => ({ rl: { ...toResearchLead(lead as unknown as Record<string, unknown>), id }, comp: enrichedComposite(lead) }))
        .sort((a, b) => b.comp - a.comp)
        .map((x) => x.rl);
      // Spread the batch across branch families so it's a MIX, not all one
      // branch — the single best lead still leads, then picks rotate branches.
      // Skip the family spread for an explicit allowlist: Lucas already chose the rows.
      if (!allow) candidates = diversifyByFamily(candidates, (c) => c.branch);
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

  const { leads, source } = await pickLeads(opts.leadName, opts.allowNames);

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

  // Hybrid sender allocation (2026-06-17). Read the existing queue ONCE so
  // we know who's already busy in the last 14 days, then for each draft
  // re-evaluate including the drafts we've already assigned in THIS run —
  // that way a single engine run balances itself too (one big batch doesn't
  // dump 100 % on whichever sender had the lower recent count).
  const existingQueue = await readQueue().catch(() => [] as QueueDraft[]);
  const senderHistory = (d: { sender?: SenderId | null; status: string; updatedAt: string }) => ({
    sender: d.sender ?? null,
    status: d.status,
    updatedAt: d.updatedAt,
  });
  const historyForPick = (): Array<{ sender: SenderId | null; status: string; updatedAt: string }> => [
    ...existingQueue.map(senderHistory),
    ...collected.map(senderHistory),
  ];

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

    // Kæder skal aldrig nå køen (2026-07-16) — før fangede kun canSendTo dem
    // ved afsendelse, så de lå godkendbare i /godkendelse. "skriv til X"
    // bypasser IKKE dette — kæder mailes aldrig.
    if (isChain(lead.name)) {
      skipped.push({ name: lead.name, reason: "kæde (isChain)" });
      emit({ phase: "skip", idx: collected.length, total: limit, name: lead.name, reason: "kæde (isChain)" });
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
    // Hybrid allokering: hent den Gmail-identity der har sendt færrest i
    // de sidste 14 dage. Ties → Lucas (defaultSender), se senders.ts.
    const sender = pickHybridSender(historyForPick());
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
      sender,
    });
    emit({ phase: "collected", idx: collected.length, total: limit, name: lead.name, sender });
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
