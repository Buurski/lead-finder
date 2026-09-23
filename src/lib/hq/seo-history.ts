import { and, desc, eq, gte, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company, seoSnapshot, site } from "../db/schema.ts";
import { safeFetch } from "../safe-fetch.ts";
import { auditOnPage } from "../seo.ts";
import { siteUrl } from "./site-health.ts";

export type SeoPoint = typeof seoSnapshot.$inferSelect;
export type SnapshotResult = { snapshot: Omit<typeof seoSnapshot.$inferInsert, "companyId"> | null; reason: string | null };

type PsiJson = {
  lighthouseResult?: {
    categories?: Record<string, { score?: number | null }>;
    audits?: Record<string, { numericValue?: number | null; score?: number | null }>;
  };
};

const AUDIT_ISSUES: Array<[string, string]> = [
  ["largest-contentful-paint", "Største indhold vises langsomt på mobil."],
  ["cumulative-layout-shift", "Indholdet flytter sig under indlæsning."],
  ["render-blocking-resources", "Ressourcer blokerer sidens første visning."],
  ["uses-optimized-images", "Billeder kan komprimeres bedre."],
  ["modern-image-formats", "Billeder bør bruge et nyere format."],
  ["image-alt", "Nogle billeder mangler alternativ tekst."],
  ["document-title", "Siden mangler en tydelig titel."],
  ["meta-description", "Siden mangler en meta-beskrivelse."],
  ["link-text", "Nogle links har utydelig tekst."],
];

/** Ren udtrækning af mobile PageSpeed-tal. Manglende felter forbliver null. */
export function parsePsi(json: PsiJson) {
  const result = json?.lighthouseResult;
  const score = (key: string) => {
    const value = result?.categories?.[key]?.score;
    return typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) : null;
  };
  const metric = (key: string) => {
    const value = result?.audits?.[key]?.numericValue;
    return typeof value === "number" && Number.isFinite(value) ? value : null;
  };
  const issues = AUDIT_ISSUES.filter(([key]) => {
    const audit = result?.audits?.[key];
    return typeof audit?.score === "number" && audit.score < 0.9;
  }).map(([, message]) => message);
  return {
    performance: score("performance"), seo: score("seo"), accessibility: score("accessibility"),
    bestPractices: score("best-practices"),
    lcpMs: metric("largest-contentful-paint") == null ? null : Math.round(metric("largest-contentful-paint")!),
    cls: metric("cumulative-layout-shift") == null ? null : String(metric("cumulative-layout-shift")),
    issues,
  };
}

export async function snapshotSite(url: string): Promise<SnapshotResult> {
  const key = process.env.PAGESPEED_API_KEY;
  if (!key) return { snapshot: null, reason: "PAGESPEED_API_KEY mangler" };
  try {
    const params = new URLSearchParams({ url, strategy: "mobile", key });
    for (const category of ["performance", "seo", "accessibility", "best-practices"]) params.append("category", category);
    const response = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${params}`, {
      signal: AbortSignal.timeout(60_000), cache: "no-store",
    });
    if (!response.ok) return { snapshot: null, reason: `PageSpeed svarede ${response.status}` };
    const psi = parsePsi(await response.json() as PsiJson);
    if ([psi.performance, psi.seo, psi.accessibility, psi.bestPractices].every((value) => value === null)) {
      return { snapshot: null, reason: "PageSpeed gav ingen målinger" };
    }
    let onpage: number | null = null;
    const issues = [...psi.issues];
    try {
      const html = await safeFetch(url, { timeoutMs: 10_000, maxBytes: 1_000_000 });
      if (html && html.status >= 200 && html.status < 400) {
        const audit = await auditOnPage(new TextDecoder().decode(html.bytes), url);
        onpage = audit.score;
        for (const check of audit.checks.filter((item) => !item.ok).sort((a, b) => b.weight - a.weight)) {
          issues.push(`${check.label}: ${check.detail}.`);
        }
      }
    } catch { /* PSI-målingen er stadig brugbar. */ }
    return { snapshot: { url, ...psi, onpage, issues: [...new Set(issues)].slice(0, 5) }, reason: null };
  } catch (error) {
    return { snapshot: null, reason: error instanceof Error && error.name === "TimeoutError" ? "PageSpeed tog over 60 sekunder" : "PageSpeed kunne ikke hentes" };
  }
}

export type CustomerSite = { companyId: string; name: string; url: string };
type Candidate = { companyId: string; name: string; website: string; domain: string | null; status: string | null };

/** Live-domæne prioriteres; company.website bruges kun uden et live site. */
export function selectCustomerSites(rows: Candidate[]): CustomerSite[] {
  const selected = new Map<string, CustomerSite>();
  for (const row of rows) {
    const live = row.status === "live";
    const url = live ? siteUrl(row.domain, row.website) : row.status === null ? siteUrl(null, row.website) : null;
    if (!url) continue;
    if (!selected.has(row.companyId) || live) selected.set(row.companyId, { companyId: row.companyId, name: row.name, url });
  }
  return [...selected.values()];
}

export async function customerSites(db: Db): Promise<CustomerSite[]> {
  const rows = await db.select({ companyId: company.id, name: company.name, website: company.website, domain: site.domain, status: site.status })
    .from(company).leftJoin(site, eq(site.companyId, company.id))
    .where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false), eq(company.archived, false)));
  return selectCustomerSites(rows);
}

export async function recordSeoSnapshot(db: Db, url: string, companyId: string | null, now = new Date()): Promise<{ saved: boolean; reason: string | null }> {
  const recent = await db.select({ id: seoSnapshot.id }).from(seoSnapshot)
    .where(and(companyId ? eq(seoSnapshot.companyId, companyId) : isNull(seoSnapshot.companyId), eq(seoSnapshot.url, url), gte(seoSnapshot.takenAt, new Date(now.getTime() - 86_400_000))))
    .orderBy(desc(seoSnapshot.takenAt)).limit(1);
  if (recent.length) return { saved: false, reason: "Allerede målt inden for 24 timer" };
  const result = await snapshotSite(url);
  if (!result.snapshot) return { saved: false, reason: result.reason };
  await db.insert(seoSnapshot).values({ ...result.snapshot, companyId, takenAt: now });
  return { saved: true, reason: null };
}

export async function runSeoSnapshots(db: Db) {
  const targets = [{ companyId: null, name: "kinly.dk", url: "https://kinly.dk/" }, ...await customerSites(db)];
  const failed: Array<{ name: string; reason: string }> = [];
  let saved = 0;
  for (const target of targets) {
    try {
      const result = await recordSeoSnapshot(db, target.url, target.companyId);
      if (result.saved) saved++;
      else if (result.reason !== "Allerede målt inden for 24 timer") failed.push({ name: target.name, reason: result.reason ?? "ukendt fejl" });
    } catch { failed.push({ name: target.name, reason: "Kunne ikke gemme målingen" }); }
  }
  return { targets: targets.length, saved, failed };
}
