// seo-signals.ts — Kinlys EGEN synlighed (SEO-fanen under Pipeline). Ikke
// kundernes SEO: den bor på kundeprofilen. Tre JSON-dokumenter i store.ts,
// samme mønster som competitors.ts (lav skrivevolumen, ingen migration):
//   seo/kinly-gsc/latest  — Search Console for kinly.dk (mandags-cron gsc-snapshot)
//   seo/geo/latest        — Hermes' geo_citation_loop.py  (POST /api/agent/seo-signals, action "geo")
//   seo/blogcheck/latest  — Hermes' blog_seo_geo_tjek.py  (samme rute, action "blogcheck")
// Handlingerne nederst er rene regler over de tre + konkurrentrapporten — ingen LLM.
import { store } from "../store.ts";
import type { CompetitorReport } from "./competitors.ts";
import { CompetitorInputError, bool, enumOf, isoDate, noUnknownKeys, obj, str, strArray } from "./competitors.ts";

const KEY_GSC = "seo/kinly-gsc/latest";
const KEY_GEO = "seo/geo/latest";
const KEY_BLOG = "seo/blogcheck/latest";

// ---------------------------------------------------------------- Google (kinly.dk)

export interface GscTotals { clicks: number; impressions: number; position: number | null }
export interface KinlyGscQuery { query: string; clicks: number; impressions: number; position: number; prevClicks: number | null; prevPosition: number | null }
export interface KinlyGsc {
  fetchedAt: string;
  /** null = service-accounten har ikke adgang til kinly.dk i Search Console. */
  property: string | null;
  periodStart: string;
  periodEnd: string;
  totals: GscTotals;
  prevTotals: GscTotals;
  queries: KinlyGscQuery[];
}

export const saveKinlyGsc = (doc: KinlyGsc) => store.put(KEY_GSC, doc);
export const loadKinlyGsc = () => store.get<KinlyGsc>(KEY_GSC);

/** Penge-søgninger: nogen der leder efter en hjemmeside/et bureau. Brand-søgninger ("kinly") tæller ikke. */
const MONEY_RE = /hjemmeside|webdesign|webbureau|webside|website|webudvikl|seo|pris/i;
export const isMoneyQuery = (q: string) => MONEY_RE.test(q) && !/kinly/i.test(q);

export type GscFlag = "side1-ingen-klik" | "taet-paa-side1" | null;
export function gscFlag(q: { clicks: number; impressions: number; position: number }): GscFlag {
  if (q.position <= 10 && q.impressions >= 50 && q.clicks === 0) return "side1-ingen-klik";
  if (q.position > 10 && q.position <= 20) return "taet-paa-side1";
  return null;
}

// ---------------------------------------------------------------- AI-søgning (GEO)

export interface GeoResult { query: string; group?: string; engine: string; measuredAt: string; mentionedKinly: boolean; competitors: string[] }
export interface GeoRun { receivedAt: string; results: GeoResult[] }

export function validateGeo(raw: unknown): GeoResult[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new CompetitorInputError("results skal være en ikke-tom liste");
  return raw.slice(0, 60).map((v, i) => {
    const label = `results[${i}]`;
    const o = obj(v, label);
    noUnknownKeys(o, ["query", "group", "engine", "measuredAt", "mentionedKinly", "competitors"], label);
    return {
      query: str(o.query, `${label}.query`, 200, true)!,
      ...(o.group !== undefined ? { group: str(o.group, `${label}.group`, 80) } : {}),
      engine: str(o.engine, `${label}.engine`, 40, true)!,
      measuredAt: isoDate(o.measuredAt, `${label}.measuredAt`),
      mentionedKinly: bool(o.mentionedKinly, `${label}.mentionedKinly`, true)!,
      competitors: strArray(o.competitors, `${label}.competitors`, 10, 80) ?? [],
    };
  });
}

export async function saveGeo(raw: unknown): Promise<GeoRun> {
  const run: GeoRun = { receivedAt: new Date().toISOString(), results: validateGeo(raw) };
  await store.put(KEY_GEO, run);
  return run;
}
export const loadGeo = () => store.get<GeoRun>(KEY_GEO);

/** Hvor ofte hvert konkurrent-domæne nævnes, flest først. */
export function geoCompetitorCounts(results: GeoResult[]): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of results) for (const c of new Set(r.competitors)) m.set(c, (m.get(c) ?? 0) + 1);
  return [...m].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------- Blog-tjek

export type QuestionAnswer = "ja" | "delvist" | "nej" | "ukendt";
export interface BlogCheckPost {
  id: string;
  title: string;
  slug?: string;
  stage: string;
  keyword: string;
  seoIssues: string[];
  questions: { question: string; answer: QuestionAnswer }[];
}
export interface BlogCheck { checkedAt: string; posts: BlogCheckPost[] }

export function validateBlogCheck(checkedAt: unknown, posts: unknown): BlogCheck {
  if (!Array.isArray(posts)) throw new CompetitorInputError("posts skal være en liste");
  return {
    checkedAt: isoDate(checkedAt, "checkedAt"),
    posts: posts.slice(0, 40).map((v, i) => {
      const label = `posts[${i}]`;
      const o = obj(v, label);
      noUnknownKeys(o, ["id", "title", "slug", "stage", "keyword", "seoIssues", "questions"], label);
      if (o.questions !== undefined && !Array.isArray(o.questions)) throw new CompetitorInputError(`${label}.questions skal være en liste`);
      const questions = ((o.questions as unknown[] | undefined) ?? []).slice(0, 8).map((q, j) => {
        const ql = `${label}.questions[${j}]`;
        const qo = obj(q, ql);
        noUnknownKeys(qo, ["question", "answer"], ql);
        return {
          question: str(qo.question, `${ql}.question`, 200, true)!,
          answer: enumOf(qo.answer, `${ql}.answer`, ["ja", "delvist", "nej", "ukendt"] as const, true)!,
        };
      });
      const slug = str(o.slug, `${label}.slug`, 120);
      return {
        id: str(o.id, `${label}.id`, 60, true)!,
        title: str(o.title, `${label}.title`, 200, true)!,
        ...(slug ? { slug } : {}),
        stage: str(o.stage, `${label}.stage`, 20, true)!,
        keyword: str(o.keyword, `${label}.keyword`, 120) ?? "",
        seoIssues: strArray(o.seoIssues, `${label}.seoIssues`, 12, 200) ?? [],
        questions,
      };
    }),
  };
}

export async function saveBlogCheck(checkedAt: unknown, posts: unknown): Promise<BlogCheck> {
  const doc = validateBlogCheck(checkedAt, posts);
  await store.put(KEY_BLOG, doc);
  return doc;
}
export const loadBlogCheck = () => store.get<BlogCheck>(KEY_BLOG);

// ---------------------------------------------------------------- os mod konkurrenterne

// Kinlys egne værdier: læst på kinly.dk's forside 27/9 — samme kilde som
// KINLY_PROFILE i vps/hermes-scripts/konkurrent_scan.py. Ret begge hvis siden ændres.
export const KINLY_SITE = { faq: true, citable: true, quotes: true, schema: true, prices: true } as const;
export const KINLY_SITE_READ = "27. sep.";

export interface CompareRow { key: keyof typeof KINLY_SITE; label: string; kinly: boolean; have: number; measured: number }
export function compareWithCompetitors(report: CompetitorReport | null): CompareRow[] {
  const rivals = (report?.competitors ?? []).filter((c) => c.kind !== "ai-bygger");
  const rows: [keyof typeof KINLY_SITE, string, (c: (typeof rivals)[number]) => boolean | undefined][] = [
    ["faq", "Synlig FAQ", (c) => c.seoExtra?.faqVisible],
    ["citable", "Citerbare svar", (c) => c.geoExtra?.citableAnswers],
    ["quotes", "Kundecitater som tekst", (c) => c.seoExtra?.reviewsAsText],
    ["schema", "Schema (LocalBusiness)", (c) => c.site?.schemaLocalBusiness],
    ["prices", "Synlige priser", (c) => c.site?.hasPrices],
  ];
  return rows.map(([key, label, get]) => {
    const vals = rivals.map(get).filter((v): v is boolean => typeof v === "boolean");
    return { key, label, kinly: KINLY_SITE[key], have: vals.filter(Boolean).length, measured: vals.length };
  });
}

// ---------------------------------------------------------------- handlinger (regler, ingen LLM)

export interface SeoAction {
  id: string;
  title: string;
  detail: string;
  blog?: { title: string; note: string; category: "lokal-synlighed" | "ai-soegning" | "hjemmeside" };
  href?: string;
  hrefLabel?: string;
}

export const GSC_URL = `https://search.google.com/search-console/performance/search-analytics?resource_id=${encodeURIComponent("sc-domain:kinly.dk")}`;
const pos = (n: number) => n.toLocaleString("da-DK", { maximumFractionDigits: 1 });

export function seoActions(input: { gsc: KinlyGsc | null; geo: GeoRun | null; blog: BlogCheck | null; compare: CompareRow[] }): SeoAction[] {
  const out: SeoAction[] = [];
  const money = (input.gsc?.queries ?? []).filter((q) => isMoneyQuery(q.query)).sort((a, b) => b.impressions - a.impressions);

  for (const q of money.filter((q) => gscFlag(q) === "side1-ingen-klik").slice(0, 2)) {
    out.push({
      id: `gsc-klik-${q.query}`,
      title: `Få klik på "${q.query}"`,
      detail: `Side 1 (pos. ${pos(q.position)}) med ${q.impressions} visninger, men 0 klik. Skriv title og beskrivelse om, så de lover svaret.`,
      href: GSC_URL,
      hrefLabel: "Åbn Search Console",
    });
  }
  const close = money.find((q) => gscFlag(q) === "taet-paa-side1");
  if (close) {
    out.push({
      id: `gsc-side1-${close.query}`,
      title: `Løft "${close.query}" til side 1`,
      detail: `Pos. ${pos(close.position)} med ${close.impressions} visninger. Et indlæg der svarer præcist på søgningen, med links fra forsiden, kan skubbe den op.`,
      blog: { title: close.query.slice(0, 60), note: `Search Console: pos. ${pos(close.position)}, ${close.impressions} visninger på 28 dage. Mål: side 1.`, category: "lokal-synlighed" },
    });
  }

  const missing = (input.geo?.results ?? []).filter((r) => !r.mentionedKinly).sort((a, b) => b.competitors.length - a.competitors.length);
  for (const r of missing.slice(0, 2)) {
    const who = r.competitors.slice(0, 3).join(", ");
    out.push({
      id: `geo-${r.query}`,
      title: `Bliv nævnt på "${r.query}"`,
      detail: `${who ? `AI nævner ${who}` : "AI nævner andre"}, ikke Kinly. Skriv et kort svar på netop det spørgsmål: spørgsmålet som overskrift, svaret i første sætning.`,
      blog: { title: r.query.slice(0, 60), note: `AI-søgning ${r.measuredAt.slice(0, 10)}: Kinly nævnes ikke${who ? `; ${who} gør` : ""}.`.slice(0, 300), category: "ai-soegning" },
    });
  }

  const worst = (input.blog?.posts ?? [])
    .map((p) => ({ p, nej: p.questions.filter((q) => q.answer === "nej"), n: p.seoIssues.length + p.questions.filter((q) => q.answer === "nej").length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)[0];
  if (worst) {
    out.push({
      id: `blog-${worst.p.id}`,
      title: `Ret "${worst.p.title}"`,
      detail: worst.p.seoIssues[0] ?? `Besvar kundespørgsmålet "${worst.nej[0].question}" i teksten.`,
      href: "/blog",
      hrefLabel: "Åbn Blog",
    });
  }

  for (const c of input.compare) {
    if (!c.kinly && c.measured > 0 && c.have / c.measured >= 0.3) {
      out.push({ id: `konk-${c.key}`, title: `${c.label} mangler på kinly.dk`, detail: `${c.have} af ${c.measured} konkurrenter har det.`, href: "https://kinly.dk", hrefLabel: "Åbn kinly.dk" });
    }
  }
  return out.slice(0, 6);
}
