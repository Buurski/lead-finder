import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { blogPost } from "../db/schema.ts";
import {
  BLOG_STAGES,
  BlogInputError,
  STAGE_LABEL,
  createPost,
  deletePost,
  deriveSlug,
  getPost,
  isSlugConflict,
  listPosts,
  markPublished,
  updatePost,
} from "./posts.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const LIVE_URL = "https://kinly.dk/blog/hvad-koster-en-hjemmeside";

async function seed(title = "Hvad koster en hjemmeside egentlig i 2026", actor = "hermes") {
  return createPost(db, { title, excerpt: "Kort resume" }, actor);
}

test("slug udledes af titlen med æ/ø/å", () => {
  assert.equal(deriveSlug("Bliver din virksomhed nævnt af ChatGPT?"), "bliver-din-virksomhed-naevnt-af-chatgpt");
  assert.equal(deriveSlug("Ærlig økonomi og åbningstider"), "aerlig-oekonomi-og-aabningstider");
  assert.equal(deriveSlug("  SEO — der sælger!  "), "seo-der-saelger");
  assert.equal(deriveSlug("a".repeat(120)).length, 80);
});

test("nye indlæg lander i Idéer med udledt slug og position max+1", async () => {
  assert.deepEqual([...BLOG_STAGES], ["ide", "arbejder", "klar", "publicer", "udgivet"]);
  assert.equal(STAGE_LABEL.publicer, "Publicer");

  const first = await seed();
  const second = await seed("Anmeldelser — den mest oversete del af din synlighed");
  assert.equal(first.stage, "ide");
  assert.equal(first.position, 1);
  assert.equal(first.slug, "hvad-koster-en-hjemmeside-egentlig-i-2026");
  assert.equal(first.createdBy, "hermes");
  assert.equal(first.publishRequestedAt, null);
  assert.equal(second.slug, "anmeldelser-den-mest-oversete-del-af-din-synlighed");
  assert.equal(second.position, 2);
});

test("slug kan sættes selv, og tom slug betyder udled", async () => {
  const given = await createPost(db, { title: "Webbureau eller selvklaret", slug: "webbureau-selvklaret" }, "lucas");
  assert.equal(given.slug, "webbureau-selvklaret");
  const derived = await createPost(db, { title: "Case Ikast AutoService", slug: "  " }, "lucas");
  assert.equal(derived.slug, "case-ikast-autoservice");
});

test("slug skal være unik", async () => {
  await seed("SEO der sælger");
  await assert.rejects(createPost(db, { title: "SEO der sælger" }, "hermes"), /allerede brugt/);
});

test("slug-sammenstød ved rettelse giver en pæn fejl, ikke et database-nedbrud", async () => {
  const a = await seed("Første indlæg");
  await seed("Andet indlæg");
  // Både et håndsat slug og en slug udledt af en ny titel skal ramme samme fejl
  // som createPost — ellers svarer ruten 500 i stedet for 400.
  await assert.rejects(updatePost(db, a.id, { slug: "andet-indlaeg" }, "lucas"), BlogInputError);
  await assert.rejects(updatePost(db, a.id, { slug: "andet-indlaeg" }, "lucas"), /allerede brugt/);
  await assert.rejects(updatePost(db, a.id, { title: "Andet indlæg", slug: "" }, "hermes"), /allerede brugt/);
  // Eget slug er ikke et sammenstød, og et nyt frit slug går igennem.
  const same = await updatePost(db, a.id, { slug: a.slug }, "lucas");
  assert.equal(same.slug, a.slug);
  const moved = await updatePost(db, a.id, { slug: "foerste-indlaeg-2" }, "lucas");
  assert.equal(moved.slug, "foerste-indlaeg-2");
});

test("validering afviser rod", async () => {
  await assert.rejects(createPost(db, { title: "" }, "lucas"), /Titel mangler/);
  await assert.rejects(createPost(db, { title: 42 }, "lucas"), /skal være tekst/);
  await assert.rejects(createPost(db, { title: "a".repeat(161) }, "lucas"), /Titel er for lang/);
  await assert.rejects(createPost(db, { title: "!!!" }, "lucas"), /slug/);
  await assert.rejects(createPost(db, { title: "Ok titel", slug: "Hej med dig!" }, "lucas"), /Slug skal/);
  await assert.rejects(createPost(db, { title: "Ok titel", slug: "ab" }, "lucas"), /Slug skal/);
  // Spec: slug skal matche ^[a-z0-9-]{3,80}$ — store bogstaver afvises, ikke rettes i tavshed
  await assert.rejects(createPost(db, { title: "Ok titel", slug: "Case-Ikast" }, "lucas"), /Slug skal/);
  await assert.rejects(createPost(db, { title: "Ok titel", category: "x".repeat(61) }, "lucas"), /Kategori/);
  await assert.rejects(createPost(db, { title: "Ok titel", excerpt: "x".repeat(301) }, "lucas"), /Resume/);
  await assert.rejects(createPost(db, { title: "Ok titel", note: "x".repeat(301) }, "lucas"), /Note/);
  await assert.rejects(createPost(db, { title: "Ok titel", sourcePath: "x".repeat(301) }, "lucas"), /Kildesti/);
  await assert.rejects(createPost(db, { title: "Ok titel", body: "x".repeat(80_001) }, "lucas"), /Brødtekst/);
  const maxBody = await createPost(db, { title: "Ok titel", body: "x".repeat(80_000) }, "lucas");
  assert.equal(maxBody.body.length, 80_000);

  const post = await seed();
  await assert.rejects(updatePost(db, post.id, { stage: "vundet" }, "lucas"), /ukendt kolonne/);
  await assert.rejects(updatePost(db, "00000000-0000-0000-0000-000000000000", { note: "hej" }, "lucas"), /findes ikke/);
});

test("agenten må ikke sætte Publicer eller Udgivet", async () => {
  const post = await seed();
  await assert.rejects(updatePost(db, post.id, { stage: "publicer" }, "hermes"), /agenten må kun/);
  await assert.rejects(updatePost(db, post.id, { stage: "udgivet" }, "hermes"), /markPublished/);
  const [after] = await db.select().from(blogPost).where(eq(blogPost.id, post.id));
  assert.equal(after.stage, "ide");
  assert.equal(after.publishRequestedAt, null);

  // Agenten må gerne arbejde videre inden for de tre første kolonner.
  const klar = await updatePost(db, post.id, { stage: "klar", note: "kladde-1 klar" }, "hermes");
  assert.equal(klar.stage, "klar");
  assert.equal(klar.updatedBy, "hermes");
});

test("Publicer kræver Lucas eller Charlie og sætter publishRequestedAt", async () => {
  const post = await seed();
  await assert.rejects(updatePost(db, post.id, { stage: "publicer" }, "delt"), /kun Lucas eller Charlie/);
  const lucas = await updatePost(db, post.id, { stage: "publicer" }, "lucas");
  assert.ok(lucas.publishRequestedAt instanceof Date);
  assert.equal(lucas.stage, "publicer");

  const other = await seed("Fem ting lokale virksomheder spørger om");
  const charlie = await updatePost(db, other.id, { stage: "publicer" }, "charlie");
  assert.ok(charlie.publishRequestedAt instanceof Date);
});

test("flyt væk fra Publicer rydder publishRequestedAt", async () => {
  const post = await seed();
  await updatePost(db, post.id, { stage: "publicer" }, "lucas");
  const back = await updatePost(db, post.id, { stage: "klar", note: "taget af køen" }, "lucas");
  assert.equal(back.stage, "klar");
  assert.equal(back.publishRequestedAt, null);
});

test("Klar-kolonnen heder \"Til gennemlæsning\" — dataværdien er stadig klar", () => {
  assert.equal(STAGE_LABEL.klar, "Til gennemlæsning");
  assert.equal(STAGE_LABEL.ide, "Idéer");
  assert.equal(STAGE_LABEL.publicer, "Publicer");
  assert.deepEqual([...BLOG_STAGES], ["ide", "arbejder", "klar", "publicer", "udgivet"]);
});

test("agenten kan ikke trække et kort ud af Publicer — aftalen aflyses kun af et menneske", async () => {
  const post = await seed();
  await updatePost(db, post.id, { stage: "publicer" }, "lucas");

  for (const stage of ["klar", "arbejder", "ide"]) {
    await assert.rejects(updatePost(db, post.id, { stage }, "hermes"), /ud af Publicer/);
  }
  // Det gamle fælles-login ("delt") og ukendte aktører må heller ikke aflyse aftalen.
  await assert.rejects(updatePost(db, post.id, { stage: "klar" }, "delt"), /ud af Publicer/);

  const [after] = await db.select().from(blogPost).where(eq(blogPost.id, post.id));
  assert.equal(after.stage, "publicer");
  assert.ok(after.publishRequestedAt instanceof Date);

  // En ren felt-rettelse mens kortet står i Publicer er stadig tilladt for agenten.
  const note = await updatePost(db, post.id, { note: "læst igennem af Lucas" }, "hermes");
  assert.equal(note.stage, "publicer");
  assert.ok(note.publishRequestedAt instanceof Date);

  // Mennesket kan — og så ryddes aftalen.
  const back = await updatePost(db, post.id, { stage: "klar" }, "charlie");
  assert.equal(back.stage, "klar");
  assert.equal(back.publishRequestedAt, null);
});

test("stage-skift lægger kortet bagerst i målkolonnen", async () => {
  const a = await seed("Første");
  const b = await seed("Anden");
  const c = await seed("Tredje");
  assert.equal(c.position, 3);
  const aMove = await updatePost(db, a.id, { stage: "klar" }, "hermes");
  const bMove = await updatePost(db, b.id, { stage: "klar" }, "hermes");
  assert.equal(aMove.position, 1);
  assert.equal(bMove.position, 2);
  // Positioner kompakteres ikke: tilbage i Idéer (hvor c står på 3) bliver næste nummer 4.
  const back = await updatePost(db, a.id, { stage: "ide" }, "hermes");
  assert.equal(back.position, 4);
});

test("markPublished kræver Publicer og en kinly.dk/blog-url", async () => {
  const post = await seed();
  await assert.rejects(markPublished(db, post.id, { url: LIVE_URL }, "hermes"), /står ikke i Publicer/);

  await updatePost(db, post.id, { stage: "publicer" }, "lucas");
  await assert.rejects(markPublished(db, post.id, { url: "https://kinly.dk/om-os" }, "hermes"), /kinly\.dk\/blog/);
  await assert.rejects(markPublished(db, post.id, { url: "http://kinly.dk/blog/x" }, "hermes"), /kinly\.dk\/blog/);
  await assert.rejects(markPublished(db, post.id, { url: "https://evil.dk/blog/x" }, "hermes"), /kinly\.dk\/blog/);
  await assert.rejects(markPublished(db, post.id, { url: "" }, "hermes"), /kinly\.dk\/blog/);

  const live = await markPublished(db, post.id, { url: LIVE_URL, note: "live" }, "hermes");
  assert.equal(live.stage, "udgivet");
  assert.equal(live.publishedUrl, LIVE_URL);
  assert.ok(live.publishedAt instanceof Date);
  assert.equal(live.note, "live");
});

test("et udgivet indlæg kan ikke flyttes tilbage", async () => {
  const post = await seed();
  await updatePost(db, post.id, { stage: "publicer" }, "lucas");
  await markPublished(db, post.id, { url: LIVE_URL }, "hermes");
  await assert.rejects(updatePost(db, post.id, { stage: "klar" }, "lucas"), /kan ikke flyttes tilbage/);
  await assert.rejects(updatePost(db, post.id, { stage: "ide" }, "hermes"), /kan ikke flyttes tilbage/);
  const [after] = await db.select().from(blogPost).where(eq(blogPost.id, post.id));
  assert.equal(after.stage, "udgivet");
});

test("sletning kræver menneske og kun i Idéer eller Arbejder", async () => {
  const ide = await seed("Slettes fra Idéer");
  await assert.rejects(deletePost(db, ide.id, "hermes"), /kun Lucas eller Charlie/);
  await deletePost(db, ide.id, "lucas");

  const arbejder = await seed("Slettes fra Arbejder");
  await updatePost(db, arbejder.id, { stage: "arbejder" }, "hermes");
  await deletePost(db, arbejder.id, "charlie");

  const klar = await seed("Bliver i Klar");
  await updatePost(db, klar.id, { stage: "klar" }, "hermes");
  await assert.rejects(deletePost(db, klar.id, "lucas"), /kun indlæg i Idéer eller Arbejder/);

  const publicer = await seed("Bliver i Publicer");
  await updatePost(db, publicer.id, { stage: "publicer" }, "lucas");
  await assert.rejects(deletePost(db, publicer.id, "lucas"), /Idéer eller Arbejder/);

  const udgivet = await seed("Bliver udgivet");
  await updatePost(db, udgivet.id, { stage: "publicer" }, "charlie");
  await markPublished(db, udgivet.id, { url: LIVE_URL }, "hermes");
  await assert.rejects(deletePost(db, udgivet.id, "lucas"), /Idéer eller Arbejder/);

  await assert.rejects(deletePost(db, "00000000-0000-0000-0000-000000000000", "lucas"), /findes ikke/);
  assert.equal((await listPosts(db)).length, 3);
});

test("listPosts filtrerer på kolonne og sorterer position asc, derefter nyeste rettelse", async () => {
  const a = await seed("Første");
  const b = await seed("Anden");
  await updatePost(db, a.id, { note: "rettet sidst" }, "hermes");
  // Position bestemmer før updatedAt: a (1) står før b (2), selv om a er nyest rettet.
  let cards = await listPosts(db);
  assert.deepEqual(cards.map((c) => c.title), ["Første", "Anden"]);
  assert.ok(cards[0].updatedAt >= cards[1].updatedAt);
  assert.ok(!("body" in cards[0]));

  // Samme position → nyeste rettelse først.
  await db.update(blogPost).set({ position: 5 }).where(eq(blogPost.id, a.id));
  await db.update(blogPost).set({ position: 5 }).where(eq(blogPost.id, b.id));
  await updatePost(db, b.id, { note: "nyest" }, "hermes");
  await db.update(blogPost).set({ updatedAt: new Date(Date.now() - 3_600_000) }).where(eq(blogPost.id, a.id));
  cards = await listPosts(db);
  assert.deepEqual(cards.map((c) => c.note), ["nyest", "rettet sidst"]);

  await updatePost(db, b.id, { stage: "arbejder" }, "hermes");
  const arbejde = await listPosts(db, { stage: "arbejder" });
  assert.deepEqual(arbejde.map((c) => c.title), ["Anden"]);
  assert.equal(arbejde[0].stage, "arbejder");
  assert.equal((await listPosts(db, { stage: "ide" })).length, 1);
  await assert.rejects(listPosts(db, { stage: "vundet" }), /ukendt kolonne/);
});

test("unique-violation på slug (23505) bliver en BlogInputError, ikke en rå 500", async () => {
  // Drizzle pakker databasens fejl ind i en DrizzleQueryError: koden står på cause.
  const pakket = Object.assign(new Error('Failed query: insert into "blog_post"'), {
    cause: Object.assign(new Error('duplicate key value violates unique constraint "blog_post_slug_uq"'), {
      code: "23505",
      constraint: "blog_post_slug_uq",
    }),
  });
  // postgres-js (prod) kalder feltet constraint_name — begge navne skal fanges.
  assert.equal(isSlugConflict(pakket), true);
  assert.equal(isSlugConflict({ code: "23505", constraint_name: "blog_post_slug_uq" }), true);
  assert.equal(isSlugConflict({ code: "23505" }), true);
  // Andre indekser og andre fejlkoder er ikke slug-sammenstød.
  assert.equal(isSlugConflict({ code: "23505", constraint_name: "company_place_id_uq" }), false);
  assert.equal(isSlugConflict({ code: "23503", constraint_name: "blog_post_slug_uq" }), false);
  assert.equal(isSlugConflict(new Error("noget andet")), false);
  assert.equal(isSlugConflict(null), false);

  // Kapløbs-stien (begge kald slipper gennem tjekket, indekset siger nej) kan ikke
  // fremkaldes med PGlite's ene forbindelse. Fejl-mappingen testes derfor direkte:
  // en db hvis transaktion kaster den pakkede unique-violation.
  const fejlendeDb = { transaction: async () => { throw pakket; } } as unknown as Db;
  await assert.rejects(createPost(fejlendeDb, { title: "Kapløb om slug" }, "hermes"), BlogInputError);
  await assert.rejects(createPost(fejlendeDb, { title: "Kapløb om slug" }, "hermes"), /allerede brugt/);
  await assert.rejects(updatePost(fejlendeDb, "00000000-0000-0000-0000-000000000001", { slug: "kaplob-om-slug" }, "hermes"), /allerede brugt/);

  // Andre fejl kastes uændret videre — dem svarer ruten 500 på, og det skal den.
  const andenFejl = new Error("forbindelsen røg");
  const doedDb = { transaction: async () => { throw andenFejl; } } as unknown as Db;
  await assert.rejects(createPost(doedDb, { title: "Rigtig fejl" }, "hermes"), /forbindelsen røg/);
  await assert.rejects(updatePost(doedDb, "00000000-0000-0000-0000-000000000001", { slug: "rigtig-fejl" }, "hermes"), /forbindelsen røg/);
});

test("kapløbet om slug'en: det rigtige indeks siger nej, og createPost svarer med en BlogInputError", async () => {
  // Ægte fejl fra databasen (ingen håndlavet objekt): drizzle pakker den i en
  // DrizzleQueryError, hvor 23505 + indeksnavnet står på `cause`. Testen holder
  // de syntetiske fejl ovenfor fast til virkeligheden — driver PGlite/drizzle
  // om på formen, fejler den her.
  await db.insert(blogPost).values({ title: "Optaget", slug: "kaplob-om-slug", createdBy: "lucas", updatedBy: "lucas" });
  const aegte = await db
    .insert(blogPost)
    .values({ title: "Dubleret", slug: "kaplob-om-slug", createdBy: "lucas", updatedBy: "lucas" })
    .then(() => null)
    .catch((e: unknown) => e);
  assert.ok(aegte instanceof Error);
  assert.equal((aegte as { code?: unknown }).code, undefined, "koden står ikke på den yderste fejl");
  assert.equal(isSlugConflict(aegte), true);

  // Kapløbs-stien uden at snyde: sammenstøds-tjekket ser tomt ud (som for det
  // andet af to samtidige kald), mens insert'en rammer det rigtige indeks.
  const raceDb = {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      db.transaction((tx) =>
        fn({
          select: () => ({ from: () => ({ where: () => Promise.resolve([]) }) }),
          insert: (table: unknown) => (tx as { insert: (t: unknown) => unknown }).insert(table),
        }),
      ),
  } as unknown as Db;

  await assert.rejects(createPost(raceDb, { title: "Kapløb", slug: "kaplob-om-slug" }, "hermes"), BlogInputError);
  await assert.rejects(createPost(raceDb, { title: "Kapløb", slug: "kaplob-om-slug" }, "hermes"), /allerede brugt/);
  assert.equal((await listPosts(db)).length, 1);
});

test("getPost slår op på id og slug og henter body med", async () => {
  const post = await createPost(db, { title: "Hvad betyder hosting egentlig", body: "# Hosting\n\nTekst her." }, "lucas");
  const byId = await getPost(db, post.id);
  assert.equal(byId.body, "# Hosting\n\nTekst her.");
  const bySlug = await getPost(db, "hvad-betyder-hosting-egentlig");
  assert.equal(bySlug.id, post.id);
  await assert.rejects(getPost(db, "findes-ikke"), BlogInputError);
  await assert.rejects(getPost(db, "  "), /id eller slug mangler/);
});
