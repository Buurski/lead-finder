// Google Search Console pr. kunde. Service-accounten (samme JSON som Sheets) skal
// tilføjes som "Begrænset bruger" på kundens GSC-ejendom — ellers springes kunden
// over med "ingen adgang" (ikke en fejl: ikke alle kunder har GSC endnu).
import { and, desc, eq, gte, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, gscSnapshot } from "../db/schema.ts";

export interface GscRow { keys?: string[]; clicks: number; impressions: number; position: number }
/** Én searchanalytics.query. Kaster { code: 403|404 } når ejendommen ikke findes/ikke er delt. */
export type GscQuery = (property: string, body: { startDate: string; endDate: string; dimensions?: string[]; rowLimit?: number }) => Promise<GscRow[]>;

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

export interface GscSyncResult { company: string; ok: boolean; property?: string; error?: string }

/** Alle aktive kunder med website. Ingen adgang ⇒ springes over (noteret); andre fejl samles. */
export async function syncGsc(db: Db, q: GscQuery, today: string): Promise<GscSyncResult[]> {
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
      await db.insert(gscSnapshot).values({ companyId: c.id, ...snap });
      out.push({ company: c.name, ok: true, property: snap.property });
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
export async function googleGscQuery(): Promise<GscQuery> {
  const { google } = await import("googleapis");
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const auth = new google.auth.GoogleAuth({
    ...(raw ? { credentials: JSON.parse(raw) } : { keyFile: process.env.GOOGLE_KEY_FILE }),
    scopes: ["https://www.googleapis.com/auth/webmasters.readonly"],
  });
  const sc = google.searchconsole({ version: "v1", auth });
  return async (siteUrl, requestBody) => {
    const r = await sc.searchanalytics.query({ siteUrl, requestBody: { ...requestBody, dataState: "final" } });
    return (r.data.rows ?? []).map((x) => ({ keys: x.keys ?? undefined, clicks: x.clicks ?? 0, impressions: x.impressions ?? 0, position: x.position ?? 0 }));
  };
}

