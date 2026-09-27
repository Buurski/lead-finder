// Rute-niveau test for vault-gaten i /api/messenger: en fejlklassificeret
// fitness-kandidat fra Coworks data/messenger.json må hverken vises eller
// kopieres som sendeklar beauty-kladde (MessengerPanel kopierer c.draft 1:1).
// Kun syntetiske fixtures, ingen netkald.
// Gaten testes gennem ruten: node 22 kan ikke linke vault-gate.ts som statisk
// import, når andre .ts-moduler er i samme graf (fejler uden hooks også).
//
// Kørbar kommando (samme vej som de øvrige rute-tests i npm test — ruten importerer
// hverken "next/server" eller "@/"-aliaser, så node kan loade den direkte):
//   node --test --experimental-strip-types --conditions react-server src/app/api/messenger/route.test.ts
import { after, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { GET } from "./route.ts";
import { __setVaultJsonForTest } from "../../../lib/vault.ts";
import { __setLeadsForTest } from "../../../lib/sheets.ts";
import { InMemoryStore, __setStore } from "../../../lib/store.ts";
import { DEMO_SITES } from "../../../lib/demos.ts";
import type { MessengerCandidate } from "../../../lib/messenger/select.ts";

interface Feed {
  ok: boolean;
  candidates: MessengerCandidate[];
  pool: { gated: number; eligible: number; remaining: number; shown: number; sent: number; skipped: number; depleted: boolean; source?: string };
}

/** Efterligner compose.ts' buildMessengerDraft: gruppen afgør demo-link + branch-ord. */
function buildDraft(branch: string) {
  const group = /frisør|frisor|salon|skønhed|hudklinik|barber/i.test(branch) ? "beauty" : "service";
  const demoUrl = group === "beauty" ? DEMO_SITES.vidaCase : "https://kinly.dk/projekter/";
  const branchDisp = group === "beauty" ? "frisørsalon" : "træningscenter";
  return {
    group,
    demoUrl,
    branchDisp,
    text: `Hej! Så lige jeres FB-side med rigtigt mange anmeldelser. Sådan kan jeres hjemmeside se ud — her er et eksempel jeg selv har bygget til en ${branchDisp}: ${demoUrl}. Skriv hvis du vil se mere :)\n\nMvh, Lucas`,
  };
}

const FITNESS_BRANCH = "Fitnesscenter / wellness";

// Cowork skrev denne som beauty: category beauty + klinik-kladde der kalder
// træningscentret "frisørsalon" og linker VIDA-casen. Det er fejlen gaten skal tage.
const FITNESS: MessengerCandidate = {
  id: "v1",
  name: "Herning Fitness & Wellness",
  branch: FITNESS_BRANCH,
  city: "Herning",
  reviews: 180,
  category: "beauty",
  qualityScore: 90,
  handle: "herningfitness",
  fbPageUrl: "https://facebook.com/herningfitness",
  messengerUrl: "https://m.me/herningfitness",
  draft: buildDraft("Frisørsalon").text,
  pattern: "A",
  status: "pending",
};

// Samme virksomhed, korrekt grupperet: category service + projekter-link.
const FITNESS_OK: MessengerCandidate = {
  ...FITNESS,
  id: "v3",
  category: "service",
  qualityScore: 88,
  handle: "herningfitnessok",
  messengerUrl: "https://m.me/herningfitnessok",
  draft: buildDraft("Fitnesscenter").text,
};

// Ægte beauty-lead: må gå uændret igennem (gaten rammer kun fitness).
const BEAUTY: MessengerCandidate = {
  id: "v2",
  name: "Salon Arte Nørrebro",
  branch: "Frisørsalon",
  city: "København",
  reviews: 140,
  category: "beauty",
  qualityScore: 80,
  handle: "salonarte",
  fbPageUrl: "https://facebook.com/salonarte",
  messengerUrl: "https://m.me/salonarte",
  draft: `Hej! Så lige jeres FB-side med 140 anmeldelser. Sådan kan jeres hjemmeside se ud — her er et eksempel jeg selv har bygget til en salon: ${DEMO_SITES.salonArtec}. Skriv hvis du vil se mere :)\n\nMvh, Lucas`,
  pattern: "B",
  status: "pending",
};

const VAULT = { at: "2026-09-27T09:00:00.000Z", candidates: [FITNESS, FITNESS_OK, BEAUTY] };

async function feed(query = ""): Promise<Feed> {
  const res = await GET(new Request(`http://localhost/api/messenger${query}`));
  assert.equal(res.status, 200);
  return (await res.json()) as Feed;
}

beforeEach(() => {
  // In-memory state: testen må ikke læse (eller skrive) rigtig Messenger-state.
  __setStore(new InMemoryStore());
  __setLeadsForTest([]);
});
after(() => {
  __setStore(null);
  __setLeadsForTest(null);
});

test("vault-grenen: fejlklassificeret fitness-kladde kommer ikke med som sendeklar", async () => {
  __setLeadsForTest([]);
  __setVaultJsonForTest("data/messenger.json", VAULT);

  const body = await feed();
  const raw = JSON.stringify(body);
  const ids = body.candidates.map((c) => c.id);

  assert.equal(body.ok, true);
  assert.equal(body.pool.source, "cowork"); // vi er på vault-vejen

  // v1 (fitness fejlklassificeret som beauty) er væk …
  assert.ok(!ids.includes("v1"), `v1 lækkede: ${ids.join(",")}`);
  // … og dens kladde findes intet sted i body: UI'et kopierer præcis c.draft.
  assert.ok(!raw.includes(FITNESS.draft), "den fejlklassificerede kladde ligger stadig i body");
  // Kladden skriver "en frisørsalon" med lille og linker VIDA-casen. BEAUTY's egen
  // branch står med stort ("Frisørsalon"), så de to strenge her er entydigt
  // fejlklassificeringens.
  assert.ok(!raw.includes("frisørsalon"), "frisørsalon-kladde i body");
  assert.ok(!raw.includes("vida-klinik"), "VIDA-casen lækker til en fitness-kandidat");

  // Legitim beauty virker fortsat.
  const beauty = body.candidates.find((c) => c.id === "v2");
  assert.equal(beauty?.category, "beauty");

  // Korrekt grupperet fitness virker fortsat.
  const fitnessOk = body.candidates.find((c) => c.id === "v3");
  assert.equal(fitnessOk?.category, "service");

  // Tal og liste siger det samme.
  assert.equal(body.pool.shown, body.candidates.length);

  // Droppet skal kunne ses i svaret: fixturet har præcis ét kandidat gaten afviser
  // (v1), og eligible + gated skal derfor give hele vault-listen. Falder gated til
  // 0, forsvinder v1 lydløst — det er netop det, pool.gated findes for at hindre.
  assert.equal(body.pool.gated, 1, `ventede 1 afvist kandidat, fik ${body.pool.gated}`);
  assert.equal(body.pool.eligible + body.pool.gated, VAULT.candidates.length);
  assert.ok(!ids.includes("v1"));

  // Uafhængigt af ordvalg: ingen fitness-kandidat i body må bære beauty-ord i kladden.
  for (const c of body.candidates) {
    if (/fitness|træningscenter|crossfit|\bgym\b|wellness/i.test(`${c.branch} ${c.name}`)) {
      assert.ok(!/frisør|salon|hudklinik|kosmetolog|vida-klinik/i.test(c.draft), `beauty-ord i fitness-kladde: ${c.id}`);
    }
  }
});

test("kun afviste vault-kandidater: falder igennem til Sheets uden at lække kladden", async () => {
  __setLeadsForTest([]);
  __setVaultJsonForTest("data/messenger.json", { at: VAULT.at, candidates: [FITNESS] });

  const body = await feed();
  const raw = JSON.stringify(body);

  assert.equal(body.ok, true);
  assert.deepEqual(body.candidates, []);
  assert.equal(body.pool.shown, 0);
  // Svaret kommer fra Sheets-vejen, men vault-droppet skal stadig kunne ses —
  // ellers er netop dette forløb (alt i vaulten afvist) et lydløst drop.
  assert.equal(body.pool.gated, 1, `ventede 1 afvist kandidat, fik ${body.pool.gated}`);
  assert.ok(!raw.includes(FITNESS.draft));
  assert.ok(!raw.includes("vida-klinik"));
});

test("tom, manglende og junk-tung kandidatliste vælter ikke ruten", async () => {
  const tomme: Array<[string, { at: string; candidates?: MessengerCandidate[] }]> = [
    ["ingen candidates", { at: VAULT.at }],
    ["tom liste", { at: VAULT.at, candidates: [] }],
    ["null-element", { at: VAULT.at, candidates: [null as unknown as MessengerCandidate] }],
  ];
  for (const [navn, vault] of tomme) {
    __setLeadsForTest([]);
    __setVaultJsonForTest("data/messenger.json", vault);
    const body = await feed();
    assert.equal(body.ok, true, navn);
    assert.deepEqual(body.candidates, [], navn);
    assert.equal(body.pool.shown, 0, navn);
  }
});

test("et afvist kandidat skubber ikke et friskt kandidat ud af limit-vinduet", async () => {
  __setLeadsForTest([]);
  __setVaultJsonForTest("data/messenger.json", VAULT);

  const body = await feed("?limit=1");
  assert.equal(body.candidates.length, 1);
  assert.equal(body.pool.shown, 1);
  assert.notEqual(body.candidates[0].id, "v1"); // gaten kører før slice
});
