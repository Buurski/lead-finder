// Blog-pipelinen (/blog): ideer → arbejder → klar → publicer → udgivet.
// Al skrivning går gennem denne fil, så stage-guards og publishRequestedAt kun
// findes ét sted. Mønster: hq/deals.ts.
import "server-only";
import { asc, desc, eq, max } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { blogPost } from "../db/schema.ts";

export const BLOG_STAGES = ["ide", "arbejder", "klar", "publicer", "udgivet"] as const;
export type BlogStage = (typeof BLOG_STAGES)[number];

export const STAGE_LABEL: Record<BlogStage, string> = {
  ide: "Idéer",
  arbejder: "Arbejder",
  klar: "Klar",
  publicer: "Publicer",
  udgivet: "Udgivet",
};

// Kun Lucas og Charlie må sætte et kort i Publicer — det er aftalen om at
// udgiver-jobbet må tage det næste gang det kører. Alt andet end de to personlige
// logins (agenten "hermes", det gamle fælles Basic-login der lander som "delt",
// og ukendte aktører) må kun flytte mellem de tre første kolonner.
const PUBLISH_ACTORS = new Set<string>(["lucas", "charlie"]);
const AGENT_STAGES: readonly string[] = ["ide", "arbejder", "klar"];

export class BlogInputError extends Error {}

const SLUG = /^[a-z0-9-]{3,80}$/;
const PUBLISHED_URL = /^https:\/\/kinly\.dk\/blog\//;

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
  stage?: unknown;
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
  if (p.stage !== undefined) out.stage = stageOf(p.stage);
  return out;
}

/** Nyt indlæg. Lander altid i Idéer, bagerst i kolonnen. */
export async function createPost(db: Db, patch: BlogPatch, actor: string) {
  const fields = validPatch(patch);
  if (!fields.title) throw new BlogInputError("Titel mangler");
  const slug = fields.slug || slugFrom(fields.title);
  return db.transaction(async (tx) => {
    const [twin] = await tx.select({ id: blogPost.id }).from(blogPost).where(eq(blogPost.slug, slug));
    if (twin) throw new BlogInputError(`slugen "${slug}" er allerede brugt af et andet indlæg`);
    const top = await tx.select({ value: max(blogPost.position) }).from(blogPost).where(eq(blogPost.stage, "ide"));
    const [row] = await tx
      .insert(blogPost)
      .values({
        ...fields,
        slug,
        stage: "ide",
        position: (top[0]?.value ?? 0) + 1,
        createdBy: actor,
        updatedBy: actor,
      })
      .returning();
    return row;
  });
}

// Stage-guards ét sted. Reglerne (spec 24-09-2026):
// - til Publicer: kun lucas/charlie, og det sætter publishRequestedAt
// - væk fra Publicer: publishRequestedAt ryddes (aftalen er aflyst inden næste kørsel)
// - til Udgivet: afvist her — kun markPublished må gøre det
// - fra Udgivet: afvist (v1 kan ikke trække et udgivet indlæg tilbage)
// - agenten (hermes) må kun target'e ide/arbejder/klar
// - ved stage-skift: position = max+1 i målkolonnen
// Felt-rettelser (fx en ny note) uden stage-skift rører hverken position eller
// publishRequestedAt — også når kortet står i Publicer eller Udgivet.
export async function updatePost(db: Db, id: string, patch: BlogPatch, actor: string) {
  const fields = validPatch(patch);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(blogPost).where(eq(blogPost.id, id)).for("update");
    if (!before) throw new BlogInputError("indlægget findes ikke");
    const from = before.stage as BlogStage;
    const target = (fields.stage ?? from) as BlogStage;
    const moving = fields.stage !== undefined && fields.stage !== before.stage;

    if (moving && from === "udgivet") throw new BlogInputError("et udgivet indlæg kan ikke flyttes tilbage");
    if (moving && target === "udgivet") throw new BlogInputError("Udgivet sættes af udgiver-jobbet — brug markPublished");
    if (fields.stage !== undefined && actor === "hermes" && !AGENT_STAGES.includes(target)) {
      throw new BlogInputError("agenten må kun flytte mellem Idéer, Arbejder og Klar");
    }
    if (moving && target === "publicer" && !PUBLISH_ACTORS.has(actor)) {
      throw new BlogInputError("kun Lucas eller Charlie kan sætte et indlæg i Publicer");
    }

    // Tom slug betyder "udled af titlen" — af den nye titel hvis der kommer en.
    if (fields.slug === "") fields.slug = slugFrom(String(fields.title ?? before.title));

    // Samme sammenstøds-tjek som i createPost. Uden det rammer et slug der er i brug
    // den rå unique-violation fra Postgres, og ruten svarer 500 i stedet for 400.
    if (fields.slug !== undefined && fields.slug !== before.slug) {
      const [twin] = await tx.select({ id: blogPost.id }).from(blogPost).where(eq(blogPost.slug, fields.slug));
      if (twin) throw new BlogInputError(`slugen "${fields.slug}" er allerede brugt af et andet indlæg`);
    }

    const set: Partial<typeof blogPost.$inferInsert> = { ...fields, updatedBy: actor, updatedAt: new Date() };
    if (moving) {
      const top = await tx.select({ value: max(blogPost.position) }).from(blogPost).where(eq(blogPost.stage, target));
      set.position = (top[0]?.value ?? 0) + 1;
      set.publishRequestedAt = target === "publicer" ? new Date() : null;
    }

    const [after] = await tx.update(blogPost).set(set).where(eq(blogPost.id, id)).returning();
    return after;
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
  if (!PUBLISH_ACTORS.has(actor)) throw new BlogInputError("kun Lucas eller Charlie kan slette et indlæg");
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
