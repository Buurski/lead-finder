// Dagligt sync af nyhedsbrev-tal: HQ henter aggregater fra kundens EGET site
// (GET <site>/api/nyhedsbrev-status/, Bearer-token pr. konto). Brevo-nøglen bliver
// på kundens site; HQ's token giver kun statistik — aldrig send-rettigheder.
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { company, newsletterSnapshot } from "../db/schema.ts";
import { isAudienceList, parseSnapshot } from "./newsletter.ts";

// Kilderne står i koden (ingen hemmelighed). Tokenet: env NYHEDSBREV_TOKEN_<ACCOUNT>, sat af Lucas.
export const NEWSLETTER_SOURCES = [
  { account: "ikast", url: "https://ikastautoservice.dk/api/nyhedsbrev-status/" },
] as const;

const hostOf = (u: string) => new URL(u).hostname.replace(/^www\./, "").toLowerCase();

/** Kunden findes på website-host — intet kundenummer hardcodes. Ingen eller flere hits ⇒ null. */
async function companyFor(db: Db, url: string): Promise<string | null> {
  const h = hostOf(url);
  const hits = await db
    .select({ id: company.id, website: company.website })
    .from(company)
    .where(and(eq(company.archived, false), sql`${company.website} ilike ${"%" + h.replace(/[%_\\]/g, "\\$&") + "%"}`));
  const exact = hits.filter((c) => {
    try {
      return hostOf(/^https?:\/\//i.test(c.website) ? c.website : `https://${c.website}`) === h;
    } catch {
      return false;
    }
  });
  return exact.length === 1 ? exact[0].id : null;
}

// Et statistik-svar er et par KB; alt over 1 MB er en fejl eller et angreb (Sol w4a-r3 R3-05).
const MAX_BYTES = 1_000_000;
async function readCapped(res: Response, max: number): Promise<string> {
  if (Number(res.headers.get("content-length") ?? 0) > max) throw new Error("svaret er for stort");
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      throw new Error("svaret er for stort");
    }
    chunks.push(value);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function syncNewsletters(
  db: Db,
  deps: { fetch?: typeof fetch; env?: Record<string, string | undefined> } = {},
): Promise<{ account: string; ok: boolean; error?: string }[]> {
  const f = deps.fetch ?? fetch;
  const env = deps.env ?? process.env;
  const out: { account: string; ok: boolean; error?: string }[] = [];
  for (const src of NEWSLETTER_SOURCES) {
    const token = env[`NYHEDSBREV_TOKEN_${src.account.toUpperCase()}`];
    if (!token) {
      out.push({ account: src.account, ok: false, error: "token ikke sat" });
      continue;
    }
    try {
      const res = await f(src.url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000), redirect: "error" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = JSON.parse(await readCapped(res, MAX_BYTES)) as Record<string, unknown>;
      const snap = parseSnapshot({ ...body, account: src.account, companyId: null });
      await db.insert(newsletterSnapshot).values({
        companyId: await companyFor(db, src.url),
        account: snap.account,
        lists: snap.lists,
        campaigns: snap.campaigns,
        domain: snap.domain,
        generatedAt: snap.generatedAt ? new Date(snap.generatedAt) : null,
      });
      out.push({ account: src.account, ok: true });
    } catch (err) {
      out.push({ account: src.account, ok: false, error: String(err instanceof Error ? err.message : err).slice(0, 200) });
    }
  }
  return out;
}

/** Seneste snapshot pr. konto for en kunde (eller Kinlys egne med companyId null). */
export async function latestNewsletterFor(db: Db, companyId: string) {
  const rows = await db
    .select()
    .from(newsletterSnapshot)
    .where(eq(newsletterSnapshot.companyId, companyId))
    .orderBy(sql`${newsletterSnapshot.takenAt} desc`)
    .limit(20);
  const seen = new Set<string>();
  const latest = rows.filter((r) => (seen.has(r.account) ? false : (seen.add(r.account), true)));
  // Modtager-historik: seneste måling pr. dansk kalenderdag, 120 dage bagud.
  const past = await db
    .select({ account: newsletterSnapshot.account, takenAt: newsletterSnapshot.takenAt, lists: newsletterSnapshot.lists })
    .from(newsletterSnapshot)
    .where(and(eq(newsletterSnapshot.companyId, companyId), sql`${newsletterSnapshot.takenAt} > now() - interval '120 days'`))
    .orderBy(sql`${newsletterSnapshot.takenAt} asc`);
  return latest.map((snap) => ({ ...snap, history: audienceHistory(past.filter((p) => p.account === snap.account)) }));
}

export function audienceHistory(rows: { takenAt: Date; lists: { name: string; subscribers: number }[] }[]): { day: string; subscribers: number }[] {
  const byDay = new Map<string, number>();
  for (const r of rows) {
    const day = r.takenAt.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
    byDay.set(day, r.lists.filter((l) => isAudienceList(l.name)).reduce((sum, l) => sum + l.subscribers, 0));
  }
  return [...byDay].map(([day, subscribers]) => ({ day, subscribers }));
}
