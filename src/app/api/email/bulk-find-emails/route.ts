import { NextResponse } from "next/server";
import { getLeads, batchSaveEmails } from "@/lib/sheets";

export const maxDuration = 300;

const HEADERS = { "User-Agent": "Mozilla/5.0 (compatible; LeadBot/1.0)" };
const CONCURRENCY = 5;
const MAX_PER_RUN = 200; // process up to 200 per run, press again to continue

function extractEmail(text: string): string | null {
  const mailto = text.match(/mailto:([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/i);
  if (mailto) return mailto[1].toLowerCase();
  const bare = text.match(/\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/);
  if (bare) {
    const addr = bare[1].toLowerCase();
    if (!/noreply|example|sentry|w3\.org|schema|jquery|google|facebook|instagram/i.test(addr)) {
      return addr;
    }
  }
  return null;
}

async function findEmailForLead(website: string): Promise<string | null> {
  const url = website.startsWith("http") ? website : `https://${website}`;

  // Try Jina Reader first — handles JS-rendered sites
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
  } catch { /* fall through to raw HTML */ }

  // Fall back to raw HTML
  try {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const html = await res.text();
      return extractEmail(html);
    }
  } catch { /* unreachable */ }

  return null;
}

// GET — return count of leads that still need an email
export async function GET() {
  try {
    const leads = await getLeads();
    const count = leads.filter(l => l.website && l.websiteStatus !== "none" && !l.email).length;
    return NextResponse.json({ count });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST — find and save emails for up to MAX_PER_RUN leads
export async function POST() {
  try {
    const leads = await getLeads();
    const targets = leads
      .filter(l => l.website && l.websiteStatus !== "none" && !l.email)
      .slice(0, MAX_PER_RUN);

    const emailUpdates: { rowIndex: number; email: string }[] = [];

    for (let i = 0; i < targets.length; i += CONCURRENCY) {
      const batch = targets.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map(async (lead) => {
          const email = await findEmailForLead(lead.website);
          return { lead, email };
        })
      );
      for (const { lead, email } of results) {
        // Save "none" for sites where no email was found so we don't re-scan them
        emailUpdates.push({ rowIndex: parseInt(lead.id) - 2, email: email ?? "none" });
      }
    }

    if (emailUpdates.length > 0) {
      await batchSaveEmails(emailUpdates);
    }

    return NextResponse.json({
      scanned: targets.length,
      found: emailUpdates.length,
      remaining: leads.filter(l => l.website && l.websiteStatus !== "none" && !l.email).length - targets.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
