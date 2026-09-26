// competitors.ts — ugentlig konkurrentrapport fra Hermes (Jev-scan, søndag nat).
// Ingen migration: rapporten er ét JSON-dokument i store.ts (KV i prod, fil
// lokalt), ikke en tabel — den er skrivevolumen for lav (1×/uge) og formen
// ændrer sig stadig. Valideringen her er den ENESTE gate: både agent-ruten
// (/api/agent/competitors) og en fremtidig manuel indtastning deler den.
//
// Nøgler: "competitors/report/latest" (altid nyeste) + "competitors/report/
// <YYYY-MM-DD>" (historik, maks 12 — ældre datoer ryddes ved hver save).
import { store } from "../store.ts";

export class CompetitorInputError extends Error {}

export type Country = "DK" | "andet";
export type BlogQuality = "høj" | "mellem" | "lav";
export type GapKind = "indhold" | "ydelse" | "pris" | "synlighed";
export type CompetitorKind = "bureau" | "freelancer" | "ai-bygger";
export type MessagingAngle = "pris" | "hastighed" | "ai" | "lokal" | "garanti";
export type FindingCategory = "ydelse" | "pris-budskab" | "seo" | "geo" | "alternativ" | "forbedring";
export type FindingSuggest = "blog" | "annonce" | "kinly-dk" | "salg";
export const FINDING_CATEGORIES = ["ydelse", "pris-budskab", "seo", "geo", "alternativ", "forbedring"] as const;
export const FINDING_SUGGESTS = ["blog", "annonce", "kinly-dk", "salg"] as const;

export interface CompetitorGoogle {
  rating: number;
  reviews: number;
  source: string;
}
export interface CompetitorSite {
  pagespeedMobile?: number;
  https: boolean;
  schemaLocalBusiness: boolean;
  hasPrices: boolean;
  priceFrom?: string;
  cms?: string;
}
export interface CompetitorBlog {
  posts30d: number;
  topics: string[];
  quality: BlogQuality;
}
export interface CompetitorSocial {
  facebookFollowers?: number;
  facebookActive?: boolean;
}
export interface CompetitorGeo {
  mentionedBy: string[];
}
export interface CompetitorMessaging {
  angles: MessagingAngle[];
}
export interface CompetitorSeoExtra {
  faqVisible?: boolean;
  reviewsAsText?: boolean;
}
export interface CompetitorGeoExtra {
  citableAnswers?: boolean;
}
export interface CompetitorAiBuilder {
  priceFromText?: string;
  aiFeatures?: boolean;
  danish?: boolean;
  codeExport?: boolean;
}
export interface Competitor {
  name: string;
  url: string;
  city?: string;
  country: Country;
  google?: CompetitorGoogle;
  site?: CompetitorSite;
  services?: string[];
  positioning?: string;
  blog?: CompetitorBlog;
  social?: CompetitorSocial;
  geo?: CompetitorGeo;
  strengths?: string[];
  weaknesses?: string[];
  kind?: CompetitorKind;
  uniqueServices?: string[];
  messaging?: CompetitorMessaging;
  seoExtra?: CompetitorSeoExtra;
  geoExtra?: CompetitorGeoExtra;
  aiBuilder?: CompetitorAiBuilder;
}
export interface CompetitorPattern {
  title: string;
  detail: string;
  evidence: string[];
}
export interface CompetitorGap {
  title: string;
  detail: string;
  kind: GapKind;
}
/** Ny, mere brugbar erstatning for CompetitorGap — kategoriseret, vurderet og med
 *  en foreslået handling. Gaps lever videre (bagudkompatibilitet); UI'et fletter
 *  begge sammen (se KonkurrenterBoard). */
export interface CompetitorFinding {
  id: string;
  category: FindingCategory;
  title: string;
  detail: string;
  rating: number;
  evidence: string[];
  suggest: FindingSuggest;
}
/** Billig LLM-læsning af Jevs tal (søndag efter scannet). Sættes kun via saveAnalysis. */
export interface CompetitorAnalysis {
  at: string;
  model: string;
  points: { title: string; detail: string; category?: FindingCategory; suggest?: FindingSuggest }[];
}
export interface CompetitorReport {
  generatedAt: string;
  jevCalls: number;
  competitors: Competitor[];
  patterns: CompetitorPattern[];
  gaps: CompetitorGap[];
  findings?: CompetitorFinding[];
  analysis?: CompetitorAnalysis;
}

const MAX_COMPETITORS = 40;
const MAX_PATTERNS = 12;
const MAX_GAPS = 12;
const MAX_FINDINGS = 20;
const MAX_HISTORY = 12;
const PREFIX = "competitors/report/";
const KEY_LATEST = `${PREFIX}latest`;

// ---- små, strenge parse-helpers (klipper tekster/lister, afviser forkerte typer) ----

function obj(v: unknown, label: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new CompetitorInputError(`${label} skal være et objekt`);
  return v as Record<string, unknown>;
}
function noUnknownKeys(o: Record<string, unknown>, known: readonly string[], label: string): void {
  for (const k of Object.keys(o)) if (!known.includes(k)) throw new CompetitorInputError(`${label}.${k} kendes ikke`);
}
function str(v: unknown, label: string, max: number, required = false): string | undefined {
  if (v === undefined || v === null) {
    if (required) throw new CompetitorInputError(`${label} mangler`);
    return undefined;
  }
  if (typeof v !== "string") throw new CompetitorInputError(`${label} skal være tekst`);
  const t = v.trim();
  if (required && !t) throw new CompetitorInputError(`${label} mangler`);
  return t.length > max ? t.slice(0, max) : t; // klip i stedet for at afvise
}
function num(v: unknown, label: string, min: number, max: number, required = false): number | undefined {
  if (v === undefined || v === null) {
    if (required) throw new CompetitorInputError(`${label} mangler`);
    return undefined;
  }
  if (typeof v !== "number" || !Number.isFinite(v)) throw new CompetitorInputError(`${label} skal være et tal`);
  if (v < min || v > max) throw new CompetitorInputError(`${label} skal være mellem ${min} og ${max}`);
  return v;
}
function int(v: unknown, label: string, min: number, required = false): number | undefined {
  return intRange(v, label, min, Number.MAX_SAFE_INTEGER, required);
}
function intRange(v: unknown, label: string, min: number, max: number, required = false): number | undefined {
  const n = num(v, label, min, max, required);
  if (n === undefined) return undefined;
  if (!Number.isInteger(n)) throw new CompetitorInputError(`${label} skal være et helt tal`);
  return n;
}
function bool(v: unknown, label: string, required = false): boolean | undefined {
  if (v === undefined || v === null) {
    if (required) throw new CompetitorInputError(`${label} mangler`);
    return undefined;
  }
  if (typeof v !== "boolean") throw new CompetitorInputError(`${label} skal være sand/falsk`);
  return v;
}
function strArray(v: unknown, label: string, maxItems: number, itemMax: number): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) throw new CompetitorInputError(`${label} skal være en liste`);
  const out = v.map((item, i) => {
    if (typeof item !== "string") throw new CompetitorInputError(`${label}[${i}] skal være tekst`);
    const t = item.trim();
    return t.length > itemMax ? t.slice(0, itemMax) : t;
  }).filter(Boolean);
  return out.length > maxItems ? out.slice(0, maxItems) : out; // klip
}
function urlArray(v: unknown, label: string, maxItems: number): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw new CompetitorInputError(`${label} skal være en liste`);
  const out = v.map((item, i) => {
    if (typeof item !== "string") throw new CompetitorInputError(`${label}[${i}] skal være tekst`);
    const t = item.trim();
    if (!/^https?:\/\/\S+$/i.test(t)) throw new CompetitorInputError(`${label}[${i}] skal være en http(s)-url`);
    return t.length > 2000 ? t.slice(0, 2000) : t;
  });
  return out.length > maxItems ? out.slice(0, maxItems) : out;
}
function httpsUrl(v: unknown, label: string, required = false): string | undefined {
  const t = str(v, label, 2000, required);
  if (t === undefined) return undefined;
  if (!/^https:\/\/\S+$/i.test(t)) throw new CompetitorInputError(`${label} skal være en https-url`);
  return t;
}
function isoDate(v: unknown, label: string): string {
  if (typeof v !== "string") throw new CompetitorInputError(`${label} skal være tekst`);
  if (Number.isNaN(new Date(v).getTime())) throw new CompetitorInputError(`${label} skal være en gyldig ISO-dato`);
  return v;
}
function enumOf<T extends string>(v: unknown, label: string, options: readonly T[], required = false): T | undefined {
  if (v === undefined || v === null) {
    if (required) throw new CompetitorInputError(`${label} mangler`);
    return undefined;
  }
  if (typeof v !== "string" || !(options as readonly string[]).includes(v)) {
    throw new CompetitorInputError(`${label} skal være ${options.join(" eller ")}`);
  }
  return v as T;
}

// ---- nested objekt-parsere ----

function parseGoogle(v: unknown): CompetitorGoogle | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, "google");
  noUnknownKeys(o, ["rating", "reviews", "source"], "google");
  return {
    rating: num(o.rating, "google.rating", 0, 5, true)!,
    reviews: int(o.reviews, "google.reviews", 0, true)!,
    source: str(o.source, "google.source", 200, true)!,
  };
}
function parseSite(v: unknown): CompetitorSite | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, "site");
  noUnknownKeys(o, ["pagespeedMobile", "https", "schemaLocalBusiness", "hasPrices", "priceFrom", "cms"], "site");
  return {
    pagespeedMobile: num(o.pagespeedMobile, "site.pagespeedMobile", 0, 100, false),
    https: bool(o.https, "site.https", true)!,
    schemaLocalBusiness: bool(o.schemaLocalBusiness, "site.schemaLocalBusiness", true)!,
    hasPrices: bool(o.hasPrices, "site.hasPrices", true)!,
    priceFrom: str(o.priceFrom, "site.priceFrom", 60),
    cms: str(o.cms, "site.cms", 40),
  };
}
function parseBlog(v: unknown): CompetitorBlog | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, "blog");
  noUnknownKeys(o, ["posts30d", "topics", "quality"], "blog");
  return {
    posts30d: int(o.posts30d, "blog.posts30d", 0, true)!,
    topics: strArray(o.topics, "blog.topics", 8, 80) ?? [],
    quality: enumOf(o.quality, "blog.quality", ["høj", "mellem", "lav"] as const, true)!,
  };
}
function parseSocial(v: unknown): CompetitorSocial | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, "social");
  noUnknownKeys(o, ["facebookFollowers", "facebookActive"], "social");
  return {
    facebookFollowers: int(o.facebookFollowers, "social.facebookFollowers", 0, false),
    facebookActive: bool(o.facebookActive, "social.facebookActive", false),
  };
}
function parseGeo(v: unknown): CompetitorGeo | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, "geo");
  noUnknownKeys(o, ["mentionedBy"], "geo");
  return { mentionedBy: strArray(o.mentionedBy, "geo.mentionedBy", 5, 80) ?? [] };
}
function parseMessaging(v: unknown): CompetitorMessaging | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, "messaging");
  noUnknownKeys(o, ["angles"], "messaging");
  if (!Array.isArray(o.angles)) throw new CompetitorInputError("messaging.angles skal være en liste");
  const angles = o.angles.map((a, i) => enumOf(a, `messaging.angles[${i}]`, ["pris", "hastighed", "ai", "lokal", "garanti"] as const, true)!);
  return { angles };
}
function parseSeoExtra(v: unknown): CompetitorSeoExtra | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, "seoExtra");
  noUnknownKeys(o, ["faqVisible", "reviewsAsText"], "seoExtra");
  return {
    faqVisible: bool(o.faqVisible, "seoExtra.faqVisible", false),
    reviewsAsText: bool(o.reviewsAsText, "seoExtra.reviewsAsText", false),
  };
}
function parseGeoExtra(v: unknown): CompetitorGeoExtra | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, "geoExtra");
  noUnknownKeys(o, ["citableAnswers"], "geoExtra");
  return { citableAnswers: bool(o.citableAnswers, "geoExtra.citableAnswers", false) };
}
function parseAiBuilder(v: unknown): CompetitorAiBuilder | undefined {
  if (v === undefined || v === null) return undefined;
  const o = obj(v, "aiBuilder");
  noUnknownKeys(o, ["priceFromText", "aiFeatures", "danish", "codeExport"], "aiBuilder");
  return {
    priceFromText: str(o.priceFromText, "aiBuilder.priceFromText", 40),
    aiFeatures: bool(o.aiFeatures, "aiBuilder.aiFeatures", false),
    danish: bool(o.danish, "aiBuilder.danish", false),
    codeExport: bool(o.codeExport, "aiBuilder.codeExport", false),
  };
}

function parseCompetitor(v: unknown, i: number): Competitor {
  const label = `competitors[${i}]`;
  const o = obj(v, label);
  noUnknownKeys(o, [
    "name", "url", "city", "country", "google", "site", "services",
    "positioning", "blog", "social", "geo", "strengths", "weaknesses",
    "kind", "uniqueServices", "messaging", "seoExtra", "geoExtra", "aiBuilder",
  ], label);
  return {
    name: str(o.name, `${label}.name`, 120, true)!,
    url: httpsUrl(o.url, `${label}.url`, true)!,
    city: str(o.city, `${label}.city`, 80),
    country: enumOf(o.country, `${label}.country`, ["DK", "andet"] as const, true)!,
    google: parseGoogle(o.google),
    site: parseSite(o.site),
    services: strArray(o.services, `${label}.services`, 12, 80),
    positioning: str(o.positioning, `${label}.positioning`, 200),
    blog: parseBlog(o.blog),
    social: parseSocial(o.social),
    geo: parseGeo(o.geo),
    strengths: strArray(o.strengths, `${label}.strengths`, 5, 120),
    weaknesses: strArray(o.weaknesses, `${label}.weaknesses`, 5, 120),
    kind: enumOf(o.kind, `${label}.kind`, ["bureau", "freelancer", "ai-bygger"] as const, false),
    uniqueServices: strArray(o.uniqueServices, `${label}.uniqueServices`, 6, 40),
    messaging: parseMessaging(o.messaging),
    seoExtra: parseSeoExtra(o.seoExtra),
    geoExtra: parseGeoExtra(o.geoExtra),
    aiBuilder: parseAiBuilder(o.aiBuilder),
  };
}
function parsePattern(v: unknown, i: number): CompetitorPattern {
  const label = `patterns[${i}]`;
  const o = obj(v, label);
  noUnknownKeys(o, ["title", "detail", "evidence"], label);
  return {
    title: str(o.title, `${label}.title`, 80, true)!,
    detail: str(o.detail, `${label}.detail`, 300, true)!,
    evidence: urlArray(o.evidence, `${label}.evidence`, 5),
  };
}
function parseGap(v: unknown, i: number): CompetitorGap {
  const label = `gaps[${i}]`;
  const o = obj(v, label);
  noUnknownKeys(o, ["title", "detail", "kind"], label);
  return {
    title: str(o.title, `${label}.title`, 80, true)!,
    detail: str(o.detail, `${label}.detail`, 300, true)!,
    kind: enumOf(o.kind, `${label}.kind`, ["indhold", "ydelse", "pris", "synlighed"] as const, true)!,
  };
}
function parseFinding(v: unknown, i: number): CompetitorFinding {
  const label = `findings[${i}]`;
  const o = obj(v, label);
  noUnknownKeys(o, ["id", "category", "title", "detail", "rating", "evidence", "suggest"], label);
  return {
    id: str(o.id, `${label}.id`, 40, true)!,
    category: enumOf(o.category, `${label}.category`, FINDING_CATEGORIES, true)!,
    title: str(o.title, `${label}.title`, 80, true)!,
    detail: str(o.detail, `${label}.detail`, 240, true)!,
    rating: intRange(o.rating, `${label}.rating`, 1, 5, true)!,
    evidence: strArray(o.evidence, `${label}.evidence`, 6, 80) ?? [],
    suggest: enumOf(o.suggest, `${label}.suggest`, FINDING_SUGGESTS, true)!,
  };
}

/** Streng validering (kastes CompetitorInputError ved fejl). Lister klippes til deres loft i stedet for at blive afvist. */
export function validateReport(raw: unknown): CompetitorReport {
  const o = obj(raw, "rapport");
  noUnknownKeys(o, ["generatedAt", "jevCalls", "competitors", "patterns", "gaps", "findings"], "rapport");
  const generatedAt = isoDate(o.generatedAt, "generatedAt");
  const jevCalls = int(o.jevCalls, "jevCalls", 0, true)!;
  if (!Array.isArray(o.competitors)) throw new CompetitorInputError("competitors skal være en liste");
  if (!Array.isArray(o.patterns)) throw new CompetitorInputError("patterns skal være en liste");
  if (!Array.isArray(o.gaps)) throw new CompetitorInputError("gaps skal være en liste");
  const competitors = o.competitors.slice(0, MAX_COMPETITORS).map(parseCompetitor);
  const patterns = o.patterns.slice(0, MAX_PATTERNS).map(parsePattern);
  const gaps = o.gaps.slice(0, MAX_GAPS).map(parseGap);
  let findings: CompetitorFinding[] | undefined;
  if (o.findings !== undefined) {
    if (!Array.isArray(o.findings)) throw new CompetitorInputError("findings skal være en liste");
    findings = o.findings.slice(0, MAX_FINDINGS).map(parseFinding);
  }
  return { generatedAt, jevCalls, competitors, patterns, gaps, ...(findings ? { findings } : {}) };
}

function dateKeyOf(generatedAt: string): string {
  const d = generatedAt.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : new Date(generatedAt).toISOString().slice(0, 10);
}

/** Validerer og gemmer rapporten under latest + dags-nøglen; rydder historik ud over 12. */
export async function saveReport(raw: unknown): Promise<CompetitorReport> {
  const report = validateReport(raw);
  await store.put(KEY_LATEST, report);
  await store.put(`${PREFIX}${dateKeyOf(report.generatedAt)}`, report);
  await pruneHistory();
  return report;
}

/** Hæfter LLM-analysen på den nyeste rapport (og dens dags-nøgle). Et nyt scan
 *  erstatter rapporten og dermed analysen — den hører altid til de tal, den læste. */
export async function saveAnalysis(raw: unknown): Promise<CompetitorAnalysis> {
  const o = obj(raw, "analysis");
  noUnknownKeys(o, ["model", "points"], "analysis");
  const model = str(o.model, "analysis.model", 60, true)!;
  if (!Array.isArray(o.points) || o.points.length === 0) throw new CompetitorInputError("analysis.points skal være en ikke-tom liste");
  const points = o.points.slice(0, 6).map((v, i) => {
    const p = obj(v, `points[${i}]`);
    noUnknownKeys(p, ["title", "detail", "category", "suggest"], `points[${i}]`);
    return {
      title: str(p.title, `points[${i}].title`, 80, true)!,
      detail: str(p.detail, `points[${i}].detail`, 400, true)!,
      category: enumOf(p.category, `points[${i}].category`, FINDING_CATEGORIES, false),
      suggest: enumOf(p.suggest, `points[${i}].suggest`, FINDING_SUGGESTS, false),
    };
  });
  const latest = await loadLatestReport();
  if (!latest) throw new CompetitorInputError("ingen rapport at analysere endnu");
  const analysis: CompetitorAnalysis = { at: new Date().toISOString(), model, points };
  const next = { ...latest, analysis };
  await store.put(KEY_LATEST, next);
  await store.put(`${PREFIX}${dateKeyOf(latest.generatedAt)}`, next);
  return analysis;
}

export async function loadLatestReport(): Promise<CompetitorReport | null> {
  return store.get<CompetitorReport>(KEY_LATEST);
}

/** Nyeste-først, maks `limit` historiske rapporter (latest talt ikke med). */
export async function loadReportHistory(limit = MAX_HISTORY): Promise<CompetitorReport[]> {
  const dated = await datedKeysDesc();
  const reports = await Promise.all(dated.slice(0, limit).map((k) => store.get<CompetitorReport>(k)));
  return reports.filter((r): r is CompetitorReport => r !== null);
}

async function datedKeysDesc(): Promise<string[]> {
  const keys = await store.list(PREFIX);
  return keys.filter((k) => k !== KEY_LATEST).sort().reverse();
}

async function pruneHistory(): Promise<void> {
  const dated = await datedKeysDesc();
  for (const key of dated.slice(MAX_HISTORY)) await store.delete(key);
}
