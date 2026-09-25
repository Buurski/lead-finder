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
