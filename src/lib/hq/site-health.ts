// Dagligt tjek af kundernes live sites: svarer de, hvor hurtigt, og hvornår udløber
// SSL-certifikatet. Et site der går ned (eller kommer op igen) bliver én aktivitet på
// kunden og en "haster"-linje i kundeoverblikket — så vi ved det før kunden.
import tls from "node:tls";
import { and, eq, isNotNull } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, site } from "../db/schema.ts";
import { safeFetch } from "../safe-fetch.ts";

export interface SiteHealth {
  checkedAt: string;
  ok: boolean;
  status: number;
  ms: number;
  sslDaysLeft: number | null;
  error?: string;
  /** Første tjek hvor sitet ikke svarede; null når det svarer. */
  downSince: string | null;
}

type Probe = Pick<SiteHealth, "ok" | "status" | "ms" | "sslDaysLeft" | "error">;

/** Domænet vinder over company.website; kun http(s). */
export function siteUrl(domain: string | null | undefined, website: string | null | undefined): string | null {
  const raw = (domain || website || "").trim();
  if (!raw) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return u.protocol === "https:" || u.protocol === "http:" ? `${u.protocol}//${u.host}/` : null;
  } catch {
    return null;
  }
}

function sslDaysLeft(host: string, now: number): Promise<number | null> {
  return new Promise((resolve) => {
    const sock = tls.connect({ host, servername: host, port: 443, timeout: 8000 }, () => {
      const cert = sock.getPeerCertificate();
      sock.end();
      const exp = cert?.valid_to ? Date.parse(cert.valid_to) : NaN;
      resolve(Number.isFinite(exp) ? Math.floor((exp - now) / 86_400_000) : null);
    });
    sock.on("error", () => resolve(null));
    sock.on("timeout", () => { sock.destroy(); resolve(null); });
  });
}

export async function probe(url: string, now = Date.now()): Promise<Probe> {
  const started = Date.now();
  let status = 0;
  let error: string | undefined;
  try {
    const r = await safeFetch(url, { timeoutMs: 10_000, maxBytes: 64_000 });
    status = r?.status ?? 0;
    if (!r) error = "ugyldig adresse";
  } catch (e) {
    error = e instanceof Error ? e.message.slice(0, 120) : "fejl";
  }
  const ms = Date.now() - started;
  const host = new URL(url).hostname;
  const ssl = url.startsWith("https:") ? await sslDaysLeft(host, now) : null;
  return { ok: status >= 200 && status < 400, status, ms, sslDaysLeft: ssl, ...(error ? { error } : {}) };
}

/** Ren overgang: holder styr på hvornår sitet gik ned. */
export function nextHealth(prev: SiteHealth | null, p: Probe, nowIso: string): SiteHealth {
  const downSince = p.ok ? null : prev && !prev.ok && prev.downSince ? prev.downSince : nowIso;
  return { checkedAt: nowIso, ...p, downSince };
}

/** Kører for alle kunders sites med en adresse. Returnerer antal tjekket og ændringer. */
export async function checkAllSites(db: Db, opts: { now?: number; probeFn?: typeof probe } = {}): Promise<{ checked: number; down: string[]; recovered: string[] }> {
  const now = opts.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const run = opts.probeFn ?? probe;
  const rows = await db
    .select({ siteId: site.id, companyId: company.id, name: company.name, domain: site.domain, status: site.status, website: company.website, health: site.health })
    .from(site)
    .innerJoin(company, eq(company.id, site.companyId))
    .where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false), eq(company.archived, false)));
  const down: string[] = [];
  const recovered: string[] = [];
  let checked = 0;
  for (const r of rows) {
    // Kun live sites: et domæne sat under opstart peger måske ikke nogen steder endnu,
    // og uden domæne er website kundens gamle site (council 23/9).
    if (r.status !== "live") continue;
    const url = siteUrl(r.domain, r.website);
    if (!url) continue;
    const prev = (r.health as SiteHealth | null) ?? null;
    const next = nextHealth(prev, await run(url, now), nowIso);
    checked++;
    await db.update(site).set({ health: next }).where(eq(site.id, r.siteId));
    const wasOk = prev ? prev.ok : true;
    if (wasOk && !next.ok) {
      down.push(r.name);
      await db.insert(activity).values({
        companyId: r.companyId, clientName: r.name, actor: "system", type: "drift",
        summary: `Sitet svarer ikke (${next.status || next.error || "ingen svar"}) — ${url}`,
      });
    } else if (prev && !prev.ok && next.ok) {
      recovered.push(r.name);
      await db.insert(activity).values({
        companyId: r.companyId, clientName: r.name, actor: "system", type: "drift",
        summary: `Sitet svarer igen — ${url}`,
      });
    }
  }
  return { checked, down, recovered };
}
