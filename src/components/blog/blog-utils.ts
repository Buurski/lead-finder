// Delt mellem BlogBoard og PostDialog. hq/posts.ts har "server-only" og kan
// ikke importeres fra klient-komponenter — samme mønster som
// pipeline-utils.ts' stepState: små, stabile konstanter duplikeres herfra
// med en kommentar, typerne importeres stadig type-only (elimineres af TS).
import type { BlogWork } from "@/lib/hq/posts";

export const BLOG_CATEGORIES = ["lokal-synlighed", "ai-soegning", "hjemmeside", "kundecases", "pris", "kinly"] as const;
export type BlogCategory = (typeof BLOG_CATEGORIES)[number];

export const CATEGORY_LABEL: Record<BlogCategory, string> = {
  "lokal-synlighed": "Google og lokal synlighed",
  "ai-soegning": "AI-søgning",
  hjemmeside: "Hjemmeside og mobil",
  kundecases: "Kundecases",
  pris: "Pris og værdi",
  kinly: "Sådan arbejder vi",
};

export function categoryLabel(category: string): string {
  return CATEGORY_LABEL[category as BlogCategory] ?? (category || "Ingen kategori");
}

export const SEO_LIMITS = { title: 60, excerptMin: 70, excerpt: 160, altMin: 20, alt: 125 } as const;

// Spejler SCORE_AXES/SCORE_LABEL i hq/posts.ts (Jev-bedømmelsen, post-score.ts)
// — samme grund som BLOG_CATEGORIES ovenfor: posts.ts er "server-only".
export const SCORE_AXES = ["styrke", "kundebase", "seo", "geo", "marked", "gap"] as const;
export type ScoreAxis = (typeof SCORE_AXES)[number];
export const SCORE_LABEL: Record<ScoreAxis, string> = {
  styrke: "Salgsværdi",
  kundebase: "Væsentlighed for kunden",
  seo: "SEO-potentiale",
  geo: "GEO",
  marked: "Efterspørgsel/marked",
  gap: "Konkurrence-hul",
};

export interface ScoreEntry {
  score: number;
  why: string;
  at?: string;
  model?: string;
}
export type Scores = Partial<Record<ScoreAxis, ScoreEntry>>;

/** Tolerant læsning af den rå jsonb-kolonne. Spejler readScores i hq/posts.ts
 *  (dialogen henter posten rå via GET /api/posts/[id] — getPost returnerer
 *  db-rækken uden posts.ts' egen normalisering, og posts.ts kan ikke
 *  importeres herfra, samme grund som resten af filen). */
export function readScores(v: unknown): Scores {
  const out: Scores = {};
  if (!v || typeof v !== "object" || Array.isArray(v)) return out;
  for (const axis of SCORE_AXES) {
    const raw = (v as Record<string, unknown>)[axis];
    if (!raw || typeof raw !== "object") continue;
    const e = raw as { score?: unknown; why?: unknown; at?: unknown; model?: unknown };
    const score = Number(e.score);
    if (!Number.isInteger(score) || score < 1 || score > 100) continue;
    out[axis] = {
      score,
      why: String(e.why ?? ""),
      ...(typeof e.at === "string" && e.at ? { at: e.at } : {}),
      ...(typeof e.model === "string" && e.model ? { model: e.model } : {}),
    };
  }
  return out;
}

/** Samlet score: gennemsnit af de akser der er sat. Spejler overallScore i hq/posts.ts. */
export function overallScore(scores: Scores): number | null {
  const values = SCORE_AXES.map((axis) => scores[axis]?.score).filter((n): n is number => typeof n === "number");
  if (!values.length) return null;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Farve-niveau til en søjle/badge: rød < 40 ≤ gul < 70 ≤ grøn. */
export function scoreLevel(score: number): "low" | "mid" | "high" {
  if (score < 40) return "low";
  if (score < 70) return "mid";
  return "high";
}

// Kandidat-kontraktens felter (imageCandidate() i hq/posts.ts) — en PATCH skal
// sende hele objektet tilbage, ellers forsvinder felter der ikke sendes med.
export const IMAGE_FIELDS = ["id", "url", "placement", "alt", "credit", "source", "mobileUrl", "desktopUrl", "consentRef"] as const;

// Spejler IMAGE_SLOTS/chosenSlots() i hq/posts.ts. Dialogen får rå jsonb (getPost),
// så gamle rækker kan stadig stå med "both" (= "a,b") og uden c.
export const IMAGE_SLOTS = ["a", "b", "c"] as const;
export type ImageSlot = (typeof IMAGE_SLOTS)[number];

/** Valgte slots i rækkefølge: [topbillede, billede i teksten]. Ugyldigt/"none" → []. */
export function chosenSlots(choice: unknown): ImageSlot[] {
  const raw = String(choice ?? "none").trim().toLowerCase();
  if (raw === "both") return ["a", "b"];
  if (!raw || raw === "none") return [];
  const slots = raw.split(",").map((s) => s.trim());
  const ok = slots.length <= 2 && new Set(slots).size === slots.length && slots.every((s) => (IMAGE_SLOTS as readonly string[]).includes(s));
  return ok ? (slots as ImageSlot[]) : [];
}

/** Spejler isCustomerImage() i hq/posts.ts. */
export function isCustomerImage(k: { url: string; source: string }): boolean {
  return /\/img\/cases\//.test(k.url) || /^kunde/i.test((k.source || "").trim());
}

// --- Hermes' arbejde i Arbejder (spejler BlogWork/readWork i hq/posts.ts) ----
export const WORK_STALE_MS = 90 * 60_000;
// Hermes-jobbet der tjekker køen kører hvert 5. minut (orkestratorens cron).
const QUEUE_EVERY_MIN = 5;

/** Tolerant læsning af work-jsonb (dialogen og flyt-svaret får rå db-rækker). */
export function readWork(v: unknown): BlogWork {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const o = v as Record<string, unknown>;
  const out: BlogWork = {};
  for (const k of ["requestedBy", "requestedAt", "startedAt", "label", "updatedAt", "finishedAt", "error"] as const) {
    if (typeof o[k] === "string" && o[k]) out[k] = o[k] as string;
  }
  for (const k of ["step", "steps"] as const) if (Number.isInteger(o[k])) out[k] = o[k] as number;
  return out;
}

export type WorkState = "waiting" | "running" | "stale" | "failed" | "idle";

/** Samme regler som serveren: fejl vinder, startet uden fremdrift i 90 min = hængt. */
export function workState(w: BlogWork, now: number): WorkState {
  if (w.error) return "failed";
  if (w.startedAt && !w.finishedAt) return now - Date.parse(w.updatedAt ?? w.startedAt) > WORK_STALE_MS ? "stale" : "running";
  if (w.requestedAt && !w.startedAt) return "waiting";
  return "idle";
}

// Fast tidszone, så server og browser skriver samme klokkeslæt (ingen hydration-forskel).
const TZ = "Europe/Copenhagen";
export const clock = (iso: string) => new Intl.DateTimeFormat("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(new Date(iso)).replace(".", ":");
export const dayMonth = (iso: string) => new Intl.DateTimeFormat("da-DK", { day: "numeric", month: "numeric", timeZone: TZ }).format(new Date(iso)).replace(/\.$/, "").replace(".", "/");
export const personName = (actor: string) => (actor ? actor[0].toUpperCase() + actor.slice(1) : "");

// Hermes skriver ét indlæg ad gangen og højst så mange pr. døgn (spejler PER_DAY i
// vps/hermes-scripts/blog_trigger.py) — så de laves ordentligt og tokens holdes nede.
export const BLOG_PER_DAY = 2;

/** Kø-plads (1 = næste) + antal der skrives nu, for kort der venter. */
export type QueueSpot = { pos: number; running: number };

/** "i dag" / "i morgen" / ugedag for et kort på plads `pos` i køen. Groft skøn. */
export function expectedDay(spot: QueueSpot, now: number): string {
  const days = Math.floor((spot.running + spot.pos - 1) / BLOG_PER_DAY);
  if (days === 0) return "i dag";
  if (days === 1) return "i morgen";
  return new Intl.DateTimeFormat("da-DK", { weekday: "long", timeZone: TZ }).format(new Date(now + days * 86_400_000));
}

/** Statuslinje + fremdrift (0-100, null = ukendt) for et kort i Arbejder. */
export function workLine(w: BlogWork, now: number, spot?: QueueSpot): { state: WorkState; text: string; pct: number | null } {
  const state = workState(w, now);
  const trin = w.steps ? `trin ${w.step ?? 0}/${w.steps}` : "";
  const pct = w.steps ? Math.round(((w.step ?? 0) / w.steps) * 100) : null;
  if (state === "failed") return { state, pct, text: `Fejlede${w.step !== undefined ? ` ved trin ${w.step}` : ""}: ${w.error}` };
  if (state === "stale") return { state, pct, text: "Ingen fremdrift i 90 min — hænger måske" };
  if (state === "waiting") {
    const waited = now - Date.parse(w.requestedAt!);
    if (spot && (spot.pos > 1 || spot.running > 0)) {
      return { state, pct: null, text: `I kø: nr. ${spot.pos} · Hermes skriver ét ad gangen · forventet ca. ${expectedDay(spot, now)}` };
    }
    return { state, pct: null, text: waited > 2 * QUEUE_EVERY_MIN * 60_000 ? `Venter på Hermes — bestilt ${clock(w.requestedAt!)}` : `Venter på Hermes — starter inden for ca. ${QUEUE_EVERY_MIN} min` };
  }
  if (state === "running") {
    // Groft skøn: gennemsnitstid pr. færdigt trin × trin tilbage.
    let eta = "";
    if (w.steps && w.step && w.step < w.steps) {
      const left = Math.max(1, Math.round(((now - Date.parse(w.startedAt!)) / w.step) * (w.steps - w.step) / 60_000));
      eta = `ca. ${left} min tilbage`;
    }
    return { state, pct, text: ["Hermes skriver", trin, w.label, `startet ${clock(w.startedAt!)}`, eta].filter(Boolean).join(" · ") };
  }
  return { state, pct: null, text: "" };
}

// Spejler countWords() i hq/posts.ts — kun til den levende ord-tæller i
// dialogen, ikke til nogen gate (den regner serveren stadig selv).
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
