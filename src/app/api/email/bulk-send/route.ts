import { NextResponse } from "next/server";
import { getLeads, getPauseStatus, updateLeadEmailStatus, updateLeadStatus } from "@/lib/sheets";
import { sendLeadEmail } from "@/lib/email";
import { isChain } from "@/lib/chains";

export const maxDuration = 300;

const PROFESSIONAL_BRANCHES = ["advokat", "revisor", "fysioterapi", "tandlæge", "optiker", "kiropraktor", "apotek"];

// Same placeholder filter as bulk-find-emails — defense in depth so a bad
// email saved earlier cannot be sent to.
const PLACEHOLDER_REGEX = /noreply|no-reply|donotreply|do-not-reply|example\.|@example|sentry|w3\.org|schema|jquery|googletagmanager|googleapis|@google\.com|facebook\.com|instagram\.com|linkedin|twitter|name@domain|user@domain|email@email|your@|youremail|test@test|@test\.dk$|@test\.com$|eksempel|firstname|lastname|sample@|placeholder|john\.doe|jane\.doe|@yourcompany|@yourdomain|@goodresto|@eksempel|@domain\.com$|@email\.com$|wixpress|cloudflare|wordpress\.com|sentry\.io|godaddy|hostnet|simply\.com/i;

const BANNED_DOMAINS = new Set([
  "example.com", "example.dk", "example.org",
  "domain.com", "domain.dk", "email.com",
  "test.com", "test.dk",
  "yourcompany.com", "yourdomain.com",
  "eksempel.dk", "eksempel.com",
  "goodresto.com", "placeholder.com", "sample.com",
]);

function isCleanEmail(email: string): boolean {
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

function isEligible(lead: { score: number; branch: string; email: string; emailSentAt: string; status: string; websiteQualityTier: string; name: string; emailStatus?: string; skipReason?: string }): boolean {
  if (!isCleanEmail(lead.email)) return false;
  if (lead.emailSentAt) return false;
  if (lead.emailStatus === "bounced") return false;
  if (lead.status === "skip" || lead.status === "client") return false;
  if (lead.websiteQualityTier === "modern") return false;
  if (isChain(lead.name)) return false;
  // Phase 2: respect the review-queue skip flag on manual sends too.
  if (lead.skipReason) return false;
  if (/kommune@|kommunen@|\.kommune\.|^visit[a-z]+@/i.test(lead.email)) return false;
  if (/offentligt kontor|skulptur|forening \/ organisation/i.test(lead.branch)) return false;
  const isProfessional = PROFESSIONAL_BRANCHES.some((b) => lead.branch.toLowerCase().includes(b));
  // Tightened: general >= 50 (was 40), professional >= 70
  const minScore = isProfessional ? 70 : 50;
  return lead.score >= minScore;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "0", 10);
  const leads = await getLeads();
  const eligible = leads
    .filter(isEligible)
    .sort((a, b) => b.score - a.score);
  const sliced = limit > 0 ? eligible.slice(0, limit) : eligible;
  return NextResponse.json({
    eligible: eligible.length,
    returning: sliced.length,
    leads: sliced.map((l) => ({
      id: l.id,
      name: l.name,
      score: l.score,
      branch: l.branch,
      city: l.city,
      email: l.email,
      websiteQualityTier: l.websiteQualityTier,
    })),
  });
}

export async function POST(req: Request) {
  // Phase 2 kill switch — if Lucas pressed "Stop alt i dag" the PauseSchedule
  // tab will have a future timestamp. Bail out before touching Gmail.
  const pause = await getPauseStatus();
  if (pause.paused) {
    return NextResponse.json({ paused: true, pausedUntil: pause.until, sent: 0, failed: 0 });
  }

  const url = new URL(req.url);
  const delayMs = Math.max(0, Math.min(180000, parseInt(url.searchParams.get("delayMs") || "500", 10)));
  const limit = Math.max(0, parseInt(url.searchParams.get("limit") || "0", 10));
  const jitterMs = Math.max(0, Math.min(120000, parseInt(url.searchParams.get("jitterMs") || "0", 10)));

  const leads = await getLeads();
  const eligible = leads
    .map((lead, i) => ({ lead, rowIndex: i }))
    .filter(({ lead }) => isEligible(lead))
    .sort((a, b) => b.lead.score - a.lead.score);
  const targets = limit > 0 ? eligible.slice(0, limit) : eligible;

  const results: { name: string; email: string; ok: boolean; error?: string }[] = [];
  const seenEmails = new Set<string>();

  let processed = 0;
  for (const { lead, rowIndex } of targets) {
    // Re-check pause every 5 iterations so mid-run halt stops us.
    if (processed > 0 && processed % 5 === 0) {
      const recheck = await getPauseStatus();
      if (recheck.paused) {
        return NextResponse.json({
          paused: true,
          pausedUntil: recheck.until,
          haltedMidRun: true,
          sent: results.filter(r=>r.ok).length, failed: results.filter(r=>!r.ok).length,
          results,
        });
      }
    }
    processed++;
    if (seenEmails.has(lead.email.toLowerCase())) {
      results.push({ name: lead.name, email: lead.email, ok: false, error: "duplicate email address" });
      continue;
    }
    seenEmails.add(lead.email.toLowerCase());
    try {
      await sendLeadEmail(lead, "cold");
      const now = new Date().toISOString();
      await updateLeadEmailStatus(rowIndex, {
        emailSentAt: now,
        emailStatus: "sent",
      });
      if (lead.status === "new") {
        await updateLeadStatus(rowIndex, "called");
      }
      results.push({ name: lead.name, email: lead.email, ok: true });
      const wait = delayMs + (jitterMs > 0 ? Math.floor(Math.random() * jitterMs) : 0);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    } catch (err) {
      results.push({ name: lead.name, email: lead.email, ok: false, error: String(err) });
    }
  }

  return NextResponse.json({
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    remaining: Math.max(0, eligible.length - targets.length),
    results,
  });
}

// Mark specific lead IDs as sent (used to recover from partial Sheets quota failures)
export async function PATCH(req: Request) {
  const { ids } = await req.json() as { ids: string[] };
  const now = new Date().toISOString();
  const updates = await Promise.allSettled(
    ids.map(async (id) => {
      const rowIndex = Number(id) - 2;
      await updateLeadEmailStatus(rowIndex, { emailSentAt: now, emailStatus: "sent" });
      return id;
    })
  );
  const ok = updates.filter((r) => r.status === "fulfilled").length;
  return NextResponse.json({ marked: ok, total: ids.length });
}
