import { NextResponse } from "next/server";
import { getLeads, batchSaveEmails } from "@/lib/sheets";
import type { Lead } from "@/lib/sheets";
import { findEmailForLead, isCleanEmailFormat } from "@/lib/email-finder";

export const maxDuration = 300;

// CONCURRENCY 10 + MAX 100 — finishes well under 5min Vercel timeout
const CONCURRENCY = 10;
const MAX_PER_RUN = 100;
// Stop processing if we get within 30s of Vercel timeout
const FUNCTION_BUDGET_MS = 270000;

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
