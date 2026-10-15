import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { freshTestDb } from "../db/test-db.ts";
import { marketingDraft, marketingRef } from "../db/schema.ts";
import {
  MAALING_COLUMNS, buildSeed, mdTables, parseAbTests, parseCouncil, parseHooksMaster, parseMaaling, parseManus,
  parseW2, scanSeed, section, seedMarketing, splitFrontmatter, type SeedFiles,
} from "./marketing-seed.ts";

// Små kopier af vault-formaterne. Selve vault-mappen findes ikke i CI; en ekstra test nederst kører mod den, hvis den er der.
const COUNCIL = `---
title: Council C-Kinly
---
# Council C-Kinly

## Dom

### NU (2)

| id | titel | hook (brug denne) | score | tid | risiko → løsning |
|---|---|---|---|---|---|
| KINLY-I08 | 7 ting en forside skal have | "7 ting din forside skal have. Gem den her." | 9 | 45-60 | Kan lyde som løfte. |
| KINLY-I03 | Dag N til 10 kunder | "Dag [N] på vejen til [mål] kunder." | 4 | 10-15 | Kun reelt mål. |

### TEST (2)

| id | titel | hook (brug denne) | score | tid | risiko → løsning |
|---|---|---|---|---|---|
| KINLY-W09 | Collab-opslag med kunde | "Din åbningstid ændrer sig." (anonym) | 7 | 20-30 | STOP til skriftligt kundeok. |
| KINLY-I05 | Den ene fil | "Det her er filen." | 5 | 20-30 | Nøgler, .env, C:\\Users\\Buur i sti. |

### SENERE (1)

| id | titel | hook (brug denne) | score | tid | risiko → løsning |
|---|---|---|---|---|---|
| KINLY-W11 | Dumme spørgsmål, tak (duo) | "Charlie: Hvad er egentlig et domæne?" | 7 | 30-45 | Fase 2. |
`;

const MANUS_1 = `---
title: Kinly faceless manus 1, 7 ting en forside skal have (KINLY-I08)
---
# Faceless manus 1

| felt | værdi |
|---|---|
| længde | 51 sekunder, 1080 x 1920, lydløs |

## Billedtekst (kladde)

> I kender jeres virksomhed.
>
> Hvilket punkt mangler?

## Musik

Ingen.
`;
const MANUS_3 = `---
title: Kinly faceless manus 3, selv-bevis, grønt flag og TEST-skitser
---
# Faceless manus 3
tekst
`;
const DUO_1 = `---
title: Kinly duo manus 1, "Spørg bare 1: Domæne" (KINLY-W11, fase 2)
---
# Duo
| felt | værdi |
|---|---|
| længde | ca. 40 sekunder |
`;
const SHOT = `---
title: Shot lists
---
# Shot lists

## 0. Fælles opsætning
fælles

## 1. Faceless manus 1: "7 ting" (51 s)
shots 1

## 4. Duo (fase 2)
duo shots
`;
const CHARLIE = `---
title: Forslag til Charlie
---
# Forslag til Charlie

Hej Charlie
`;
const HOOKS = `---
title: Hooks-master
---
## 3. Biblioteket (60 mønstre)

### Familie 1: Overraskelse og afsløring

| # | Mønster | Skabelon (DA) | Skabelon (EN) | Planuko | Kinly | Lucas | Kilde |
|---|---|---|---|---|---|---|---|
| H01 | Opdagelses-chok | "Hvad?!" | "Wait" | p | "Min hjemmeside er min egen." (kun kunde-citat med ok) | l | A-M1 |
| H08 | Reaktion uden ord | "1 s" | "Pure" | p | n/a (faceless) | l | A |

### Familie 2: Tal, løfte og specificitet

| # | Mønster | Skabelon (DA) | Skabelon (EN) | Planuko | Kinly | Lucas | Kilde |
|---|---|---|---|---|---|---|---|
| H09 | Tal først | "[Tal] [enhed]" | "[Number]" | p | "[N] ting din hjemmeside mangler" | l | A-M2 |

## 4. Ban-liste
`;
const AB = `---
title: A/B
---
## 5. Hypoteserne i detaljer

### AB-02 Ansigt først mod skærm først (NU, uge 3-4)

| Felt | Indhold |
|---|---|
| Brand | Lucas IG |
| Arme | **A ansigt** x **B skærm** y |

### AB-04 2-3 ords undertekster mod tekstbjælke (NU, uge 1 og 3-4)

| Felt | Indhold |
|---|---|
| Brand | **Planuko TikTok** (uge 1). **Kinly IG** (uge 3-4). |
| Arme | **A tekstbjælke** (guldstandard). **B** captions.py, 2-3 ord ad gangen. |
| Primær | Gem + delinger pr. 1000 |
| Beslutningsregel | Standard §2. |

### AB-06 Licenseret lyd (TEST, uge 3)

| Felt | Indhold |
|---|---|
| Brand | Planuko TikTok. Ikke Kinly (briefet 10/10: lydløst). |
| Arme | **A** a **B** b |

### AB-11 Kinly slutkort: Gem mod Send (NU, uge 1-2)

| Felt | Indhold |
|---|---|
| Brand | Kinly IG, faceless og lydløs |
| Arme | **A** I32: "Gem den her." **B** I13: "Send den her." |
| Primær | Gem + delinger pr. 1000 |
| Min. opslag | 3 pr. arm |

## 6. Kalender
`;
const W2 = `---
title: W2
---
## 4. Hvad tallene siger (beregnet)

- Længde: median 70 sek.

## 5. Hook-mønstre, rangeret efter evidens

| # | Mønster (dansk skabelon) | Evidens | Eksempler | Status mod eksisterende | Kinly-brug |
|---|---|---|---|---|---|
| P1 | **Én regel om ét element**: "Gør ikke X" | B (tre opslag over 100.000) | X01 | **[NYT]** | Serie. |
| P2 | **Standard mod forbedret** | B (180K) | X15 | **[NYT]** | Faceless-venligt. |
| P3 | **Showcase** | A (to konti) | X08 | **[NYT]** | Kun egne koncepter. |

## 6. 20 færdige danske Kinly-hooks

### (a) Faceless / AI-skærm (2)

| # | Hook (tekst på skærm / talt) | Mønster | Kun hvis sandt / note |
|---|---|---|---|
| a1 | "Det her bygger Claude. Efter [N] rettelser." | P2 | [N] = faktisk antal. |
| a2 | "Skjul al brødtekst." | P1/P6 | Selvtest. |

### (b) Lucas + Charlie, duo (1)

Kræver Charlies skriftlige ok.

| # | Hook | Mønster | Note |
|---|---|---|---|
| b1 | "Charlie får fem sekunder." | P1/P6 | Fem sekunder måles. |

### (c) "Dag N af at bygge Kinly" (1)

| # | Hook | Mønster | Note |
|---|---|---|---|
| c1 | "Dag [N] af at bygge Kinly." | P19 | Værktøj og dato. |

## 7. Note
x

## 8. 10 formatidéer der passer til Kinly

1. **"Standard mod efter [N] rettelser"** [NYT]. Skærmsplit.
2. **"Én regel"-serien** [NYT]. Fast titel.

## 9. Huller
`;
const W4 = `---
title: W4
---
## 4. Pr. brand

### Kinly (AI-drevet webstudie, lokale virksomheder)

| # | Format | Konkret idé |
|---|---|---|
| 1 | Før/efter-afsløring | Skærmbillede af en gammel side. |
| 2 | Motion graphics | Animeret prisstige. |

### Lucas

| # | Format | Konkret idé |
|---|---|---|
| 1 | Dag N | x |

## 5. AI-mærkning: hvad Meta og TikTok kræver

Vi skjuler aldrig AI-mærkning.

## 6. Værktøjs-status
`;
const W5 = `---
title: W5
---
## Svar til Lucas (5 linjer)

1. Nej.

## Steelman

x

## 6. Anbefalinger pr. konto

| Konto | OK |
|---|---|
| Kinly | CML |

## Hvad var uverificeret
`;
const FILES: SeedFiles = {
  council: COUNCIL,
  manus: { "faceless-manus-1.md": MANUS_1, "faceless-manus-3.md": MANUS_3, "duo-manus-1.md": DUO_1 },
  shotLists: SHOT,
  charlie: CHARLIE,
  hooksMaster: HOOKS,
  abTest: AB,
  maalingCsv: MAALING_COLUMNS.join(",") + "\n",
  w2: W2,
  w4: W4,
  w5: W5,
};

test("frontmatter og tabeller", () => {
  const { fm, body } = splitFrontmatter(COUNCIL);
  assert.equal(fm.title, "Council C-Kinly");
  assert.ok(body.startsWith("# Council"));
  const tables = mdTables(body);
  assert.equal(tables.length, 3);
  assert.equal(tables[0].heading, "NU (2)");
  assert.equal(tables[0].rows.length, 2);
  assert.equal(section(HOOKS, /^3\. Biblioteket/).includes("H09"), true);
});

test("council: NU/TEST/SENERE giver prioritet, spor og kundecase-flag", () => {
  const d = parseCouncil(COUNCIL);
  assert.equal(d.length, 5);
  const by = Object.fromEntries(d.map((x) => [x.extKey, x]));
  assert.equal(by["kinly:I08"].priority, 1);
  assert.equal(by["kinly:I08"].hook, "7 ting din forside skal have. Gem den her.");
  assert.equal(by["kinly:I08"].track, "faceless");
  assert.equal(by["kinly:I08"].score, 9);
  assert.equal(by["kinly:I03"].track, "dag-n");
  assert.equal(by["kinly:I03"].priority, 1); // NU
  assert.equal(by["kinly:W11"].track, "duo");
  assert.equal(by["kinly:W11"].priority, 3);
  assert.match(by["kinly:W11"].note, /Charlie/);
  // kundecase: TEST (2) rykkes en op (W2: kundecase slår Dag N)
  assert.equal(by["kinly:W09"].customerCase, true);
  assert.equal(by["kinly:W09"].priority, 1);
  assert.equal(by["kinly:W09"].hook, "Din åbningstid ændrer sig.");
  assert.equal(by["kinly:I05"].customerCase, false);
  assert.equal(by["kinly:I05"].priority, 2);
});

test("manus: id fra titel, længde og billedtekst (blockquote)", () => {
  const m = parseManus("faceless-manus-1.md", MANUS_1);
  assert.equal(m.id, "I08");
  assert.equal(m.lengthS, 51);
  assert.equal(m.title, "7 ting en forside skal have");
  assert.equal(m.caption, "I kender jeres virksomhed.\n\nHvilket punkt mangler?");
  assert.equal(parseManus("faceless-manus-3.md", MANUS_3).id, null);
  assert.equal(parseManus("duo-manus-1.md", DUO_1).lengthS, 40);
});

test("buildSeed: manus bindes til rådets række, manus uden id bliver egen kladde, Charlie-forslag er en note", () => {
  const s = buildSeed(FILES);
  assert.equal(s.drafts.length, 6);
  const i08 = s.drafts.find((d) => d.extKey === "kinly:I08")!;
  assert.match(i08.script, /Faceless manus 1/);
  assert.match(i08.shotlist, /shots 1/);
  assert.equal(i08.lengthS, 51);
  assert.equal(i08.musicKind, "ingen");
  const w11 = s.drafts.find((d) => d.extKey === "kinly:W11")!;
  assert.equal(w11.track, "duo");
  assert.equal(w11.musicKind, "original-lyd");
  assert.ok(s.drafts.find((d) => d.extKey === "kinly:manus-faceless-manus-3"));
  // intet af det der sendes: Charlie-forslaget er en note, ikke en kladde
  assert.ok(!s.drafts.some((d) => /charlie/i.test(d.extKey)));
  const note = s.refs.find((r) => r.extKey === "kinly:forslag-charlie")!;
  assert.equal(note.kind, "note");
  assert.equal(note.data.section, "charlie");
  assert.ok(s.refs.some((r) => r.extKey === "kinly:shotlist-faelles"));
  assert.ok(s.refs.some((r) => r.extKey === "kinly:shotlist-duo"));
  // C:\Users\<navn> fra rådets risikotekst er renset
  assert.ok(!s.drafts.some((d) => d.risk.includes("C:\\Users")));
});

test("hooks-master: kun Kinly-kolonnen, n/a springes over, familie følger med", () => {
  const h = parseHooksMaster(HOOKS);
  assert.deepEqual(h.map((x) => x.data.code), ["H01", "H09"]);
  assert.equal(h[0].data.family, "Overraskelse og afsløring");
  assert.equal(h[0].body, "Min hjemmeside er min egen.");
  assert.equal(h[0].data.kinlyFull, '"Min hjemmeside er min egen." (kun kunde-citat med ok)');
  assert.equal(h[1].body, "[N] ting din hjemmeside mangler");
});

test("A/B: kun tests om Kinly (ikke 'Ikke Kinly'), arme splittes i A og B", () => {
  const ab = parseAbTests(AB);
  assert.deepEqual(ab.map((x) => x.data.code), ["AB-04", "AB-11"]);
  const ab11 = ab[1];
  assert.equal(ab11.status, "planlagt");
  assert.deepEqual(ab11.data.arms, { A: 'I32: "Gem den her."', B: 'I13: "Send den her."' });
  assert.equal(ab11.data.week, "1-2");
  assert.equal(ab11.data.metric, "Gem + delinger pr. 1000");
  assert.equal((ab[0].data.arms as { A: string }).A.startsWith("(guldstandard)"), true);
});

test("W2: 20-hook-tabellerne, duo markeres, P1/P2 er stærkeste, formater tælles", () => {
  const r = parseW2(W2);
  const hooks = r.filter((x) => x.kind === "hook");
  assert.deepEqual(hooks.map((h) => h.data.code), ["a1", "a2", "b1", "c1"]);
  assert.equal(hooks[0].title, "Det her bygger Claude. Efter [N] rettelser.");
  assert.equal(hooks[0].data.track, "faceless");
  assert.equal(hooks.find((h) => h.data.code === "b1")!.data.needsCharlie, true);
  assert.equal(hooks.find((h) => h.data.code === "c1")!.data.track, "dag-n");
  assert.equal(hooks[0].data.truth, "[N] = faktisk antal.");
  const pats = r.filter((x) => x.data.group === "moenster");
  assert.deepEqual(pats.map((p) => [p.data.code, p.data.evidence, p.data.strong]), [["P1", "B", true], ["P2", "B", true], ["P3", "A", false]]);
  const fmts = r.filter((x) => x.data.group === "format");
  assert.equal(fmts.length, 2);
  assert.equal(fmts[0].title, "Standard mod efter [N] rettelser");
  assert.ok(r.some((x) => x.extKey === "w2:tal" && x.kind === "note"));
});

test("maaling.csv: kun header, ingen datarækker", () => {
  const m = parseMaaling(MAALING_COLUMNS.join(",") + "\n");
  assert.deepEqual(m.header, [...MAALING_COLUMNS]);
  assert.equal(m.rows, 0);
  assert.equal(buildSeed(FILES).measureRowsSkipped, 0);
});

test("scanSeed fanger telefonnummer, mail, gadeadresse og salgselev", () => {
  const base = buildSeed(FILES);
  assert.deepEqual(scanSeed(base), []);
  const withBad = (t: string) => ({ ...base, drafts: [{ ...base.drafts[0], note: t }] });
  assert.equal(scanSeed(withBad("Ring 12 34 56 78")).length, 1);
  assert.equal(scanSeed(withBad("Skriv til nogen@eksempel.dk")).length, 1);
  assert.equal(scanSeed(withBad("Bor på Eksempelvej 12")).length, 1);
  assert.equal(scanSeed(withBad("Charlie er salgselev")).length, 1);
  assert.equal(scanSeed(withBad('Aldrig "salgselev".')).length, 0);
  assert.equal(scanSeed(withBad("kort/i08-hook1.png@0-1.5 og 1080 x 1920")).length, 0);
});

test("seedMarketing er idempotent, seeder kun kladder, og rører ikke menneskers rettelser", async () => {
  const db = await freshTestDb();
  const seed = buildSeed(FILES);
  const first = await seedMarketing(db, seed);
  assert.equal(first.draftsInserted, seed.drafts.length);
  assert.equal(first.refsInserted, seed.refs.length);
  const rows = await db.select().from(marketingDraft);
  assert.ok(rows.every((r) => r.status === "kladde" && r.source === "seed"));
  assert.equal((await db.select().from(marketingDraft)).filter((r) => r.track === "duo").every((r) => !r.charlieOk), true);

  const { eq } = await import("drizzle-orm");
  await db.update(marketingDraft).set({ priority: 3, status: "droppet" }).where(eq(marketingDraft.extKey, "kinly:I08"));
  const second = await seedMarketing(db, seed);
  assert.equal(second.draftsInserted, 0);
  assert.equal(second.refsInserted, 0);
  assert.equal((await db.select().from(marketingDraft)).length, seed.drafts.length);
  assert.equal((await db.select().from(marketingRef)).length, seed.refs.length);
  const [i08] = await db.select().from(marketingDraft).where(eq(marketingDraft.extKey, "kinly:I08"));
  assert.equal(i08.status, "droppet");
  assert.equal(i08.priority, 3);
});

test("seedMarketing afviser data med telefonnummer", async () => {
  const db = await freshTestDb();
  const seed = buildSeed(FILES);
  seed.drafts[0].note = "Ring 12 34 56 78";
  await assert.rejects(seedMarketing(db, seed), /seed afvist/);
  assert.equal((await db.select().from(marketingDraft)).length, 0);
});

// Mod den rigtige vault-mappe, når den findes (lokalt). Springes over i CI.
const VAULT = process.env.REEL_VAULT_DIR ?? "C:/Users/Buur/Documents/KnowledgeOS/wiki/vaekst/reel-system-2026-10";
test("rigtig vault: parser alt, ingen fund fra scanSeed", { skip: !fs.existsSync(path.join(VAULT, "03-COUNCIL-KINLY.md")) }, () => {
  const read = (r: string) => fs.readFileSync(path.join(VAULT, r), "utf-8");
  const k = "05-LEVERANCER/kinly";
  const manus: Record<string, string> = {};
  for (const f of fs.readdirSync(path.join(VAULT, k))) if (/^(faceless|duo)-manus-\d\.md$/.test(f)) manus[f] = read(`${k}/${f}`);
  const s = buildSeed({
    council: read("03-COUNCIL-KINLY.md"), manus, shotLists: read(`${k}/shot-lists.md`), charlie: read(`${k}/FORSLAG-TIL-CHARLIE.md`),
    hooksMaster: read("hooks-master.md"), abTest: read("07-AB-TEST.md"), maalingCsv: read("maaling.csv"),
    w2: read("wave-2/W2-kinly-lignende.md"), w4: read("wave-2/W4-ai-formater.md"), w5: read("wave-2/W5-musik-rettigheder.md"),
  });
  assert.equal(s.drafts.length, 49); // 48 rådsidéer + manus 3 (samlefil)
  assert.equal(Object.keys(manus).length, 6);
  assert.equal(s.drafts.filter((d) => d.script).length, 6);
  assert.equal(s.refs.filter((r) => r.kind === "ab").length, 3);
  assert.equal(s.refs.filter((r) => r.kind === "hook" && r.data.source === "W2").length, 20);
  assert.equal(s.refs.filter((r) => r.data.group === "moenster").length, 20);
  assert.equal(s.refs.filter((r) => r.data.group === "format").length, 10);
  assert.equal(s.measureRowsSkipped, 0);
  assert.deepEqual(s.measureHeader, [...MAALING_COLUMNS]);
  assert.deepEqual(scanSeed(s), []);
  assert.equal(new Set(s.drafts.map((d) => d.extKey)).size, s.drafts.length);
  assert.equal(new Set(s.refs.map((r) => r.extKey)).size, s.refs.length);
});
