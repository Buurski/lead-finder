import { NextResponse } from "next/server";
import { getLeads, moveLeadsToDeadLeads } from "@/lib/sheets";

export const maxDuration = 60;

const PLACEHOLDER_REGEX = /noreply|no-reply|donotreply|do-not-reply|example\.|@example|sentry|w3\.org|schema|jquery|googletagmanager|googleapis|@google\.com|facebook\.com|instagram\.com|linkedin|twitter|name@domain|user@domain|email@email|your@|youremail|test@test|@test\.dk$|@test\.com$|eksempel|firstname|lastname|sample@|placeholder|john\.doe|jane\.doe|@yourcompany|@yourdomain|@goodresto|@eksempel|@domain\.com$|@email\.com$|wixpress|cloudflare|wordpress\.com/i;

const BANNED_DOMAINS = new Set([
  "example.com", "example.dk", "example.org",
  "domain.com", "domain.dk", "email.com",
  "test.com", "test.dk",
  "yourcompany.com", "yourdomain.com",
  "eksempel.dk", "eksempel.com",
  "goodresto.com", "placeholder.com", "sample.com",
]);

function isPlaceholderEmail(email: string): boolean {
  if (!email) return false;
  if (/%[0-9a-fA-F]{2}/.test(email)) return true;
  try { if (decodeURIComponent(email) !== email) return true; } catch { return true; }
  if (PLACEHOLDER_REGEX.test(email)) return true;
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).toLowerCase();
  return BANNED_DOMAINS.has(domain);
}

export async function GET() {
  const leads = await getLeads();
  const bounced = leads.filter((l) => l.emailStatus === "bounced");
  const placeholder = leads.filter((l) => l.email && isPlaceholderEmail(l.email));
  return NextResponse.json({
    bouncedCount: bounced.length,
    placeholderCount: placeholder.length,
    candidates: bounced.length + placeholder.length,
  });
}

export async function POST(req: Request) {
  const url = new URL(req.url);
  const includePlaceholders = url.searchParams.get("includePlaceholders") !== "false";

  const leads = await getLeads();
  const bounced = leads.filter((l) => l.emailStatus === "bounced");
  const placeholder = includePlaceholders
    ? leads.filter((l) => l.email && isPlaceholderEmail(l.email) && l.emailStatus !== "bounced")
    : [];

  let movedBounced = 0;
  let movedPlaceholder = 0;

  if (bounced.length > 0) {
    const res = await moveLeadsToDeadLeads(bounced, "bounced");
    movedBounced = res.moved;
  }

  if (placeholder.length > 0) {
    const res = await moveLeadsToDeadLeads(placeholder, "placeholder-email");
    movedPlaceholder = res.moved;
  }

  return NextResponse.json({
    movedBounced,
    movedPlaceholder,
    total: movedBounced + movedPlaceholder,
  });
}
