import { NextResponse } from "next/server";
import { getLeads, batchSaveEmails } from "@/lib/sheets";
import type { Lead } from "@/lib/sheets";

export const maxDuration = 300;

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" };
const CONCURRENCY = 5;
const MAX_PER_RUN = 200;

function extractEmail(text: string): string | null {
  const mailto = text.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (mailto) return mailto[1].toLowerCase();
  const bare = text.match(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/);
  if (bare) {
    const addr = bare[1].toLowerCase();
    if (!/noreply|example|sentry|w3\.org|schema|jquery|google|facebook|instagram|name@domain|user@domain|email@email|your@|test@test/i.test(addr)) {
      return addr;
    }
  }
  return null;
}

async function findEmailOnWebsite(website: string): Promise<string | null> {
  const url = website.startsWith("http") ? website : `https://${website}`;

  try {
    const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
      headers: { ...HEADERS, "Accept": "text/plain", "X-Return-Format": "markdown" },
      signal: AbortSignal.timeout(12000),
    });
    if (jinaRes.ok) {
      const text = await jinaRes.text();
      const email = extractEmail(text);
      if (email) return email;
    }
  } catch { /* fall through */ }

  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      return extractEmail(html);
    }
  } catch { /* ignore */ }

  return null;
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
    if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return email.toLowerCase();
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
  return !l.email && !!l.name;
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
    const leads = await getLeads();
    const targets = leads.filter(needsEmailSearch).slice(0, MAX_PER_RUN);

    const emailUpdates: { rowIndex: number; email: string }[] = [];

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
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
