import { NextResponse } from "next/server";
import { promises as dns } from "dns";
import { getLeads, batchSaveEmails } from "@/lib/sheets";
import type { Lead } from "@/lib/sheets";

export const maxDuration = 300;

// Real Chrome UA — the old "LeadBot/1.0" UA was bot-blocked and missed real
// businesses (e.g. VIDA). Sites serve full markup to a normal browser UA.
const HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36" };
// CONCURRENCY 10 + MAX 100 — finishes well under 5min Vercel timeout
const CONCURRENCY = 10;
const MAX_PER_RUN = 100;
// Stop processing if we get within 30s of Vercel timeout
const FUNCTION_BUDGET_MS = 270000;

// Aggressive placeholder/spam filter
const PLACEHOLDER_REGEX = /noreply|no-reply|donotreply|do-not-reply|example\.|@example|sentry|w3\.org|schema|jquery|googletagmanager|googleapis|@google\.com|facebook\.com|instagram\.com|linkedin|twitter|name@domain|user@domain|email@email|your@|youremail|test@test|@test\.dk$|@test\.com$|eksempel|firstname|lastname|sample@|placeholder|john\.doe|jane\.doe|@yourcompany|@yourdomain|@goodresto|@eksempel|@domain\.com$|@email\.com$|wixpress|cloudflare|wordpress\.com|sentry\.io|godaddy|hostnet|simply\.com/i;

const BANNED_DOMAINS = new Set([
  "example.com", "example.dk", "example.org",
  "domain.com", "domain.dk", "email.com",
  "test.com", "test.dk",
  "yourcompany.com", "yourdomain.com",
  "eksempel.dk", "eksempel.com",
  "goodresto.com", "placeholder.com", "sample.com",
]);

const mxCache = new Map<string, boolean>();

async function hasMxRecord(email: string): Promise<boolean> {
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

function isCleanEmailFormat(email: string): boolean {
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

// Strip a phone-number prefix that ran into the email local-part.
// Real-world cause: page contains "Tlf. 20 12 34 56 info@foo.dk" → regex matches "56info@foo.dk".
// We strip leading 1-3 digits if the rest of the local-part starts with a letter,
// since no legitimate Danish business email starts with a digit immediately followed by letters.
function stripPhonePrefix(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  // e.g. "20info" → "info", "56info" → "info", "2025info" → "info" (up to 4 leading digits)
  const m = local.match(/^[0-9]{1,4}([a-zA-Z][a-zA-Z0-9._%+\-]*)$/);
  if (m) return m[1].toLowerCase() + domain;
  return email;
}

function extractEmailCandidates(text: string): string[] {
  const candidates: string[] = [];
  const mailtoRegex = /mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/gi;
  let m;
  while ((m = mailtoRegex.exec(text)) !== null) candidates.push(m[1].toLowerCase());
  // Use lookbehind so a digit run that came from a phone number doesn't bleed into the local part.
  // The \b boundary alone matches between a digit and a letter (e.g. "56info") which produced
  // bogus addresses like "20info@unique-hair.dk".
  const bareRegex = /(?:^|[^a-zA-Z0-9._%+\-])([a-zA-Z][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/g;
  while ((m = bareRegex.exec(text)) !== null) candidates.push(m[1].toLowerCase());
  // Also catch digit-leading locals (rare but valid) via the old regex, then strip a phone prefix.
  const fallbackRegex = /\b([0-9]{1,4}[a-zA-Z][a-zA-Z0-9._%+\-]*@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/g;
  while ((m = fallbackRegex.exec(text)) !== null) candidates.push(stripPhonePrefix(m[1].toLowerCase()));
  const unique = [...new Set(candidates)].filter(isCleanEmailFormat);
  unique.sort((a, b) => {
    const aGeneric = /^(info|kontakt|mail|hello|hej|admin|booking|salg|sales|contact)@/.test(a);
    const bGeneric = /^(info|kontakt|mail|hello|hej|admin|booking|salg|sales|contact)@/.test(b);
    if (aGeneric && !bGeneric) return 1;
    if (!aGeneric && bGeneric) return -1;
    return 0;
  });
  return unique;
}

function getLeadDomain(website: string): string | undefined {
  if (!website) return undefined;
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch { return undefined; }
}

async function pickVerifiedEmail(candidates: string[], leadDomain?: string): Promise<string | null> {
  // Filter out random free-mail addresses unless lead domain matches
  const filtered = candidates.filter((e) => {
    const at = e.lastIndexOf("@");
    const d = e.slice(at + 1);
    if (/^(gmail|hotmail|outlook|yahoo|live|msn|protonmail|icloud|me|aol)\.com$/i.test(d)) {
      return false;
    }
    return true;
  });
  const list = filtered.length > 0 ? filtered : candidates;
  if (leadDomain) {
    const matching = list.filter((e) => e.endsWith(`@${leadDomain}`));
    for (const c of matching) {
      if (await hasMxRecord(c)) return c;
    }
  }
  for (const c of list) {
    if (await hasMxRecord(c)) return c;
  }
  return null;
}

async function findEmailOnWebsite(website: string): Promise<string | null> {
  const url = website.startsWith("http") ? website : `https://${website}`;
  const leadDomain = getLeadDomain(website);
  const all = new Set<string>();

  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: { ...HEADERS, "Accept": "text/plain", "X-Return-Format": "markdown" },
      signal: AbortSignal.timeout(12000),
    });
    if (jinaRes.ok) {
      const text = await jinaRes.text();
      for (const c of extractEmailCandidates(text)) all.add(c);
    }
  } catch { /* fall through */ }

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      for (const c of extractEmailCandidates(html)) all.add(c);
    }
  } catch { /* ignore */ }

  if (all.size === 0) return null;
  return pickVerifiedEmail([...all], leadDomain);
}

async function findEmailViaCVR(name: string): Promise<string | null> {
  try {
    const encoded = encodeURIComponent(name);
    const res = await fetch(`https://cvrapi.dk/api?search=${encoded}&country=dk`, {
      headers: { "User-Agent": "LeadBot/1.0 (shadowporo123@gmail.com)" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const email = data.email;
    if (email && typeof email === "string") {
      const norm = email.toLowerCase().trim();
      if (isCleanEmailFormat(norm) && (await hasMxRecord(norm))) return norm;
    }
  } catch { /* ignore */ }
  return null;
}

async function findEmailForLead(lead: Lead): Promise<string | null> {
  // Try website first if available
  if (lead.website && lead.websiteStatus !== "none") {
    const email = await findEmailOnWebsite(lead.website);
    if (email) return email;
  }

  // CVR fallback for all leads (with or without website)
  if (lead.name) {
    return findEmailViaCVR(lead.name);
  }

  return null;
}

function needsEmailSearch(l: Lead): boolean {
  if (!l.name) return false;
  if (!l.email) return true; // not yet scanned
  if (l.email === "none") return false; // already scanned, nothing found
  // Re-scan if the existing email is clearly invalid or a placeholder
  if (!isCleanEmailFormat(l.email)) return true;
  return false;
}

export async function GET() {
  try {
    const leads = await getLeads();
    const count = leads.filter(needsEmailSearch).length;
    return NextResponse.json({ count });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const startedAt = Date.now();
    const leads = await getLeads();
    const targets = leads.filter(needsEmailSearch).slice(0, MAX_PER_RUN);

    const emailUpdates: { rowIndex: number; email: string }[] = [];

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      // Bail out before Vercel kills the function so we can persist what we have
      if (Date.now() - startedAt > FUNCTION_BUDGET_MS) break;
      const batch = targets.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (lead) => {
          const email = await findEmailForLead(lead);
          return { lead, email };
        })
      );
      for (const { lead, email } of results) {
        emailUpdates.push({ rowIndex: parseInt(lead.id) - 2, email: email ?? "none" });
      }
    }

    if (emailUpdates.length > 0) {
      await batchSaveEmails(emailUpdates);
    }

    const remaining = leads.filter(needsEmailSearch).length - targets.length;
    return NextResponse.json({
      scanned: targets.length,
      found: emailUpdates.filter(u => u.email !== "none").length,
      remaining,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
