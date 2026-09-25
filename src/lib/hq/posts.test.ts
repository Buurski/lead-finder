import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { freshTestDb } from "../db/test-db.ts";
import type { Db } from "../db/client.ts";
import { blogPost } from "../db/schema.ts";
import {
  BLOG_STAGES,
  BlogInputError,
  SOURCE_LABEL,
  STAGE_LABEL,
  bodyLinks,
  countWords,
  createPost,
  deletePost,
  deriveSlug,
  getPost,
  internalLinks,
  isSlugConflict,
  listPosts,
  markPublished,
  readChecklist,
  readJev,
  readProofs,
  readRatings,
  readScores,
  recordJev,
  revisionOf,
  runChecklist,
  seoMissing,
  updatePost,
} from "./posts.ts";
import type { BlogImages } from "./posts.ts";

let db: Db;
beforeEach(async () => {
  db = await freshTestDb();
});

const LIVE_URL = "https://kinly.dk/blog/hvad-koster-en-hjemmeside";

/**
 * Kvitterer tjeklisten grøn for den aktuelle revision, præcis som serveren selv
 * gør efter en grøn kørsel. Bruges i de tests der handler om stage-guards og
 * markPublished — selve fail-closed-reglen testes for sig nedenfor.
 */
async function publish(id: string, actor = "lucas") {
  const [row] = await db.select().from(blogPost).where(eq(blogPost.id, id));
  await db
    .update(blogPost)
    .set({ checklist: { revision: revisionOf(row), ok: true, missing: [], at: new Date().toISOString() } })
    .where(eq(blogPost.id, id));
  return updatePost(db, id, { stage: "publicer" }, actor);
}

// --- Grønt eksempel: en kladde der opfylder hvert punkt i tjeklisten --------
const GREEN_SLUG = "hvad-koster-en-hjemmeside";
const GREEN_CANDIDATE = (slot: "a" | "b") => ({
  id: `billed-${slot}`,
  url: `https://cdn.kinly.dk/${slot}.jpg`,
  placement: slot === "a" ? "hero" : "inline",
  alt: `Håndtegnet skitse af en hjemmeside, variant ${slot}`,
  credit: "Foto: Kinly",
  source: "eget skud",
  mobileUrl: `https://cdn.kinly.dk/${slot}-mobil.jpg`,
  desktopUrl: `https://cdn.kinly.dk/${slot}-desktop.jpg`,
});
const GREEN_IMAGES: BlogImages = { a: GREEN_CANDIDATE("a"), b: GREEN_CANDIDATE("b"), choice: "none", choiceBy: "", choiceAt: null };
const GREEN_SOURCES = [1, 2, 3, 4, 5].map((n) => ({
  url: `https://www.erhvervsstyrelsen.dk/kilde-${n}`,
  date: `2026-09-0${n}`,
  claim: `Konkret påstand ${n} fra kilden`,
  method: "åbnet og læst 25-09",
}));
const GREEN_COUNCIL = { reviewer: "uafhængig-agent-b", log: "wiki/kinly/council-2026-09-24.md", findings: "to fund lukket", retest: "grøn" };
const GREEN_FAQ = [
  { q: "Hvad koster en hjemmeside?", a: "Det afhænger af opgaven — spørg om et tilbud." },
  { q: "Hvor lang tid tager det?", a: "Typisk to til fire uger." },
  { q: "Ejer jeg koden?", a: "Ja, 100 procent." },
];
const GREEN_PROOFS = { sources: GREEN_SOURCES, council: GREEN_COUNCIL, faq: GREEN_FAQ, factcheck: null };

/** 640 ord plus links og CTA — nok til at ligge i 600-900-vinduet. */
function greenBody(slug = GREEN_SLUG): string {
  const ord = Array.from({ length: 640 }, (_, i) => `ord${i % 40}`);
  const afsnit: string[] = [];
  for (let i = 0; i < ord.length; i += 40) afsnit.push(ord.slice(i, i + 40).join(" "));
  return [
    "# Hvad koster en hjemmeside",
    ...afsnit,
    "Læs også om [branchesiden for håndværkere](https://kinly.dk/brancher/haandvaerk) og [vores case med Ikast AutoService](https://kinly.dk/cases/ikast-autoservice).",
    `[Tag SEO-tjekket](/seo-tjek/?ref=blog-${slug})`,
  ].join("\n\n");
}

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
  const lucas = await publish(post.id);
  assert.ok(lucas.publishRequestedAt instanceof Date);
  assert.equal(lucas.stage, "publicer");

  const other = await seed("Fem ting lokale virksomheder spørger om");
  const charlie = await publish(other.id, "charlie");
  assert.ok(charlie.publishRequestedAt instanceof Date);
});

test("flyt væk fra Publicer rydder publishRequestedAt", async () => {
  const post = await seed();
  await publish(post.id);
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
  await publish(post.id);

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

  await publish(post.id);
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
  await publish(post.id);
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
  await publish(publicer.id);
  await assert.rejects(deletePost(db, publicer.id, "lucas"), /Idéer eller Arbejder/);

  const udgivet = await seed("Bliver udgivet");
  await publish(udgivet.id, "charlie");
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

// --- B2: kilde, scorekort, ratings, beviser, tjekliste, Jev -----------------

test("kilden sættes serverside — agenten kan ikke kalde sit kort manuelt", async () => {
  const menneske = await createPost(db, { title: "Idé fra Lucas" }, "lucas");
  assert.equal(menneske.source, "manuel");
  const agent = await createPost(db, { title: "Idé fra agenten" }, "hermes");
  assert.equal(agent.source, "agent");
  const signal = await createPost(db, { title: "Fra CRM-signalet", source: "crm-signal" }, "hermes");
  assert.equal(signal.source, "crm-signal");
  await assert.rejects(createPost(db, { title: "Snyder med kilden", source: "manuel" }, "hermes"), /manuel/);
  // Også når et menneske skriver noget andet i payloaden, er kilden manuel.
  const payload = await createPost(db, { title: "Mennesket siger agent", source: "agent" }, "charlie");
  assert.equal(payload.source, "manuel");
  assert.equal(SOURCE_LABEL["crm-signal"], "CRM-signal");
});

test("scorekort og menneskers rating: partial patches, round-trip og agent-afvisning", async () => {
  const post = await createPost(db, { title: "Bliver din virksomhed nævnt af ChatGPT?" }, "hermes");

  const første = await updatePost(db, post.id, { scores: { seo: { score: 78, why: "søgevolumen i Ikast" } } }, "hermes");
  assert.deepEqual(readScores(første.scores), { seo: { score: 78, why: "søgevolumen i Ikast" } });
  // Partial patch: næste akse må ikke rydde den første.
  const anden = await updatePost(db, post.id, { scores: { gap: { score: 40, why: "mange skriver om emnet" } } }, "hermes");
  assert.deepEqual(Object.keys(readScores(anden.scores)).sort(), ["gap", "seo"]);
  await assert.rejects(updatePost(db, post.id, { scores: { seo: { score: 101, why: "" } } }, "hermes"), /1-100/);
  await assert.rejects(updatePost(db, post.id, { scores: { ukendt: { score: 9, why: "" } } }, "hermes"), /kendes ikke/);

  // Ratinger er menneskets: agenten må hverken skrive eller senere fjerne dem.
  await assert.rejects(updatePost(db, post.id, { rating: { value: 5 } }, "hermes"), /kun Lucas eller Charlie kan rate/);
  const rated = await updatePost(db, post.id, { rating: { value: 4, comment: "God vinkel" } }, "lucas");
  const ratinger = readRatings(rated.ratings);
  assert.equal(ratinger.length, 1);
  assert.equal(ratinger[0].actor, "lucas");
  assert.equal(ratinger[0].stage, "ide");
  assert.equal(ratinger[0].kind, "score");
  assert.equal(ratinger[0].revision, revisionOf(rated));

  await updatePost(db, post.id, { rating: { thumb: "op" } }, "charlie");
  const efterAgent = await updatePost(db, post.id, { note: "agenten retter videre" }, "hermes");
  const beholdt = readRatings(efterAgent.ratings);
  assert.equal(beholdt.length, 2, "agentens opdatering må ikke fjerne ratinger");
  assert.deepEqual(beholdt.map((r) => r.actor), ["lucas", "charlie"]);
  assert.equal(beholdt[1].kind, "thumb");
  assert.equal(beholdt[1].thumb, "op");

  await assert.rejects(updatePost(db, post.id, { rating: { value: 3, thumb: "op" } }, "lucas"), /enten 1-5/);
  await assert.rejects(updatePost(db, post.id, { rating: { value: 6 } }, "lucas"), /1-5/);
  const cards = await listPosts(db);
  assert.equal(cards[0].ratings.length, 2);
  assert.equal(cards[0].scores.seo?.score, 78);
});

test("beviserne er partial patches, og faktatjekket er menneskets alene", async () => {
  const post = await createPost(db, { title: "Beviser for et indlæg" }, "hermes");
  const medKilder = await updatePost(db, post.id, { proofs: { sources: GREEN_SOURCES } }, "hermes");
  assert.equal(readProofs(medKilder.proofs).sources.length, 5);

  // Agenten kan ikke bekræfte sin egen tekst.
  await assert.rejects(updatePost(db, post.id, { proofs: { factcheck: { note: "tror det er fint" } } }, "hermes"), /kun Lucas eller Charlie/);

  // Mennesket kan — og det der ikke sendes med, bevares.
  const menneske = await updatePost(db, post.id, { proofs: { factcheck: { note: "talt med kunden" }, faq: GREEN_FAQ } }, "lucas");
  const p = readProofs(menneske.proofs);
  assert.equal(p.factcheck?.by, "lucas");
  assert.equal(p.factcheck?.revision, revisionOf(menneske));
  assert.equal(p.sources.length, 5);
  assert.equal(p.faq.length, 3);
  assert.equal(readProofs((await updatePost(db, post.id, { proofs: { council: GREEN_COUNCIL } }, "hermes")).proofs).factcheck?.by, "lucas");

  // En kilde uden url, dato eller påstand er ikke en kilde.
  await assert.rejects(updatePost(db, post.id, { proofs: { sources: [{ url: "https://x.dk", date: "", claim: "noget" }] } }, "hermes"), /Dato/);
  await assert.rejects(updatePost(db, post.id, { proofs: { sources: [{ url: "ikke-en-url", date: "2026-09-01", claim: "noget" }] } }, "hermes"), /url/);
  await assert.rejects(updatePost(db, post.id, { proofs: { ukendt: 1 } }, "hermes"), /kendes ikke/);
});

test("tjeklisten er maskinelt beregnet, og Publicer er fail-closed på revisionen", async () => {
  // Ordtælling og links deler definition med UI'et (ingen netkald, ren tekst).
  assert.equal(countWords("## Hej\n\n[med link](https://kinly.dk/x) og `kode`"), 4);
  assert.equal(internalLinks(greenBody()).length, 2);
  assert.equal(bodyLinks(greenBody()).some((l) => l.href.includes(`ref=blog-${GREEN_SLUG}`)), true);

  const post = await createPost(db, { title: "Hvad koster en hjemmeside", slug: GREEN_SLUG, category: "pris", excerpt: "Hvad koster en hjemmeside til en lille virksomhed i 2026? Vi gennemgår priser, drift og hvad du selv kan gøre." }, "hermes");
  const rød = readChecklist(post.checklist);
  assert.equal(rød.ok, false);
  assert.ok(rød.missing.length >= 5, rød.missing.join("; "));
  assert.equal(rød.revision, revisionOf(post));

  // Agenten kan levere alt undtagen de to menneske-punkter.
  const halv = await updatePost(db, post.id, { body: greenBody(), proofs: { ...GREEN_PROOFS }, images: GREEN_IMAGES }, "hermes");
  assert.deepEqual(readChecklist(halv.checklist).missing, [
    "menneskets A/B-valg mangler (A, B, begge eller ingen)",
    "menneskets faktatjek mangler (nul opdigtede kunder, citater og tal)",
    "et billede skal vælges (A, B eller begge) — uden billede kan opslaget ikke publiceres",
  ]);

  // Agenten kan ikke publicere, uanset hvor grønt kortet er.
  await assert.rejects(updatePost(db, post.id, { stage: "publicer" }, "hermes"), /agenten må kun/);

  // Mennesket vælger billede (A, B eller begge — "ingen" blokerer Publicer) og kvitterer faktatjek.
  // Klientens egne choiceBy/choiceAt ignoreres: stemplet er serverens, sat ud fra
  // aktøren — så et UI kan ikke skrive et falsk menneskestempel på et valg.
  const grøn = await updatePost(
    db,
    post.id,
    {
      images: { choice: "a", choiceBy: "hermes", choiceAt: "1999-01-01T00:00:00.000Z" },
      proofs: { factcheck: { note: "læst igennem" } },
    },
    "lucas",
  );
  const check = readChecklist(grøn.checklist);
  assert.equal(check.ok, true, check.missing.join("; "));
  assert.equal(grøn.images.choiceBy, "lucas");
  assert.notEqual(grøn.images.choiceAt, "1999-01-01T00:00:00.000Z");

  const publiceret = await updatePost(db, post.id, { stage: "publicer" }, "lucas");
  assert.equal(publiceret.stage, "publicer");
  assert.ok(publiceret.publishRequestedAt instanceof Date);

  // Ændres teksten, er tjeklisten ikke længere grøn (faktatjekket hører til den
  // gamle revision) — og så kan kortet ikke sættes i Publicer igen.
  const ændret = await updatePost(db, post.id, { body: greenBody() + "\n\nEt nyt afsnit, som ingen har læst." }, "hermes");
  const ny = readChecklist(ændret.checklist);
  assert.equal(ny.ok, false);
  assert.match(ny.missing.join(" "), /ældre version/);
  assert.equal(ny.revision, revisionOf(ændret));

  await updatePost(db, post.id, { stage: "klar" }, "lucas"); // mennesket tager den ud af køen
  await assert.rejects(updatePost(db, post.id, { stage: "publicer" }, "lucas"), /ikke aktuel og grøn/);

  // En gammel grøn kvittering kan heller ikke bruges: revisionen skal matche.
  const [row] = await db.select().from(blogPost).where(eq(blogPost.id, post.id));
  await db
    .update(blogPost)
    .set({ checklist: { revision: "gammel-revision", ok: true, missing: [], at: new Date().toISOString() } })
    .where(eq(blogPost.id, post.id));
  await assert.rejects(updatePost(db, post.id, { stage: "publicer" }, "lucas"), /ikke aktuel og grøn/);
  assert.equal(row.stage, "klar");

  // Nyt faktatjek på den nye tekst → grønt igen.
  await updatePost(db, post.id, { proofs: { factcheck: { note: "læst igen" } } }, "charlie");
  const igen = await updatePost(db, post.id, { stage: "publicer" }, "lucas");
  assert.equal(igen.stage, "publicer");
});

test("tjeklistens enkelte punkter: ord, links, CTA, pladsholder og A/B-stempel", async () => {
  const grund = { title: "Hvad koster en hjemmeside", slug: GREEN_SLUG, category: "pris", excerpt: "Hvad koster en hjemmeside til en lille virksomhed i 2026? Vi gennemgår priser, drift og hvad du selv kan gøre.", body: greenBody() };
  const billeder: BlogImages = { ...GREEN_IMAGES, choice: "both", choiceBy: "lucas", choiceAt: "2026-09-25T00:00:00.000Z" };
  const beviser = { ...GREEN_PROOFS, factcheck: { by: "lucas", at: "2026-09-25T00:00:00.000Z", note: "", revision: revisionOf({ ...grund, images: billeder }) } };

  const grøn = runChecklist({ ...grund, images: billeder, proofs: beviser });
  assert.equal(grøn.ok, true, grøn.missing.join("; "));

  const udenValg = runChecklist({ ...grund, images: { ...billeder, choiceBy: "", choiceAt: null }, proofs: beviser });
  assert.match(udenValg.missing.join(" "), /A\/B-valg/);

  const medTodo = runChecklist({ ...grund, body: `${grund.body}\n\nTODO: skriv resten`, images: billeder, proofs: beviser });
  assert.match(medTodo.missing.join(" "), /pladsholder/);

  const forKort = runChecklist({ ...grund, body: "Alt for kort.", images: billeder, proofs: beviser });
  assert.match(forKort.missing.join(" "), /600-900/);

  const udenCta = runChecklist({ ...grund, body: grund.body.replace(/\?ref=blog-[a-z-]+/, ""), images: billeder, proofs: beviser });
  assert.match(udenCta.missing.join(" "), /CTA/);

  const udenLink = runChecklist({ ...grund, body: grund.body.replace("https://kinly.dk/cases/ikast-autoservice", "https://kinly.dk/blog/et-andet-indlaeg"), images: billeder, proofs: beviser });
  assert.match(udenLink.missing.join(" "), /interne links/);

  const kunToFaq = runChecklist({ ...grund, images: billeder, proofs: { ...beviser, faq: GREEN_FAQ.slice(0, 2) } });
  assert.match(kunToFaq.missing.join(" "), /3-5 FAQ/);

  const udenKilder = runChecklist({ ...grund, images: billeder, proofs: { ...beviser, sources: GREEN_SOURCES.slice(0, 4) } });
  assert.match(udenKilder.missing.join(" "), /5 kilder/);

  const udenCouncil = runChecklist({ ...grund, images: billeder, proofs: { ...beviser, council: null } });
  assert.match(udenCouncil.missing.join(" "), /council-log/);
});

test("Jev-svaret gemmes på den revision det gjaldt", async () => {
  const post = await createPost(db, { title: "Klar til Jev" }, "hermes");
  assert.equal(readJev(post.jev), null);

  const record = await recordJev(db, post.id, { ready: true, score: 0.82, issue: "ingen" }, "hermes");
  assert.equal(record.revision, revisionOf(post));
  assert.equal(readJev(record)?.ready, true);
  const [card] = await listPosts(db);
  assert.equal(card.jev?.ready, true);
  assert.equal(card.jev?.score, 0.82);

  // Ny tekst: svaret hører til en ældre revision og må ikke læses som gyldigt.
  await updatePost(db, post.id, { body: "Ny tekst her." }, "hermes");
  const [efter] = await db.select().from(blogPost).where(eq(blogPost.id, post.id));
  assert.equal(readJev(efter.jev)?.ready, true);
  assert.notEqual(readJev(efter.jev)?.revision, revisionOf(efter));
  assert.equal(readJev(efter.jev)?.revision, revisionOf(post));
});

test("SEO-gates (Lucas 25-09): kategori, titel, uddrag, alt-tekst, billedvalg og kundesamtykke", () => {
  const grund = { title: "Hvad koster en hjemmeside", slug: GREEN_SLUG, category: "pris", excerpt: "Hvad koster en hjemmeside til en lille virksomhed i 2026? Vi gennemgår priser, drift og hvad du selv kan gøre." };
  const valgt = (choice: "a" | "b" | "both" | "none", a = GREEN_CANDIDATE("a")): BlogImages => ({ a, b: GREEN_CANDIDATE("b"), choice, choiceBy: "lucas", choiceAt: "2026-09-25T00:00:00.000Z" });
  assert.deepEqual(seoMissing(grund, valgt("a")), []);
  const m = (p: object, imgs = valgt("a")) => seoMissing({ ...grund, ...p }, imgs).join(" | ");
  assert.match(m({ category: "Priser" }), /kategori skal være/);
  assert.match(m({ title: "x".repeat(61) }), /titlen er 61 tegn/);
  assert.match(m({ excerpt: "for kort" }), /uddraget er 8 tegn/);
  assert.match(m({ excerpt: "x".repeat(161) }), /uddraget er 161 tegn/);
  assert.match(m({}, valgt("none")), /et billede skal vælges/);
  assert.match(m({}, valgt("a", { ...GREEN_CANDIDATE("a"), alt: "kort" })), /alt-tekst på A er 4 tegn/);
  assert.match(m({}, valgt("a", { ...GREEN_CANDIDATE("a"), alt: "Billede af en håndværker på et tag i Herning" })), /må ikke starte med/);
  const kunde = { ...GREEN_CANDIDATE("a"), url: "https://kinly.dk/img/cases/shot-ikast-desktop.webp" };
  assert.match(m({}, valgt("a", kunde)), /kundens samtykke/);
  assert.deepEqual(seoMissing(grund, valgt("a", { ...kunde, consentRef: "mail 2026-09-20 fra Allan" })), []);
  // B tjekkes kun når B er valgt.
  assert.deepEqual(seoMissing(grund, { ...valgt("a"), b: { ...GREEN_CANDIDATE("b"), alt: "kort" } }), []);
  assert.match(seoMissing(grund, { ...valgt("both"), b: { ...GREEN_CANDIDATE("b"), alt: "kort" } }).join(" "), /alt-tekst på B/);
});
