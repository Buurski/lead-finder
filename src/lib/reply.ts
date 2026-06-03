// reply.ts — the reply-assistant (brief QUALITY phase).
//
// Three jobs on an inbound reply to a cold outreach mail:
//   1. classifyReply(text)      — deterministic Danish intent classifier.
//   2. draftReply(text, ...)    — a warm, in-voice suggested response (Opus via
//                                 ai.ts when a key is set, deterministic else),
//                                 always run through validateDraft (no price/robot).
//   3. becameClient flag        — auto-detect an explicit yes so the CRM can flip
//                                 the lead to "client" without manual triage.
//
// Deterministic-first: every function works with NO API key. The AI layer only
// refines. Strip-safe so the node engine / a future cron can import it.

import { validateDraft } from "./draft.ts";
import { generate, isAiEnabled } from "./ai.ts";

export type ReplyCategory =
  | "interested"
  | "question"
  | "objection"
  | "not-interested"
  | "auto-reply"
  | "wrong-person"
  | "unsubscribe"
  | "other";

export interface ReplyClassification {
  category: ReplyCategory;
  isInterested: boolean; // worth a personal reply / follow-up
  becameClient: boolean; // explicit yes — flip lead to "client"
  shouldStop: boolean; // unsubscribe / hard no / wrong person — suppress
  confidence: number; // 0..1 heuristic confidence
  signals: string[];
}

// ---- deterministic patterns (Danish) ------------------------------------
const P = {
  unsubscribe: /\b(afmeld|frabed(er|e)?|fjern mig|tag mig af|spam|unsubscribe|ikke (skriv|kontakt|henvend)|hold op med)\b/i,
  notInterested: /\b(ikke interesseret|nej tak|ellers tak|ikke aktuelt|ikke relevant|har allerede|vi klarer|ingen interesse|ikke behov)\b/i,
  client: /\b(ja tak|vi er med|lad os|kom (forbi|igang)|send (en )?(aftale|kontrakt|tilbud)|vi vil gerne|book(?:er)? et møde|hvornår kan (du|vi)|sæt(ter)? i gang|gå videre|helt sikkert|det lyder perfekt)\b/i,
  interested: /\b(interesseret|lyder (spændende|interessant|godt)|fortæl (mere|gerne)|send (mig )?mere|kan (du|vi)|ring(e)?|møde|kontakt mig|hvad (koster|med)|pris)\b/i,
  objection: /\b(for dyrt|har ikke (tid|råd|budget)|tænker over|vender tilbage|måske senere|skal lige|ikke (nu|lige nu)|travlt)\b/i,
  autoReply: /\b(automatisk svar|autosvar|ude af kontoret|out of office|på ferie|holder ferie|fri indtil|vender tilbage den|modtaget din (mail|besked))\b/i,
  wrongPerson: /\b(forkert (person|adresse|modtager)|ikke (rette|den rette)|kontakt i stedet|er ikke ansvarlig|prøv at skrive til)\b/i,
};

export function classifyReply(textRaw: string): ReplyClassification {
  const text = (textRaw || "").trim();
  const signals: string[] = [];
  if (!text) {
    return { category: "other", isInterested: false, becameClient: false, shouldStop: false, confidence: 0, signals };
  }

  // Order matters: hard stops first, then positive, then soft.
  if (P.unsubscribe.test(text)) {
    signals.push("unsubscribe");
    return { category: "unsubscribe", isInterested: false, becameClient: false, shouldStop: true, confidence: 0.95, signals };
  }
  if (P.autoReply.test(text)) {
    signals.push("auto-reply");
    return { category: "auto-reply", isInterested: false, becameClient: false, shouldStop: false, confidence: 0.8, signals };
  }
  if (P.wrongPerson.test(text)) {
    signals.push("wrong-person");
    return { category: "wrong-person", isInterested: false, becameClient: false, shouldStop: true, confidence: 0.75, signals };
  }
  if (P.client.test(text)) {
    signals.push("explicit-yes");
    return { category: "interested", isInterested: true, becameClient: true, shouldStop: false, confidence: 0.85, signals };
  }
  if (P.notInterested.test(text)) {
    signals.push("decline");
    return { category: "not-interested", isInterested: false, becameClient: false, shouldStop: true, confidence: 0.85, signals };
  }
  if (P.objection.test(text)) {
    signals.push("objection");
    return { category: "objection", isInterested: true, becameClient: false, shouldStop: false, confidence: 0.6, signals };
  }
  if (P.interested.test(text)) {
    signals.push("interest");
    const isQ = text.includes("?");
    return { category: isQ ? "question" : "interested", isInterested: true, becameClient: false, shouldStop: false, confidence: 0.65, signals };
  }
  if (text.includes("?")) {
    signals.push("question-mark");
    return { category: "question", isInterested: true, becameClient: false, shouldStop: false, confidence: 0.5, signals };
  }
  return { category: "other", isInterested: false, becameClient: false, shouldStop: false, confidence: 0.3, signals };
}

// ---- deterministic reply templates --------------------------------------
function templateFor(cat: ReplyCategory, leadName: string): string {
  const hi = `Hej${leadName ? " " + leadName : ""},`;
  const sign = "\n\nMvh, Lucas";
  switch (cat) {
    case "interested":
    case "question":
      return `${hi}\n\nDejligt at høre fra jer! Jeg svarer gerne på det I tænker — og ellers kan vi tage en kort uforpligtende snak om hvordan en side til jer kunne se ud. Pas det jer at jeg ringer en dag i denne uge?${sign}`;
    case "objection":
      return `${hi}\n\nDet forstår jeg godt — ingen hast. Jeg lader demoerne stå, så I kan kigge når der er ro på. Sig endelig til hvis I på et tidspunkt vil vende det.${sign}`;
    case "not-interested":
      return `${hi}\n\nTak for svaret — helt fint, jeg respekterer det. Jeg ønsker jer alt godt fremover.${sign}`;
    case "wrong-person":
      return `${hi}\n\nTak, beklager ulejligheden! Hvis du kan pege mig i retning af den rette, skriver jeg gerne til vedkommende i stedet.${sign}`;
    case "unsubscribe":
      return `${hi}\n\nSelvfølgelig — jeg fjerner jer med det samme og skriver ikke igen. Beklager forstyrrelsen.${sign}`;
    case "auto-reply":
      return ""; // no reply to an autoresponder
    default:
      return `${hi}\n\nTak for jeres besked — jeg vender tilbage hurtigst muligt.${sign}`;
  }
}

export interface ReplyDraft {
  category: ReplyCategory;
  classification: ReplyClassification;
  suggestedReply: string; // "" means: do not reply (e.g. autoresponder)
  source: "ai" | "deterministic";
}

export interface ReplyContext {
  leadName?: string;
  branch?: string;
  city?: string;
}

// Compose a suggested reply. AI (Opus) when enabled + validated; deterministic
// template otherwise (and as the fallback whenever AI output breaks a rule).
export async function draftReply(
  incomingText: string,
  ctx: ReplyContext = {},
  voiceGuide = "",
  opts: { useAI?: boolean } = {}
): Promise<ReplyDraft> {
  const classification = classifyReply(incomingText);
  const cat = classification.category;
  const deterministic = templateFor(cat, ctx.leadName ?? "");

  // Never auto-reply to an autoresponder, and keep hard-stops minimal/safe.
  const useAI = (opts.useAI ?? true) && isAiEnabled() && cat !== "auto-reply";
  if (useAI) {
    const res = await generate({
      task: "draft",
      system:
        `Du er Lucas, en ydmyg hobby-webudvikler. Skriv et kort, varmt, menneskeligt dansk SVAR på en indkommende besked. ` +
        `Ingen priser/kr, ingen robot-CTA, ingen smileys. Afslut med "Mvh, Lucas". Skriv kun selve svaret.` +
        (voiceGuide ? `\n\nStemme-guide:\n${voiceGuide}` : ""),
      prompt:
        `Virksomhed: ${ctx.leadName ?? "(ukendt)"}${ctx.branch ? ` (${ctx.branch}${ctx.city ? ", " + ctx.city : ""})` : ""}.\n` +
        `Deres besked (kategori: ${cat}):\n"""${(incomingText || "").slice(0, 1500)}"""\n\n` +
        `Skriv mit svar.`,
      maxTokens: 400,
      temperature: 0.6,
    });
    if (res && validateDraft(res.text).ok && /Mvh, Lucas/.test(res.text)) {
      return { category: cat, classification, suggestedReply: res.text.trim(), source: "ai" };
    }
  }
  return { category: cat, classification, suggestedReply: deterministic, source: "deterministic" };
}
