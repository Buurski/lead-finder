// Udgiveren (spec 24-09: "rent script, 0 LLM"): kinly-site's GitHub Action henter
// kort i Publicer herfra, skriver content/blog/<slug>.ts + billeder, committer, og
// melder tilbage med url'en. HQ tjekker selv at siden er live (URL-bevis) før
// kortet flyttes til Udgivet. Konverteringen ligger her, så den kan testes mod
// samme regler som tjeklisten.
import { eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { blogPost } from "../db/schema.ts";
import { chosenSlots, isCustomerImage, markPublished, readChecklist, readImages, readJev, readProofs, revisionOf, type BlogImageCandidate, type BlogChecklist, type BlogJev } from "./posts.ts";

type Row = typeof blogPost.$inferSelect;

export interface KinlySection { heading: string; paragraphs: string[]; bullets?: string[] }
export interface KinlyImage { src: string; alt: string; caption?: string; afterSection?: number; consentRef?: string }
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
  /** OG-udsnit af heroen (1200x630) med samme alt-tekst. */
  og?: KinlyImage;
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
  /**
   * De gates kortet stod igennem, med i svaret så udgiver-scriptet kan
   * fail-closer validereklarheden offline uden at kalde HQ (spec: "kræver
   * JEV/precheck uden live-kald i test"). Begge skal matche `revision`.
   */
  gate: { checklist: BlogChecklist; jev: BlogJev | null };
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

/**
 * Billede 2's plads. kinly.dk's afterSection er et 0-baseret sektionsindeks ("vises efter
 * sektionen med dette indeks"), så placement "efter-afsnit-2" (efter 2. afsnit) → 1.
 * Andet ("midt", "inline", "hero" …) → midterste sektion. Altid klemt inden for sektionerne.
 */
export function afterSectionFor(placement: string, count: number): number {
  const m = /^efter-afsnit-(\d{1,3})$/i.exec(placement.trim());
  const idx = m ? Number(m[1]) - 1 : Math.floor(count / 2);
  return Math.max(0, Math.min(idx, count - 1));
}

/** Billedtekst ud fra krediteringen: "Foto: …"/"Kilde: …" står som de er, ellers "Kilde: <kredit>". */
function captionFor(credit: string): { caption?: string } {
  const c = credit.trim();
  if (!c) return {};
  return { caption: /^(foto|kilde|illustration|grafik|graf)\s*:/i.test(c) ? c : `Kilde: ${c}` };
}

function cphToday(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Europe/Copenhagen" });
}

/** Ét kort i Publicer → kinly.dk-opslag. Kaster, hvis kortet mangler noget kinly.dk kræver. */
export function toKinlyPost(row: Pick<Row, "id" | "title" | "slug" | "category" | "excerpt" | "body" | "images" | "proofs" | "updatedBy">, now = new Date()): Omit<ExportItem, "revision" | "gate"> {
  const slug = row.slug;
  const images = readImages(row.images);
  const proofs = readProofs(row.proofs);
  // Rækkefølgen er menneskets: første valgte = cover, andet = billedet i teksten.
  const chosen = chosenSlots(images).map((s) => images[s]).filter((k): k is BlogImageCandidate => Boolean(k));
  if (!chosen.length) throw new Error(`${slug}: intet valgt billede`);
  // Fail-closed (Lucas 25-09): et valgt billede uden alt-tekst, eller et
  // kundebillede uden registreret samtykke, stopper eksporten — det bliver
  // aldrig til et mock-billede eller en offentlig fil uden bevis.
  for (const k of chosen) {
    if (!k.alt?.trim()) throw new Error(`${slug}: valgt billede mangler alt-tekst`);
    if (isCustomerImage(k) && !k.consentRef?.trim()) throw new Error(`${slug}: kundebillede ${k.id} mangler kundens samtykke (consentRef)`);
  }

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

  // Filerne skal hedde præcis det kode.sh-vagten tillader (public/img/blog/
  // <slug>-hero.webp og -og.webp) og det sitet renderer: hero 1600x900,
  // OG-udsnit 1200x630 afledt af den valgte hero, og ved to valgte billeder
  // <slug>-b.webp i brødteksten. Udgiver-scriptet konverterer til webp.
  const heroSrc = chosen[0].desktopUrl || chosen[0].url;
  const files = [
    { url: heroSrc, path: `img/blog/${slug}-hero.webp` },
    { url: heroSrc, path: `img/blog/${slug}-og.webp` },
    ...(chosen[1] ? [{ url: chosen[1].desktopUrl || chosen[1].url, path: `img/blog/${slug}-b.webp` }] : []),
  ];
  const cover: KinlyImage = { src: `/img/blog/${slug}-hero.webp`, alt: chosen[0].alt, ...(chosen[0].consentRef ? { consentRef: chosen[0].consentRef } : {}) };
  // OG-billedet er et udsnit af heroen og bærer samme alt-tekst.
  const og: KinlyImage = { src: `/img/blog/${slug}-og.webp`, alt: chosen[0].alt };

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
    cover,
    og,
    sections,
    ...(chosen[1]
      ? {
          images: [
            {
              src: `/img/blog/${slug}-b.webp`,
              alt: chosen[1].alt,
              afterSection: afterSectionFor(chosen[1].placement, sections.length),
              ...captionFor(chosen[1].credit),
              ...(chosen[1].consentRef ? { consentRef: chosen[1].consentRef } : {}),
            },
          ],
        }
      : {}),
    ...(proofs.sources.length
      ? { sources: proofs.sources.map((s) => ({ label: s.claim.length > 140 ? `${s.claim.slice(0, 137)}…` : s.claim || s.url, url: s.url })) }
      : {}),
    tjekliste,
    ...(proofs.faq.length ? { faq: proofs.faq.map((f) => ({ question: f.q, answer: f.a })) } : {}),
  };
  return { id: row.id, post, files };
}

/** Kort i Publicer med grøn tjekliste OG grønt Jev for PRÉCIS den nuværende tekst — samme gate som markPublished. */
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
    // Fail-closed (kontrakt 25-09): udgiver-jobbet skal kunne kontrollere Jev
    // offline, så et grønt svar på en gammel kladde aldrig når kinly.dk.
    const jev = readJev(row.jev);
    if (!jev || !jev.ready || jev.revision !== revision) {
      skipped.push({ id: row.id, error: "Jev-resultatet mangler eller er ikke grønt for den nuværende tekst" });
      continue;
    }
    try {
      items.push({ ...toKinlyPost(row, now), revision, gate: { checklist: stored, jev } });
    } catch (e) {
      skipped.push({ id: row.id, error: String((e as Error).message ?? e).slice(0, 200) });
    }
  }
  return { items, skipped };
}

/** Hvad udgiver-jobbet skal levere som menneskets release-bevis (kontrakt 9/10). */
export interface ReleaseProof { revision: string; releaseSha: string }

/** Udgiveren melder et opslag live. Kræver BÅDE menneskets release-bevis og en læst live-url. */
export async function confirmPublished(db: Db, id: string, url: unknown, fetcher: typeof fetch = fetch, proof?: unknown) {
  const [row] = await db.select().from(blogPost).where(eq(blogPost.id, id));
  if (!row) throw new Error("indlægget findes ikke");
  if (typeof url !== "string") throw new Error("url mangler");
  const expected = `https://kinly.dk/blog/${row.slug}/`;
  if (!row.slug || url !== expected) throw new Error(`url skal være ${expected}`);
  // 1) Menneskets release-bevis: jobbet klargør kun en privat PR. At grenen er
  // merget er Lucas' handling, og sha'en binder den til PRÆCIS denne version.
  const p = (proof ?? {}) as Partial<ReleaseProof>;
  const sha = String(p.releaseSha ?? "").trim();
  if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error("release-bevis mangler: jobbet må ikke melde et opslag udgivet uden Lucas' merge-sha");
  if (String(p.revision ?? "") !== revisionOf(row)) {
    throw new Error("release-beviset er til en anden version af teksten — faktatjek igen, før opslaget meldes udgivet");
  }
  // 2) Live-url'en læses: 200 alene beviser ikke at DETTE kort er udgivet.
  const res = await fetcher(expected, { redirect: "manual", headers: { "user-agent": "KinlyHQ-udgiver" } });
  if (res.status !== 200) throw new Error(`siden er ikke live endnu (HTTP ${res.status})`);
  if (!decodeEntities(await res.text()).includes(row.title)) throw new Error("siden svarer, men viser ikke kortets titel — ikke dette opslag");
  return markPublished(db, id, { url: expected, note: `udgivet efter Lucas' release ${sha.slice(0, 8)}` }, "udgiver");
}

function decodeEntities(html: string): string {
  return html
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
