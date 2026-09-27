// Google Search Console pr. kunde. Service-accounten (samme JSON som Sheets) skal
// tilføjes som "Begrænset bruger" på kundens GSC-ejendom — ellers springes kunden
// over med "ingen adgang" (ikke en fejl: ikke alle kunder har GSC endnu).
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, gscSnapshot } from "../db/schema.ts";
import { jevJudge, recordGscUpdate, type Judge } from "./gsc-updates.ts";
import type { BlogIndexStatus, KinlyGsc, KinlyGscPage } from "./seo-signals.ts";

export interface GscRow { keys?: string[]; clicks: number; impressions: number; position: number }
type GscFilter = { filters: { dimension: string; operator: string; expression: string }[] };
/** Én searchanalytics.query. Kaster { code: 403|404 } når ejendommen ikke findes/ikke er delt. */
export type GscQuery = (property: string, body: { startDate: string; endDate: string; dimensions?: string[]; rowLimit?: number; dimensionFilterGroups?: GscFilter[] }) => Promise<GscRow[]>;
/** Én urlInspection.index.inspect (virker med "Begrænset bruger" + read-only scope — testet 27/9). */
export type GscInspect = (property: string, url: string) => Promise<{ verdict?: string | null; coverageState?: string | null; lastCrawlTime?: string | null }>;

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/** GSC-data er ~2-3 dage forsinket: vinduet slutter 3 dage før i dag. */
export function gscWindow(today: string) {
  const end = Date.parse(`${today}T12:00:00Z`) - 3 * DAY;
  return { start: iso(end - 27 * DAY), end: iso(end), dailyStart: iso(end - 89 * DAY) };
}

export function hostOf(website: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(website) ? website : `https://${website}`).hostname.replace(/^www\./, "").toLowerCase() || null;
  } catch {
    return null;
  }
}

const candidates = (host: string) => [`sc-domain:${host}`, `https://${host}/`, `https://www.${host}/`];
const noAccess = (err: unknown) => [403, 404].includes(Number((err as { code?: number }).code));

export interface GscSnapshotInput {
  property: string;
  periodStart: string;
  periodEnd: string;
  clicks: number;
  impressions: number;
  position: number | null;
  topQueries: { query: string; clicks: number; impressions: number; position: number }[];
  daily: { date: string; clicks: number; impressions: number }[];
}

/** null = ingen af ejendommene er delt med service-accounten. */
export async function fetchGsc(q: GscQuery, host: string, today: string): Promise<GscSnapshotInput | null> {
  const w = gscWindow(today);
  for (const property of candidates(host)) {
    let totals: GscRow[];
    try {
      totals = await q(property, { startDate: w.start, endDate: w.end });
    } catch (err) {
      if (noAccess(err)) continue;
      throw err;
    }
    const [top, days] = [
      await q(property, { startDate: w.start, endDate: w.end, dimensions: ["query"], rowLimit: 5 }),
      await q(property, { startDate: w.dailyStart, endDate: w.end, dimensions: ["date"], rowLimit: 100 }),
    ];
    const t = totals[0];
    return {
      property,
      periodStart: w.start,
      periodEnd: w.end,
      clicks: Math.round(t?.clicks ?? 0),
      impressions: Math.round(t?.impressions ?? 0),
      position: t && t.impressions > 0 ? Math.round(t.position * 10) / 10 : null,
      topQueries: top.map((r) => ({ query: String(r.keys?.[0] ?? "").slice(0, 200), clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), position: Math.round(r.position * 10) / 10 })),
      daily: fillDays(days, w.dailyStart, w.end),
    };
  }
  return null;
}

/** GSC udelader dage uden visninger — fyld med 0, så grafen ikke snyder. */
function fillDays(rows: GscRow[], start: string, end: string) {
  const by = new Map(rows.map((r) => [String(r.keys?.[0]), r]));
  const out: { date: string; clicks: number; impressions: number }[] = [];
  for (let t = Date.parse(`${start}T12:00:00Z`); t <= Date.parse(`${end}T12:00:00Z`); t += DAY) {
    const d = iso(t);
    const r = by.get(d);
    out.push({ date: d, clicks: Math.round(r?.clicks ?? 0), impressions: Math.round(r?.impressions ?? 0) });
  }
  return out;
}

/** kinly.dk selv (SEO-fanen): 28 dage mod de 28 før, alle søgninger (maks 250). Ingen adgang ⇒ property null. */
export async function fetchKinlyGsc(q: GscQuery, today: string, host = "kinly.dk"): Promise<KinlyGsc> {
  const w = gscWindow(today);
  const prevEnd = iso(Date.parse(`${w.start}T12:00:00Z`) - DAY);
  const prevStart = iso(Date.parse(`${prevEnd}T12:00:00Z`) - 27 * DAY);
  const tot = (r: GscRow[]) => ({ clicks: Math.round(r[0]?.clicks ?? 0), impressions: Math.round(r[0]?.impressions ?? 0), position: r[0]?.impressions ? Math.round(r[0].position * 10) / 10 : null });
  const base = { fetchedAt: new Date().toISOString(), periodStart: w.start, periodEnd: w.end };
  for (const property of candidates(host)) {
    let cur: GscRow[];
    try {
      cur = await q(property, { startDate: w.start, endDate: w.end });
    } catch (err) {
      if (noAccess(err)) continue;
      throw err;
    }
    const prev = await q(property, { startDate: prevStart, endDate: prevEnd });
    const rows = await q(property, { startDate: w.start, endDate: w.end, dimensions: ["query"], rowLimit: 250 });
    const prevRows = new Map((await q(property, { startDate: prevStart, endDate: prevEnd, dimensions: ["query"], rowLimit: 250 })).map((r) => [String(r.keys?.[0]), r]));
    const blogOnly = [{ filters: [{ dimension: "page", operator: "contains", expression: "/blog/" }] }];
    const pages = blogPages(
      await q(property, { startDate: w.start, endDate: w.end, dimensions: ["page"], rowLimit: 200, dimensionFilterGroups: blogOnly }),
      await q(property, { startDate: prevStart, endDate: prevEnd, dimensions: ["page"], rowLimit: 200, dimensionFilterGroups: blogOnly }),
      await q(property, { startDate: w.start, endDate: w.end, dimensions: ["page", "query"], rowLimit: 1000, dimensionFilterGroups: blogOnly }),
    );
    return {
      pages,
      ...base,
      property,
      totals: tot(cur),
      prevTotals: tot(prev),
      queries: rows.map((r) => {
        const query = String(r.keys?.[0] ?? "").slice(0, 200);
        const p = prevRows.get(query);
        return { query, clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), position: Math.round(r.position * 10) / 10, prevClicks: p ? Math.round(p.clicks) : null, prevPosition: p ? Math.round(p.position * 10) / 10 : null };
      }),
    };
  }
  const empty = { clicks: 0, impressions: 0, position: null };
  return { ...base, property: null, totals: empty, prevTotals: empty, queries: [] };
}

const pathOf = (page: string) => {
  try {
    return new URL(page).pathname;
  } catch {
    return page;
  }
};
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Blog-sider: nu + forrige 28 dage (også sider der er faldet til 0) og top-3 søgeord pr. side. */
export function blogPages(cur: GscRow[], prev: GscRow[], pageQueries: GscRow[]): KinlyGscPage[] {
  const stats = (r: GscRow | undefined) => r ? { clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), position: r.impressions ? r1(r.position) : null } : null;
  const byPath = (rows: GscRow[]) => new Map(rows.map((r) => [pathOf(String(r.keys?.[0] ?? "")), r]));
  const [now, before] = [byPath(cur), byPath(prev)];
  return [...new Set([...now.keys(), ...before.keys()])].map((path) => {
    const top = pageQueries
      .filter((r) => pathOf(String(r.keys?.[0] ?? "")) === path)
      .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
      .slice(0, 3)
      .map((r) => ({ query: String(r.keys?.[1] ?? "").slice(0, 200), clicks: Math.round(r.clicks), impressions: Math.round(r.impressions), position: r1(r.position) }));
    return { path, ...(stats(now.get(path)) ?? { clicks: 0, impressions: 0, position: null }), prev: stats(before.get(path)), topQueries: top };
  }).sort((a, b) => b.impressions - a.impressions);
}

/** Er de udgivne indlæg i Googles indeks? Én fejl stopper ikke de andre — den vises som fejl, ikke som "ikke indekseret". */
export async function inspectBlogUrls(inspect: GscInspect, property: string, urls: string[]): Promise<BlogIndexStatus[]> {
  const out: BlogIndexStatus[] = [];
  for (const url of urls.slice(0, 50)) {
    try {
      const r = await inspect(property, url);
      out.push({ url, indexed: r.verdict === "PASS", coverage: String(r.coverageState ?? "").slice(0, 160), lastCrawl: r.lastCrawlTime ?? null });
    } catch (err) {
      out.push({ url, indexed: false, coverage: "", lastCrawl: null, error: String((err as { code?: number }).code ?? (err instanceof Error ? err.message : err)).slice(0, 120) });
    }
  }
  return out;
}

export interface GscSyncResult { company: string; ok: boolean; property?: string; error?: string }

/** Alle aktive kunder med website. Ingen adgang ⇒ springes over (noteret); andre fejl samles. */
export async function syncGsc(db: Db, q: GscQuery, today: string, judge: Judge = jevJudge): Promise<GscSyncResult[]> {
  const rows = await db
    .select({ id: company.id, name: company.name, website: company.website })
    .from(company)
    .where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false), eq(company.archived, false)));
  const out: GscSyncResult[] = [];
  for (const c of rows) {
    const host = hostOf(c.website ?? "");
    if (!host) continue;
    try {
      const snap = await fetchGsc(q, host, today);
      if (!snap) {
        out.push({ company: c.name, ok: true, error: "ingen adgang" });
        continue;
      }
      const [prev] = await db.select().from(gscSnapshot).where(eq(gscSnapshot.companyId, c.id)).orderBy(desc(gscSnapshot.takenAt)).limit(1);
      await db.insert(gscSnapshot).values({ companyId: c.id, ...snap });
      out.push({ company: c.name, ok: true, property: snap.property });
      // Opdateringen er ikke kritisk: fejler den, er målingen stadig gemt.
      if (prev) await recordGscUpdate(db, c, prev, snap, today, judge).catch((e) => console.warn("[gsc] opdatering", e instanceof Error ? e.message : e));
    } catch (err) {
      out.push({ company: c.name, ok: false, error: err instanceof Error ? err.message.slice(0, 200) : String(err) });
    }
  }
  return out;
}

/** Seneste og forrige måling for kundeprofilen. */
export async function latestGscFor(db: Db, companyId: string) {
  const rows = await db.select().from(gscSnapshot).where(eq(gscSnapshot.companyId, companyId)).orderBy(desc(gscSnapshot.takenAt)).limit(2);
  const latest = rows[0] ?? null;
  // Vores arbejde i grafens vindue (dossierets aktivitetsliste er kun de seneste 20).
  const since = latest?.daily[0]?.date;
  const marks = since
    ? (await db.select({ at: activity.at, summary: activity.summary }).from(activity)
        .where(and(eq(activity.companyId, companyId), eq(activity.type, "arbejde"), gte(activity.at, new Date(`${since}T00:00:00Z`))))
        .orderBy(activity.at).limit(50))
        .map((a) => ({ date: a.at.toISOString().slice(0, 10), text: a.summary ?? "Arbejde" }))
    : [];
  return { latest, previous: rows[1] ?? null, marks };
}

/** Rigtig klient via googleapis (read-only scope). */
async function searchConsole() {
  const { google } = await import("googleapis");
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const auth = new google.auth.GoogleAuth({
    ...(raw ? { credentials: JSON.parse(raw) } : { keyFile: process.env.GOOGLE_KEY_FILE }),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  return google.searchconsole({ version: "v1", auth });
}

export async function googleGscQuery(): Promise<GscQuery> {
  const sc = await searchConsole();
  return async (siteUrl, requestBody) => {
    const r = await sc.searchanalytics.query({ siteUrl, requestBody: { ...requestBody, dataState: "final" } });
    return (r.data.rows ?? []).map((x) => ({ keys: x.keys ?? undefined, clicks: x.clicks ?? 0, impressions: x.impressions ?? 0, position: x.position ?? 0 }));
  };
}

export async function googleGscInspect(): Promise<GscInspect> {
  const sc = await searchConsole();
  return async (siteUrl, inspectionUrl) => {
    const r = await sc.urlInspection.index.inspect({ requestBody: { siteUrl, inspectionUrl, languageCode: "da" } });
    return r.data.inspectionResult?.indexStatusResult ?? {};
  };
}

