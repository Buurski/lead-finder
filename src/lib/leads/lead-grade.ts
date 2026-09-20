// lead-grade.ts — turns the two Jev scores (lead attractiveness + draft
// quality) into an A/B/C grade for /approve, plus business links and a short
// fact line built ONLY from fields that actually exist on JevShadowRecord /
// SiteJudgment (council 2026-09-20: never fabricate follower counts etc.).
//
// PURE, no I/O — unit-testable.

export type Grade = "A" | "B" | "C" | "?";

/** Same weighting as page.tsx's jevPriority: draft quality weighs heaviest
 * (it's what actually gets sent), lead attractiveness is secondary. */
export function priority(leadAttr: number | null, draftQuality: number | null): number | null {
  if (leadAttr == null && draftQuality == null) return null;
  const p = (draftQuality ?? leadAttr ?? 50) * 0.6 + (leadAttr ?? draftQuality ?? 50) * 0.4;
  return Math.round(p);
}

export function grade(p: number | null): Grade {
  if (p == null) return "?";
  if (p >= 70) return "A";
  if (p >= 50) return "B";
  return "C";
}

export interface BusinessLink {
  kind: "web" | "maps" | "facebook" | "mail";
  label: string;
  href: string;
}

/** Real link (website) when we have one, honest SEARCH links otherwise —
 * never a fabricated facebook/maps profile URL (none exists in our data). */
export function businessLinks(name: string, city: string, website: string, email?: string): BusinessLink[] {
  const links: BusinessLink[] = [];
  const n = (name ?? "").trim();
  const c = (city ?? "").trim();
  const w = (website ?? "").trim();
  if (w) {
    const href = /^https?:\/\//i.test(w) ? w : `https://${w}`;
    links.push({ kind: "web", label: "Website", href });
  }
  const q = `${n} ${c}`.trim();
  links.push({ kind: "maps", label: "Maps", href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}` });
  links.push({ kind: "facebook", label: "Facebook", href: `https://www.google.com/search?q=${encodeURIComponent(`${q} facebook`.trim())}` });
  const e = (email ?? "").trim();
  if (e) links.push({ kind: "mail", label: "Mail", href: `mailto:${e}` });
  return links;
}

const VTYPE_DA: Record<string, string> = {
  lokal_ejerledet: "lokal, ejerledet",
  regional_flere_afdelinger: "regional, flere afdelinger",
  stor_eller_landskendt: "stor eller landskendt",
  offentlig_eller_forening: "offentlig/forening",
};

const BUDGET_DA: Record<string, string> = { lavt: "lav", middel: "middel", hoejt: "høj" };

const SITE_TIER_DA = ["moderne side", "middelmådig side", "forældet side", "død side"];

export interface FactInput {
  reviewsCount?: number;
  isChain?: boolean;
  judgment?: {
    virksomhedstype?: string;
    budget?: string;
    redesign?: number;
  } | null;
}

/** Short Danish facts about how big/serious the business is — only what we
 * actually know; missing data is skipped, never shown as "ukendt". */
export function factLine(j: FactInput): string[] {
  const out: string[] = [];
  if (typeof j.reviewsCount === "number" && j.reviewsCount > 0) {
    out.push(`${j.reviewsCount} Google-anmeldelser`);
  }
  const vtype = j.judgment?.virksomhedstype;
  if (vtype && VTYPE_DA[vtype]) out.push(VTYPE_DA[vtype]);
  const budget = j.judgment?.budget;
  if (budget && BUDGET_DA[budget]) out.push(`budget-signal: ${BUDGET_DA[budget]}`);
  const redesign = j.judgment?.redesign;
  if (typeof redesign === "number" && Number.isFinite(redesign)) {
    const tier = SITE_TIER_DA[Math.max(0, Math.min(3, Math.round(redesign)))];
    out.push(tier);
  }
  if (j.isChain) out.push("kæde");
  return out;
}
