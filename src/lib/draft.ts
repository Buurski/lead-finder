// draft.ts — DRAFT step (brief §7). Turns a lead + research into a warm,
// human, Lucas-voiced message with exactly two demos. A strict validator
// (validateDraft) enforces the HARD RULES from voice-guide.md: no price/kr,
// no robot CTA. The deterministic composer is guaranteed to pass the
// validator; an optional LLM lift (ANTHROPIC_API_KEY) can produce richer copy
// but its output is validated and falls back to deterministic on any failure.
//
// Strip-safe (no enums/namespaces) so the node engine can import it directly.

import type { ResearchResult, ResearchLead } from "./research.ts";
import type { Demo } from "./demos.ts";
import { generate, isAiEnabled } from "./ai.ts";
import { mixForLead } from "./tone-mixer.ts";

export interface Draft {
  subject: string;
  body: string;
  demoPair: [Demo, Demo];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

// ---- HARD RULES (voice-guide.md) -----------------------------------------

// Price / kr / money — never allowed.
const PRICE_PATTERNS: Array<[RegExp, string]> = [
  [/\b\d+\s?kr\b/i, "kr-beløb"],
  [/\bkr\.?\b/i, "kr-reference"],
  [/\bkroner\b/i, "ordet 'kroner'"],
  [/\bdkk\b/i, "DKK-reference"],
  [/€/, "euro-tegn"],
  [/\b\d{1,3}[.,]\d{3}\b/, "pengebeløb"], // require thousands separator so a bare year (2026) is not a false "price"
  [/\b\d+\s?k\b/i, "pris som '5k'"],
  [/\bprisvenlig\w*/i, "ordet 'prisvenlig'"],
  [/\bbillig\w*/i, "ordet 'billig'"],
  [/\bfra\s+\d+/i, "'fra X' pris"],
  [/\bpris(en|er|tilbud)?\b/i, "ordet 'pris'"],
  [/\bgratis\b/i, "ordet 'gratis' (lyder som tilbud)"],
];

// Robot / hard-sell CTA + template-isms — never allowed.
const ROBOT_PATTERNS: Array<[RegExp, string]> = [
  [/skriv\s+ja\b/i, "'skriv ja'"],
  [/send\s+(mig\s+)?(en\s+)?mockup/i, "'send mockup'"],
  [/helt\s+uforpligtende/i, "'helt uforpligtende'"],
  [/skriv\s+hvis\s+du\s+vil\s+(se|høre)\s+mere/i, "'skriv hvis du vil se mere'"],
  [/lille\s+idé\s+til/i, "robot-frasen 'lille idé til'"],
  [/:\)/, "smiley :)"],
  [/jeg\s+har\s+lavet\s+(sider|hjemmesider)\s+for\s+\d+/i, "kunde-volumen-pral"],
];

export function validateDraft(text: string): ValidationResult {
  const errors: string[] = [];
  for (const [re, label] of PRICE_PATTERNS) {
    if (re.test(text)) errors.push(`pris/penge: ${label}`);
  }
  for (const [re, label] of ROBOT_PATTERNS) {
    if (re.test(text)) errors.push(`robot-CTA: ${label}`);
  }
  return { ok: errors.length === 0, errors };
}

// ---- Deterministic composer ----------------------------------------------

function firstName(name: string): string {
  // For the greeting we address the business by name as-is (Danish businesses
  // are usually greeted by business name, not a person).
  return name.trim();
}

// Stable per-lead index so 12 mails in a batch don't share one opener, without
// introducing randomness (same lead -> same draft, re-runnable / testable).
function pick<T>(name: string, variants: T[]): T {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return variants[h % variants.length];
}

// Pull a clean, sentence-bounded quote out of a `en kunde fremhæver: "…"` hook.
// Trims mid-word truncation (the Places snippet often ends "…" or "og").
function cleanQuote(hook: string): string | null {
  const m = hook.match(/"([^"]+)"/);
  if (!m) return null;
  let q = m[1].replace(/[\s.…]+$/u, "").trim();
  // Prefer the last full sentence; else cut at the last clause (comma) so a
  // truncated snippet doesn't end mid-thought ("…som efter vo").
  const dot = q.lastIndexOf(".");
  if (dot > 25) {
    q = q.slice(0, dot).trim();
  } else {
    const comma = q.lastIndexOf(",");
    if (comma > 25) q = q.slice(0, comma).trim();
  }
  // Drop any dangling truncation fragment (stopword / 1-2 char / lone number).
  q = q.replace(/[\s,]+(og|men|som|der|at|en|et|med|på|til|af|for|er|var|[a-zæøå]{1,2}|\d+)$/i, "").trim();
  q = q.replace(/[\s,]+$/u, "").trim();
  if (q.length < 12) return null;
  return q.charAt(0).toLowerCase() + q.slice(1);
}

function cleanHook(hook: string): string {
  let h = hook.trim();
  h = h.replace(/^(nævner|etableret|summary[:\s]*)/i, "").trim();
  if (/^\d{4}$/.test(h)) return `historie helt tilbage til ${h}`;
  return h;
}

function buildOpener(lead: ResearchLead, research: ResearchResult): string {
  const hook = research.hooks[0];

  // 1. Genuine customer review quote — the strongest, most human opener.
  if (hook && /^en kunde fremhæver/i.test(hook)) {
    const q = cleanQuote(hook);
    if (q) {
      const cand = pick(lead.name, [
        `jeg faldt over en af jeres Google-anmeldelser hvor en kunde skrev "${q}" — sådan noget siger jo en del.`,
        `en af jeres anmeldelser fangede mig: en kunde skrev "${q}". Det er svært at købe sig til.`,
        `jeg kom til at læse jeres anmeldelser — en kunde skrev "${q}", og det sagde mig en del om jer.`,
      ]);
      // Never emit an opener that breaks the voice rules (e.g. a quote that
      // slipped a price/kr word) — that would get the whole line stripped.
      if (validateDraft(cand).ok) return cand;
    }
  }

  // 2. A specific named detail (service / award / established-since).
  if (hook && hook.length > 8 && !/anmeldelser på Google/i.test(hook)) {
    const cand = pick(lead.name, [
      `jeg lagde mærke til jeres ${cleanHook(hook)} — det ser virkelig stærkt ud.`,
      `jeg faldt over jeres ${cleanHook(hook)} og blev nysgerrig.`,
    ]);
    if (validateDraft(cand).ok) return cand;
  }

  // 3. Strong review volume (no quote available) — use their real number, not
  //    the dead "bygget noget særligt op" phrasing.
  if (lead.reviewsCount >= 50) {
    return pick(lead.name, [
      `jeg sad og kiggede på jer i ${lead.city}, og ${lead.reviewsCount} anmeldelser — det er folk der kommer tilbage.`,
      `jeg lagde mærke til hvor mange gode anmeldelser I har her i ${lead.city}.`,
    ]);
  }

  // 4. Nothing specific — honest, local.
  return pick(lead.name, [
    `jeg kiggede forbi jer her fra ${lead.city} og blev nysgerrig på det I laver.`,
    `jeg faldt over jer her fra ${lead.city} og blev nysgerrig.`,
  ]);
}

// Branch-specific "what a real site would DO for you" line — the concrete value
// Lucas wants every draft to carry, instead of only "here are two demos". Pure +
// validateDraft-safe (no price/kr/gratis/robot-CTA words).
function branchValueLine(branch: string): string {
  const b = (branch || "").toLowerCase();
  if (/frisør|frisor|salon|skønhed|skonhed|hud|negle|vippe|barber|kosmet|\bspa\b|wellness|massage|klinik|beauty|hair/.test(b))
    return `For en salon som jeres kunne sådan en side fx samle online booking ét sted og fremhæve jeres bedste anmeldelser, så nye kunder nemt finder vej.`;
  if (/restaurant|café|cafe|pizz|\bbar\b|\bpub\b|grill|\bkro\b|bistro|brasseri|bager|spise|køkken|food|takeaway|sushi|kebab|burger|bodega/.test(b))
    return `For et spisested kunne en rigtig side gøre menukort og bordbestilling nemt at finde — og lade stemningen og jeres anmeldelser sælge, før gæsten er kommet.`;
  if (/tømrer|tomrer|maler|murer|vvs|elektr|håndværk|\btag\b|snedker|smed|anlæg|entrepren|blik|kloak/.test(b))
    return `For et håndværksfirma kunne en side vise et galleri af jeres arbejde og gøre det nemt for kunder at sende en forespørgsel direkte — mens interessen er der.`;
  if (/foto|photo/.test(b))
    return `For en fotograf er en stærk portfolio næsten alt — et sted hvor jeres billeder får lov at sælge, og folk nemt kan booke jer.`;
  return `En rigtig side ville samle det vigtigste ét sted — hvad I laver, jeres anmeldelser og en nem måde at række ud på — så I står stærkere når folk søger jer.`;
}

function composeDeterministic(lead: ResearchLead, research: ResearchResult): Draft {
  const [d1, d2] = research.demoPair;
  const name = firstName(lead.name);

  // Tone-mixer (OUTREACH_ANALYSIS-driven): data-aware, deterministic opener +
  // the salgselev-hobby disclosure + demo intro + closing. The dead "bygget noget
  // særligt op" opener is gone. Guard the opener through the validator and fall
  // back to a quote-free deterministic opener if a review quote slipped a rule.
  const mix = mixForLead({
    name: lead.name,
    branch: lead.branch,
    city: lead.city,
    reviewsCount: lead.reviewsCount,
    websiteStatus: lead.websiteStatus,
    hooks: research.hooks,
    achievements: research.achievements,
  });
  const opener = validateDraft(mix.opener).ok ? mix.opener : buildOpener(lead, research);

  const tailorLine = pick(lead.name + "t", [
    `Det er bare eksempler — en rigtig version til ${name} ville selvfølgelig matche jeres egen stil og farver.`,
    `Det er kun for at vise idéen — en rigtig side til ${name} ville følge jeres egne farver og udtryk.`,
  ]);

  const body = [
    `Hej ${name},`,
    ``,
    `${opener} ${mix.disclosure}`,
    ``,
    branchValueLine(lead.branch),
    ``,
    mix.demoIntro,
    `→ ${d1.url}`,
    `→ ${d2.url}`,
    ``,
    tailorLine,
    ``,
    mix.closing,
    ``,
    `Mvh, Lucas`,
  ].join("\n");

  return {
    subject: pick(lead.name + "s", [
      `En lille hilsen til ${name}`,
      `En idé til ${name}`,
      `Tænkte på ${name}`,
    ]),
    body,
    demoPair: research.demoPair,
  };
}

// Strip any HARD-RULE violations the LLM may have produced, line by line.
function sanitize(text: string): string {
  return text
    .split("\n")
    .filter((line) => validateDraft(line).ok)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---- Optional LLM lift ----------------------------------------------------

async function composeWithLLM(
  lead: ResearchLead,
  research: ResearchResult,
  voiceGuide: string
): Promise<string | null> {
  if (!isAiEnabled()) return null;
  const [d1, d2] = research.demoPair;
  const prompt = [
    `Skriv en kort, varm, personlig dansk besked fra Lucas til virksomheden "${lead.name}" (${lead.branch}, ${lead.city}).`,
    research.hooks.length ? `Brug denne ægte detalje som åbning: ${research.hooks.join("; ")}` : `Ingen specifik detalje fundet — hold åbningen ærlig og lokal.`,
    `Skriv ÉN konkret sætning om hvad en rigtig hjemmeside ville gøre for netop deres branche (fx booking/menukort/galleri/portfolio) — ikke bare "her er to demoer".`,
    `Inkludér PRÆCIS disse to demo-links, hver på sin egen linje med "→ ":`,
    `→ ${d1.url}`,
    `→ ${d2.url}`,
    `Slut med "Mvh, Lucas".`,
  ].join("\n\n");

  // DRAFT -> Opus 4.8 (model resolved by ai.ts; gateway -> anthropic -> null).
  const res = await generate({
    task: "draft",
    system: `Du er Lucas. Skriv kun selve beskeden, intet andet. Følg denne stemme-guide nøje:\n\n${voiceGuide}`,
    prompt,
    maxTokens: 600,
    temperature: 0.7,
  });
  return res ? res.text : null;
}

export interface DraftOptions {
  useLLM?: boolean;
}

export async function draft_personal_message(
  lead: ResearchLead,
  research: ResearchResult,
  voiceGuide: string,
  opts: DraftOptions = {}
): Promise<Draft> {
  // Try the LLM lift only when explicitly enabled and a key exists.
  if (opts.useLLM) {
    const llm = await composeWithLLM(lead, research, voiceGuide);
    if (llm) {
      let body = llm;
      if (!validateDraft(body).ok) body = sanitize(body);
      // Ensure both demo links survived sanitisation; otherwise fall back.
      const [d1, d2] = research.demoPair;
      if (validateDraft(body).ok && body.includes(d1.url) && body.includes(d2.url)) {
        return { subject: `En lille hilsen til ${firstName(lead.name)}`, body, demoPair: research.demoPair };
      }
    }
  }

  // Deterministic path — guaranteed to pass the validator.
  const draft = composeDeterministic(lead, research);
  const check = validateDraft(draft.body);
  if (!check.ok) {
    // Should never happen, but never emit a rule-breaking draft.
    draft.body = sanitize(draft.body);
  }
  return draft;
}
