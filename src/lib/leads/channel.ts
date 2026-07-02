// channel.ts — the single "how can we reach this lead?" classifier. One predicate,
// used everywhere (engine PICK, lead-gen feed, Messenger, SMS) so a lead always
// lands in the right channel and we never draft an email for a lead with no email.
//
// Priority: a real email wins; else a Facebook page → Messenger; else a phone
// number → SMS; else nothing reachable. Pure + strip-safe (node engine imports it).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Addresses that pass the format check but must NEVER be mailed (2026-06-22):
// web-agency footer mails (grouponline/planway/...) reach the BUREAU not the lead
// and collapse many leads onto one address; template/placeholder mails are junk.
// Kept in ONE place so every channel (ingest, send-gate, find-emails, engine) agrees.
// NB: find-emails targets drafts where !hasUsableEmail(recipientEmail), so blocking
// a bureau/placeholder address here makes that draft re-enter email discovery.
const BLOCKED_EMAIL_DOMAINS = [
  "grouponline.dk", "planway.com", "wannafind.dk", "dandomain.dk",
  "simplero.com", "wix.com", "wixpress.com", "squarespace.com",
];
const BLOCKED_EMAIL_FRAGMENTS = [
  "user@domain.com", "name@email.com", "din@email", "your@email", "email@domain",
  "example.com", "example.org", "yourdomain", "dindomain", "noreply@", "no-reply@",
  "sentry", "@2x",
];

export function isBlockedEmail(email: string | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  if (!e) return false;
  if (BLOCKED_EMAIL_FRAGMENTS.some((p) => e.includes(p))) return true;
  const domain = e.split("@")[1] || "";
  if (!domain) return false;
  return BLOCKED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith("." + d));
}

export type LeadChannel = "email" | "messenger" | "sms" | "none";

export function hasUsableEmail(email: string | undefined): boolean {
  const e = (email || "").trim().toLowerCase();
  return Boolean(e) && e !== "none" && EMAIL_RE.test(e) && !isBlockedEmail(e);
}

export function isFacebookSite(website: string | undefined): boolean {
  return /facebook\.com|fb\.com|fb\.me|messenger\.com/i.test(website || "");
}

// Digits-only phone, 8–15 digits (E.164 range) — guards against junk that would
// otherwise mis-route a lead to SMS and keep it out of the email engine.
export function normalizePhone(phone: string | undefined): string | null {
  const digits = (phone || "").replace(/\D/g, "");
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.length === 8) return `+45${digits}`;            // bare Danish local
  if (digits.startsWith("0045")) return `+${digits.slice(2)}`; // 0045… → +45…
  if (digits.startsWith("45") && digits.length === 10) return `+${digits}`;
  return `+${digits}`;
}

export function leadChannel(lead: { email?: string; website?: string; phone?: string }): LeadChannel {
  if (hasUsableEmail(lead.email)) return "email";
  if (isFacebookSite(lead.website)) return "messenger";
  if (normalizePhone(lead.phone)) return "sms";
  return "none";
}
