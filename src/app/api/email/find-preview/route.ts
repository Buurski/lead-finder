import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { findEmailForLead } from "@/lib/email-finder";

// POST /api/email/find-preview — read-only email discovery.
//
// Runs email-finder.ts over the next N leads that have NO email yet and returns
// what it found. It writes NOTHING back to Sheets — persisting the results is a
// separate, explicit step (the existing /api/email/bulk-find-emails). This keeps
// the Mission Control "Find emails" button safe to click during the build.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function mapLimited<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(req: Request) {
  let limit = 25;
  try {
    const b = await req.json();
    if (b && typeof b.limit === "number") limit = Math.min(100, Math.max(1, b.limit));
  } catch {
    /* default */
  }

  let leads;
  try {
    leads = await getLeads();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `sheets: ${String(err)}`, results: [] }, { status: 200 });
  }

  const candidates = leads.filter((l) => !l.email && l.status !== "skip").slice(0, limit);
  if (candidates.length === 0) {
    return NextResponse.json({ ok: true, checked: 0, found: 0, results: [] });
  }

  const found = await mapLimited(candidates, 6, async (l) => {
    let email: string | null = null;
    try {
      email = await findEmailForLead({ name: l.name, website: l.website, websiteStatus: l.websiteStatus });
    } catch {
      email = null;
    }
    return { id: l.id, name: l.name, website: l.website, email };
  });

  return NextResponse.json({
    ok: true,
    checked: candidates.length,
    found: found.filter((f) => f.email).length,
    results: found,
    note: "preview only — nothing written to Sheets",
  });
}
