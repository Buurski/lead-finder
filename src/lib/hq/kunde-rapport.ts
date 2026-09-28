// Månedsrapporten til kunder med SEO i abonnementet: målinger ind, status ud.
//
// Flow: kunde_seo_tjek.py (VPS) → POST /api/agent/kunde-rapport → gemMaaling()
// → HQ viser /kunder/rapporter → Lucas åbner rapporten, henter PDF'en, sender
// selv fra Gmail og trykker "Sendt". Intet sendes herfra.
//
// Hvem SKAL have rapporten kommer fra DB (kunder med ydelsen "seo" på
// profilen), ikke fra tidligere rapporter: ellers kan en kunde der aldrig har
// fået én, aldrig mangle. Og måneden der dømmes, er den valgte kalendermåned,
// ikke "nyeste måned i materialet": kører jobbet ikke i oktober, skal oktober
// lyse rødt, ikke vise september som grøn.
//
// Lager: KV via store.ts (samme greb som seo-signals/konkurrenter, ingen
// migration). Én måling pr. domæne pr. måned: en ny sendbar kørsel samme
// måned overskriver (idempotent), indtil rapporten er markeret sendt; så er
// måneden låst, så PDF'en kunden fik, altid kan genskabes.
import { and, desc, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { activity, company, contact, gscSnapshot } from "../db/schema.ts";
import { store } from "../store.ts";
import type { GscChange } from "./gsc-updates.ts";
import { byggRapport, hostAf, maanedFor, type GscInput, type Maaling, type RapportModel } from "./kunde-rapport-model.ts";

export class KundeRapportError extends Error {}

const PREFIX_MAALING = "kunderapport/maaling/";
const PREFIX_LEVERING = "kunderapport/levering/";
const MAANED_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const HOST_RE = /^[a-z0-9.-]{3,100}$/;

export type LeveringStatus = "sendt" | "sprunget";
export interface Levering {
  status: LeveringStatus;
  at: string;
  af: string;
  grund?: string;
  /** Rapporten præcis som kunden fik den, fastfrosset ved "sendt" (council 28/9). */
  rapport?: RapportModel;
  /** Målingen rapporten blev bygget af; næste måneds pile peger mod den, ikke mod en senere overskrivning. */
  maaling?: Maaling;
}

/** Levering uden den fastfrosne rapport: det der sendes til browseren. */
export const kortLevering = (l: Levering | null): Levering | null => (l ? { status: l.status, at: l.at, af: l.af, ...(l.grund ? { grund: l.grund } : {}) } : null);

interface GemtMaaling {
  modtaget: string;
  maaling: Maaling;
}

const keyM = (host: string, ym: string) => `${PREFIX_MAALING}${host}/${ym}`;
const keyL = (host: string, ym: string) => `${PREFIX_LEVERING}${host}/${ym}`;

export function tjekMaaned(ym: unknown): string {
  if (typeof ym !== "string" || !MAANED_RE.test(ym)) throw new KundeRapportError("ugyldig måned (brug ÅÅÅÅ-MM)");
  return ym;
}
export function tjekHost(h: unknown): string {
  const host = typeof h === "string" ? hostAf(h) : "";
  if (!HOST_RE.test(host) || !host.includes(".")) throw new KundeRapportError("ugyldigt domæne");
  return host;
}

// ---------------------------------------------------------------- indgang (gaten)

const s = (v: unknown, label: string, max = 2000): string => {
  if (typeof v !== "string" || !v.trim()) throw new KundeRapportError(`${label} mangler`);
  if (v.length > max) throw new KundeRapportError(`${label} er for lang`);
  return v;
};

/**
 * Motorens JSON → Maaling. Afviser alt der ikke må nå en kunde: gaten står også
 * i motoren, men et tal fra en blokeret kørsel må ikke kunne havne i en mail
 * bare fordi nogen en dag glemmer den ene af dem.
 */
export function validerMaaling(raw: unknown): Maaling {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new KundeRapportError("måling skal være et objekt");
  const r = raw as Record<string, unknown>;
  if (r.status_flag !== "ok" || r.kan_sendes !== true) {
    const grund = typeof r.kan_sendes_grund === "string" && r.kan_sendes_grund ? `: ${r.kan_sendes_grund.slice(0, 200)}` : "";
    throw new KundeRapportError(`målingen er ikke sendbar (status ${String(r.status_flag)})${grund}`);
  }
  const maalt = s(r.maalt, "maalt", 40);
  if (Number.isNaN(Date.parse(maalt))) throw new KundeRapportError("maalt er ikke et tidspunkt");
  // Uden tidszone læses tiden som UTC på Vercel, og en måling kl. 23:30 d. 30/9 lander i oktober.
  if (!/(Z|[+-]\d\d:\d\d)$/.test(maalt)) throw new KundeRapportError("maalt skal have tidszone (fx +02:00)");
  if (!Array.isArray(r.punkter) || r.punkter.length === 0 || r.punkter.length > 60) throw new KundeRapportError("punkter mangler");
  const punkter = r.punkter.map((p, i) => {
    if (!p || typeof p !== "object") throw new KundeRapportError(`punkter[${i}] er ugyldigt`);
    const q = p as Record<string, unknown>;
    return {
      punkt: s(q.punkt, `punkter[${i}].punkt`, 40),
      vaerdi: typeof q.vaerdi === "string" ? q.vaerdi.slice(0, 600) : typeof q.vaerdi === "number" ? q.vaerdi : null,
      status: s(q.status, `punkter[${i}].status`, 20),
      alvor: typeof q.alvor === "string" ? q.alvor.slice(0, 20) : undefined,
      note: typeof q.note === "string" ? q.note.slice(0, 400) : null,
    };
  });
  const vigtigste = Array.isArray(r.vigtigste)
    ? r.vigtigste
        .filter((v): v is Record<string, unknown> => !!v && typeof v === "object")
        .map((v) => ({ rang: Number(v.rang) || 99, punkt: String(v.punkt ?? "").slice(0, 40) }))
        .filter((v) => v.punkt)
        .slice(0, 10)
    : [];
  let gsc: Maaling["gsc"] = null;
  const g = r.gsc as Record<string, unknown> | null | undefined;
  if (g && typeof g === "object" && Array.isArray(g.sider)) {
    const periode = Array.isArray(g.periode) && g.periode.length === 2 ? ([String(g.periode[0]).slice(0, 10), String(g.periode[1]).slice(0, 10)] as [string, string]) : undefined;
    const sider = g.sider
      .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
      .slice(0, 50)
      .map((x) => ({ side: String(x.side ?? "").slice(0, 300), klik: Number(x.klik) || 0, visninger: Number(x.visninger) || 0, position: Number(x.position) || undefined }));
    gsc = { periode, sider };
  }
  const url = s(r.url, "url", 300);
  tjekHost(url);
  return {
    navn: typeof r.navn === "string" ? r.navn.slice(0, 120) : hostAf(url),
    url,
    kilde: typeof r.kilde === "string" ? r.kilde.slice(0, 20) : "direkte",
    maalt,
    punkter,
    gsc,
    status_flag: "ok",
    kan_sendes: true,
    vigtigste,
  };
}

export async function gemMaaling(raw: unknown, nu = new Date()): Promise<{ domaene: string; maaned: string; overskrev: boolean }> {
  const maaling = validerMaaling(raw);
  const domaene = tjekHost(maaling.url);
  const maaned = maanedFor(maaling.maalt);
  if ((await hentLevering(domaene, maaned))?.status === "sendt") {
    throw new KundeRapportError(`rapporten for ${domaene} i ${maaned} er allerede sendt; målingen er låst`);
  }
  const key = keyM(domaene, maaned);
  const foer = await store.get<GemtMaaling>(key);
  // En ældre kørsel (fx en genkørsel der ankommer sent) må ikke erstatte en nyere.
  if (foer && Date.parse(foer.maaling.maalt) > Date.parse(maaling.maalt)) {
    throw new KundeRapportError("der ligger allerede en nyere måling for måneden");
  }
  await store.put(key, { modtaget: nu.toISOString(), maaling } satisfies GemtMaaling);
  return { domaene, maaned, overskrev: Boolean(foer) };
}

export async function hentMaaling(host: string, ym: string): Promise<Maaling | null> {
  return (await store.get<GemtMaaling>(keyM(host, ym)))?.maaling ?? null;
}

export async function hentLevering(host: string, ym: string): Promise<Levering | null> {
  return store.get<Levering>(keyL(host, ym));
}

/** Seneste måling kunden faktisk fik (sendt) før måneden. Det er den pilene peger mod. */
export async function forrigeSendte(host: string, ym: string): Promise<Maaling | null> {
  const maaneder = (await store.list(`${PREFIX_MAALING}${host}/`))
    .map((k) => k.slice(`${PREFIX_MAALING}${host}/`.length))
    .filter((m) => MAANED_RE.test(m) && m < ym)
    .sort()
    .reverse();
  for (const m of maaneder) {
    const lev = await hentLevering(host, m);
    if (lev?.status === "sendt") return lev.maaling ?? hentMaaling(host, m);
  }
  return null;
}

const FORTRYD_MS = 15 * 60_000;

export async function saetLevering(host: string, ym: string, status: LeveringStatus | "aaben", af: string, grund?: string, nu = new Date(), rapport?: RapportModel | null): Promise<Levering | null> {
  tjekHost(host);
  tjekMaaned(ym);
  if (status !== "sendt" && status !== "sprunget" && status !== "aaben") throw new KundeRapportError("status skal være sendt, sprunget eller aaben");
  // Sendt er en kendsgerning: kunden har rapporten, og næste måneds pile peger mod den.
  // 15 minutter til at fortryde et fejlklik, derefter er den låst (council 28/9).
  const foer = await hentLevering(host, ym);
  if (foer?.status === "sendt") {
    if (status === "sendt") return foer; // gentaget klik: behold den frosne rapport og tidspunktet
    if (status === "sprunget") throw new KundeRapportError("rapporten er allerede sendt; fortryd den først");
    if (nu.getTime() - Date.parse(foer.at) > FORTRYD_MS) throw new KundeRapportError("rapporten er sendt og kan ikke længere fortrydes");
  }
  if (status === "aaben") {
    await store.delete(keyL(host, ym));
    return null;
  }
  // ponytail: rapporten bygges i ruten lige før; lander en ny VPS-måling i de millisekunder
  // imellem, fryses rapport og måling fra hver sin kørsel. Kørslen er månedlig, så det accepteres.
  const maaling = status === "sendt" ? await hentMaaling(host, ym) : null;
  if (status === "sendt" && !maaling) throw new KundeRapportError("der er ingen måling for måneden, så der er ingen rapport at sende");
  const g = (grund ?? "").trim().slice(0, 200);
  if (status === "sprunget" && !g) throw new KundeRapportError("skriv kort hvorfor den springes over");
  const lev: Levering = { status, at: nu.toISOString(), af, ...(g ? { grund: g } : {}), ...(status === "sendt" && rapport ? { rapport } : {}), ...(maaling ? { maaling } : {}) };
  await store.put(keyL(host, ym), lev);
  return lev;
}

// ---------------------------------------------------------------- kunder og data fra DB

interface KundeRaekke {
  id: string;
  name: string;
  website: string;
  services: string[];
  archived: boolean;
}

async function kunder(db: Db): Promise<(KundeRaekke & { host: string | null })[]> {
  const rows = await db
    .select({ id: company.id, name: company.name, website: company.website, services: company.services, archived: company.archived })
    .from(company)
    // Arkiverede tages med (som /kunder gør), så en SEO-kunde aldrig forsvinder uden spor.
    .where(and(isNotNull(company.clientNo), eq(company.clientRemoved, false)))
    // Fast rækkefølge, aktive først: to firmaer med samme side vælges ens i oversigt og rapport.
    .orderBy(company.archived, company.rowNo);
  return rows.map((r) => ({ ...r, host: r.website ? hostAf(r.website) || null : null }));
}

async function gscFor(db: Db, companyId: string, foer: Date): Promise<GscInput | null> {
  const [g] = await db
    .select()
    .from(gscSnapshot)
    .where(and(eq(gscSnapshot.companyId, companyId), lt(gscSnapshot.takenAt, foer)))
    .orderBy(desc(gscSnapshot.takenAt))
    .limit(1);
  if (!g) return null;
  // Snapshottet tages ugentligt. Ældre end 10 dage = forrige måneds tal; så hellere motorens egne.
  if (foer.getTime() - g.takenAt.getTime() > 10 * 86_400_000) return null;
  return { periodStart: g.periodStart, periodEnd: g.periodEnd, clicks: g.clicks, impressions: g.impressions, position: g.position, topQueries: g.topQueries, daily: g.daily };
}

function maanedStart(ym: string): Date {
  // Dansk midnat den 1.: UTC-midnat minus Københavns forskel den dag (1 t vinter, 2 t sommer).
  const [y, m] = ym.split("-").map(Number);
  const utc = Date.UTC(y, m - 1, 1);
  const timeKbh = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Copenhagen", hour: "2-digit", hourCycle: "h23" }).format(new Date(utc)));
  return new Date(utc - timeKbh * 3_600_000);
}
function naesteMaaned(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

async function arbejdeI(db: Db, companyId: string, ym: string): Promise<string[]> {
  const rows = await db
    .select({ summary: activity.summary })
    .from(activity)
    .where(
      and(
        eq(activity.companyId, companyId),
        eq(activity.type, "arbejde"),
        sql`coalesce((${activity.payload}->>'kundeSynlig')::boolean, false)`,
        gte(activity.at, maanedStart(ym)),
        lt(activity.at, maanedStart(naesteMaaned(ym))),
      ),
    )
    .orderBy(activity.at)
    .limit(8);
  return rows.map((r) => r.summary).filter(Boolean);
}

/** "Det er nyt siden sidst": ugens GSC-sammenligninger i måneden, hvor Jev sagde "værd at fortælle
 *  kunden" (payload.kunde). Kun gode ændringer med kundetekst; nyeste først, én pr. slags. */
async function nyhederI(db: Db, companyId: string, ym: string): Promise<{ titel: string; tekst: string }[]> {
  const rows = await db
    .select({ payload: activity.payload })
    .from(activity)
    .where(
      and(
        eq(activity.companyId, companyId),
        eq(activity.type, "seo-opdatering"),
        sql`coalesce((${activity.payload}->>'kunde')::boolean, false)`,
        gte(activity.at, maanedStart(ym)),
        lt(activity.at, maanedStart(naesteMaaned(ym))),
      ),
    )
    .orderBy(desc(activity.at))
    .limit(10);
  const set = new Map<string, { titel: string; tekst: string }>();
  for (const r of rows) {
    const changes = (r.payload as { changes?: GscChange[] } | null)?.changes ?? [];
    // Klik og visninger står allerede i rapportens store tal (mod forrige 28 dage). To forskellige
    // "sidst" side om side ligner regnefejl, så nyhederne viser kun det, tallene ikke dækker.
    for (const c of changes) if (c.good && c.kunde && c.kind !== "klik" && c.kind !== "visninger" && !set.has(c.kind)) set.set(c.kind, c.kunde);
  }
  return [...set.values()].slice(0, 6) // modellen prioriterer og skærer til 3;
}

async function fornavn(db: Db, companyId: string): Promise<string> {
  const [c] = await db.select({ name: contact.name }).from(contact).where(eq(contact.companyId, companyId)).limit(1);
  return c?.name.trim().split(/\s+/)[0] ?? "";
}

/** Alt der skal til for at bygge én kundes rapport. null = ingen måling i måneden. */
export async function rapportFor(db: Db, host: string, ym: string): Promise<RapportModel | null> {
  // Sendt = fastfrosset: kunden skal kunne få præcis samme PDF igen.
  const lev = await hentLevering(host, ym);
  if (lev?.status === "sendt" && lev.rapport) return lev.rapport;
  const maaling = await hentMaaling(host, ym);
  if (!maaling) return null;
  const alle = (await kunder(db)).filter((x) => x.host === host);
  const k = alle.find((x) => x.services.includes("seo")) ?? alle[0] ?? null; // samme valg som oversigten
  const efterMaaling = new Date(Date.parse(maaling.maalt) + 86_400_000);
  return byggRapport({
    kunde: k?.name || maaling.navn,
    maaling,
    forrige: await forrigeSendte(host, ym),
    gsc: k ? await gscFor(db, k.id, efterMaaling) : null,
    arbejde: k ? await arbejdeI(db, k.id, ym) : [],
    nyt: k ? await nyhederI(db, k.id, ym) : [],
    hilsen: k ? await fornavn(db, k.id) : "",
  });
}

// ---------------------------------------------------------------- oversigten

export type RaekkeStatus = "mangler" | "klar" | "sendt" | "sprunget";

export interface OversigtRaekke {
  companyId: string | null;
  kunde: string;
  domaene: string;
  tilmeldt: boolean; // har ydelsen "seo" = skal have rapporten
  status: RaekkeStatus;
  variant: "med-adgang" | "uden-adgang" | null;
  maalt: string | null;
  fund: number; // antal "vigtigste" i målingen: >0 på en side vi selv har bygget = ret det før du sender
  haster: boolean; // et af de vigtigste er alvor "hoej"
  levering: Levering | null;
  /** Sendt for mere end 15 min siden: kan ikke fortrydes. */
  laast: boolean;
  note: string;
}

export interface Oversigt {
  maaned: string;
  raekker: OversigtRaekke[];
  taeller: Record<RaekkeStatus, number>;
}

const ORDEN: Record<RaekkeStatus, number> = { mangler: 0, klar: 1, sprunget: 2, sendt: 3 };

export async function oversigt(db: Db, ym: string): Promise<Oversigt> {
  tjekMaaned(ym);
  const alle = await kunder(db);
  const tilmeldte = alle.filter((k) => k.services.includes("seo"));
  const maalteHosts = new Set(
    (await store.list(PREFIX_MAALING))
      .map((k) => k.slice(PREFIX_MAALING.length).split("/"))
      .filter(([, m]) => m === ym)
      .map(([h]) => h),
  );

  const raekker: OversigtRaekke[] = [];
  const set = new Set<string>();
  const byg = async (host: string, kunde: string, companyId: string | null, tilmeldt: boolean, arkiveret = false) => {
    set.add(host);
    const [maaling, levering] = await Promise.all([hentMaaling(host, ym), hentLevering(host, ym)]);
    const harGsc = companyId ? Boolean(await gscFor(db, companyId, maaling ? new Date(Date.parse(maaling.maalt) + 86_400_000) : new Date())) : false;
    const status: RaekkeStatus = levering?.status ?? (maaling ? "klar" : "mangler");
    raekker.push({
      companyId,
      kunde,
      domaene: host,
      tilmeldt,
      status,
      variant: maaling ? (harGsc || maaling.gsc?.sider?.length ? "med-adgang" : "uden-adgang") : null,
      maalt: maaling?.maalt ?? null,
      fund: maaling?.vigtigste?.length ?? 0,
      // Alvorligt fund (fx siden er skjult for Google): skal ses i HQ nu, ikke først i næste mail.
      haster: Boolean(maaling?.vigtigste?.some((v) => maaling.punkter.find((p) => p.punkt === v.punkt)?.alvor === "hoej")),
      levering: kortLevering(levering),
      laast: levering?.status === "sendt" && Date.now() - Date.parse(levering.at) > FORTRYD_MS,
      note:
        status === "mangler"
          ? "Ingen sendbar måling i måneden endnu. Kør tjekket på VPS'en."
          : !tilmeldt
            ? "Målt, men kunden har ikke SEO på profilen. Skal den have rapporten?"
            : arkiveret
              ? "Kunden er arkiveret i HQ. Skal den stadig have rapporten?"
              : "",
    });
  };

  for (const k of tilmeldte) {
    if (k.host && set.has(k.host)) continue; // to firmaer med samme side = én rapport
    if (!k.host) {
      raekker.push({ companyId: k.id, kunde: k.name, domaene: "", tilmeldt: true, status: "mangler", variant: null, maalt: null, fund: 0, haster: false, levering: null, laast: false, note: "Kunden har ingen hjemmeside-adresse i HQ." });
      continue;
    }
    await byg(k.host, k.name, k.id, true, k.archived);
  }
  for (const host of maalteHosts) {
    if (set.has(host)) continue;
    const k = alle.find((x) => x.host === host);
    const m = await hentMaaling(host, ym);
    await byg(host, k?.name || m?.navn || host, k?.id ?? null, false);
  }

  raekker.sort((a, b) => Number(b.tilmeldt) - Number(a.tilmeldt) || ORDEN[a.status] - ORDEN[b.status] || a.kunde.localeCompare(b.kunde, "da"));
  const taeller: Record<RaekkeStatus, number> = { mangler: 0, klar: 0, sprunget: 0, sendt: 0 };
  for (const r of raekker) if (r.tilmeldt) taeller[r.status] += 1;
  return { maaned: ym, raekker, taeller };
}

/** Indeværende måned i dansk tid. */
export const denneMaaned = (nu = new Date()) => maanedFor(nu.toISOString());
