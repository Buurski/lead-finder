// branch-confidence.ts — how sure are we which branch family a lead belongs to?
// OUTREACH_ANALYSIS: the worst misfires came from confident-but-wrong routing
// (a café got the "håndværker-projekter" template). So we score confidence and
// fall back to a NEUTRAL group when unsure — the cost of a wrong angle is higher
// than the upside of a branch-specific one.

import { DESIGN_TEMPLATES } from "./design-templates.ts";

export type BranchGroup =
  | "mad" | "skønhed" | "håndværk" | "foto" | "service" | "advokat" | "neutral";

export interface BranchConfidence {
  group: BranchGroup;
  confidence: number; // 0..1
  matched: string[];
}

// Reuse the template aliases as the keyword source so there is ONE definition of
// what each branch family looks like.
function aliasHits(text: string, aliases: string[]): string[] {
  const t = text.toLowerCase();
  return aliases.filter((a) => t.includes(a));
}

export function branchConfidence(lead: { name?: string; branch?: string }): BranchConfidence {
  const text = `${lead.branch || ""} ${lead.name || ""}`.toLowerCase();
  if (!text.trim()) return { group: "neutral", confidence: 0, matched: [] };

  // Score each template family by how many of its aliases appear.
  const scored = DESIGN_TEMPLATES.map((t) => {
    const matched = aliasHits(text, t.aliases);
    return { slug: t.slug, matched, score: matched.length };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { group: "neutral", confidence: 0.3, matched: [] };

  const top = scored[0];
  const second = scored[1];
  // Confidence: strong if a single family clearly wins; ambiguous if two families
  // tie (e.g. "barber" hits both skønhed + a service word).
  let confidence = Math.min(0.95, 0.55 + top.score * 0.15);
  if (second && second.score === top.score) confidence = 0.45; // tie -> neutral band

  const group = mapSlugToGroup(top.slug);
  // Below the neutral threshold we don't trust the branch angle.
  if (confidence < 0.5) return { group: "neutral", confidence, matched: top.matched };
  return { group, confidence, matched: top.matched };
}

function mapSlugToGroup(slug: string): BranchGroup {
  switch (slug) {
    case "restaurant": return "mad";
    case "frisor":
    case "salon":
    case "hudpleje": return "skønhed";
    case "vvs": return "håndværk";
    case "foto": return "foto";
    case "advokat": return "advokat";
    default: return "service";
  }
}
