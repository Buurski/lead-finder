import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { POST } from "./route.ts";
import { __setDb, type Db } from "../../../../lib/db/client.ts";
import { freshTestDb } from "../../../../lib/db/test-db.ts";
import { blogPost } from "../../../../lib/db/schema.ts";
import { updatePost, revisionOf, readProofs, readRatings } from "../../../../lib/hq/posts.ts";
import { hermesSignature } from "../../../../lib/hermes-hmac.ts";

// Handleren kaldes direkte med et signeret Request — samme HMAC-skema som i
// prod: X-Timestamp + Bearer hmac(`${ts}.POST.${path}.${body}`).
const SECRET = "test-hemmelig-hmac";
process.env.HERMES_API_SECRET = SECRET;
process.env.DATA_BACKEND = "pg";
// JEV slået fra i disse tests: precheck skal svare jev:null uden netkald.
delete process.env.TYPESAFE_API_KEY;

const PATH = "/api/agent/posts";
const LIVE_URL = "https://kinly.dk/blog/hvad-koster-en-hjemmeside";
const IMAGE_CANDIDATES = {
  a: {
    id: "billed-a",
    url: "https://cdn.example.com/a.jpg",
    placement: "hero",
    alt: "Lucas foran et skrivebord",
    credit: "Foto: A",
    source: "CRM",
    mobileUrl: "https://cdn.example.com/a-mobile.jpg",
    desktopUrl: "https://cdn.example.com/a-desktop.jpg",
  },
  b: {
    id: "billed-b",
    url: "https://cdn.example.com/b.jpg",
    placement: "inline",
    alt: "Et arbejdsbord med laptop",
    credit: "Foto: B",
    source: "CRM",
    mobileUrl: "https://cdn.example.com/b-mobile.jpg",
    desktopUrl: "https://cdn.example.com/b-desktop.jpg",
  },
};

let db: Db;

beforeEach(async () => {
  db = await freshTestDb();
});
after(() => __setDb(null));

function signed(body: string, opts: { secret?: string; path?: string; signPath?: string } = {}) {
  const ts = String(Math.floor(Date.now() / 1000));
  const path = opts.path ?? PATH;
  // signPath lader testen sende et kald til én sti med en signatur lavet til en anden.
  const signedPath = opts.signPath ?? path;
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-timestamp": ts,
      authorization: `Bearer ${hermesSignature(opts.secret ?? SECRET, ts, "POST", signedPath, body)}`,
    },
    body,
  });
}

const post = (payload: unknown, opts: { secret?: string; path?: string; signPath?: string } = {}) => POST(signed(JSON.stringify(payload), opts));

/**
 * Lægger et kort direkte i Publicer — det må kun ske med et menneske som actor.
 * Tjeklisten kvitteres grøn for den aktuelle revision først, som serveren selv
 * ville have gjort det; selve fail-closed-reglen testes i posts.test.ts.
 */
async function toPublicer(id: string) {
  const [row] = await db.select().from(blogPost).where(eq(blogPost.id, id));
  await db
    .update(blogPost)
    .set({ checklist: { revision: revisionOf(row), ok: true, missing: [], at: new Date().toISOString() } })
    .where(eq(blogPost.id, id));
  return updatePost(db, id, { stage: "publicer" }, "lucas");
}

test("create opretter kortet i Idéer med udledt slug", async () => {
  const res = await post({ actor: "hermes", action: "create", title: "  Hvad koster en hjemmeside egentlig i 2026  ", category: "SEO", excerpt: "Kort resume", body: "# Hosting\n\nTekst her.", note: "kladde-1 klar" });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.ok, true);
  assert.equal(json.post.stage, "ide");
  assert.equal(json.post.slug, "hvad-koster-en-hjemmeside-egentlig-i-2026");
  assert.equal(json.post.createdBy, "hermes");
  assert.equal(json.post.position, 1);
  assert.equal(json.post.publishRequestedAt, null);

  const [row] = await db.select().from(blogPost).where(eq(blogPost.id, json.post.id));
  assert.equal(row.body, "# Hosting\n\nTekst her.");
});

test("update retter felter uden at røre kolonnen", async () => {
  const created = await (await post({ actor: "hermes", action: "create", title: "Billigste og bedste webbureau" })).json();
  const res = await post({ actor: "hermes", action: "update", id: created.post.id, fields: { note: "råd 2-af-3 kørt", excerpt: "Nyt resume" } });
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.post.note, "råd 2-af-3 kørt");
  assert.equal(json.post.excerpt, "Nyt resume");
  assert.equal(json.post.stage, "ide");
  assert.equal(json.post.updatedBy, "hermes");
});

test("A/B-billeder kan round-trippe, men agenten kan ikke vælge dem", async () => {
  const created = await (await post({
    actor: "hermes",
    action: "create",
    title: "Billeder til bloggen",
    images: IMAGE_CANDIDATES,
  })).json();
  assert.equal(created.post.images.choice, "none");
  assert.deepEqual(created.post.images.a, IMAGE_CANDIDATES.a);
  assert.deepEqual(created.post.images.b, IMAGE_CANDIDATES.b);

  const list = await (await post({ actor: "hermes", action: "list" })).json();
  assert.deepEqual(list.cards[0].images, created.post.images);

  const agentChoice = await post({
    actor: "hermes",
    action: "update",
    id: created.post.id,
    fields: { images: { choice: "a" } },
  });
  assert.equal(agentChoice.status, 400);
  assert.match((await agentChoice.json()).error, /kun Lucas eller Charlie/);

  const humanChoice = await updatePost(db, created.post.id, { images: { choice: "both" } }, "lucas");
  assert.equal(humanChoice.images.choice, "both");
  assert.deepEqual(humanChoice.images.a, IMAGE_CANDIDATES.a);
  assert.deepEqual(humanChoice.images.b, IMAGE_CANDIDATES.b);
});

test("agenten kan ikke udskifte et allerede valgt billede, men må rette frie slots", async () => {
  for (const choice of ["a", "b", "both"] as const) {
    const created = await (await post({ action: "create", title: `Valgt billede ${choice}`, images: IMAGE_CANDIDATES })).json();
    const id = created.post.id;
    await updatePost(db, id, { images: { choice } }, "lucas");

    for (const slot of (["a", "b"] as const)) {
      const replacement = {
        ...IMAGE_CANDIDATES[slot],
        id: `nyt-${slot}`,
        url: `https://cdn.example.com/nyt-${slot}.jpg`,
        mobileUrl: `https://cdn.example.com/nyt-${slot}-mobile.jpg`,
        desktopUrl: `https://cdn.example.com/nyt-${slot}-desktop.jpg`,
      };
      const res = await post({ action: "update", id, fields: { images: { [slot]: replacement } } });
      if (choice === slot || choice === "both") {
        assert.equal(res.status, 400, `valgt ${slot} må ikke ændres ved choice=${choice}`);
        assert.match((await res.json()).error, /valgt billede/);
        const [row] = await db.select().from(blogPost).where(eq(blogPost.id, id));
        assert.deepEqual(row.images[slot], IMAGE_CANDIDATES[slot]);
        assert.equal(row.images.choice, choice);
      } else {
        assert.equal(res.status, 200, `frit ${slot} må ændres ved choice=${choice}`);
        assert.deepEqual((await res.json()).post.images[slot], replacement);
      }
    }

    // Idempotente gentagelser er ikke ændringer, og mennesket kan stadig rette sit valg.
    const selectedSlot = choice === "b" ? "b" : "a";
    const same = await post({ action: "update", id, fields: { images: { [selectedSlot]: IMAGE_CANDIDATES[selectedSlot] } } });
    assert.equal(same.status, 200);
    const human = await updatePost(db, id, { images: { [selectedSlot]: { ...IMAGE_CANDIDATES[selectedSlot], alt: "Godkendt ny alt-tekst" } } }, "lucas");
    assert.equal(human.images[selectedSlot]?.alt, "Godkendt ny alt-tekst");
  }

  const created = await (await post({ action: "create", title: "Endnu intet valg", images: IMAGE_CANDIDATES })).json();
  const res = await post({ action: "update", id: created.post.id, fields: { images: {
    a: { ...IMAGE_CANDIDATES.a, id: "nyt-a" },
    b: { ...IMAGE_CANDIDATES.b, id: "nyt-b" },
  } } });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).post.images.choice, "none");
});

test("move flytter mellem agentens tre kolonner og lægger kortet bagerst", async () => {
  const a = await (await post({ actor: "hermes", action: "create", title: "Første indlæg" })).json();
  const b = await (await post({ actor: "hermes", action: "create", title: "Andet indlæg" })).json();

  const arbejder = await (await post({ actor: "hermes", action: "move", id: a.post.id, stage: "arbejder" })).json();
  assert.equal(arbejder.post.stage, "arbejder");
  assert.equal(arbejder.post.position, 1);

  const klar = await (await post({ actor: "hermes", action: "move", id: b.post.id, stage: "klar" })).json();
  assert.equal(klar.post.stage, "klar");
  assert.equal(klar.post.publishRequestedAt, null);
  assert.equal(klar.post.position, 1);
});

test("list giver kort uden body, med og uden stage-filter", async () => {
  const a = await (await post({ actor: "hermes", action: "create", title: "Første indlæg" })).json();
  await post({ actor: "hermes", action: "create", title: "Andet indlæg" });
  await post({ actor: "hermes", action: "move", id: a.post.id, stage: "klar" });

  const alle = await (await post({ actor: "hermes", action: "list" })).json();
  assert.equal(alle.ok, true);
  assert.deepEqual(alle.cards.map((c: { title: string }) => c.title), ["Første indlæg", "Andet indlæg"]);
  assert.ok(!("body" in alle.cards[0]));

  const klar = await (await post({ actor: "hermes", action: "list", stage: "klar" })).json();
  assert.deepEqual(klar.cards.map((c: { title: string }) => c.title), ["Første indlæg"]);
  assert.equal(klar.cards[0].stage, "klar");

  const tom = await (await post({ actor: "hermes", action: "list", stage: "publicer" })).json();
  assert.deepEqual(tom.cards, []);
});

test("get slår op på id og på slug og henter body med", async () => {
  const created = await (await post({ actor: "hermes", action: "create", title: "Hvad betyder hosting egentlig", body: "Brødtekst" })).json();

  const byId = await (await post({ actor: "hermes", action: "get", id: created.post.id })).json();
  assert.equal(byId.post.body, "Brødtekst");

  const bySlug = await (await post({ actor: "hermes", action: "get", slug: "hvad-betyder-hosting-egentlig" })).json();
  assert.equal(bySlug.post.id, created.post.id);

  const mangler = await post({ actor: "hermes", action: "get" });
  assert.equal(mangler.status, 400);
  assert.equal((await mangler.json()).error, "id eller slug mangler");

  const ukendt = await post({ actor: "hermes", action: "get", slug: "findes-ikke" });
  assert.equal(ukendt.status, 400);
});

test("401 uden og med forkert signatur", async () => {
  const uden = await POST(new Request(`http://localhost${PATH}`, { method: "POST", body: JSON.stringify({ action: "list" }) }));
  assert.equal(uden.status, 401);
  assert.deepEqual(await uden.json(), { ok: false, error: "unauthorized" });

  const forkert = await post({ actor: "hermes", action: "list" }, { secret: "forkert" });
  assert.equal(forkert.status, 401);
  assert.deepEqual(await forkert.json(), { ok: false, error: "unauthorized" });

  // Signaturen hænger på stien: et kald signeret til tasks-ruten dur ikke her.
  const andenSti = await post({ actor: "hermes", action: "list" }, { signPath: "/api/agent/tasks" });
  assert.equal(andenSti.status, 401);
});

test("ruten tvinger actor hermes — payloaden kan ikke vælge et menneske", async () => {
  const lucas = await post({ actor: "lucas", action: "create", title: "Forsøg fra payloaden" });
  assert.equal(lucas.status, 400);
  assert.equal((await lucas.json()).ok, false);

  const hacker = await post({ actor: "hacker", action: "list" });
  assert.equal(hacker.status, 400);

  const delt = await post({ actor: "delt", action: "list" });
  assert.equal(delt.status, 400);

  const storeBogstaver = await post({ actor: "Lucas", action: "list" });
  assert.equal(storeBogstaver.status, 400);

  assert.equal((await db.select().from(blogPost)).length, 0);

  // Actor udeladt = agenten skriver som hermes (den kan ikke gætte et menneske).
  const udeladt = await post({ action: "list" });
  assert.equal(udeladt.status, 200);
  assert.equal((await udeladt.json()).ok, true);
});

test("ukendt action og delete afvises — agent-ruten har ingen sletning", async () => {
  const created = await (await post({ actor: "hermes", action: "create", title: "Bliver ikke slettet" })).json();

  for (const action of ["delete", "slet", "remove"]) {
    const res = await post({ actor: "hermes", action, id: created.post.id });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "ukendt action");
  }
  assert.equal((await db.select().from(blogPost)).length, 1);
});

test("agenten må ikke flytte til Publicer eller Udgivet", async () => {
  const created = await (await post({ actor: "hermes", action: "create", title: "Skal blive i Klar" })).json();
  await post({ actor: "hermes", action: "move", id: created.post.id, stage: "klar" });

  const publicer = await post({ actor: "hermes", action: "move", id: created.post.id, stage: "publicer" });
  assert.equal(publicer.status, 400);
  assert.equal((await publicer.json()).error, "agenten må kun flytte mellem Idéer, Arbejder og Klar");

  const udgivet = await post({ actor: "hermes", action: "move", id: created.post.id, stage: "udgivet" });
  assert.equal(udgivet.status, 400);
  assert.match((await udgivet.json()).error, /markPublished/);

  const [after] = await db.select().from(blogPost).where(eq(blogPost.id, created.post.id));
  assert.equal(after.stage, "klar");
  assert.equal(after.publishRequestedAt, null);
});

test("agenten kan ikke trække et kort ud af Publicer — aftalen aflyses kun af et menneske", async () => {
  const created = await (await post({ actor: "hermes", action: "create", title: "Ligger i Publicer" })).json();
  const publicer = await toPublicer(created.post.id);
  assert.ok(publicer.publishRequestedAt instanceof Date);

  for (const stage of ["klar", "arbejder", "ide"]) {
    const res = await post({ actor: "hermes", action: "move", id: created.post.id, stage });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /ud af Publicer/);
  }

  // Aftalen står stadig: publishRequestedAt er ikke ryddet i tavshed.
  const [after] = await db.select().from(blogPost).where(eq(blogPost.id, created.post.id));
  assert.equal(after.stage, "publicer");
  assert.ok(after.publishRequestedAt instanceof Date);

  // Mennesket (UI-ruten) kan godt — og så ryddes aftalen.
  const aflyst = await updatePost(db, created.post.id, { stage: "klar" }, "lucas");
  assert.equal(aflyst.publishRequestedAt, null);
});

test("move uden stage og update uden felter afvises — ingen tavse no-ops", async () => {
  const created = await (await post({ actor: "hermes", action: "create", title: "Må ikke røres i tavshed" })).json();
  const id = created.post.id;

  const udenStage = await post({ actor: "hermes", action: "move", id });
  assert.equal(udenStage.status, 400);
  assert.equal((await udenStage.json()).error, "stage mangler");

  for (const payload of [
    { actor: "hermes", action: "update", id, fields: {} },
    { actor: "hermes", action: "update", id },
  ]) {
    const res = await post(payload);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, "ingen felter at rette");
  }

  const liste = await post({ actor: "hermes", action: "update", id, fields: [] });
  assert.equal(liste.status, 400);
  assert.equal((await liste.json()).error, "fields skal være et objekt");

  // Ingen af afvisningerne nåede at skrive: updatedAt står stille, og kortet ligger stadig i Idéer.
  const [after] = await db.select().from(blogPost).where(eq(blogPost.id, id));
  assert.equal(after.stage, "ide");
  assert.equal(after.updatedAt.toISOString(), created.post.updatedAt);
});

test("published kræver url-bevis fra kinly.dk/blog og stage Publicer", async () => {
  const created = await (await post({ actor: "hermes", action: "create", title: "Klar til live" })).json();
  const id = created.post.id;

  // Forkert kolonne: kortet står i Idéer.
  const forTidligt = await post({ actor: "hermes", action: "published", id, url: LIVE_URL });
  assert.equal(forTidligt.status, 400);
  assert.match((await forTidligt.json()).error, /står ikke i Publicer/);

  await toPublicer(id);

  for (const url of ["https://kinly.dk/om-os", "http://kinly.dk/blog/x", "https://evil.dk/blog/x", ""]) {
    const res = await post({ actor: "hermes", action: "published", id, url });
    assert.equal(res.status, 400);
    assert.match((await res.json()).error, /kinly\.dk\/blog/);
  }

  const live = await (await post({ actor: "hermes", action: "published", id, url: LIVE_URL, note: "live kl. 05:15" })).json();
  assert.equal(live.post.stage, "udgivet");
  assert.equal(live.post.publishedUrl, LIVE_URL);
  assert.ok(live.post.publishedAt);

  const igen = await post({ actor: "hermes", action: "published", id, url: LIVE_URL });
  assert.equal(igen.status, 400);
});

test("update afviser de forbudte felter — stage og udgivelses-felter kan ikke patches", async () => {
  const created = await (await post({ actor: "hermes", action: "create", title: "Må ikke patches" })).json();
  const id = created.post.id;

  const forbudte: Array<[string, unknown]> = [
    ["stage", "publicer"],
    ["publishedUrl", LIVE_URL],
    ["publishedAt", "2026-09-24T00:00:00.000Z"],
    ["publishRequestedAt", "2026-09-24T00:00:00.000Z"],
    ["createdBy", "lucas"],
    ["updatedBy", "lucas"],
    ["position", 99],
    ["id", "00000000-0000-0000-0000-000000000000"],
  ];
  for (const [felt, værdi] of forbudte) {
    const res = await post({ actor: "hermes", action: "update", id, fields: { [felt]: værdi } });
    assert.equal(res.status, 400, `feltet ${felt} skulle være afvist`);
    assert.match((await res.json()).error, /kan ikke sættes her/);
  }

  // create er lige så stram: stage hører til move.
  const createStage = await post({ actor: "hermes", action: "create", title: "Ny med stage", stage: "publicer" });
  assert.equal(createStage.status, 400);

  // ingenting af det forbudte nåede databasen
  const [after] = await db.select().from(blogPost).where(eq(blogPost.id, id));
  assert.equal(after.stage, "ide");
  assert.equal(after.publishedUrl, null);
  assert.equal(after.publishedAt, null);
  assert.equal(after.publishRequestedAt, null);
  assert.equal(after.createdBy, "hermes");
  assert.equal((await db.select().from(blogPost)).length, 1);
});

test("dublet-slug giver 400 med forklaring, ikke 500", async () => {
  await post({ actor: "hermes", action: "create", title: "Første", slug: "dublet-slug" });
  const res = await post({ actor: "hermes", action: "create", title: "Anden", slug: "dublet-slug" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /allerede brugt/);

  const to = await (await post({ actor: "hermes", action: "create", title: "Tredje" })).json();
  const vedRettelse = await post({ actor: "hermes", action: "update", id: to.post.id, fields: { slug: "dublet-slug" } });
  assert.equal(vedRettelse.status, 400);
  assert.match((await vedRettelse.json()).error, /allerede brugt/);
  assert.equal((await db.select().from(blogPost)).length, 2);
});

test("rutens eget body-loft — 80k ind går, over 120.000 afvises", async () => {
  const stort = await post({ actor: "hermes", action: "create", title: "Langt indlæg", body: "x".repeat(80_000) });
  assert.equal(stort.status, 200);
  assert.equal((await stort.json()).post.body.length, 80_000);

  const forStort = await post({ actor: "hermes", action: "create", title: "For langt", body: "x".repeat(120_001) });
  assert.equal(forStort.status, 413);
  assert.deepEqual(await forStort.json(), { ok: false, error: "for stor" });
});

test("precheck uden JEV-nøgle svarer jev:null uden fejl", async () => {
  const created = await (await post({ actor: "hermes", action: "create", title: "Klar til gennemlæsning", body: "En færdig tekst uden pladsholdere." })).json();

  const res = await post({ actor: "hermes", action: "precheck", id: created.post.id });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, jev: null, jevRecord: null });

  // Også på slug — udgiver-jobbet kan bruge begge veje.
  const bySlug = await post({ actor: "hermes", action: "precheck", slug: "klar-til-gennemlaesning" });
  assert.equal(bySlug.status, 200);
  assert.equal((await bySlug.json()).jev, null);

  // Findes indlægget ikke, er det en 400 — det er ikke JEV's afgørelse.
  const ukendt = await post({ actor: "hermes", action: "precheck", id: "00000000-0000-0000-0000-000000000000" });
  assert.equal(ukendt.status, 400);
});

test("ugyldig JSON og ugyldigt indlægs-id giver 400", async () => {
  const ugyldig = await POST(signed("{ikke json"));
  assert.equal(ugyldig.status, 400);
  assert.deepEqual(await ugyldig.json(), { ok: false, error: "ugyldig JSON" });

  const id = await post({ actor: "hermes", action: "move", id: "ikke-en-uuid", stage: "klar" });
  assert.equal(id.status, 400);
  assert.equal((await id.json()).error, "ugyldigt indlægs-id");
});

test("agenten kan ikke rate, faktatjekke eller kalde sig manuel — og ikke publicere på grønt", async () => {
  // Kilden er server-verificeret: agentens signerede rute må skrive agent og
  // crm-signal, men aldrig manuel (den hører til menneskets egen intake).
  const signal = await (await post({ action: "create", title: "Fra CRM-signalet", source: "crm-signal" })).json();
  assert.equal(signal.post.source, "crm-signal");
  const manuel = await post({ action: "create", title: "Snyder med kilden", source: "manuel" });
  assert.equal(manuel.status, 400);
  assert.match((await manuel.json()).error, /manuel/);

  // Rating, source og tjeklisten er menneskets: felterne kendes ikke på
  // agent-ruten. Faktatjekket står i proofs, som agenten må skrive — men ikke
  // den del af det (guarden ligger i lib'en, så den også gælder UI-vejen).
  const id = signal.post.id;
  for (const fields of [{ rating: { value: 5 } }, { source: "manuel" }, { checklist: { ok: true } }, { jev: { ready: true } }]) {
    const res = await post({ actor: "hermes", action: "update", id, fields });
    assert.equal(res.status, 400, JSON.stringify(fields));
    assert.match((await res.json()).error, /kan ikke sættes her/);
  }
  const factcheck = await post({ actor: "hermes", action: "update", id, fields: { proofs: { factcheck: { note: "jeg bekræfter min egen tekst" } } } });
  assert.equal(factcheck.status, 400);
  assert.match((await factcheck.json()).error, /kun Lucas eller Charlie/);

  // Selv med en grøn tjekliste for den aktuelle revision er Publicer menneskets
  // knap: agent-ruten afviser, og aftalen (publishRequestedAt) sættes ikke.
  const [row] = await db.select().from(blogPost).where(eq(blogPost.id, id));
  await db
    .update(blogPost)
    .set({ checklist: { revision: revisionOf(row), ok: true, missing: [], at: new Date().toISOString() } })
    .where(eq(blogPost.id, id));
  const publicer = await post({ actor: "hermes", action: "move", id, stage: "publicer" });
  assert.equal(publicer.status, 400);
  assert.match((await publicer.json()).error, /agenten må kun/);

  const [after] = await db.select().from(blogPost).where(eq(blogPost.id, id));
  assert.equal(after.stage, "ide");
  assert.equal(after.publishRequestedAt, null);
  assert.deepEqual(readRatings(after.ratings), []);
  assert.equal(readProofs(after.proofs).factcheck, null);

  // Mennesket kan til gengæld: ratingen lægges til med aktør, stage og revision.
  const rated = await updatePost(db, id, { rating: { value: 4, comment: "god vinkel" } }, "lucas");
  const ratinger = readRatings(rated.ratings);
  assert.equal(ratinger.length, 1);
  assert.equal(ratinger[0].actor, "lucas");
  assert.equal(ratinger[0].stage, "ide");
  assert.equal(ratinger[0].revision, revisionOf(rated));
});
