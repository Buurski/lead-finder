// match.ts — draft→Sheets-række-matching (leadkø-triage-fix 2026-08-07).
//
// Prioritet: (1) numerisk leadId (engine-rækkenummer) → (2) bizKey by+navn →
// (3) navn-only KUN hvis entydigt. Aldrig first-match på navn: 16 ingest-drafts
// har navnet som leadId, og "Beauty by M" findes i 2 rækker med forskellig
// composite-score (44 vs 90) — first-match ramte tilfældigt og kunne godkende
// eller sende den forkerte række videre.

import { bizKey } from "./suppress.ts";

// Generisk over T: rækkerne kan være Lead (Sheets) eller en testdub —
// matchLead returnerer den eksakte række, så kaldere beholder alle felter.
export function matchLead<T extends { name: string; city?: string; id?: string | number }>(
  leads: T[],
  d: { leadId?: string; name: string; city?: string }
): T | undefined {
  if (d.leadId && /^\d+$/.test(d.leadId)) {
    const byId = leads.find((l) => String(l.id) === d.leadId);
    if (byId) return byId;
  }
  if (d.name) {
    const k = bizKey(d.name, d.city);
    const byBiz = k ? leads.filter((l) => bizKey(l.name, l.city) === k) : undefined;
    // Kun entydigt hit — samme navn+by i to rækker (filial/stavefejl) må IKKE
    // ramme tilfældigt, præcis som navn-only-reglen nedenfor.
    if (byBiz && byBiz.length === 1) return byBiz[0];
    // Navn-only kun når entydigt — dublet-navn skal IKKE ramme tilfældigt.
    const byName = leads.filter(
      (l) => l.name.trim().toLowerCase() === d.name.trim().toLowerCase()
    );
    if (byName.length === 1) return byName[0];
  }
  return undefined;
}
