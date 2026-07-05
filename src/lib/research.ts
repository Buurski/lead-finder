// research.ts — RESEARCH step (brief §8).
//
// research_lead(lead) gathers 1-2 genuine, lead-specific "hooks" plus a
// professionalism verdict and a branch-appropriate demo pair. It is built to
// DEGRADE GRACEFULLY: every network call is wrapped, short-timeouts, and it
// never throws. With no network / no creds (e.g. the engine's --dry-run) it
// falls back to hooks mined from the lead's own enrichedInfo + notes so the
// pipeline always produces something.
//
// Strip-safe (no enums/namespaces) so the node engine can import it directly.

import { isProfessionalEnough } from "./qualify.ts";
import type { QualifyVerdict, QualifyLead } from "./qualify.ts";
import { pickDemos } from "./demos.ts";
import type { Demo } from "./demos.ts";
import { generate, isAiEnabled } from "./ai.ts";
import { achievementStrings } from "./achievements.ts";

export interface ResearchLead extends QualifyLead {
  notes: string;
  enrichedInfo: string;
  city: string;
}

export interface ResearchResult {
  hooks: string[];
  professionalismVerdict: QualifyVerdict;
  branch: string;
  demoPair: Demo[];
  sources: string[];
  achievements: string[]; // awards/titles for the "Tillykke" opener (Block 3)
}

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

async function fetchWithRetry(url: string, attempts: number, timeoutMs: number): Promise<string | null> {
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": CHROME_UA, Accept: "text/html,application/xhtml+xml" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) return await res.text();
    } catch {
      /* retry */
    }
  }
  return null;
}

// Real Chrome UA first, then r.jina.ai markdown fallback for JS-heavy / blocked sites.
async function fetchSite(website: string): Promise<string | null> {
  const url = website.startsWith("http") ? website : `https://${website}`;
  const direct = await fetchWithRetry(url, 2, 8000);
  if (direct) return direct;
  try {
    const res = await fetch(`https://r.jina.ai/${url}`, {
      headers: { "User-Agent": CHROME_UA, Accept: "text/plain", "X-Return-Format": "markdown" },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) return await res.text();
  } catch {
    /* give up */
  }
  return null;
}

// Pull short, human-readable hooks from a blob of site/markdown text.
function hooksFromText(text: string): string[] {
  const hooks: string[] = [];
  const clean = text.replace(/\s+/g, " ").trim();

  // "Om os" / about blurbs, taglines, "siden 19xx/20xx" establishment markers.
  const sinceMatch = clean.match(/(siden|since|etableret|grundlagt)\s+(\d{4})/i);
  if (sinceMatch) hooks.push(`etableret ${sinceMatch[2]}`);

  const award = clean.match(/(prisvinder|award|kåret|anbefalet af|certificeret|autoriseret)[^.]{0,60}/i);
  if (award) hooks.push(award[0].trim());

  // Premium service mentions are strong beauty/craft hooks.
  const svc = clean.match(/\b(balayage|extensions?|keratin|bryllup|microblading|wax|hudpleje|kosmetolog|specialist|håndlavet|økologisk|bæredygtig)\b/i);
  if (svc) hooks.push(`nævner ${svc[1].toLowerCase()}`);

  return hooks.slice(0, 2);
}

// enrichedInfo is JSON written when a lead is marked Interesseret; notes is free
// text. Both are reliable offline hook sources.
function hooksFromLead(lead: ResearchLead): string[] {
  const hooks: string[] = [];
  if (lead.enrichedInfo) {
    try {
      const j = JSON.parse(lead.enrichedInfo);
      for (const key of ["summary", "highlight", "specialty", "about", "review"]) {
        if (typeof j[key] === "string" && j[key].trim()) {
          hooks.push(j[key].trim().slice(0, 140));
        }
      }
    } catch {
      if (lead.enrichedInfo.length < 200) hooks.push(lead.enrichedInfo.trim());
    }
  }
  if (lead.notes && lead.notes.trim() && hooks.length < 2) {
    hooks.push(lead.notes.trim().slice(0, 140));
  }
  if (lead.reviewsCount >= 50) hooks.push(`${lead.reviewsCount} anmeldelser på Google`);
  return hooks.slice(0, 2);
}

// Apify FB/IG actor — only attempted when a token is present. Graceful skip
// otherwise. Kept deliberately defensive: any shape/timeout error -> [].
async function hooksFromApify(lead: ResearchLead): Promise<string[]> {
  // OFF by default — Apify bills per run and burns out fast on bulk passes.
  // The website scrape + Google reviews + AI cover the hook need. Set
  // ENABLE_APIFY=1 only for a deliberate, small manual run.
  if (process.env.ENABLE_APIFY !== "1") return [];
  const token = process.env.APIFY_TOKEN;
  if (!token || !lead.website) return [];
  const handle = extractSocialHandle(lead.website);
  if (!handle) return [];
  try {
    const actor = handle.platform === "instagram" ? "apify~instagram-scraper" : "apify~facebook-pages-scraper";
    const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        handle.platform === "instagram"
          ? { directUrls: [`https://www.instagram.com/${handle.id}/`], resultsLimit: 3 }
          : { startUrls: [{ url: `https://www.facebook.com/${handle.id}` }] }
      ),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return [];
    const items = (await res.json()) as Array<Record<string, unknown>>;
    const out: string[] = [];
    for (const it of items.slice(0, 2)) {
      const cap = (it.caption ?? it.text ?? it.bio) as string | undefined;
      if (cap && typeof cap === "string") out.push(cap.trim().slice(0, 140));
    }
    return out;
  } catch {
    return [];
  }
}

// Google Business reviews via Places API (New) — token-gated on
// GOOGLE_PLACES_API_KEY. Returns short, genuine customer-voice snippets that
// make strong, specific openings ("en kunde fremhæver jeres ..."). Defensive:
// any error / no key -> []. Returns { hooks, raw } so the AI layer also gets the
// fuller review text as corpus.
async function googleReviews(lead: ResearchLead): Promise<{ hooks: string[]; raw: string }> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) return { hooks: [], raw: "" };
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.displayName,places.rating,places.userRatingCount,places.reviews",
      },
      body: JSON.stringify({
        textQuery: `${lead.name} ${lead.city}`.trim(),
        languageCode: "da",
        maxResultCount: 1,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return { hooks: [], raw: "" };
    const data = (await res.json()) as {
      places?: Array<{ reviews?: Array<{ text?: { text?: string }; rating?: number }> }>;
    };
    const reviews = data.places?.[0]?.reviews ?? [];
    const texts = reviews
      .map((r) => (r.text?.text ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 20);
    const raw = texts.join(" | ").slice(0, 3000);
    // One concise hook from the best CLEAN, POSITIVE, high-rated review. We must
    // exclude two failure modes that deterministic copy can't otherwise catch:
    //   - negative-sentiment quotes (a complaint used as praise = disaster),
    //   - price/kr mentions (collide with the no-price voice rule and get the
    //     whole opener line stripped by the draft sanitizer).
    const NEGATIVE = /\b(sløv|uorganiseret|dårlig|elendig|skuffe|skuffet|desværre|langsom|ventetid|koldt?\s+mad|beskidt|uhøflig|rod(et)?|fejl|surt|træls|ikke\s+(god|værd|tilfreds|imponer)|for\s+dyrt|aldrig\s+igen|undgå)\b/i;
    const PRICEY = /\b(\d+\s?kr|kr\.?|kroner|pris(en|er)?|billig|dyrt|beløb|tilbud)\b/i;
    const best = reviews
      .filter((r) => (r.rating ?? 0) >= 4)
      .map((r) => (r.text?.text ?? "").replace(/\s+/g, " ").trim())
      .filter((t) => t.length > 30 && !NEGATIVE.test(t) && !PRICEY.test(t))
      .sort((a, b) => b.length - a.length)[0];
    const hooks: string[] = [];
    if (best) hooks.push(`en kunde fremhæver: "${best.slice(0, 90)}${best.length > 90 ? "…" : ""}"`);
    return { hooks, raw };
  } catch {
    return { hooks: [], raw: "" };
  }
}

function extractSocialHandle(website: string): { platform: string; id: string } | null {
  const m = website.match(/(?:facebook|fb)\.com\/([A-Za-z0-9.\-_]+)/i);
  if (m) return { platform: "facebook", id: m[1] };
  const ig = website.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  if (ig) return { platform: "instagram", id: ig[1] };
  return null;
}

// ---- optional AI layer (Sonnet 4.6) -------------------------------------
// Both helpers are gated by isAiEnabled() and wrapped to NEVER throw — with no
// key they are no-ops and the deterministic results stand.

// RESEARCH -> Sonnet: distil the single most genuine, human opening hook from
// the raw collected text. Returns a short Danish phrase or null.
async function refineHookWithAI(lead: ResearchLead, rawText: string, candidates: string[]): Promise<string | null> {
  if (!isAiEnabled()) return null;
  const corpus = rawText.replace(/\s+/g, " ").trim().slice(0, 4000);
  if (!corpus && candidates.length === 0) return null;
  const res = await generate({
    task: "research",
    system:
      "Du finder ÉN ægte, specifik detalje om en dansk virksomhed, der kan bruges som varm åbning i en personlig besked. " +
      "Svar med PRÆCIS én kort dansk sætning (max 12 ord), ingen anførselstegn, ingen forklaring. " +
      "Opfind ALDRIG noget — brug kun hvad teksten understøtter. Hvis intet konkret findes, svar 'INGEN'.",
    prompt: [
      `Virksomhed: ${lead.name} (${lead.branch}, ${lead.city}).`,
      candidates.length ? `Mulige detaljer fundet: ${candidates.join(" | ")}.` : "",
      corpus ? `Rå tekst fra deres web/sociale medier:\n${corpus}` : "",
    ].filter(Boolean).join("\n\n"),
    maxTokens: 60,
    temperature: 0.4,
  });
  if (!res) return null;
  const line = res.text.split("\n")[0].trim().replace(/^["'»]|["'«]$/g, "").trim();
  if (!line || /^ingen\b/i.test(line) || line.length < 6) return null;
  return line.slice(0, 140);
}

// QUALIFY -> Sonnet: tiebreaker for the borderline band only. Never overrides a
// hard cheap/personal drop; only adjudicates "thin profile" cases where the
// deterministic gate is genuinely unsure.
function isBorderline(verdict: QualifyVerdict): boolean {
  return !verdict.ok && /thin profile/.test(verdict.reason);
}

async function aiProfessionalism(lead: ResearchLead, deterministic: QualifyVerdict): Promise<QualifyVerdict> {
  if (!isAiEnabled() || !isBorderline(deterministic)) return deterministic;
  const res = await generate({
    task: "qualify",
    system:
      "Du vurderer om en dansk virksomhed er etableret nok til realistisk at investere i en ny hjemmeside (5-15k). " +
      "Svar PRÆCIS med 'JA: <kort grund>' eller 'NEJ: <kort grund>'. Vær konservativ: i tvivl, svar NEJ.",
    prompt:
      `Navn: ${lead.name}\nBranche: ${lead.branch}\nBy: ${lead.city}\n` +
      `Score: ${lead.score}\nAnmeldelser: ${lead.reviewsCount}\nWebsite-tier: ${lead.websiteQualityTier || "ukendt"}\n` +
      `Noter: ${(lead.notes || "").slice(0, 200)}`,
    maxTokens: 60,
    temperature: 0.2,
  });
  if (!res) return deterministic;
  const t = res.text.trim();
  if (/^ja\b/i.test(t)) return { ok: true, reason: `AI-rescue: ${t.replace(/^ja:?\s*/i, "").slice(0, 120)}` };
  if (/^nej\b/i.test(t)) return { ok: false, reason: `AI-bekræftet drop: ${t.replace(/^nej:?\s*/i, "").slice(0, 120)}` };
  return deterministic;
}

// Rank hooks by how specific/personal they are, so the draft opener uses the
// strongest material first. A genuine customer review quote beats a bare review
// count beats generic notes. Stable sort within a tier.
function hookScore(h: string): number {
  if (/^en kunde fremhæver/i.test(h)) return 100; // real customer voice
  if (/(prisvinder|award|kåret|anbefalet|certificeret|autoriseret)/i.test(h)) return 80;
  if (/^(nævner|etableret|siden|grundlagt)/i.test(h)) return 60;
  if (/anmeldelser på Google/i.test(h)) return 20; // generic, fine as fallback
  return 45; // notes / enrichedInfo text
}
function rankHooks(hooks: string[]): string[] {
  return hooks
    .map((h, i) => ({ h, i, s: hookScore(h) }))
    .sort((a, b) => (b.s - a.s) || (a.i - b.i))
    .map((x) => x.h);
}

export interface ResearchOptions {
  useAI?: boolean;      // default true; engine sets false for --dry-run
  useNetwork?: boolean; // default true; engine sets false for --dry-run (no paid API hits)
}

export async function research_lead(lead: ResearchLead, opts: ResearchOptions = {}): Promise<ResearchResult> {
  const useAI = opts.useAI ?? true;
  const useNetwork = opts.useNetwork ?? true;
  const sources: string[] = [];
  const hookSet = new Set<string>();
  const rawParts: string[] = [];

  // 1. Lead-local hooks first (always available, offline-safe).
  for (const h of hooksFromLead(lead)) {
    if (h) { hookSet.add(h); sources.push("lead"); }
  }

  // 2. Live web (skipped cleanly when offline / no site / dry-run).
  if (useNetwork && lead.website && lead.websiteStatus !== "none") {
    const html = await fetchSite(lead.website);
    if (html) {
      rawParts.push(html);
      for (const h of hooksFromText(html)) { hookSet.add(h); sources.push("web"); }
    }
  }

  // 3. FB/IG via Apify (token-gated; skipped in dry-run to avoid paid hits).
  if (useNetwork) {
    for (const h of await hooksFromApify(lead)) {
      if (h) { hookSet.add(h); sources.push("apify"); rawParts.push(h); }
    }
    // 3b. Google Business reviews (token-gated on GOOGLE_PLACES_API_KEY).
    const gr = await googleReviews(lead);
    for (const h of gr.hooks) { if (h) { hookSet.add(h); sources.push("google-reviews"); } }
    if (gr.raw) rawParts.push(gr.raw);
  }

  let hooks = rankHooks([...hookSet].filter(Boolean)).slice(0, 3);

  // 4. AI refinement (Sonnet) — promotes one distilled hook to the front.
  //    No-op without a key or when useAI is false; deterministic hooks remain.
  const aiHook = useAI ? await refineHookWithAI(lead, rawParts.join("\n\n"), hooks) : null;
  if (aiHook) {
    hooks = [aiHook, ...hooks.filter((h) => h !== aiHook)].slice(0, 3);
    sources.push("ai");
  }

  // 5. Professionalism — deterministic gate, with an AI tiebreaker on the
  //    borderline "thin profile" band only.
  const detVerdict = isProfessionalEnough(lead);
  const verdict = useAI ? await aiProfessionalism(lead, detVerdict) : detVerdict;

  // Achievement detection (Block 3) — scan everything we gathered + the lead's
  // own notes/enrichedInfo for awards/titles that power the "Tillykke" opener.
  const achievements = achievementStrings(
    { text: rawParts.join("\n\n"), source: "web/reviews" },
    { text: `${lead.notes || ""}\n${lead.enrichedInfo || ""}`, source: "lead" },
  );

  return {
    hooks,
    professionalismVerdict: verdict,
    branch: lead.branch,
    demoPair: pickDemos(lead.branch, lead.name),
    sources: [...new Set(sources)],
    achievements,
  };
}
