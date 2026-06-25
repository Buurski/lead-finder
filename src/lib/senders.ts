// senders.ts — central sender hub for the two-account outreach setup.
//
// Before 2026-06-17 we had a single sender (Lucas, buur.aigro@gmail.com) and
// the transport was hardcoded to process.env.GMAIL_USER. Charlie is now the
// second sender (1charlie.nielsen@gmail.com, while the Buur domain isn't yet
// live). The cold-mail engine and the /approve send route pick a sender per
// draft (hybrid allocation, see pickHybridSender below), and sync-replies /
// inbox-live scan BOTH accounts so replies to either side surface in the
// "Svar" tab.
//
// 2026-06-26: also became the source of truth for the *display signature*
// (displayName + title + tagline + phone). Previously the signature was
// hardcoded in 28+ places in email.ts and 3 places in draft.ts. Now every
// cold mail renders the sender's signature through formatSignature(senderId)
// so Charlie and Lucas each get their own contact details automatically.
//
// 2026-06-26 (later): added `tagline` for Charlie's "Web-design entusiast"
// line. Charlie's profile is Senior Funding Manager (title) + Web-design
// entusiast (tagline). Both fall back to env vars, both default empty for
// Lucas so his layout stays "navn + telefon, intet andet".
//
// Hard rules in this file:
//   - If a sender's credentials are missing, that sender is unavailable.
//     pickHybridSender / getTransporter fall back to the other one rather than
//     throw — losing a sender for a deploy blip shouldn't kill the whole run.
//   - All sender resolution goes through this module. Don't reach for
//     process.env.GMAIL_USER directly in lib/* or app/api/* from here on.
//   - "salgselev" is Lucas' differentiator and must NEVER appear on Charlie.
//     Both default + env paths for Charlie filter this string (see below).
//
// Strip-safe (no Next imports) so node tooling (CLI engine) can use it.

import nodemailer from "nodemailer";

export type SenderId = "lucas" | "charlie";

export interface SenderCreds {
  id: SenderId;
  email: string;
  appPassword: string;
  /** Display name used in the From: header (e.g. "Lucas Buur"). */
  displayName: string;
  /** Phone number shown in the email signature (e.g. "+45 23 24 24 82"). */
  phone: string;
  /** Optional title shown above the phone number ("Senior Funding Manager" / ""). */
  title: string;
  /** Optional tagline shown between title and phone ("Web-design entusiast" / "").
   *  Added 2026-06-26 for Charlie's web-design passion. Default empty for both
   *  senders; opt-in via *_SENDER_TAGLINE env var. */
  tagline: string;
}

// ---- Per-sender defaults -------------------------------------------------
// Phone numbers, titles and taglines are kept here as *defaults* that can be
// overridden by env vars. Hard rules:
//
//  - No field is ever hardcoded in email templates — everything flows through
//    formatSignature(senderId) below.
//  - Lucas keeps his existing layout ("Lucas\n+45 23 24 24 82", no title, no
//    tagline). LUCAS_SENDER_PHONE is what Vercel currently has set;
//    LUCAS_PHONE is accepted as a legacy alias. Same for title/tagline.
//  - Charlie's signature is: navn + titel ("Senior Funding Manager") +
//    tagline ("Web-design entusiast") + telefon ("+45 42 25 32 62"). All four
//    fields are env-overridable so the team can tweak without a redeploy.
//  - "salgselev" is filtered out of Charlie's signature at the formatSignature
//    boundary even if some env var accidentally sets it. Lucas' tag/title
//    paths do NOT filter — that's his differentiator by design.
const LUCAS_DEFAULT_NAME = "Lucas Buur";
const LUCAS_DEFAULT_PHONE = "+45 23 24 24 82";
const LUCAS_DEFAULT_TITLE = "";   // bevarer eksisterende format (kun navn + tlf)
const LUCAS_DEFAULT_TAGLINE = ""; // bevarer eksisterende format

const CHARLIE_DEFAULT_NAME = "Charlie Nielsen";
const CHARLIE_DEFAULT_PHONE = "+45 42 25 32 62";   // per Charlie 2026-06-26
const CHARLIE_DEFAULT_TITLE = "Senior Funding Manager"; // per Charlie 2026-06-26
const CHARLIE_DEFAULT_TAGLINE = "Web-design entusiast";  // per Charlie 2026-06-26

/** 2026-06-26: distinguish "env var absent" from "env var set to empty string".
 *  Returns the first defined value (including ""). The old `||` operator
 *  collapsed empty string into the fallback, breaking the opt-out semantics
 *  for tagline. Hoisted to module level so both fromEnv() (line ~95) and
 *  formatSignature() (line ~300) can share it. */
function pickEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v !== undefined) return v;
  }
  return undefined;
}


/**
 * Defense-in-depth: scrub "salgselev" ud af Charlie-signatur-felter. Default
 * paths inkluderer aldrig "salgselev", men en stray env-var kunne. Lucas'
 * signatur røres ikke.
 */
function scrubCharlieLeak(value: string): string {
  if (!value) return value;
  return value.replace(/salgselev/gi, "").trim();
}

function fromEnv(): Record<SenderId, SenderCreds | null> {
  const lucasEmail = process.env.GMAIL_USER;
  const lucasPw = process.env.GMAIL_APP_PASSWORD;
  const charlieEmail = process.env.CHARLIE_GMAIL_USER;
  const charliePw = process.env.CHARLIE_GMAIL_APP_PASSWORD;

  // 2026-06-26: use pickEnv() instead of || so that an empty env var means
  // "explicit opt-out" — the field is stored as "" in creds and formatSignature
  // will filter the line out. The old || operator collapsed "" into the
  // in-code default, breaking the opt-out test.
  return {
    lucas: lucasEmail && lucasPw
      ? {
          id: "lucas",
          email: lucasEmail,
          appPassword: lucasPw,
          displayName: LUCAS_DEFAULT_NAME,
          phone: pickEnv("LUCAS_SENDER_PHONE", "LUCAS_PHONE") ?? LUCAS_DEFAULT_PHONE,
          title: pickEnv("LUCAS_SENDER_TITLE", "LUCAS_TITLE") ?? LUCAS_DEFAULT_TITLE,
          tagline: pickEnv("LUCAS_SENDER_TAGLINE", "LUCAS_TAGLINE") ?? LUCAS_DEFAULT_TAGLINE,
        }
      : null,
    charlie: charlieEmail && charliePw
      ? {
          id: "charlie",
          email: charlieEmail,
          appPassword: charliePw,
          displayName: CHARLIE_DEFAULT_NAME,
          phone: pickEnv("CHARLIE_SENDER_PHONE", "CHARLIE_PHONE") ?? CHARLIE_DEFAULT_PHONE,
          title: pickEnv("CHARLIE_SENDER_TITLE", "CHARLIE_TITLE") ?? CHARLIE_DEFAULT_TITLE,
          tagline: pickEnv("CHARLIE_SENDER_TAGLINE", "CHARLIE_TAGLINE") ?? CHARLIE_DEFAULT_TAGLINE,
        }
      : null,
  };
}

/** Returns the SenderId values whose credentials are configured in env. */
export function availableSenders(): SenderId[] {
  const creds = fromEnv();
  return (Object.keys(creds) as SenderId[]).filter((k) => creds[k] !== null);
}

/** Resolves a SenderId to its credentials, or null if that sender is not set. */
export function getSenderCreds(id: SenderId): SenderCreds | null {
  return fromEnv()[id] ?? null;
}

/** Is this sender usable right now? */
export function isSenderAvailable(id: SenderId): boolean {
  return fromEnv()[id] !== null;
}

/** Returnerer kun de konti der har BÅDE user + appPassword sat, med creds
 *  inkluderet. Bruges af multi-account scannere (sync-replies, inbox-live)
 *  der ellers ville fejle på en manglende konto. `email` følger SenderCreds. */
export function getActiveSenders(): Array<{ id: SenderId; user: string; appPassword: string }> {
  const creds = fromEnv();
  return (Object.keys(creds) as SenderId[])
    .filter((k) => creds[k] !== null)
    .map((id) => {
      const c = creds[id]!;
      return { id, user: c.email, appPassword: c.appPassword };
    });
}

/**
 * Default sender — used when a draft has no `sender` field set (legacy drafts
 * from before this feature landed, or when only one account is configured).
 * Prefer lucas for stability — he's the canonical contact.
 */
export function defaultSender(): SenderId {
  const a = availableSenders();
  if (a.length === 0) return "lucas"; // never reached: sendMail would throw anyway
  if (a.includes("lucas")) return "lucas";
  return a[0];
}

/**
 * Hybrid allocation — pick the sender who has sent FEWER cold mails in the
 * last 14 days. Not round-robin (the same lead + day pair must always land
 * on the same sender, see followup-dedupe in approve/send). Tie-breakers in
 * order:
 *   1. If only one sender is configured, return that one (cheap path).
 *   2. Lower recent-sent-count wins.
 *   3. On a true tie, "lucas" wins so a partially-configured Charlie keeps
 *      things stable.
 *
 * The "recent" window is 14 days so a quiet week still doesn't dump 100%
 * of new drafts on whoever sent last (Lucas's hard rule: samme kontakt kun
 * én mail pr. dag — keeping senders balanced is part of that).
 */
export function pickHybridSender(
  history: Array<{ sender?: SenderId | null; status: string; updatedAt: string }>,
  now: Date = new Date(),
): SenderId {
  const a = availableSenders();
  if (!a.includes("lucas")) return a[0] ?? "lucas";   // Charlie-only deploy
  if (!a.includes("charlie")) return "lucas";          // Lucas-only deploy
  const cutoffMs = now.getTime() - 14 * 24 * 60 * 60 * 1000;
  const counts: Record<SenderId, number> = { lucas: 0, charlie: 0 };
  for (const d of history) {
    if (d.status !== "sent") continue;
    const t = new Date(d.updatedAt).getTime();
    if (!Number.isFinite(t) || t < cutoffMs) continue;
    const s = (d.sender ?? "lucas") as SenderId;
    if (s in counts) counts[s]++;
  }
  if (counts.lucas <= counts.charlie) return "lucas";
  return "charlie";
}

// ---- Transport cache ------------------------------------------------------
// nodemailer transports are safe to reuse (pool: true already), but creating
// one per call is wasteful and complicates the SMTP throttle counter.
// Keyed by senderId so Charlie's pool never gets Lucas's credential.
const _transporters = new Map<SenderId, nodemailer.Transporter>();

function buildTransporter(creds: SenderCreds): nodemailer.Transporter {
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    pool: true,
    maxConnections: 1,
    maxMessages: Infinity,
    auth: { user: creds.email, pass: creds.appPassword },
  });
}

/**
 * Returns a cached nodemailer transporter for the given sender. Throws if
 * the sender's credentials aren't configured — callers should defaultSender()
 * first or fall back gracefully.
 */
export function getTransporter(senderId: SenderId): nodemailer.Transporter {
  const existing = _transporters.get(senderId);
  if (existing) return existing;
  const creds = getSenderCreds(senderId);
  if (!creds) {
    throw new Error(
      `sender "${senderId}" ikke konfigureret — sæt ${
        senderId === "lucas" ? "GMAIL_USER + GMAIL_APP_PASSWORD" : "CHARLIE_GMAIL_USER + CHARLIE_GMAIL_APP_PASSWORD"
      } i miljøet.`,
    );
  }
  const t = buildTransporter(creds);
  _transporters.set(senderId, t);
  return t;
}

/** The display address shown in From: — "Lucas Buur <lucas@…>" etc. */
export function formatFrom(senderId: SenderId): string {
  const creds = getSenderCreds(senderId);
  if (!creds) return senderId;
  return `${creds.displayName} <${creds.email}>`;
}

// ---- Signature rendering --------------------------------------------------
// 2026-06-26: the cold-mail signature used to be hardcoded "Lucas\n+45 23 24
// 24 82" in 28+ places in email.ts. It is now a single function so Charlie
// automatically gets his own name + phone + title, and the runtime can be
// reconfigured via env (LUCAS_SENDER_PHONE / LUCAS_SENDER_TITLE /
// CHARLIE_SENDER_PHONE / CHARLIE_SENDER_TITLE) without touching code.
// Legacy names without _SENDER_ (LUCAS_PHONE / LUCAS_TITLE / CHARLIE_PHONE /
// CHARLIE_TITLE) are accepted as aliases for backwards compatibility.
//
// 2026-06-26 (later): added `tagline` for Charlie ("Web-design entusiast").
// Same env override pattern (LUCAS_SENDER_TAGLINE / CHARLIE_SENDER_TAGLINE
// with legacy _TAGLINE aliases).
//
// formatSignature returns BOTH the plain-text and HTML rendering of the
// signature block. Email templates interpolate the relevant form. If the
// sender creds are not configured we fall back to the per-sender defaults.
// Order: navn, titel, tagline, telefon — alle tomme felter filtreres væk så
// vi aldrig emitterer "Charlie\n\n\n+45 42…" (med blanke linjer).

export interface Signature {
  /** Plain-text signatur, linjer adskilt af "\n". Eksempel Lucas:
   *  "Lucas Buur\n+45 23 24 24 82". Eksempel Charlie:
   *  "Charlie Nielsen\nSenior Funding Manager\nWeb-design entusiast\n+45 42 25 32 62". */
  text: string;
  /** HTML-form: hver linje adskilt af "<br>", navn i <strong>. */
  html: string;
  /** "Mvh, Lucas" / "Mvh, Charlie Nielsen" — drop-in for LLM-promptens afslutning. */
  closing: string;
}

export function formatSignature(senderId: SenderId, credsOverride?: SenderCreds): Signature {
  const creds = credsOverride ?? getSenderCreds(senderId);
  // Layered lookup: creds (Gmail-loaded) -> env vars (per-sender _SENDER_ prefix,
  // legacy aliases without _SENDER_) -> in-code defaults. The env vars are
  // consulted even when creds is null so tests/dry-run can still tweak the
  // signature without provisioning a full Gmail account.
  const envPhone = senderId === "lucas"
    ? (process.env.LUCAS_SENDER_PHONE || process.env.LUCAS_PHONE || "")
    : (process.env.CHARLIE_SENDER_PHONE || process.env.CHARLIE_PHONE || "");
  const envTitle = senderId === "lucas"
    ? (process.env.LUCAS_SENDER_TITLE || process.env.LUCAS_TITLE || "")
    : (process.env.CHARLIE_SENDER_TITLE || process.env.CHARLIE_TITLE || "");
  const envTagline = senderId === "lucas"
    ? (process.env.LUCAS_SENDER_TAGLINE || process.env.LUCAS_TAGLINE || "")
    : (process.env.CHARLIE_SENDER_TAGLINE || process.env.CHARLIE_TAGLINE || "");
  const name = creds?.displayName ?? (senderId === "lucas" ? LUCAS_DEFAULT_NAME : CHARLIE_DEFAULT_NAME);
  const senderEnvPhone = pickEnv(...(senderId === "lucas" ? ["LUCAS_SENDER_PHONE", "LUCAS_PHONE"] : ["CHARLIE_SENDER_PHONE", "CHARLIE_PHONE"]));
  const senderEnvTitle = pickEnv(...(senderId === "lucas" ? ["LUCAS_SENDER_TITLE", "LUCAS_TITLE"] : ["CHARLIE_SENDER_TITLE", "CHARLIE_TITLE"]));
  const senderEnvTagline = pickEnv(...(senderId === "lucas" ? ["LUCAS_SENDER_TAGLINE", "LUCAS_TAGLINE"] : ["CHARLIE_SENDER_TAGLINE", "CHARLIE_TAGLINE"]));

  let phone = creds?.phone ?? senderEnvPhone ?? (senderId === "lucas" ? LUCAS_DEFAULT_PHONE : CHARLIE_DEFAULT_PHONE);
  let title = creds?.title ?? senderEnvTitle ?? (senderId === "lucas" ? LUCAS_DEFAULT_TITLE : CHARLIE_DEFAULT_TITLE);
  let tagline = creds?.tagline ?? senderEnvTagline ?? (senderId === "lucas" ? LUCAS_DEFAULT_TAGLINE : CHARLIE_DEFAULT_TAGLINE);

  // Defense-in-depth: scrub "salgselev" out of Charlie's signature no matter
  // where it came from. The default paths never include it, but a stray env
  // var could.
  if (senderId === "charlie") {
    phone = scrubCharlieLeak(phone);
    title = scrubCharlieLeak(title);
    tagline = scrubCharlieLeak(tagline);
  }

  // Text form: filter out empty fields so we never emit trailing blank lines
  // ("Charlie\n") when phone is empty. Order: name, title, tagline, phone.
  // Lucas's existing layout (no title, no tagline) is preserved so the diff
  // is invisible for him.
  const trim = (s: string) => s.trim();
  const textLines = [name, title, tagline, phone].map(trim).filter((s) => s.length > 0);
  const htmlLines = [`<strong>${trim(name)}</strong>`, trim(title), trim(tagline), trim(phone)].filter((s) => s.length > 0);

  return {
    text: textLines.join("\n"),
    html: htmlLines.join("<br>"),
    closing: `Mvh, ${trim(name)}`,
  };
}

// ---- Legacy applySignature helper ----------------------------------------
// 2026-06-26: re-sign a body for the chosen sender (used by /api/approve/send
// to re-sign drafts when the manual override flips sender mid-batch). Uses
// the layered formatSignature() under the hood so it picks up the same env
// vars and per-sender defaults.

/** Strip any trailing sign-off from a body so we can re-sign for the chosen sender. */
export function stripSignature(body: string): string {
  let t = (body || "").replace(/\s+$/, "");
  const patterns: RegExp[] = [
    /\n+Med venlig hilsen,?\s*\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?(?:\n\+?[\d\s]{6,})?\s*$/i,
    /\n+Mvh,?\s*(?:Lucas|Charlie)(?:\n\+?[\d\s]{6,})?\s*$/i,
    /\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?\n\+?[\d\s]{6,}\s*$/i,
    /\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?\s*$/i,
  ];
  for (const re of patterns) {
    if (re.test(t)) { t = t.replace(re, "").replace(/\s+$/, ""); break; }
  }
  return t;
}

/** Re-sign a body for the chosen sender. */
export function applySignature(body: string, id: SenderId): string {
  const sig = formatSignature(id);
  return `${stripSignature(body)}\n\n${sig.text}`;
}