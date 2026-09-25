// Blog-pipelinen (/blog): ideer → arbejder → klar → publicer → udgivet.
// Al skrivning går gennem denne fil, så stage-guards og publishRequestedAt kun
// findes ét sted. Mønster: hq/deals.ts.
import "server-only";
import crypto from "node:crypto";
import { asc, desc, eq, max } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { blogPost } from "../db/schema.ts";

export const BLOG_STAGES = ["ide", "arbejder", "klar", "publicer", "udgivet"] as const;
export type BlogStage = (typeof BLOG_STAGES)[number];

export const STAGE_LABEL: Record<BlogStage, string> = {
  ide: "Idéer",
  arbejder: "Arbejder",
  // Dataværdien er stadig "klar"; labelen siger hvad der skal ske herfra
  // (spec-review 24-09, punkt 9): næste handling er Lucas' gennemlæsning.
  klar: "Til gennemlæsning",
  publicer: "Publicer",
  udgivet: "Udgivet",
};

// Kun Lucas og Charlie tæller som mennesker her — det er aftalen om at
// udgiver-jobbet må tage det næste gang det kører, og det er dem der vælger
// A/B-billedet. Alt andet end de to personlige logins (agenten "hermes", det
// gamle fælles Basic-login der lander som "delt", og ukendte aktører) må kun
// flytte mellem de tre første kolonner.
const HUMAN_ACTORS = new Set<string>(["lucas", "charlie"]);
const AGENT_STAGES: readonly string[] = ["ide", "arbejder", "klar"];

// Kortets oprindelse (spec 24-09 §Datamodel). "manuel" kan kun sættes af et
// menneske i sessionen — også når idéen kommer ind via dock eller Telegram.
export const BLOG_SOURCES = ["manuel", "agent", "crm-signal"] as const;
export type BlogSource = (typeof BLOG_SOURCES)[number];

export const SOURCE_LABEL: Record<BlogSource, string> = {
  manuel: "Manuel",
  agent: "Agent",
  "crm-signal": "CRM-signal",
};

export class BlogInputError extends Error {}

const SLUG = /^[a-z0-9-]{3,80}$/;
const PUBLISHED_URL = /^https:\/\/kinly\.dk\/blog\//;

// Postgres' unique-violation. Drizzle pakker databasens fejl ind i en
// DrizzleQueryError, så koden står på `cause` (og ikke på den yderste fejl).
// postgres-js kalder feltet constraint_name, PGlite kalder det constraint.
const UNIQUE_VIOLATION = "23505";
const SLUG_CONSTRAINT = "blog_post_slug_uq";

/** Sand når fejlen (eller dens cause-kæde) er et unique-violation på slug-indekset. */
export function isSlugConflict(err: unknown): boolean {
  let cur: unknown = err;
  for (let depth = 0; depth < 4 && cur && typeof cur === "object"; depth++) {
    const e = cur as { code?: unknown; constraint?: unknown; constraint_name?: unknown; cause?: unknown };
    if (String(e.code ?? "") === UNIQUE_VIOLATION) {
      const name = String(e.constraint ?? e.constraint_name ?? "");
      if (!name || name === SLUG_CONSTRAINT) return true;
    }
    cur = e.cause;
  }
  return false;
}

/**
 * To samtidige kald kan begge slippe gennem sammenstøds-tjekket nedenfor, og så
 * er det indekset der siger nej. Kapløbet skal give en pæn 400 — ikke en rå 500
 * (review-fund 24-09). Andre fejl kastes uændret videre.
 */
function slugConflictError(err: unknown, slug: string): unknown {
  if (!isSlugConflict(err)) return err;
  return new BlogInputError(`slugen "${slug}" er allerede brugt af et andet indlæg`);
}

const SLUG_CHARS: Record<string, string> = { æ: "ae", ø: "oe", å: "aa", ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

/** Titel → slug: æ/ø/å → ae/oe/aa, små bogstaver, alt ikke-alnum → '-', maks 80. */
export function deriveSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[æøåäöüß]/g, (c) => SLUG_CHARS[c] ?? c)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");
}

function text(v: unknown, label: string, max: number, required = false): string | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") throw new BlogInputError(`${label} skal være tekst`);
  const t = v.trim();
  if (required && !t) throw new BlogInputError(`${label} mangler`);
  if (t.length > max) throw new BlogInputError(`${label} er for lang`);
  return t;
}

function stageOf(v: unknown): BlogStage {
  if (typeof v !== "string" || !(BLOG_STAGES as readonly string[]).includes(v)) throw new BlogInputError("ukendt kolonne");
  return v as BlogStage;
}

/** Slug fra titlen, eller en fejl hvis titlen ikke kan blive til en gyldig slug. */
function slugFrom(title: string): string {
  const derived = deriveSlug(title);
  if (!SLUG.test(derived)) throw new BlogInputError("kunne ikke lave en slug af titlen — skriv en selv (a-z, 0-9, bindestreg)");
  return derived;
}

export interface BlogPatch {
  title?: unknown;
  slug?: unknown;
  category?: unknown;
  excerpt?: unknown;
  body?: unknown;
  note?: unknown;
  sourcePath?: unknown;
  images?: unknown;
  stage?: unknown;
  // B2: scorekort, kvalitetsbeviser og menneskers rating. Alle tre er partial
  // patches (se scoresPatch/proofsPatch/ratingEntry), så et felt ad gangen kan
  // rettes uden at røre resten.
  strengths?: unknown;
  scores?: unknown;
  proofs?: unknown;
  rating?: unknown;
  /** Kun ved create: "agent" | "crm-signal" fra den signerede rute (se sourceOf). */
  source?: unknown;
}

// --- A/B-billedkontrakt ----------------------------------------------------
// Hvert kort kan bære to selvstændige kandidater (a og b) og ét eksplicit valg.
// Ren CRM-data: url'erne peger på billeder der allerede findes — ingen upload og
// ingen publicering her. Agenten lægger kandidaterne ind; valget er menneskets
// (se guardChoice).
export const IMAGE_CHOICES = ["a", "b", "both", "none"] as const;
export type ImageChoice = (typeof IMAGE_CHOICES)[number];

/** De otte felter en kandidat bærer. Altid alle otte ud; de valgfrie som "". */
export interface BlogImageCandidate {
  id: string;
  url: string;
  placement: string;
  alt: string;
  credit: string;
  source: string;
  mobileUrl: string;
  desktopUrl: string;
  /** Kundens samtykke (fx "mail 2026-09-20 fra Allan"). Påkrævet for kundebilleder (Lucas 25-09). */
  consentRef?: string;
}

export interface BlogImages {
  a: BlogImageCandidate | null;
  b: BlogImageCandidate | null;
  choice: ImageChoice;
  // Menneskets valg, stemplet serverside: hvem valgte, og hvornår. Tom betyder
  // "endnu ikke valgt" — "none" er altså kun et gyldigt menneskevalg når det
  // står her (se tjeklisten).
  choiceBy: string;
  choiceAt: string | null;
}

export const NO_IMAGES: BlogImages = { a: null, b: null, choice: "none", choiceBy: "", choiceAt: null };

const IMAGE_FIELDS = ["id", "url", "placement", "alt", "credit", "source", "mobileUrl", "desktopUrl", "consentRef"] as const;
const HTTP_URL = /^https?:\/\/[^\s]+$/;

/** Valgfri http(s)-url. "" når feltet ikke er sat. */
function imageUrl(v: unknown, label: string): string {
  const t = text(v, label, 500) ?? "";
  if (t && !HTTP_URL.test(t)) throw new BlogInputError(`${label} skal være en http(s)-url`);
  return t;
}

/** Én kandidat. null = slotten er tom (eller bliver tømt). */
function imageCandidate(v: unknown, slot: "a" | "b"): BlogImageCandidate | null {
  if (v === undefined || v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new BlogInputError(`kandidat ${slot} skal være et objekt`);
  const src = v as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (!(IMAGE_FIELDS as readonly string[]).includes(key)) throw new BlogInputError(`billedfeltet "${key}" kendes ikke`);
  }
  const id = text(src.id, "Kandidat-id", 80, true);
  if (id && !SLUG.test(id)) throw new BlogInputError("Kandidat-id skal være 3-80 tegn med a-z (små bogstaver), 0-9 og bindestreg");
  const url = imageUrl(src.url, "Url");
  if (!url) throw new BlogInputError("Url mangler");
  return {
    id: id ?? "",
    url,
    placement: text(src.placement, "Placering", 40, true) ?? "",
    alt: text(src.alt, "Alt-tekst", 300) ?? "",
    credit: text(src.credit, "Kredit", 200) ?? "",
    source: text(src.source, "Kilde", 300) ?? "",
    mobileUrl: imageUrl(src.mobileUrl, "Mobil-url"),
    desktopUrl: imageUrl(src.desktopUrl, "Desktop-url"),
    // Kun med når det er sat, så eksisterende kandidater round-tripper uændret.
    ...(text(src.consentRef, "Samtykke", 200) ? { consentRef: text(src.consentRef, "Samtykke", 200) } : {}),
  };
}

/** Læser jsonb-kolonnen tolerant ind i BlogImages (legacy/ukendt valg → "none"). */
export function readImages(v: unknown): BlogImages {
  const o = (v ?? {}) as Partial<BlogImages>;
  const raw = String(o.choice ?? "none");
  return {
    a: (o.a as BlogImageCandidate | null) ?? null,
    b: (o.b as BlogImageCandidate | null) ?? null,
    choice: (IMAGE_CHOICES as readonly string[]).includes(raw) ? (raw as ImageChoice) : "none",
    choiceBy: typeof o.choiceBy === "string" ? o.choiceBy : "",
    choiceAt: typeof o.choiceAt === "string" && o.choiceAt ? o.choiceAt : null,
  };
}

function imageChoice(v: unknown): ImageChoice {
  if (typeof v !== "string" || !(IMAGE_CHOICES as readonly string[]).includes(v)) {
    throw new BlogInputError(`valget skal være ${IMAGE_CHOICES.join(", ")}`);
  }
  return v as ImageChoice;
}

/**
 * Partial images-patch: kun de nøgler der sendes med ændres, så et menneske kan
 * vende valget uden at gensende kandidaterne. Ukendte nøgler afvises.
 */
function imagesPatch(v: unknown, before: BlogImages, actor: string): BlogImages {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BlogInputError("images skal være et objekt");
  const src = v as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    // choiceBy/choiceAt er serverens stempel. Et UI der runder et læst kort sender
    // dem med tilbage, så de accepteres — men værdien læses aldrig herfra, og
    // stemplet sættes udelukkende ud fra aktøren længere nede (server, aldrig klient).
    if (key !== "a" && key !== "b" && key !== "choice" && key !== "choiceBy" && key !== "choiceAt") {
      throw new BlogInputError(`billedfeltet "${key}" kendes ikke`);
    }
  }
  const a = "a" in src ? imageCandidate(src.a, "a") : before.a;
  const b = "b" in src ? imageCandidate(src.b, "b") : before.b;
  const choice = src.choice === undefined ? before.choice : imageChoice(src.choice);
  // Fail-closed: valget må ikke pege på en tom kandidat — det ville give et kort
  // hvor nogen tror der er valgt et billede.
  if ((choice === "a" && !a) || (choice === "b" && !b)) throw new BlogInputError(`valget ${choice} kræver en kandidat i ${choice}`);
  if (choice === "both" && (!a || !b)) throw new BlogInputError("valget both kræver både a og b");
  // A/B-valget sættes af et menneske. Agenten leverer kandidater, ikke beslutningen.
  if (choice !== before.choice && !HUMAN_ACTORS.has(actor)) {
    throw new BlogInputError("kun Lucas eller Charlie kan vælge A/B-billedet");
  }
  const human = HUMAN_ACTORS.has(actor);
  let choiceBy = before.choiceBy;
  let choiceAt = before.choiceAt;
  for (const slot of ["a", "b"] as const) {
    const now = slot === "a" ? a : b;
    const chosen = before.choice === slot || before.choice === "both";
    if (!chosen || !IMAGE_FIELDS.some((field) => now?.[field] !== before[slot]?.[field])) continue;
    // Et valgt billede må kun skiftes af et menneske — og så kræves der et nyt
    // valg, for stemplet hørte til den kandidat der lå der før (spec §4).
    if (!human) throw new BlogInputError(`kun Lucas eller Charlie kan ændre et valgt billede (${slot})`);
    choiceBy = "";
    choiceAt = null;
  }
  // Et nyt valg stemples med aktør og tid. Bliver valget gentaget oven på et
  // ryddet stempel (fx efter en ny kandidat), tælles det som et nyt valg.
  if (src.choice !== undefined && human && (choice !== before.choice || !before.choiceBy)) {
    choiceBy = actor;
    choiceAt = new Date().toISOString();
  }
  return { a, b, choice, choiceBy, choiceAt };
}

// --- Scorekortet (fem akser 1-100) -----------------------------------------
// Blog-arbejderen scorer en idé før nogen skriver: styrke, kundebase-fit, SEO,
// GEO og konkurrent-gap. Hver akse bærer sin korte begrundelse, så tallet ikke
// står alene. Mennesker må rette tallene; agenten overskriver aldrig en rating
// (se ratings nedenfor).
export const SCORE_AXES = ["styrke", "kundebase", "seo", "geo", "gap"] as const;
export type ScoreAxis = (typeof SCORE_AXES)[number];

export const SCORE_LABEL: Record<ScoreAxis, string> = {
  styrke: "Styrke",
  kundebase: "Kundebase-fit",
  seo: "SEO",
  geo: "GEO",
  gap: "Konkurrent-gap",
};

export interface BlogScoreEntry {
  score: number;
  why: string;
}

export type BlogScores = Partial<Record<ScoreAxis, BlogScoreEntry>>;

/** Tolerant læsning af jsonb-kolonnen: ukendte akser og rod falder væk. */
export function readScores(v: unknown): BlogScores {
  const out: BlogScores = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const axis of SCORE_AXES) {
    const raw = (v as Record<string, unknown>)[axis];
    if (!raw || typeof raw !== "object") continue;
    const e = raw as { score?: unknown; why?: unknown };
    const score = Number(e.score);
    if (!Number.isInteger(score) || score < 1 || score > 100) continue;
    out[axis] = { score, why: String(e.why ?? "") };
  }
  return out;
}

/** Partial patch: kun de akser der sendes med ændres; null rydder én akse. */
function scoresPatch(v: unknown, before: BlogScores): BlogScores {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BlogInputError("scores skal være et objekt");
  const src = v as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (!(SCORE_AXES as readonly string[]).includes(key)) throw new BlogInputError(`scoren "${key}" kendes ikke — brug ${SCORE_AXES.join(", ")}`);
  }
  const out: BlogScores = { ...before };
  for (const axis of SCORE_AXES) {
    if (!(axis in src)) continue;
    if (src[axis] === null) {
      delete out[axis];
      continue;
    }
    const raw = src[axis];
    if (typeof raw !== "object" || Array.isArray(raw)) throw new BlogInputError(`scoren ${axis} skal være {score, why}`);
    const n = Number((raw as { score?: unknown }).score);
    if (!Number.isInteger(n) || n < 1 || n > 100) throw new BlogInputError(`scoren ${axis} skal være et helt tal 1-100`);
    out[axis] = { score: n, why: text((raw as { why?: unknown }).why, `Begrundelsen for ${axis}`, 300) ?? "" };
  }
  return out;
}

// --- Menneskers rating (append-only) ---------------------------------------
// Score 1-5 eller 👍/👎 plus valgfri kommentar. Hver rating bærer stage og
// revision, aktør og tid, så den altid læses mod den tekst den gjaldt — og
// agenten kan hverken rate eller fjerne en rating (kun mennesker, se ratingEntry).
export type BlogRatingKind = "score" | "thumb";
export type BlogThumb = "op" | "ned";

export interface BlogRating {
  id: string;
  at: string;
  actor: string;
  stage: BlogStage;
  revision: string;
  kind: BlogRatingKind;
  value: number | null;
  thumb: BlogThumb | null;
  comment: string;
}

export function readRatings(v: unknown): BlogRating[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((r) => r && typeof r === "object")
    .map((r) => {
      const e = r as Record<string, unknown>;
      const stage = String(e.stage ?? "");
      const thumb = String(e.thumb ?? "");
      return {
        id: String(e.id ?? ""),
        at: String(e.at ?? ""),
        actor: String(e.actor ?? ""),
        stage: (BLOG_STAGES as readonly string[]).includes(stage) ? (stage as BlogStage) : "ide",
        revision: String(e.revision ?? ""),
        kind: e.kind === "thumb" ? "thumb" : "score",
        value: typeof e.value === "number" ? e.value : null,
        thumb: thumb === "op" || thumb === "ned" ? (thumb as BlogThumb) : null,
        comment: String(e.comment ?? ""),
      } satisfies BlogRating;
    });
}

/** Én ny rating: 1-5 eller 👍/👎, valgfri kommentar. Kun Lucas eller Charlie. */
function ratingEntry(v: unknown, actor: string, row: { stage: BlogStage; revision: string }): BlogRating {
  if (!HUMAN_ACTORS.has(actor)) throw new BlogInputError("kun Lucas eller Charlie kan rate et kort");
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BlogInputError("rating skal være et objekt");
  const src = v as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (key !== "value" && key !== "thumb" && key !== "comment") throw new BlogInputError(`rating-feltet "${key}" kendes ikke`);
  }
  const value = src.value === undefined || src.value === null ? null : Number(src.value);
  const thumbRaw = src.thumb === undefined || src.thumb === null ? "" : String(src.thumb);
  if (value !== null && (!Number.isInteger(value) || value < 1 || value > 5)) throw new BlogInputError("rating skal være 1-5");
  if (thumbRaw && thumbRaw !== "op" && thumbRaw !== "ned") throw new BlogInputError("thumb skal være op eller ned");
  if ((value === null) === !thumbRaw) throw new BlogInputError("rating skal være enten 1-5 eller op/ned");
  return {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    actor,
    stage: row.stage,
    revision: row.revision,
    kind: value !== null ? "score" : "thumb",
    value,
    thumb: (thumbRaw || null) as BlogThumb | null,
    comment: text(src.comment, "Kommentar", 500) ?? "",
  };
}

// --- Kvalitetsbeviser ------------------------------------------------------
// Kilder/evidensark, council-log, FAQ og menneskets faktatjek. Alt er partial
// patches: det der ikke sendes med, bevares — også når agenten retter videre
// (spec: stram ikke brugerredigerede data væk).
export interface BlogSourceEntry {
  url: string;
  date: string;
  claim: string;
  method: string;
}

export interface BlogCouncilLog {
  reviewer: string;
  log: string;
  findings: string;
  retest: string;
}

export interface BlogFaqEntry {
  q: string;
  a: string;
}

export interface BlogFactCheck {
  by: string;
  at: string;
  note: string;
  /** Revisionen faktatjekket gjaldt. Ændres teksten, skal det laves om. */
  revision: string;
}

export interface BlogProofs {
  sources: BlogSourceEntry[];
  council: BlogCouncilLog | null;
  faq: BlogFaqEntry[];
  factcheck: BlogFactCheck | null;
}

export const NO_PROOFS: BlogProofs = { sources: [], council: null, faq: [], factcheck: null };

export function readProofs(v: unknown): BlogProofs {
  const o = (v ?? {}) as Partial<BlogProofs>;
  return {
    sources: Array.isArray(o.sources) ? o.sources.filter((s) => s && typeof s === "object") : [],
    council: o.council && typeof o.council === "object" ? o.council : null,
    faq: Array.isArray(o.faq) ? o.faq.filter((f) => f && typeof f === "object") : [],
    factcheck: o.factcheck && typeof o.factcheck === "object" ? o.factcheck : null,
  };
}

/** Kilderne i evidensarket: url, dato og en konkret påstand (metode er valgfri). */
function sourceList(v: unknown): BlogSourceEntry[] {
  if (!Array.isArray(v)) throw new BlogInputError("kilderne skal være en liste");
  if (v.length > 20) throw new BlogInputError("højst 20 kilder");
  return v.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BlogInputError(`kilde ${i + 1} skal være et objekt`);
    const s = raw as Record<string, unknown>;
    const url = imageUrl(s.url, `Url på kilde ${i + 1}`);
    if (!url) throw new BlogInputError(`Url mangler på kilde ${i + 1}`);
    return {
      url,
      date: text(s.date, `Dato på kilde ${i + 1}`, 40, true) ?? "",
      claim: text(s.claim, `Påstand på kilde ${i + 1}`, 300, true) ?? "",
      method: text(s.method, `Metode på kilde ${i + 1}`, 300) ?? "",
    };
  });
}

function councilLog(v: unknown): BlogCouncilLog | null {
  if (v === null) return null;
  if (typeof v !== "object" || Array.isArray(v)) throw new BlogInputError("council-loggen skal være et objekt");
  const c = v as Record<string, unknown>;
  return {
    reviewer: text(c.reviewer, "Reviewer", 120, true) ?? "",
    log: text(c.log, "Henvisning til council-loggen", 300, true) ?? "",
    findings: text(c.findings, "Fund", 500) ?? "",
    retest: text(c.retest, "Retest", 300) ?? "",
  };
}

function faqList(v: unknown): BlogFaqEntry[] {
  if (!Array.isArray(v)) throw new BlogInputError("FAQ skal være en liste");
  if (v.length > 8) throw new BlogInputError("højst 8 FAQ-spørgsmål");
  return v.map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new BlogInputError(`FAQ ${i + 1} skal være et objekt`);
    const f = raw as Record<string, unknown>;
    return {
      q: text(f.q, `Spørgsmål ${i + 1}`, 200, true) ?? "",
      a: text(f.a, `Svar ${i + 1}`, 1000, true) ?? "",
    };
  });
}

/**
 * Faktatjekket er menneskets erklæring om at der ikke står opdigtede kunder,
 * citater eller tal i teksten. Agenten må ikke sætte det — den kan ikke
 * bekræfte sin egen tekst — og det bindes til revisionen den gjaldt.
 */
function factCheck(v: unknown, actor: string, revision: string): BlogFactCheck | null {
  if (v === null) return null;
  if (!HUMAN_ACTORS.has(actor)) throw new BlogInputError("kun Lucas eller Charlie kan lave faktatjekket");
  if (typeof v !== "object" || Array.isArray(v)) throw new BlogInputError("faktatjekket skal være et objekt");
  return {
    by: actor,
    at: new Date().toISOString(),
    note: text((v as Record<string, unknown>).note, "Note til faktatjekket", 300) ?? "",
    revision,
  };
}

/** Partial patch af beviserne — ukendte nøgler afvises, resten bevares. */
function proofsPatch(v: unknown, before: BlogProofs, actor: string, revision: string): BlogProofs {
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new BlogInputError("proofs skal være et objekt");
  const src = v as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (key !== "sources" && key !== "council" && key !== "faq" && key !== "factcheck") {
      throw new BlogInputError(`bevis-feltet "${key}" kendes ikke`);
    }
  }
  return {
    sources: "sources" in src ? sourceList(src.sources) : before.sources,
    council: "council" in src ? councilLog(src.council) : before.council,
    faq: "faq" in src ? faqList(src.faq) : before.faq,
    factcheck: "factcheck" in src ? factCheck(src.factcheck, actor, revision) : before.factcheck,
  };
}

// --- Revision, tjekliste og Jev --------------------------------------------
// Revisionen er et fingeraftryk af alt i kortet der kan ændre teksten. Alt
// versionsbundet (tjekliste, Jev-svar, faktatjek) bærer den, så et grønt svar på
// en gammel kladde ikke kan læses som et svar på en ny (spec §Release-gates 4).

export interface BlogChecklist {
  revision: string;
  ok: boolean;
  missing: string[];
  at: string;
}

export function readChecklist(v: unknown): BlogChecklist {
  const o = (v ?? {}) as Partial<BlogChecklist>;
  return {
    revision: String(o.revision ?? ""),
    ok: o.ok === true,
    missing: Array.isArray(o.missing) ? o.missing.map(String) : [],
    at: String(o.at ?? ""),
  };
}

export interface BlogJev {
  ready: boolean;
  /** Jevs noul-svar (0-1) for "klar til udgivelse"; null når svaret manglede. */
  score: number | null;
  issue: string;
  at: string;
  revision: string;
  actor: string;
}

export function readJev(v: unknown): BlogJev | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.ready !== "boolean") return null;
  return {
    ready: o.ready,
    score: typeof o.score === "number" ? o.score : null,
    issue: String(o.issue ?? ""),
    at: String(o.at ?? ""),
    revision: String(o.revision ?? ""),
    actor: String(o.actor ?? ""),
  };
}

/** Fingeraftryk af titel, slug, kategori, resume, brødtekst og billeder. */
export function revisionOf(p: {
  title?: string;
  slug?: string;
  category?: string;
  excerpt?: string;
  body?: string;
  images?: unknown;
}): string {
  const parts = [p.title ?? "", p.slug ?? "", p.category ?? "", p.excerpt ?? "", p.body ?? "", readImages(p.images)];
  return crypto.createHash("sha256").update(JSON.stringify(parts), "utf-8").digest("hex").slice(0, 16);
}

// Ord, links og pladsholdere: én definition, som både serveren og UI'et bruger
// (spec: "ens definition i UI/server"), så tallene ikke kan divergere.
const MD_LINK = /\[([^\]\n]{1,200})\]\(\s*([^)\s]{1,500})\s*\)/g;
const PLACEHOLDER = /\b(TODO|TBD|FIXME)\b|\[\s*(indsæt|indsat)|placeholder|lorem ipsum/i;
const INTERNAL = /^https?:\/\/(www\.)?kinly\.dk\//i;

/** Brødtekstord: markdown-støj væk, links tæller som deres ankertekst. */
export function countWords(body: string): number {
  const tekst = body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, " ")
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s{0,3}>\s?/gm, "")
    .replace(/[*_~|]/g, " ");
  return tekst.split(/\s+/).filter((w) => /[a-z0-9æøå]/i.test(w)).length;
}

export interface BodyLink {
  text: string;
  href: string;
}

/** Markdown-links i brødteksten (ankertekst + href). */
export function bodyLinks(body: string): BodyLink[] {
  const out: BodyLink[] = [];
  for (const m of body.matchAll(MD_LINK)) out.push({ text: m[1].trim(), href: m[2].trim() });
  return out;
}

/**
 * Interne links til by-/branche- eller casesider: fuld kinly.dk-adresse med en
 * rigtig ankertekst. Bloggen selv og /seo-tjek-tragten tæller ikke (de er
 * henholdsvis indeks og CTA), og hver side tælles kun én gang.
 */
export function internalLinks(body: string): BodyLink[] {
  const seen = new Set<string>();
  const out: BodyLink[] = [];
  for (const l of bodyLinks(body)) {
    if (!INTERNAL.test(l.href) || l.text.length < 3) continue;
    let path = "";
    try {
      path = new URL(l.href).pathname.replace(/\/+$/, "");
    } catch {
      continue;
    }
    if (!path || path.startsWith("/blog") || path.startsWith("/seo-tjek") || seen.has(path)) continue;
    seen.add(path);
    out.push(l);
  }
  return out;
}

/**
 * Serverens tjekliste for én revision (spec §Release-gates 4a-4h). Ren
 * beregning: ingen netkald, ingen gæt. `missing` er både det UI'et viser og den
 * fejl et afvist Publicer-forsøg får — punkterne er skrevet så de kan læses af
 * et menneske uden at slå spec'en op.
 */
export function runChecklist(p: {
  title?: string;
  slug?: string;
  category?: string;
  excerpt?: string;
  body?: string;
  images?: unknown;
  proofs?: unknown;
}): BlogChecklist {
  const revision = revisionOf(p);
  const images = readImages(p.images);
  const proofs = readProofs(p.proofs);
  const body = String(p.body ?? "");
  const slug = String(p.slug ?? "");
  const missing: string[] = [];

  if (proofs.sources.length < 5) missing.push(`mindst 5 kilder i evidensarket med url, dato og påstand (har ${proofs.sources.length})`);
  if (!proofs.council) missing.push("council-log med uafhængig reviewer mangler");
  if (proofs.faq.length < 3 || proofs.faq.length > 5) missing.push(`3-5 FAQ-spørgsmål (har ${proofs.faq.length})`);
  const links = internalLinks(body);
  if (links.length < 2) missing.push(`mindst 2 interne links til by-/branche- eller caseside (har ${links.length})`);
  if (!slug || !bodyLinks(body).some((l) => l.href.includes(`ref=blog-${slug}`))) {
    missing.push(`CTA til /seo-tjek/ eller kontakt med ?ref=blog-${slug || "<slug>"} mangler`);
  }
  const words = countWords(body);
  if (words < 600 || words > 900) missing.push(`brødteksten er ${words} ord — den skal være 600-900`);
  const candidates = [images.a, images.b];
  if (candidates.some((k) => !k || !k.alt || !k.credit || !k.source || !k.placement)) {
    missing.push("to A/B-billeder med placering, alt-tekst, kredit og kilde");
  }
  // "none" er et gyldigt menneskevalg — men kun når et menneske faktisk valgte det.
  if (!HUMAN_ACTORS.has(images.choiceBy) || !images.choiceAt) {
    missing.push("menneskets A/B-valg mangler (A, B, begge eller ingen)");
  }
  if (!proofs.factcheck) missing.push("menneskets faktatjek mangler (nul opdigtede kunder, citater og tal)");
  else if (proofs.factcheck.revision !== revision) missing.push("faktatjekket gælder en ældre version af teksten — det skal laves om");
  if (PLACEHOLDER.test(body)) missing.push("pladsholder eller TODO står stadig i teksten");
  missing.push(...seoMissing(p, images));

  return { revision, ok: missing.length === 0, missing, at: new Date().toISOString() };
}

// --- SEO-gates (Lucas 25-09): håndhæves her, ikke kun på sitet ----------------
// Kategorien skal være et af kinly-sitets emner (content/blog/categories.ts).
export const BLOG_CATEGORIES = ["lokal-synlighed", "ai-soegning", "hjemmeside", "kundecases", "pris", "kinly"] as const;
export const SEO_LIMITS = { title: 60, excerptMin: 70, excerpt: 160, altMin: 20, alt: 125 } as const;
const ALT_OPENER = /^(billede|foto|image|picture)\s+af\b/i;

/** Kundebillede = hentet fra en kundes side eller Kinlys case-skud. Kræver registreret samtykke. */
export function isCustomerImage(k: BlogImageCandidate): boolean {
  return /\/img\/cases\//.test(k.url) || /^kunde/i.test(k.source.trim());
}

/** SEO-punkter der mangler. Titlen bliver <title>, excerpt bliver meta description. */
export function seoMissing(p: { title?: string; category?: string; excerpt?: string }, images: BlogImages): string[] {
  const out: string[] = [];
  const title = String(p.title ?? "").trim();
  const excerpt = String(p.excerpt ?? "").trim();
  if (!(BLOG_CATEGORIES as readonly string[]).includes(String(p.category ?? ""))) {
    out.push(`kategori skal være en af: ${BLOG_CATEGORIES.join(", ")}`);
  }
  if (!title || title.length > SEO_LIMITS.title) out.push(`titlen er ${title.length} tegn — den skal være 1-${SEO_LIMITS.title} (den bliver sidens <title>)`);
  if (excerpt.length < SEO_LIMITS.excerptMin || excerpt.length > SEO_LIMITS.excerpt) {
    out.push(`uddraget er ${excerpt.length} tegn — det skal være ${SEO_LIMITS.excerptMin}-${SEO_LIMITS.excerpt} (det bliver meta description)`);
  }
  if (images.choice === "none") out.push("et billede skal vælges (A, B eller begge) — uden billede kan opslaget ikke publiceres");
  const chosen = images.choice === "both" ? [images.a, images.b] : images.choice === "a" ? [images.a] : images.choice === "b" ? [images.b] : [];
  for (const [i, k] of chosen.entries()) {
    if (!k) continue;
    const label = images.choice === "both" ? (i === 0 ? "A" : "B") : images.choice.toUpperCase();
    const alt = k.alt.trim();
    if (alt.length < SEO_LIMITS.altMin || alt.length > SEO_LIMITS.alt) out.push(`alt-tekst på ${label} er ${alt.length} tegn — den skal være ${SEO_LIMITS.altMin}-${SEO_LIMITS.alt}`);
    else if (ALT_OPENER.test(alt)) out.push(`alt-tekst på ${label} må ikke starte med "billede af"/"foto af" — beskriv motivet`);
    if (isCustomerImage(k) && !k.consentRef?.trim()) out.push(`billede ${label} er et kundebillede — kundens samtykke skal registreres`);
  }
  return out;
}

const NO_STRUCTURED = { images: NO_IMAGES, scores: {} as BlogScores, proofs: NO_PROOFS };

/**
 * Fælles afslutning for create og update: scores, beviser, rating, revision og
 * den serverberegnede tjekliste. Alt der kræver "hvordan ser kortet ud
 * bagefter" regnes her, så create og update ikke kan komme til at gøre det
 * hver for sig (og dermed uenigt).
 */
function finish(
  p: BlogPatch,
  before: { images: BlogImages; scores: BlogScores; proofs: BlogProofs },
  content: { title: string; slug: string; category: string; excerpt: string; body: string; images: BlogImages },
  actor: string,
  stage: BlogStage,
) {
  const revision = revisionOf(content);
  const scores = p.scores === undefined ? before.scores : scoresPatch(p.scores, before.scores);
  const proofs = p.proofs === undefined ? before.proofs : proofsPatch(p.proofs, before.proofs, actor, revision);
  const rating = p.rating === undefined || p.rating === null ? null : ratingEntry(p.rating, actor, { stage, revision });
  return { revision, scores, proofs, rating, checklist: runChecklist({ ...content, proofs }) };
}

/** Kilden er server-verificeret: menneske-sessionen giver manuel, agenten agent|crm-signal. */
function sourceOf(v: unknown, actor: string): BlogSource {
  if (HUMAN_ACTORS.has(actor)) return "manuel";
  if (v === undefined || v === null || v === "") return "agent";
  const s = String(v).trim().toLowerCase();
  if (s !== "agent" && s !== "crm-signal") {
    throw new BlogInputError("agenten kan kun sætte kilden agent eller crm-signal — manuel kommer fra menneskets egen intake");
  }
  return s;
}

function validPatch(p: BlogPatch) {
  const out: Partial<typeof blogPost.$inferInsert> = {};
  const title = text(p.title, "Titel", 160, true);
  if (title !== undefined) out.title = title;
  if (p.slug !== undefined && p.slug !== null) {
    if (typeof p.slug !== "string") throw new BlogInputError("Slug skal være tekst");
    // Spec: ^[a-z0-9-]{3,80}$ — store bogstaver afvises i stedet for at blive rettet
    // i tavshed, så slug'en altid er præcis den man skrev (og den bliver en offentlig URL).
    const s = p.slug.trim();
    if (s && !SLUG.test(s)) throw new BlogInputError("Slug skal være 3-80 tegn med a-z (små bogstaver), 0-9 og bindestreg");
    out.slug = s; // tom = udled af titlen (se createPost/updatePost)
  }
  const category = text(p.category, "Kategori", 60);
  if (category !== undefined) out.category = category;
  const excerpt = text(p.excerpt, "Resume", 300);
  if (excerpt !== undefined) out.excerpt = excerpt;
  const body = text(p.body, "Brødtekst", 80_000);
  if (body !== undefined) out.body = body;
  const note = text(p.note, "Note", 300);
  if (note !== undefined) out.note = note;
  const sourcePath = text(p.sourcePath, "Kildesti", 300);
  if (sourcePath !== undefined) out.sourcePath = sourcePath;
  const strengths = text(p.strengths, "Styrker", 1000);
  if (strengths !== undefined) out.strengths = strengths;
  if (p.stage !== undefined) out.stage = stageOf(p.stage);
  return out;
}

/** Nyt indlæg. Lander altid i Idéer, bagerst i kolonnen. */
export async function createPost(db: Db, patch: BlogPatch, actor: string) {
  const fields = validPatch(patch);
  if (!fields.title) throw new BlogInputError("Titel mangler");
  const source = sourceOf(patch.source, actor);
  const images = patch.images === undefined ? NO_IMAGES : imagesPatch(patch.images, NO_IMAGES, actor);
  const slug = fields.slug || slugFrom(fields.title);
  const content = {
    title: fields.title,
    slug,
    category: fields.category ?? "",
    excerpt: fields.excerpt ?? "",
    body: fields.body ?? "",
    images,
  };
  // Tjeklisten regnes med det samme, så et nyt kort altid viser hvad der
  // mangler — den bliver sjældent grøn her, og det er meningen.
  const { scores, proofs, rating, checklist } = finish(patch, NO_STRUCTURED, content, actor, "ide");
  try {
    return await db.transaction(async (tx) => {
      const [twin] = await tx.select({ id: blogPost.id }).from(blogPost).where(eq(blogPost.slug, slug));
      if (twin) throw new BlogInputError(`slugen "${slug}" er allerede brugt af et andet indlæg`);
      const top = await tx.select({ value: max(blogPost.position) }).from(blogPost).where(eq(blogPost.stage, "ide"));
      const [row] = await tx
        .insert(blogPost)
        .values({
          ...fields,
          images,
          slug,
          source,
          scores,
          proofs,
          checklist,
          ratings: rating ? [rating] : [],
          stage: "ide",
          position: (top[0]?.value ?? 0) + 1,
          createdBy: actor,
          updatedBy: actor,
        })
        .returning();
      return row;
    });
  } catch (err) {
    // Kapløb om slug'en: indekset siger nej, og det skal blive en 400.
    throw slugConflictError(err, slug);
  }
}

// Stage-guards ét sted. Reglerne (spec 24-09-2026):
// - til Publicer: kun lucas/charlie, og det sætter publishRequestedAt
// - væk fra Publicer: kun lucas/charlie, og publishRequestedAt ryddes (aftalen er
//   aflyst inden næste kørsel). Agenten må ikke selv kunne trække et kort ud af
//   køen og dermed rydde aftalen i tavshed (review-fund 24-09).
// - til Udgivet: afvist her — kun markPublished må gøre det
// - fra Udgivet: afvist (v1 kan ikke trække et udgivet indlæg tilbage)
// - agenten (hermes) må kun target'e ide/arbejder/klar
// - ved stage-skift: position = max+1 i målkolonnen
// Felt-rettelser (fx en ny note) uden stage-skift rører hverken position eller
// publishRequestedAt — også når kortet står i Publicer eller Udgivet.
export async function updatePost(db: Db, id: string, patch: BlogPatch, actor: string) {
  const fields = validPatch(patch);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(blogPost).where(eq(blogPost.id, id)).for("update");
      if (!before) throw new BlogInputError("indlægget findes ikke");
      const from = before.stage as BlogStage;
      const target = (fields.stage ?? from) as BlogStage;
      const moving = fields.stage !== undefined && fields.stage !== before.stage;

      if (moving && from === "udgivet") throw new BlogInputError("et udgivet indlæg kan ikke flyttes tilbage");
      if (moving && target === "udgivet") throw new BlogInputError("Udgivet sættes af udgiver-jobbet — brug markPublished");
      // Ud af Publicer er en aftale om udgivelse — den må kun aflyses af et menneske.
      if (moving && from === "publicer" && !HUMAN_ACTORS.has(actor)) {
        throw new BlogInputError("kun Lucas eller Charlie kan flytte et indlæg ud af Publicer");
      }
      if (fields.stage !== undefined && actor === "hermes" && !AGENT_STAGES.includes(target)) {
        throw new BlogInputError("agenten må kun flytte mellem Idéer, Arbejder og Klar");
      }
      if (moving && target === "publicer" && !HUMAN_ACTORS.has(actor)) {
        throw new BlogInputError("kun Lucas eller Charlie kan sætte et indlæg i Publicer");
      }

      // A/B-billederne: agenten må skrive frie kandidater, men ikke sætte valget
      // og ikke udskifte et billede mennesket allerede har valgt (imagesPatch).
      const beforeImages = readImages(before.images);
      const images = patch.images === undefined ? beforeImages : imagesPatch(patch.images, beforeImages, actor);

      // Tom slug betyder "udled af titlen" — af den nye titel hvis der kommer en.
      if (fields.slug === "") fields.slug = slugFrom(String(fields.title ?? before.title));

      // Samme sammenstøds-tjek som i createPost. Uden det rammer et slug der er i brug
      // den rå unique-violation fra Postgres, og ruten svarer 500 i stedet for 400.
      if (fields.slug !== undefined && fields.slug !== before.slug) {
        const [twin] = await tx.select({ id: blogPost.id }).from(blogPost).where(eq(blogPost.slug, fields.slug));
        if (twin) throw new BlogInputError(`slugen "${fields.slug}" er allerede brugt af et andet indlæg`);
      }

      // Kortet som det ser ud bagefter: scorekort, beviser, rating, revision og
      // tjeklisten regnes på det — ikke på hvad der stod før.
      const content = {
        title: String(fields.title ?? before.title),
        slug: String(fields.slug ?? before.slug),
        category: String(fields.category ?? before.category),
        excerpt: String(fields.excerpt ?? before.excerpt),
        body: String(fields.body ?? before.body),
        images,
      };
      const { revision, scores, proofs, rating, checklist } = finish(
        patch,
        { images: beforeImages, scores: readScores(before.scores), proofs: readProofs(before.proofs) },
        content,
        actor,
        from,
      );

      // Fail-closed (spec §Release-gates 4): Publicer må kun ske på den grønne
      // tjekliste for PRÆCIS denne revision. Er teksten ændret siden tjeklisten
      // blev kørt, eller er et punkt ikke opfyldt, er svaret nej — også selv om
      // ændringen i dette kald ville gøre kortet grønt.
      if (moving && target === "publicer") {
        const stored = readChecklist(before.checklist);
        if (!stored.ok || stored.revision !== revision) {
          const why = checklist.missing.length ? checklist.missing : ["tjeklisten er ikke kørt for den nuværende tekst"];
          throw new BlogInputError(`tjeklisten er ikke aktuel og grøn: ${why.join("; ")}`);
        }
      }

      const set: Partial<typeof blogPost.$inferInsert> = {
        ...fields,
        images,
        scores,
        proofs,
        checklist,
        updatedBy: actor,
        updatedAt: new Date(),
      };
      // Menneskeratinger lægges til — de overskrives aldrig, heller ikke af en
      // senere agent-opdatering (spec: ingen rating overskrives af agenten).
      if (rating) set.ratings = [...readRatings(before.ratings), rating];
      if (moving) {
        const top = await tx.select({ value: max(blogPost.position) }).from(blogPost).where(eq(blogPost.stage, target));
        set.position = (top[0]?.value ?? 0) + 1;
        set.publishRequestedAt = target === "publicer" ? new Date() : null;
      }

      const [after] = await tx.update(blogPost).set(set).where(eq(blogPost.id, id)).returning();
      return after;
    });
  } catch (err) {
    // Kapløb om slug'en: indekset siger nej, og det skal blive en 400.
    throw slugConflictError(err, String(fields.slug ?? ""));
  }
}

/**
 * Gemmer Jevs svar på den aktuelle revision (kaldes af agent-rutens precheck).
 * Jev kan ikke selv skrive i databasen, og svaret må ikke genbruges efter en
 * tekstændring — derfor revisionen med i svaret (spec: udgiver-jobbet må ikke
 * genbruge et Jev-resultat efter tekst-/billedændring).
 */
export async function recordJev(
  db: Db,
  id: string,
  input: { ready: boolean; score: number | null; issue: string },
  actor: string,
): Promise<BlogJev> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(blogPost).where(eq(blogPost.id, id)).for("update");
    if (!row) throw new BlogInputError("indlægget findes ikke");
    const jev: BlogJev = {
      ready: input.ready,
      score: typeof input.score === "number" ? input.score : null,
      issue: String(input.issue ?? "").slice(0, 200),
      at: new Date().toISOString(),
      revision: revisionOf(row),
      actor,
    };
    await tx.update(blogPost).set({ jev }).where(eq(blogPost.id, id));
    return jev;
  });
}

/** Udgiver-jobbet melder et indlæg live. Eneste vej til kolonnen Udgivet. */
export async function markPublished(db: Db, id: string, p: { url?: unknown; note?: unknown }, actor: string) {
  if (typeof p.url !== "string" || !PUBLISHED_URL.test(p.url.trim())) {
    throw new BlogInputError("url skal være en side under https://kinly.dk/blog/");
  }
  const url = p.url.trim();
  const note = text(p.note, "Note", 300);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(blogPost).where(eq(blogPost.id, id)).for("update");
    if (!before) throw new BlogInputError("indlægget findes ikke");
    if (before.stage !== "publicer") throw new BlogInputError("indlægget står ikke i Publicer");
    const set: Partial<typeof blogPost.$inferInsert> = {
      stage: "udgivet",
      publishedAt: new Date(),
      publishedUrl: url,
      updatedBy: actor,
      updatedAt: new Date(),
    };
    if (note !== undefined) set.note = note;
    const [after] = await tx.update(blogPost).set(set).where(eq(blogPost.id, id)).returning();
    return after;
  });
}

// Sletning er kun for mennesker (UI-ruten kalder hqWrite — agenten har ingen
// delete-handling), og kun mens kortet er i Idéer eller Arbejder. Står det i
// Klar/Publicer/Udgivet, er der arbejde eller en aftale i det: flyt det først
// (agenten kan flytte tilbage til Arbejder), så det ikke forsvinder i tavshed.
export async function deletePost(db: Db, id: string, actor: string) {
  if (!HUMAN_ACTORS.has(actor)) throw new BlogInputError("kun Lucas eller Charlie kan slette et indlæg");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(blogPost).where(eq(blogPost.id, id)).for("update");
    if (!before) throw new BlogInputError("indlægget findes ikke");
    if (before.stage !== "ide" && before.stage !== "arbejder") {
      throw new BlogInputError("kun indlæg i Idéer eller Arbejder kan slettes");
    }
    await tx.delete(blogPost).where(eq(blogPost.id, id));
    return { id: before.id, title: before.title };
  });
}

export interface PostCard {
  id: string;
  title: string;
  slug: string;
  category: string;
  stage: BlogStage;
  excerpt: string;
  note: string;
  images: BlogImages;
  source: BlogSource;
  strengths: string;
  scores: BlogScores;
  ratings: BlogRating[];
  checklist: BlogChecklist;
  jev: BlogJev | null;
  publishRequestedAt: string | null;
  publishedAt: string | null;
  publishedUrl: string | null;
  updatedAt: string;
}

/** Kort-listen til tavlen — uden body. position asc, derefter nyeste rettelse først. */
export async function listPosts(db: Db, opts: { stage?: string } = {}): Promise<PostCard[]> {
  const stage = opts.stage ? stageOf(opts.stage) : undefined;
  const rows = await db
    .select({
      id: blogPost.id,
      title: blogPost.title,
      slug: blogPost.slug,
      category: blogPost.category,
      stage: blogPost.stage,
      excerpt: blogPost.excerpt,
      note: blogPost.note,
      images: blogPost.images,
      source: blogPost.source,
      strengths: blogPost.strengths,
      scores: blogPost.scores,
      ratings: blogPost.ratings,
      checklist: blogPost.checklist,
      jev: blogPost.jev,
      publishRequestedAt: blogPost.publishRequestedAt,
      publishedAt: blogPost.publishedAt,
      publishedUrl: blogPost.publishedUrl,
      updatedAt: blogPost.updatedAt,
    })
    .from(blogPost)
    .where(stage ? eq(blogPost.stage, stage) : undefined)
    .orderBy(asc(blogPost.position), desc(blogPost.updatedAt));
  return rows.map((r) => ({
    ...r,
    stage: r.stage as BlogStage,
    source: ((BLOG_SOURCES as readonly string[]).includes(r.source) ? r.source : "agent") as BlogSource,
    images: readImages(r.images),
    scores: readScores(r.scores),
    ratings: readRatings(r.ratings),
    checklist: readChecklist(r.checklist),
    jev: readJev(r.jev),
    publishRequestedAt: r.publishRequestedAt ? r.publishRequestedAt.toISOString() : null,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/** Fuld post inkl. body. Slår op på id (uuid) eller slug. */
export async function getPost(db: Db, idOrSlug: string) {
  const key = String(idOrSlug ?? "").trim();
  if (!key) throw new BlogInputError("id eller slug mangler");
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  const [row] = await db.select().from(blogPost).where(isUuid ? eq(blogPost.id, key) : eq(blogPost.slug, key));
  if (!row) throw new BlogInputError("indlægget findes ikke");
  return row;
}
