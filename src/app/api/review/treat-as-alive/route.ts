import { NextResponse } from "next/server";
import { addTreatAsAliveDomain } from "@/lib/sheets";
import { extractRootDomain } from "@/lib/website-verify";

// POST /api/review/treat-as-alive
// Body: { domain: string, reason: string }
//
// Adds a root domain to the manual "this site IS alive" override list. We
// strip protocol / www / paths first so subsequent lookups are deterministic.
// Called from the review UI when a lead is skipped with reason
// `cloudflare_false_positive` — saves Lucas from seeing the same false
// positive every day.

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawDomain: string = body.domain ?? "";
    const reason: string = body.reason ?? "manual override from review UI";

    const domain = extractRootDomain(rawDomain);
    if (!domain) {
      return NextResponse.json({ error: "invalid domain" }, { status: 400 });
    }

    await addTreatAsAliveDomain(domain, reason);
    return NextResponse.json({ ok: true, domain });
  } catch (err) {
    console.error("review/treat-as-alive failed:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
