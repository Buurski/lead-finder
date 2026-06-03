// email-finder.ts — the single email-discovery layer (brief QUALITY phase).
//
// Extracted from app/api/email/bulk-find-emails so the route and any future
// caller (engine, reply-assistant) share ONE implementation — no logic drift.
//
// Sources, best-first: lead website -> booking/social pages -> FB/IG (Apify) ->
// CVR registry. Candidates are ranked, NOT pre-discarded: a free-mail address
// (gmail/hotmail/…) is a valid last resort instead of being thrown away — that
// blind discard is what lost real leads like VIDA, whose only public contact
// was a gmail. Domain-matching and role addresses still rank first.
//
// Strip-safe (no enums/namespaces): importable by the node engine if needed.

import { promises as dns } from "node:dns";

export const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HEADERS = { "User-Agent": CHROME_UA };

// Placeholder / vendor / tracking junk — never a real business address.
const PLACEHOLDER_REGEX =
  /noreply|no-reply|donotreply|do-not-reply|example\.|@example|sentry|w3\.org|schema|jquery|googletagmanager|googleapis|@google\.com|facebook\.com|instagram\.com|linkedin|twitter|name@domain|user@domain|email@email|your@|youremail|test@test|@test\.dk$|@test\.com$|eksempel|firstname|lastname|sample@|placeholder|john\.doe|jane\.doe|@yourcompany|@yourdomain|@goodresto|@eksempel|@domain\.com$|@email\.com$|wixpress|cloudflare|wordpress\.com|sentry\.io|godaddy|hostnet|simply\.com/i;

const BANNED_DOMAINS = new Set([
  "example.com", "example.dk", "example.org",
  "domain.com", "domain.dk", "email.com",
  "test.com", "test.dk",
  "yourcompany.com", "yourdomain.com",
  "eksempel.dk", "eksempel.com",
  "goodresto.com", "placeholder.com", "sample.com",
]);

const FREEMAIL_REGEX = /^(gmail|hotmail|outlook|yahoo|live|msn|protonmail|proton|icloud|me|aol|mail|email)\.[a-z.]+$/i;
const ROLE_REGEX = /^(info|kontakt|mail|hello|hej|admin|booking|salg|sales|contact|post|kontor|reception)@/i;

const mxCache = new Map<string, boolean>();

export async function hasMxRecord(email: string): Promise<boolean> {
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain) return false;
  if (BANNED_DOMAINS.has(domain)) return false;
  if (mxCache.has(domain)) return mxCache.get(domain)!;
  try {
    const records = await dns.resolveMx(domain);
    const ok = records.length > 0;
    mxCache.set(domain, ok);
    return ok;
  } catch {
    try {
      await dns.resolve4(domain);
      mxCache.set(domain, true);
      return true;
    } catch {
      mxCache.set(domain, false);
      return false;
    }
  }
}

export function isCleanEmailFormat(email: string): boolean {
  if (!email) return false;
  if (/%[0-9a-fA-F]{2}/.test(email)) return false;
  try { if (decodeURIComponent(email) !== email) return false; } catch { return false; }
  if (/\s/.test(email)) return false;
  if (email.length > 80 || email.length < 5) return false;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email)) return false;
  if (PLACEHOLDER_REGEX.test(email)) return false;
  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1).toLowerCase();
  if (BANNED_DOMAINS.has(domain)) return false;
  return true;
}

// Strip a phone-number prefix that ran into the email local-part
// ("Tlf. …56 info@foo.dk" -> "56info@foo.dk" -> "info@foo.dk").
export function stripPhonePrefix(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const m = local.match(/^[0-9]{1,4}([a-zA-Z][a-zA-Z0-9._%+\-]*)$/);
  if (m) return m[1].toLowerCase() + domain;
  return email;
}

export function extractEmailCandidates(text: string): string[] {
  const candidates: string[] = [];
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  let m: RegExpExecArray | null;
  while ((m = mailtoRegex.exec(text)) !== null) candidates.push(m[1].toLowerCase());
  // Lookbehind via a leading non-ident char so a digit run from a phone number
  // doesn't bleed into the local part ("56info@…").
  const bareRegex = /(?:^|[^a-zA-Z0-9._%+\-])([a-zA-Z][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  while ((m = bareRegex.exec(text)) !== null) candidates.push(m[1].toLowerCase());
  const fallbackRegex = /\b([0-9]{1,4}[a-zA-Z][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g;
  while ((m = fallbackRegex.exec(text)) !== null) candidates.push(stripPhonePrefix(m[1].toLowerCase()));
  return [...new Set(candidates)].filter(isCleanEmailFormat);
}

function domainOf(email: string): string {
  return email.slice(email.lastIndexOf("@") + 1).toLowerCase();
}

export function isFreemail(email: string): boolean {
  return FREEMAIL_REGEX.test(domainOf(email));
}

// Rank candidates best-first WITHOUT discarding free-mail (the VIDA fix).
// Order: domain-match non-role > domain-match role > other-domain non-freemail
// non-role > other-domain role > free-mail. Stable within a tier.
export function rankEmailCandidates(candidates: string[], leadDomain?: string): string[] {
  const seen = new Set<string>();
  const unique = candidates.filter((c) => (seen.has(c) ? false : (seen.add(c), true)));
  function tier(e: string): number {
    const matchesDomain = !!leadDomain && domainOf(e) === leadDomain;
    const role = ROLE_REGEX.test(e);
    const free = isFreemail(e);
    if (matchesDomain && !role) return 0;
    if (matchesDomain && role) return 1;
    if (!free && !role) return 2;
    if (!free && role) return 3;
    return 4; // free-mail — kept, ranked last
  }
  return unique
    .map((e, i) => ({ e, i, t: tier(e) }))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i))
    .map((x) => x.e);
}

export function getLeadDomain(website: string): string | undefined {
  if (!website) return undefined;
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch { return undefined; }
}

// Rank, then MX-verify in order; return the first deliverable address.
export async function pickVerifiedEmail(candidates: string[], leadDomain?: string): Promise<string | null> {
  for (const c of rankEmailCandidates(candidates, leadDomain)) {
    if (await hasMxRecord(c)) return c;
  }
  return null;
}

async function fetchText(url: string, timeoutMs: number, accept = "text/html"): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { ...HEADERS, Accept: accept }, signal: AbortSignal.timeout(timeoutMs) });
    if (res.ok) return await res.text();
  } catch { /* ignore */ }
  return null;
}

export async function findEmailOnWebsite(website: string): Promise<string | null> {
  const url = website.startsWith("http") ? website : `https://${website}`;
  const leadDomain = getLeadDomain(website);
  const all = new Set<string>();

  // r.jina.ai markdown (renders JS-heavy / blocked sites) + raw HTML.
  const jina = await fetchText(`https://r.jina.ai/${url}`, 12000, "text/plain");
  if (jina) for (const c of extractEmailCandidates(jina)) all.add(c);
  const html = await fetchText(url, 8000);
  if (html) {
    for (const c of extractEmailCandidates(html)) all.add(c);
    // Follow an obvious /kontakt page — that's where addresses usually live.
    const contact = html.match(/href=["']([^"']*(?:kontakt|contact|about|om-os)[^"']*)["']/i);
    if (contact) {
      try {
        const cu = new URL(contact[1], url).href;
        const ch = await fetchText(cu, 8000);
        if (ch) for (const c of extractEmailCandidates(ch)) all.add(c);
      } catch { /* ignore */ }
    }
  }
  if (all.size === 0) return null;
  return pickVerifiedEmail([...all], leadDomain);
}

// FB/IG/booking — token-gated (Apify). A booking link (Timma/Ordrupdal/…) often
// has no email; in that case we mine the linked website if present.
export async function findEmailViaSocial(website: string): Promise<string | null> {
  const token = process.env.APIFY_TOKEN;
  if (!token || !website) return null;
  const ig = website.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const fb = website.match(/(?:facebook|fb)\.com\/([A-Za-z0-9.\-_]+)/i);
  if (!ig && !fb) return null;
  try {
    const actor = ig ? "apify~instagram-scraper" : "apify~facebook-pages-scraper";
    const body = ig
      ? { directUrls: [`https://www.instagram.com/${ig[1]}/`], resultsLimit: 3 }
      : { startUrls: [{ url: `https://www.facebook.com/${fb![1]}` }] };
    const res = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(45000),
    });
    if (!res.ok) return null;
    const items = (await res.json()) as Array<Record<string, unknown>>;
    const blob = items.map((it) => JSON.stringify(it)).join(" ");
    const found = extractEmailCandidates(blob);
    if (found.length) return pickVerifiedEmail(found);
  } catch { /* ignore */ }
  return null;
}

export async function findEmailViaCVR(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://cvrapi.dk/api?search=${encodeURIComponent(name)}&country=dk`, {
      headers: { "User-Agent": "LeadBot/1.0 (shadowporo123@gmail.com)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { email?: unknown };
    const email = data.email;
    if (email && typeof email === "string") {
      const norm = email.toLowerCase().trim();
      if (isCleanEmailFormat(norm) && (await hasMxRecord(norm))) return norm;
    }
  } catch { /* ignore */ }
  return null;
}

export interface FindableLead {
  name: string;
  website: string;
  websiteStatus: string;
}

// Orchestrator: website -> social/booking -> CVR.
export async function findEmailForLead(lead: FindableLead): Promise<string | null> {
  if (lead.website && lead.websiteStatus !== "none") {
    const fromSite = await findEmailOnWebsite(lead.website);
    if (fromSite) return fromSite;
    const fromSocial = await findEmailViaSocial(lead.website);
    if (fromSocial) return fromSocial;
  }
  if (lead.name) return findEmailViaCVR(lead.name);
  return null;
}
