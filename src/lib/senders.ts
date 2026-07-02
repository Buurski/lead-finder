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
// Hard rules in this file:
//   - If a sender's credentials are missing, that sender is unavailable.
//     pickHybridSender / getTransporter fall back to the other one rather than
//     throw — losing a sender for a deploy blip shouldn't kill the whole run.
//   - All sender resolution goes through this module. Don't reach for
//     process.env.GMAIL_USER directly in lib/* or app/api/* from here on.
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
}

const LUCAS_DEFAULT_NAME = "Lucas Buur";
const CHARLIE_DEFAULT_NAME = "Charlie Nielsen";

function fromEnv(): Record<SenderId, SenderCreds | null> {
  const lucasEmail = process.env.GMAIL_USER;
  const lucasPw = process.env.GMAIL_APP_PASSWORD;
  const charlieEmail = process.env.CHARLIE_GMAIL_USER;
  const charliePw = process.env.CHARLIE_GMAIL_APP_PASSWORD;

  return {
    lucas: lucasEmail && lucasPw
      ? { id: "lucas", email: lucasEmail, appPassword: lucasPw, displayName: LUCAS_DEFAULT_NAME }
      : null,
    charlie: charlieEmail && charliePw
      ? { id: "charlie", email: charlieEmail, appPassword: charliePw, displayName: CHARLIE_DEFAULT_NAME }
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

// ---- Signature rewrite (manual sender override, 2026-06-19) ----------------
// Drafts are composed with a "Mvh, Lucas" sign-off. When the actual sender is
// Charlie (engine allocation OR the manual /godkendelse toggle), the body must
// be re-signed so the letter matches who sends it — otherwise a mail from
// Charlie's account still says "Mvh, Lucas". Voice-safe (no contact CTA / kr).
// Optional phone via {LUCAS,CHARLIE}_SENDER_PHONE.

/** The closing sign-off for a sender. */
export function signatureFor(id: SenderId): string {
  if (id === "charlie") {
    const phone = (process.env.CHARLIE_SENDER_PHONE || "").trim();
    return phone ? `Mvh, Charlie\n${phone}` : "Mvh, Charlie";
  }
  const phone = (process.env.LUCAS_SENDER_PHONE || "").trim();
  return phone ? `Mvh, Lucas\n${phone}` : "Mvh, Lucas";
}

// Strip whatever trailing Lucas/Charlie sign-off the body has, so we can re-sign
// for the chosen sender. Covers "Mvh, Lucas", "Lucas\n+45 …" and bare "Lucas".
export function stripSignature(body: string): string {
  let t = (body || "").replace(/\s+$/, "");
  const patterns: RegExp[] = [
    /\n+Mvh,?\s*(?:Lucas|Charlie)(?:\n+\+?[\d\s]{6,})?\s*$/i,
    /\n+Med venlig hilsen,?\s*\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?(?:\n+\+?[\d\s]{6,})?\s*$/i,
    /\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?\n+\+?[\d\s]{6,}\s*$/i,
    /\n+(?:Lucas|Charlie)(?:\s+(?:Buur|Nielsen))?\s*$/i,
  ];
  for (const re of patterns) {
    if (re.test(t)) { t = t.replace(re, "").replace(/\s+$/, ""); break; }
  }
  return t;
}

/** Re-sign a body for the chosen sender. */
export function applySignature(body: string, id: SenderId): string {
  return `${stripSignature(body)}\n\n${signatureFor(id)}`;
}
