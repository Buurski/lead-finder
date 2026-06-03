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
  [/\b\d{1,3}[.,]?\d{3}\b/, "pengebeløb"],
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

function buildOpener(lead: ResearchLead, research: ResearchResult): string {
  const hook = research.hooks[0];
  if (hook && hook.length > 8) {
    // Use the genuine, lead-specific hook.
    return `jeg faldt over jeres ${cleanHook(hook)} — det ser virkelig stærkt ud.`;
  }
  if (lead.reviewsCount >= 50) {
    return `jeg kiggede forbi jer og kunne se I har bygget noget rigtig solidt op i ${lead.city} med jeres mange anmeldelser.`;
  }
  return `jeg kiggede forbi jer her fra ${lead.city} og blev nysgerrig på det I laver.`;
}

function cleanHook(hook: string): string {
  let h = hook.trim();
  // Strip leading verbs / labels that would read oddly after "jeres".
  h = h.replace(/^(nævner|etableret|summary[:\s]*)/i, "").trim();
  if (/^\d{4}$/.test(h)) return `historie helt tilbage til ${h}`;
  return h;
}

function composeDeterministic(lead: ResearchLead, research: ResearchResult): Draft {
  const [d1, d2] = research.demoPair;
  const opener = buildOpener(lead, research);

  const body = [
    `Hej ${firstName(lead.name)},`,
    ``,
    `${opener} Jeg sidder og bygger hjemmesider som hobby ved siden af mit arbejde, og jeg kom til at tænke på hvordan sådan noget kunne se ud online for jer.`,
    ``,
    `Jeg lavede et par demoer I kan kigge på:`,
    `→ ${d1.url}`,
    `→ ${d2.url}`,
    ``,
    `Det er bare eksempler — en rigtig version til ${firstName(lead.name)} ville selvfølgelig matche jeres egen stil og farver.`,
    ``,
    `Sig endelig til hvis I vil se hvordan jeres kunne se ud — ellers ingen skade sket.`,
    ``,
    `Mvh, Lucas`,
  ].join("\n");

  return {
    subject: `En lille hilsen til ${firstName(lead.name)}`,
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
