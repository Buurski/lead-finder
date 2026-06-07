import { NextResponse } from "next/server";
import { getLeads } from "@/lib/sheets";
import { selectMessengerCandidates, isMessengerEligible } from "@/lib/messenger/select";
import type { MessengerCandidate } from "@/lib/messenger/select";
import { loadMessengerState, handledIds } from "@/lib/messenger/state";
import { readVaultJson } from "@/lib/vault";
import { suppressedNameSet } from "@/lib/leads/contactable";

interface VaultMessenger { at?: string; candidates?: MessengerCandidate[] }

// GET /api/messenger — the Messenger workspace feed.
//
// Reads leads from Sheets, selects the best FB-only candidates to DM (quota-
// balanced, ranked), minus the ones already sent/skipped. Read-only: it never
// messages anyone — the panel just hands Lucas the page link, the direct
// Messenger link, and a ready draft to paste.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(req: Request) {
  const limit = Math.min(25, Math.max(1, parseInt(new URL(req.url).searchParams.get("limit") || "12", 10) || 12));

  let leads;
  try {
    leads = await getLeads();
  } catch (err) {
    return NextResponse.json({ ok: false, error: `sheets: ${String(err)}`, candidates: [] }, { status: 200 });
  }

  const state = await loadMessengerState();
  const handled = handledIds(state);

  // Obsidian channel: if a Cowork task curated data/messenger.json, prefer those
  // (already deep-rated FB-leads with drafts), minus the ones already sent/skipped
  // AND minus anyone we've already contacted on any channel (Cowork doesn't know
  // our Sheets contacted-state). Match by name against Sheets suppression.
  const suppressed = suppressedNameSet(leads);
  const vault = await readVaultJson<VaultMessenger>("data/messenger.json").catch(() => null);
  if (vault && Array.isArray(vault.candidates) && vault.candidates.length > 0) {
    const fresh = vault.candidates
      .filter((c) => c && c.id && !handled.has(c.id) && !suppressed.has((c.name || "").trim().toLowerCase()))
      .slice(0, limit);
    if (fresh.length > 0) {
      return NextResponse.json({
        ok: true,
        candidates: fresh,
        pool: { eligible: vault.candidates.length, remaining: vault.candidates.length - handled.size, shown: fresh.length, sent: Object.keys(state.sent).length, skipped: Object.keys(state.skipped).length, depleted: false, source: "cowork" },
      });
    }
  }

  const candidates = selectMessengerCandidates(leads, { limit, excludeIds: handled });

  const eligibleTotal = leads.filter(isMessengerEligible).length;
  const sentCount = Object.keys(state.sent).length;
  const skippedCount = Object.keys(state.skipped).length;

  return NextResponse.json({
    ok: true,
    candidates,
    pool: {
      eligible: eligibleTotal,          // currently eligible in the sheet
      remaining: Math.max(0, eligibleTotal - handled.size), // not yet worked
      shown: candidates.length,
      sent: sentCount,
      skipped: skippedCount,
      depleted: eligibleTotal - handled.size <= 0,
    },
  });
}
