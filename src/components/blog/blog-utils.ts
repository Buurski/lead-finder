// Delt mellem BlogBoard og PostDialog. hq/posts.ts har "server-only" og kan
// ikke importeres fra klient-komponenter — samme mønster som
// pipeline-utils.ts' stepState: små, stabile konstanter duplikeres herfra
// med en kommentar, typerne importeres stadig type-only (elimineres af TS).
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

/** Spejler isCustomerImage() i hq/posts.ts. */
export function isCustomerImage(k: { url: string; source: string }): boolean {
  return /\/img\/cases\//.test(k.url) || /^kunde/i.test((k.source || "").trim());
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
