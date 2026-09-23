// Brug af kunde-CMS'et (buur-cms) i kundeoverblikket: sidst udgivet, rettelser
// der ikke er udgivet, AI-chat-forbrug. Hentes fra CMS'ets /api/crm/usage med
// CRM_API_KEY. Fejler det (nøgle mangler, CMS nede), vises bare intet.
import "server-only";

export interface CmsUsage {
  slug: string;
  navn: string;
  lastPublishAt: string | null;
  contentUpdatedAt: string | null;
  pendingEdits: number;
  aiSpendMonthKr: number;
  unreadMessages: number;
}

const BASE = (process.env.CMS_URL || "https://buur-cms.vercel.app").replace(/\/$/, "");

/** Slug ud af et CMS-link som https://buur-cms.vercel.app/e/vida. */
export function cmsSlug(cmsUrl: string | null | undefined): string | null {
  const m = /\/e\/([a-z0-9-]+)/i.exec(cmsUrl ?? "");
  return m ? m[1].toLowerCase() : null;
}

export async function cmsUsageAll(): Promise<CmsUsage[]> {
  const key = process.env.CRM_API_KEY;
  if (!key) return [];
  try {
    const res = await fetch(`${BASE}/api/crm/usage`, {
      headers: { authorization: `Bearer ${key}` },
      next: { revalidate: 600 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { sites?: CmsUsage[] };
    return Array.isArray(body.sites) ? body.sites : [];
  } catch {
    return [];
  }
}

function fold(v: string): string {
  return v
    .toLowerCase()
    .replace(/æ/g, "ae").replace(/ø/g, "o").replace(/å/g, "aa")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Navn ↔ CMS-slug: "Jernbanecaféen" ↔ jernbane-cafeen, "VIDA Skønhedsklinik" ↔ vida. */
export function slugMatches(companyName: string, slug: string): boolean {
  const a = fold(companyName);
  const b = fold(slug);
  if (a.length < 3 || b.length < 3) return false;
  return a === b || a.startsWith(b) || b.includes(a);
}

/** Kundens CMS-brug: slug fra CMS-linket, ellers entydigt navnematch. */
export async function cmsUsageFor(company: { name: string }, cmsUrl: string | null | undefined): Promise<CmsUsage | null> {
  const all = await cmsUsageAll();
  const slug = cmsSlug(cmsUrl);
  if (slug) return all.find((s) => s.slug === slug) ?? null;
  const hits = all.filter((s) => slugMatches(company.name, s.slug) || slugMatches(company.name, s.navn));
  return hits.length === 1 ? hits[0] : null;
}
