// Ren parser for et lead-svar (spec 2026-10-15-har-svaret-kontekst-design.md §5): rå RFC822 → uddrag,
// kategori og "bad de om opkald?". Ingen DB, ingen netværk, intet sendes.
import { classifyReply, type ReplyCategory } from "../reply.ts";
import { decodeMailBody } from "../mail-decode.ts";

export const SNIPPET_MAX = 600;

export interface ParsedReply {
  snippet: string;
  category: ReplyCategory;
  asksCall: boolean;
}

// Header-tegn på maskinsvar. X-Auto-Response-Suppress er med vilje IKKE med: Exchange sætter den på almindelig post.
const AUTO_HEADERS = [
  /^auto-submitted:\s*(?!no\b)\S/im,
  /^x-autoreply:/im,
  /^x-autorespond:/im,
  /^precedence:\s*(auto[_-]?reply|bulk|junk)/im,
];
const AUTO_SUBJECT = /(automatisk svar|autosvar|automatic reply|auto-?reply|out of office|fraværsbesked|fraværende|ude af kontoret)/i;

function headerBlock(raw: string): string {
  const end = raw.search(/\r?\n\r?\n/);
  return (end < 0 ? raw : raw.slice(0, end)).replace(/\r?\n[ \t]+/g, " "); // fold foldede headers ud
}

export function isAutoReplyMail(rawSource: string, subject: string): boolean {
  const headers = headerBlock(rawSource);
  return AUTO_HEADERS.some((re) => re.test(headers)) || AUTO_SUBJECT.test(subject);
}

// "Ring"/"ringe" (ikke "ringer"/"ringede": "vi ringer til jer" er ikke en bøn om opkald), "giv et ring" og eksplicit telefonsamtale.
// Et telefonnummer alene tæller ikke: det står i de fleste signaturer. Nummeret læses fra uddraget når siden viser det.
const ASKS_CALL = /\b(ring|ringe)\b|\bgiv\s+(mig|os)\s+et\s+ring\b|\btelefonsamtale\b|\b(snakke|tale)\s+(sammen\s+)?(i|på)\s+telefon(en)?\b/i;

export function asksForCall(text: string): boolean {
  return ASKS_CALL.test(text);
}

// Signaturer uden "-- "-streg: afslut ved de almindelige mobil-/klient-hilsner.
const SIGNATURE_START = /^(--\s*$|sendt fra min |sent from my |hent outlook |get outlook )/i;

/** Brødtekst uden signatur, på én linje. Kategori og opkalds-tjek læser denne fulde tekst, ikke det klippede uddrag. */
export function flatBody(text: string): string {
  const kept: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (SIGNATURE_START.test(line.trim())) break;
    kept.push(line);
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

export function toSnippet(text: string): string {
  const flat = flatBody(text);
  const chars = [...flat];
  return chars.length > SNIPPET_MAX ? chars.slice(0, SNIPPET_MAX - 1).join("").trimEnd() + "…" : flat;
}

export function parseReply(rawSource: string, subject: string): ParsedReply {
  const body = flatBody(decodeMailBody(rawSource));
  const category: ReplyCategory = isAutoReplyMail(rawSource, subject) ? "auto-reply" : classifyReply(body).category;
  return { snippet: toSnippet(body), category, asksCall: category === "auto-reply" ? false : asksForCall(body) };
}
