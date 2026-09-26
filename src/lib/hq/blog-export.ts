// Udgiveren (spec 24-09: "rent script, 0 LLM"): kinly-site's GitHub Action henter
// kort i Publicer herfra, skriver content/blog/<slug>.ts + billeder, committer, og
// melder tilbage med url'en. HQ tjekker selv at siden er live (URL-bevis) før
// kortet flyttes til Udgivet. Konverteringen ligger her, så den kan testes mod
// samme regler som tjeklisten.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { blogPost } from "../db/schema.ts";
import { markPublished, readChecklist, readImages, readProofs, revisionOf, type BlogImageCandidate } from "./posts.ts";

type Row = typeof blogPost.$inferSelect;

export interface KinlySection { heading: string; paragraphs: string[]; bullets?: string[] }
export interface KinlyImage { src: string; alt: string; afterSection?: number; consentRef?: string }
export interface KinlyPost {
  slug: string;
  title: string;
  metaTitle: string;
  description: string;
  category: string;
  format: "Historien" | "Undersøgelsen" | "Vores historie";
  published: string;
  author: "Lucas Buur" | "Charlie Nielsen";
  hook: string;
  shortAnswer?: string;
  cover: KinlyImage;
  sections: KinlySection[];
  images?: KinlyImage[];
  sources?: { label: string; url: string }[];
  tjekliste: { heading: string; items: string[] };
  faq?: { question: string; answer: string }[];
}
export interface ExportItem {
  id: string;
  revision: string;
  post: KinlyPost;
  /** Billeder der skal hentes og lægges i kinly-site/public/<path>. */
  files: { url: string; path: string }[];
}

const TJEKLISTE = /gøre nu|tjekliste|kom i gang|næste skridt/i;
const BULLET = /^\s*[-*]\s+/;

function ext(url: string): string {
  const m = /\.(webp|png|jpe?g|avif)(?:$|[?#])/i.exec(url);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "webp";
}

/** Markdown (som HQ-tjeklisten læser den) → kinly.dk's sektionsformat. Links bevares som [tekst](url). */
export function parseBody(body: string): { intro: string[]; sections: KinlySection[] } {
  const intro: string[] = [];
  const sections: KinlySection[] = [];
  const blocks = body.replace(/\r\n/g, "\n").split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    if (/^#\s/.test(lines[0])) {
      lines.shift(); // titlen står allerede i title
      if (!lines.length) continue;
    }
    if (/^##+\s/.test(lines[0])) {
      sections.push({ heading: lines[0].replace(/^##+\s+/, "").trim(), paragraphs: [] });
      lines.shift();
      if (!lines.length) continue;
    }
    const cur = sections[sections.length - 1];
    if (lines.every((l) => BULLET.test(l))) {
      const items = lines.map((l) => l.replace(BULLET, "").trim());
      if (cur) cur.bullets = [...(cur.bullets ?? []), ...items];
      else intro.push(items.join(" · "));
      continue;
    }
    const text = lines.join(" ").replace(/\s+/g, " ").trim();
    if (cur) cur.paragraphs.push(text);
    else intro.push(text);
  }
  return { intro, sections };
}

function cphToday(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
}

/** Ét kort i Publicer → kinly.dk-opslag. Kaster, hvis kortet mangler noget kinly.dk kræver. */
export function toKinlyPost(row: Pick<Row, "id" | "title" | "slug" | "category" | "excerpt" | "body" | "images" | "proofs" | "updatedBy">, now = new Date()): Omit<ExportItem, "revision"> {
  const slug = row.slug;
  const images = readImages(row.images);
  const proofs = readProofs(row.proofs);
  const chosen: BlogImageCandidate[] = (images.choice === "both" ? [images.a, images.b] : images.choice === "a" ? [images.a] : images.choice === "b" ? [images.b] : []).filter(
    (k): k is BlogImageCandidate => Boolean(k),
  );
  if (!chosen.length) throw new Error(`${slug}: intet valgt billede`);

  const { intro, sections: parsed } = parseBody(row.body);
  let sections = parsed;
  const tjekIdx = sections.findIndex((s) => TJEKLISTE.test(s.heading) && s.bullets?.length);
  const tjekliste = tjekIdx >= 0 ? { heading: sections[tjekIdx].heading, items: sections[tjekIdx].bullets! } : { heading: "Hvad kan du gøre nu", items: [] };
  if (tjekIdx >= 0) {
    const rest = sections[tjekIdx].paragraphs;
    sections = sections.filter((_, i) => i !== tjekIdx);
    if (rest.length && sections.length) sections[sections.length - 1].paragraphs.push(...rest);
  }
  const hook = intro[0] || row.excerpt;
  const extraIntro = intro.slice(2);
  if (!sections.length) sections = [{ heading: row.title, paragraphs: [] }];
  if (extraIntro.length) sections[0].paragraphs.unshift(...extraIntro);

  const files = chosen.map((k, i) => ({ url: k.desktopUrl || k.url, path: `img/blog/${slug}-${i === 0 ? "hero" : "billede"}.${ext(k.desktopUrl || k.url)}` }));
  const img = (k: BlogImageCandidate, i: number): KinlyImage => ({ src: `/${files[i].path}`, alt: k.alt, ...(k.consentRef ? { consentRef: k.consentRef } : {}) });

  const post: KinlyPost = {
    slug,
    title: row.title,
    metaTitle: row.title.length + 8 <= 60 ? `${row.title} · Kinly` : row.title,
    description: row.excerpt,
    category: row.category,
    format: row.category === "kundecases" ? "Historien" : row.category === "kinly" ? "Vores historie" : "Undersøgelsen",
    published: cphToday(now),
    // Forfatter = mennesket der faktatjekkede den version der udgives (updatedBy kan være hermes).
    author: proofs.factcheck?.by === "charlie" ? "Charlie Nielsen" : "Lucas Buur",
    hook,
    ...(intro[1] ? { shortAnswer: intro[1] } : {}),
    cover: img(chosen[0], 0),
    sections,
    ...(chosen[1] ? { images: [{ ...img(chosen[1], 1), afterSection: Math.min(1, sections.length - 1) }] } : {}),
    ...(proofs.sources.length
      ? { sources: proofs.sources.map((s) => ({ label: s.claim.length > 140 ? `${s.claim.slice(0, 137)}…` : s.claim || s.url, url: s.url })) }
      : {}),
    tjekliste,
    ...(proofs.faq.length ? { faq: proofs.faq.map((f) => ({ question: f.q, answer: f.a })) } : {}),
  };
  return { id: row.id, post, files };
}

/** Kort i Publicer med grøn tjekliste for PRÆCIS den nuværende tekst — samme gate som markPublished. */
export async function exportablePosts(db: Db, now = new Date()): Promise<{ items: ExportItem[]; skipped: { id: string; error: string }[] }> {
  const rows = await db.select().from(blogPost).where(eq(blogPost.stage, "publicer"));
  const items: ExportItem[] = [];
  const skipped: { id: string; error: string }[] = [];
  for (const row of rows) {
    const revision = revisionOf(row);
    const stored = readChecklist(row.checklist);
    if (!stored.ok || stored.revision !== revision) {
      skipped.push({ id: row.id, error: "tjeklisten er ikke grøn for den nuværende tekst" });
      continue;
    }
    try {
      items.push({ ...toKinlyPost(row, now), revision });
    } catch (e) {
      skipped.push({ id: row.id, error: String((e as Error).message ?? e).slice(0, 200) });
    }
  }
  return { items, skipped };
}

/** Udgiveren melder et opslag live. HQ henter selv siden og kræver 200 + titlen i HTML'en før Udgivet. */
export async function confirmPublished(db: Db, id: string, url: unknown, fetcher: typeof fetch = fetch) {
  const [row] = await db.select().from(blogPost).where(eq(blogPost.id, id));
  if (!row) throw new Error("indlægget findes ikke");
  if (typeof url !== "string") throw new Error("url mangler");
  // Kun kortets egen adresse hentes (ingen vilkårlige url'er — SSRF, Opus-council 26/9).
  const expected = `https://kinly.dk/blog/${row.slug}/`;
  if (!row.slug || url !== expected) throw new Error(`url skal være ${expected}`);
  const res = await fetcher(expected, { redirect: "manual", headers: { "user-agent": "KinlyHQ-udgiver" } });
  if (res.status !== 200) throw new Error(`siden er ikke live endnu (HTTP ${res.status})`);
  // 200 alene beviser ikke at DETTE kort er udgivet (fx en ældre side med samme slug): titlen skal stå i HTML'en.
  if (!decodeEntities(await res.text()).includes(row.title)) throw new Error("siden svarer, men viser ikke kortets titel — ikke dette opslag");
  return markPublished(db, id, { url: expected }, "udgiver");
}

function decodeEntities(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
