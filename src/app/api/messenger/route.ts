// Ingen "next/server" og ingen "@/"-aliaser: ruten skal kunne loades direkte af
// node:test (samme vej som api/agent/posts/route.ts). Response.json = samme objekt.
import { getLeads } from "../../../lib/sheets.ts";
import { selectMessengerCandidates, isMessengerEligible } from "../../../lib/messenger/select.ts";
import type { MessengerCandidate } from "../../../lib/messenger/select.ts";
import { loadMessengerState, handledIds } from "../../../lib/messenger/state.ts";
import { readVaultJson } from "../../../lib/vault.ts";
import { suppressedNameSet } from "../../../lib/leads/contactable.ts";
import { gateMessengerCandidates } from "../../../lib/messenger/vault-gate.ts";

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
    return Response.json({ ok: false, error: `sheets: ${String(err)}`, candidates: [] }, { status: 200 });
  }

  const state = await loadMessengerState();
  const handled = handledIds(state);

  // Obsidian channel: if a Cowork task curated data/messenger.json, prefer those
  // (already deep-rated FB-leads with drafts), minus the ones already sent/skipped
  // AND minus anyone we've already contacted on any channel (Cowork doesn't know
  // our Sheets contacted-state). Match by name against Sheets suppression.
  //
  // Vault-kandidaterne går gennem vault-gate FØRST: Cowork klassificerer selv, og
  // uden compose.ts på denne vej kan et træningscenter ankomme som beauty-kladde.
  // Gaten er fail-closed og kører før id-/handled-/suppressed-filteret og før
  // slice, så et afvist kandidat hverken vises eller skubber et friskt ud.
  const suppressed = suppressedNameSet(leads);
  // Gaten er fail-closed, og et drop må ikke være lydløst: antallet tælles på
  // tværs af begge veje og rapporteres som pool.gated — også når vault-listen
  // falder igennem til Sheets-vejen.
  let gatedCount = 0;
  const vault = await readVaultJson<VaultMessenger>("data/messenger.json").catch(() => null);
  if (vault && Array.isArray(vault.candidates) && vault.candidates.length > 0) {
    const gated = gateMessengerCandidates(vault.candidates);
    gatedCount += vault.candidates.length - gated.length;
    const fresh = gated
      .filter((c) => c && c.id && !handled.has(c.id) && !suppressed.has((c.name || "").trim().toLowerCase()))
      .slice(0, limit);
    if (fresh.length > 0) {
      return Response.json({
        ok: true,
        candidates: fresh,
        // eligible er listen EFTER gaten, og et drop kan derfor overstige det
        // arbejdede antal → remaining må ikke kunne blive negativ.
        pool: { gated: gatedCount, eligible: gated.length, remaining: Math.max(0, gated.length - handled.size), shown: fresh.length, sent: Object.keys(state.sent).length, skipped: Object.keys(state.skipped).length, depleted: false, source: "cowork" },
      });
    }
  }

  // Samme gate på Sheets-vejen. compose.ts er stadig utæt her (wellness → beauty
  // + VIDA-casen + "frisørsalon"), så gaten dropper også en legitim fitness-lead
  // på denne gren, indtil 478013e er merget. Detaljer i vault-gate.ts.
  const picked = selectMessengerCandidates(leads, { limit, excludeIds: handled });
  const candidates = gateMessengerCandidates(picked);
  // Sheets-droppet bogføres for sig: det er en anden population end vaultens,
  // og det skal trækkes fra puljen her — ellers står panelet med "N tilbage ·
  // 0 vist" i det uendelige når alle egnede er droppet.
  const gatedSheets = picked.length - candidates.length;
  gatedCount += gatedSheets;

  const eligibleTotal = leads.filter(isMessengerEligible).length;
  const sentCount = Object.keys(state.sent).length;
  const skippedCount = Object.keys(state.skipped).length;
  const remaining = Math.max(0, eligibleTotal - handled.size - gatedSheets);

  return Response.json({
    ok: true,
    candidates,
    pool: {
      gated: gatedCount,                // droppet af gaten (fitness/beauty-lækage)
      eligible: eligibleTotal,          // currently eligible in the sheet
      remaining,                        // not yet worked, minus det gaten kasserede
      shown: candidates.length,
      sent: sentCount,
      skipped: skippedCount,
      depleted: remaining <= 0,
    },
  });
}
