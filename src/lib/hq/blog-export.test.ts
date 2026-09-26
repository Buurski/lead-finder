import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { blogPost } from "../db/schema.ts";
import { createPost, updatePost } from "./posts.ts";
import { confirmPublished, exportablePosts, parseBody, toKinlyPost } from "./blog-export.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const cand = (slot: "a" | "b") => ({
  id: `billed-${slot}`,
  url: `https://cdn.kinly.dk/${slot}.png`,
  placement: slot === "a" ? "hero" : "inline",
  alt: `Skærmskud af en hjemmeside på en telefon, variant ${slot}`,
  credit: "Foto: Kinly",
  source: "eget skud",
  mobileUrl: "",
  desktopUrl: "",
});
const SOURCES = [1, 2, 3, 4, 5].map((n) => ({ url: `https://www.erhvervsstyrelsen.dk/kilde-${n}`, date: `2026-09-0${n}`, claim: `Konkret påstand ${n}`, method: "læst" }));
const FAQ = [1, 2, 3].map((n) => ({ q: `Spørgsmål ${n}?`, a: `Svar ${n}.` }));
const COUNCIL = { reviewer: "uafhængig", log: "wiki/x.md", findings: "ingen", retest: "grøn" };
const EXCERPT = "Hvad koster en hjemmeside til en lille virksomhed i 2026? Vi gennemgår priser, drift og hvad du selv kan gøre.";

function body(slug: string): string {
  const para = (n: number) => Array.from({ length: 40 }, (_, i) => `ord${(i + n) % 30}`).join(" ");
  return [
    "# Hvad koster en hjemmeside",
    "Kort åbning om prisen.",
    "Det korte svar: det afhænger af opgaven.",
    "## Hvad prisen består af",
    ...Array.from({ length: 8 }, (_, i) => para(i)),
    "- Domæne\n- Hosting\n- Tekster",
    "## Drift",
    ...Array.from({ length: 8 }, (_, i) => para(i + 9)),
    "Læs [branchesiden](https://kinly.dk/brancher/haandvaerk) og [casen](https://kinly.dk/cases/ikast-autoservice).",
    "## Hvad kan du gøre nu",
    "- Tjek din egen side på mobilen\n- Find tre konkurrenter",
    `[Tag SEO-tjekket](/seo-tjek/?ref=blog-${slug})`,
  ].join("\n\n");
}

async function greenInPublicer(title = "Hvad koster en hjemmeside i 2026") {
  const p = await createPost(db, { title }, "hermes");
  await updatePost(db, p.id, { category: "pris", excerpt: EXCERPT, body: body(p.slug), proofs: { sources: SOURCES, faq: FAQ, council: COUNCIL }, images: { a: cand("a"), b: cand("b") } }, "hermes");
  await updatePost(db, p.id, { images: { choice: "both" }, proofs: { factcheck: { note: "læst" } } }, "charlie");
  return updatePost(db, p.id, { stage: "publicer" }, "charlie");
}

test("parseBody: titel droppes, intro, sektioner, punktlister og links bevares", () => {
  const r = parseBody("# Titel\n\nÅbning.\n\n## Første\n\nTekst med [link](/x/).\n\n- a\n- b");
  assert.deepEqual(r.intro, ["Åbning."]);
  assert.deepEqual(r.sections, [{ heading: "Første", paragraphs: ["Tekst med [link](/x/)."], bullets: ["a", "b"] }]);
});

test("grønt kort i Publicer eksporteres i kinly.dk-format; tjeklisten flyttes ud; forfatter = den der godkendte", async () => {
  const p = await greenInPublicer();
  const { items, skipped } = await exportablePosts(db, new Date("2026-09-26T10:00:00Z"));
  assert.deepEqual(skipped, []);
  assert.equal(items.length, 1);
  const { post, files } = items[0];
  assert.equal(post.slug, p.slug);
  assert.equal(post.author, "Charlie Nielsen");
  assert.equal(post.published, "2026-09-26");
  assert.equal(post.hook, "Kort åbning om prisen.");
  assert.equal(post.shortAnswer, "Det korte svar: det afhænger af opgaven.");
  assert.deepEqual(post.sections.map((s) => s.heading), ["Hvad prisen består af", "Drift"]);
  assert.deepEqual(post.tjekliste, { heading: "Hvad kan du gøre nu", items: ["Tjek din egen side på mobilen", "Find tre konkurrenter"] });
  assert.ok(post.sections[1].paragraphs.some((x) => x.includes(`?ref=blog-${p.slug}`)), "CTA'en følger med");
  assert.equal(post.cover.src, `/img/blog/${p.slug}-hero.png`);
  assert.equal(post.images?.[0].src, `/img/blog/${p.slug}-billede.png`);
  assert.deepEqual(files.map((f) => f.url), ["https://cdn.kinly.dk/a.png", "https://cdn.kinly.dk/b.png"]);
  assert.equal(post.sources?.length, 5);
  assert.equal(post.faq?.length, 3);
});

test("kort uden for Publicer eller med ændret tekst eksporteres ikke", async () => {
  await createPost(db, { title: "Bare en idé" }, "lucas");
  const p = await greenInPublicer();
  await db.update(blogPost).set({ body: "ændret bag om ryggen" }).where(eq(blogPost.id, p.id));
  const { items, skipped } = await exportablePosts(db);
  assert.equal(items.length, 0);
  assert.match(skipped[0].error, /tjeklisten/);
});

test("confirmPublished kræver 200 fra siden, før kortet bliver Udgivet", async () => {
  const p = await greenInPublicer();
  const url = `https://kinly.dk/blog/${p.slug}/`;
  let fetched = "";
  const fake = (status: number, body = "x") => (async (u: string) => { fetched = u; return new Response(body, { status }); }) as unknown as typeof fetch;
  // SSRF: en fremmed url hentes aldrig.
  await assert.rejects(confirmPublished(db, p.id, "http://169.254.169.254/latest", fake(200)), /url skal være/);
  assert.equal(fetched, "");
  await assert.rejects(confirmPublished(db, p.id, url, fake(404)), /ikke live/);
  // 200 uden kortets titel = en anden side med samme slug.
  await assert.rejects(confirmPublished(db, p.id, url, fake(200, "<h1>Et gammelt opslag</h1>")), /titel/);
  const html = `<h1>${p.title.replace(/'/g, "&#x27;").replace(/&/g, "&amp;")}</h1>`;
  const after = await confirmPublished(db, p.id, url, fake(200, html));
  assert.equal(after.stage, "udgivet");
  assert.equal(after.publishedUrl, url);
  await assert.rejects(confirmPublished(db, p.id, url, fake(200, html)), /ikke i Publicer/);
});

test("toKinlyPost uden valgt billede kaster", () => {
  assert.throws(() => toKinlyPost({ id: "x", title: "T", slug: "t-t-t", category: "pris", excerpt: "e", body: "", images: { a: null, b: null, choice: "none" }, proofs: {}, updatedBy: "lucas" }), /billede/);
});
