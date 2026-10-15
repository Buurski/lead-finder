// marketing-seed.ts — læser reel-system-mappen i vaulten (wiki/vaekst/reel-system-2026-10)
// og bygger seed-data til /marketing. Rene parsere (tekst ind, data ud) + én idempotent
// skrivning (seedMarketing). Kun til lokal/test-brug: scripts/seed-marketing.ts nægter at
// røre en database, der ikke ligger på localhost.
//
// Idempotens: hver række har en ext_key; en række der findes i forvejen røres ikke
// (ON CONFLICT DO NOTHING), så menneskers rettelser og godkendelser overlever en gen-kørsel.
// Alt seedes som KLADDE/idéer. Intet godkendes, postes eller sendes herfra.
import type { Db } from "../db/client.ts";
import { marketingDraft, marketingRef } from "../db/schema.ts";

export interface SeedDraft {
  extKey: string;
  track: "faceless" | "duo" | "dag-n";
  title: string;
  hook: string;
  script: string;
  shotlist: string;
  caption: string;
  label: string;
  priority: number;
  score: number | null;
  lengthS: number | null;
  musicKind: "ingen" | "original-lyd";
  customerCase: boolean;
  risk: string;
  note: string;
}
export interface SeedRef {
  extKey: string;
  kind: "hook" | "ab" | "inspiration" | "note";
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: string;
}
export interface Seed {
  drafts: SeedDraft[];
  refs: SeedRef[];
  /** Kolonnerne i maaling.csv. Datarækker importeres aldrig; antallet vises så de ikke overses. */
  measureHeader: string[];
  measureRowsSkipped: number;
}
export interface SeedFiles {
  council: string;
  /** filnavn → tekst (faceless-manus-1.md …, duo-manus-1.md …) */
  manus: Record<string, string>;
  shotLists: string;
  charlie: string;
  hooksMaster: string;
  abTest: string;
  maalingCsv: string;
  w2: string;
  w4: string;
  w5: string;
}

export const MAALING_COLUMNS = [
  "dato", "brand", "hypotese", "par_id", "arm", "arm_tildelt_ved", "opslag_url", "visninger", "gem", "delinger",
  "foelgere_nye", "profilbesoeg", "link_klik", "skip_pct", "fuldt_set_pct", "watch_s", "note",
] as const;

// ---------------------------------------------------------------- små hjælpere

const norm = (t: string) => t.replace(/\r\n/g, "\n");

export function splitFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const t = norm(raw);
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(t);
  if (!m) return { fm: {}, body: t.trim() };
  const fm: Record<string, string> = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { fm, body: t.slice(m[0].length).trim() };
}

const cells = (line: string): string[] => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const isSep = (c: string[]) => c.every((x) => /^:?-{2,}:?$/.test(x));
/** Første citerede stump i cellen ("…" først), ellers hele cellen. Resten (fx "(kun hvis sandt)") ryger ikke i hooket. */
const unquote = (s: string) => {
  const m = /^["“„]([\s\S]*?)["”]/.exec(s.trim());
  return (m ? m[1] : s).trim();
};
const plain = (s: string) => s.replace(/\*\*/g, "").replace(/`/g, "").trim();

export interface MdTable {
  heading: string;
  header: string[];
  rows: string[][];
}
/** Alle pipe-tabeller med nærmeste overskrift over (uden #'er). Rækker med forkert kolonneantal droppes. */
export function mdTables(body: string): MdTable[] {
  const out: MdTable[] = [];
  let heading = "";
  const lines = norm(body).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const h = /^#{1,6}\s+(.*)$/.exec(lines[i]);
    if (h) {
      heading = h[1].trim();
      continue;
    }
    if (lines[i].trim().startsWith("|") && lines[i + 1] && lines[i + 1].trim().startsWith("|") && isSep(cells(lines[i + 1]))) {
      const header = cells(lines[i]);
      const rows: string[][] = [];
      let j = i + 2;
      for (; j < lines.length && lines[j].trim().startsWith("|"); j++) {
        const r = cells(lines[j]);
        if (r.length === header.length) rows.push(r);
      }
      out.push({ heading, header, rows });
      i = j - 1;
    }
  }
  return out;
}

/** Tekst fra en overskrift (match) til næste overskrift på samme eller højere niveau. */
export function section(body: string, re: RegExp): string {
  const lines = norm(body).split("\n");
  const start = lines.findIndex((l) => /^#{1,6}\s/.test(l) && re.test(l.replace(/^#+\s+/, "")));
  if (start < 0) return "";
  const level = /^(#+)/.exec(lines[start])![1].length;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    const m = /^(#+)\s/.exec(lines[i]);
    if (m && m[1].length <= level) {
      end = i;
      break;
    }
  }
  return lines.slice(start + 1, end).join("\n").trim();
}

// ---------------------------------------------------------------- council → kladder

const DUO_IDS = new Set(["W11", "I18", "I19"]);
// Dag N: byg offentligt. I03 tæller, I04 uge-for-uge, W10 ugens ændringer.
const DAGN_IDS = new Set(["I03", "I04", "W10"]);
const PRIO: Record<string, number> = { NU: 1, TEST: 2, SENERE: 3 };
const CUSTOMER_RE = /kundeok|kundens (skriftlige )?ok/i;
const DAGN_NOTE = "W2: svag evidens for Dag N alene (2.600-6.000 visninger mod 121.800 for en kundecase på samme konto). Hæng hver dag på ét synligt resultat.";
const CASE_NOTE = "W2: en kundecase med konkret hook slår Dag N klart. Kræver kundens skriftlige ok før den godkendes.";

export function parseCouncil(text: string): SeedDraft[] {
  const { body } = splitFrontmatter(text);
  const out: SeedDraft[] = [];
  for (const t of mdTables(body)) {
    const label = /^(NU|TEST|SENERE)\b/.exec(t.heading)?.[1];
    if (!label || t.header[0] !== "id") continue;
    for (const r of t.rows) {
      const id = r[0].replace(/^KINLY-/, "");
      const customerCase = CUSTOMER_RE.test(r[5]);
      const track: SeedDraft["track"] = DUO_IDS.has(id) ? "duo" : DAGN_IDS.has(id) ? "dag-n" : "faceless";
      const score = Number.parseInt(r[3], 10);
      let priority = PRIO[label];
      if (customerCase) priority = Math.max(1, priority - 1); // W2: kundecase med hook slår Dag N
      out.push({
        extKey: `kinly:${id}`,
        track,
        title: r[1],
        hook: unquote(r[2]),
        script: "",
        shotlist: "",
        caption: "",
        label,
        priority,
        score: Number.isFinite(score) ? score : null,
        lengthS: null,
        musicKind: "ingen",
        customerCase,
        risk: r[5],
        note: [`Tid: ${r[4]} min (skøn, ikke målt).`, track === "dag-n" ? DAGN_NOTE : "", customerCase ? CASE_NOTE : "", track === "duo" ? "Fase 2: kræver Charlies skriftlige ok." : ""].filter(Boolean).join(" "),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------- manus → manus/billedtekst på kladden

export interface ParsedManus {
  file: string;
  track: "faceless" | "duo";
  id: string | null;
  title: string;
  script: string;
  caption: string;
  lengthS: number | null;
}

export function parseManus(file: string, text: string): ParsedManus {
  const { fm, body } = splitFrontmatter(text);
  const id = /\(KINLY-([A-Z]\d+)/.exec(fm.title ?? "")?.[1] ?? null;
  const cap = section(body, /^Billedtekst/);
  const caption = cap
    .split("\n")
    .filter((l) => l.startsWith(">"))
    .map((l) => l.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
  const len = /\|\s*længde\s*\|\s*(?:ca\.\s*)?(\d+)\s*sek/i.exec(body);
  return {
    file,
    track: file.startsWith("duo") ? "duo" : "faceless",
    id,
    title: (fm.title ?? file).replace(/^Kinly (faceless|duo) manus \d+,\s*/i, "").replace(/\s*\(KINLY-[^)]*\)\s*$/, "").trim(),
    script: body,
    caption,
    lengthS: len ? Number.parseInt(len[1], 10) : null,
  };
}

/** shot-lists.md → { nr: blok } for ## N. */
export function parseShotLists(text: string): Record<string, string> {
  const { body } = splitFrontmatter(text);
  const out: Record<string, string> = {};
  const parts = body.split(/^## /m).slice(1);
  for (const p of parts) {
    const m = /^(\d+)\.\s/.exec(p);
    if (m) out[m[1]] = ("## " + p).trim();
  }
  return out;
}

// ---------------------------------------------------------------- hooks-master (Kinly-kolonnen)

export function parseHooksMaster(text: string): SeedRef[] {
  const { body } = splitFrontmatter(text);
  const lib = section(body, /^3\. Biblioteket/);
  const out: SeedRef[] = [];
  let family = "";
  for (const chunk of lib.split(/^### /m)) {
    const fam = /^(Familie \d+:[^\n]*)\n/.exec(chunk);
    if (fam) family = fam[1].replace(/^Familie \d+:\s*/, "").trim();
    for (const t of mdTables(chunk)) {
      if (t.header[0] !== "#" || !t.header.includes("Kinly")) continue;
      const ki = t.header.indexOf("Kinly");
      for (const r of t.rows) {
        const kinly = r[ki];
        if (!/^H\d+$/.test(r[0]) || !kinly || /^n\/a/i.test(kinly)) continue;
        out.push({
          extKey: `hooks-master:${r[0]}`,
          kind: "hook",
          title: r[1],
          body: unquote(kinly),
          status: "",
          data: { code: r[0], family, pattern: r[1], template: r[2], kinly: unquote(kinly), kinlyFull: kinly, source: "hooks-master", sourceRef: r[r.length - 1] },
        });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- A/B-tests (Kinly)

export function parseAbTests(text: string): SeedRef[] {
  const { body } = splitFrontmatter(text);
  const out: SeedRef[] = [];
  for (const chunk of body.split(/^### /m).slice(1)) {
    const head = /^(AB-\d+)\s+(.*?)\s+\((NU|TEST|SENERE),\s*uge\s*([^)]*)\)/.exec(chunk);
    if (!head) continue;
    const t = mdTables(chunk).find((x) => x.header[0] === "Felt");
    if (!t) continue;
    const f: Record<string, string> = {};
    for (const r of t.rows) f[r[0]] = r[1];
    const brand = f["Brand"] ?? "";
    // Kun tests der handler om Kinly (ikke "Ikke Kinly", ikke "Kinly bruger slutkort").
    if (!/Kinly/.test(brand) || /ikke Kinly|Kinly bruger/i.test(brand)) continue;
    const arms = f["Arme"] ?? "";
    const am = /\*\*A[^*]*\*\*\s*([\s\S]*?)\s*\*\*B[^*]*\*\*\s*([\s\S]*)$/.exec(arms);
    out.push({
      extKey: `ab:${head[1]}`,
      kind: "ab",
      title: `${head[1]} ${head[2]}`,
      body: "",
      status: "planlagt",
      data: {
        code: head[1],
        label: head[3],
        week: head[4].trim(),
        brand: plain(brand),
        arms: am ? { A: plain(am[1]), B: plain(am[2]) } : { A: plain(arms), B: "" },
        metric: plain(f["Primær"] ?? "Gem + delinger pr. 1000 visninger"),
        secondary: plain(f["Sekundær"] ?? ""),
        hold: plain(f["Hold fast"] ?? ""),
        minPosts: plain(f["Min. opslag"] ?? ""),
        rule: plain(f["Beslutningsregel"] ?? ""),
        caveat: plain(f["Forbehold"] ?? ""),
        gate: plain(f["Gate"] ?? ""),
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------- måling (kun header)

export function parseMaaling(csv: string): { header: string[]; rows: number } {
  const lines = norm(csv).split("\n").filter((l) => l.trim());
  const header = (lines[0] ?? "").split(",").map((c) => c.trim());
  return { header, rows: Math.max(0, lines.length - 1) };
}

// ---------------------------------------------------------------- W2, W4, W5

export function parseW2(text: string): SeedRef[] {
  const { body } = splitFrontmatter(text);
  const out: SeedRef[] = [];

  // 20 danske hooks, tre spor
  const hookSec = section(body, /^6\. 20 færdige danske Kinly-hooks/);
  const TRACK_BY: Record<string, "faceless" | "duo" | "dag-n"> = { a: "faceless", b: "duo", c: "dag-n" };
  for (const t of mdTables(hookSec)) {
    const letter = /^\(([abc])\)/.exec(t.heading)?.[1];
    if (!letter) continue;
    for (const r of t.rows) {
      if (!/^[abc]\d+$/.test(r[0])) continue;
      const track = TRACK_BY[letter];
      out.push({
        extKey: `w2:${r[0]}`,
        kind: "hook",
        title: unquote(r[1]),
        body: r[3],
        status: "",
        data: {
          code: r[0], track, family: "W2: færdig dansk hook", pattern: r[2], template: unquote(r[1]), kinly: unquote(r[1]),
          truth: r[3], source: "W2", needsCharlie: track === "duo",
        },
      });
    }
  }

  // Mønstre P1-P20 med evidensgrad
  const patSec = section(body, /^5\. Hook-mønstre/);
  for (const t of mdTables(patSec)) {
    if (t.header[0] !== "#") continue;
    for (const r of t.rows) {
      if (!/^P\d+$/.test(r[0])) continue;
      out.push({
        extKey: `w2:${r[0]}`,
        kind: "inspiration",
        title: plain(r[1]),
        body: r[5],
        status: "",
        data: {
          group: "moenster", code: r[0], evidence: /^([ABCU])\b/.exec(r[2])?.[1] ?? "", evidenceText: r[2], examples: r[3], status: plain(r[4]),
          strong: r[0] === "P1" || r[0] === "P2",
        },
      });
    }
  }

  // 10 formatidéer
  const fmtSec = section(body, /^8\. 10 formatidéer/);
  for (const line of fmtSec.split("\n")) {
    const m = /^(\d+)\.\s+\*\*(.+?)\*\*\s*(.*)$/.exec(line.trim());
    if (!m) continue;
    out.push({
      extKey: `w2:format-${m[1]}`,
      kind: "inspiration",
      title: unquote(m[2]),
      body: plain(m[3]),
      status: "",
      data: { group: "format", code: `F${m[1]}`, source: "W2", strong: m[1] === "1" || m[1] === "2" },
    });
  }

  // Hvad tallene siger (længde, gem-rate, lyd)
  const stats = section(body, /^4\. Hvad tallene siger/);
  if (stats) out.push({ extKey: "w2:tal", kind: "note", title: "Hvad tallene siger (W2)", body: stats, status: "", data: { section: "tal" } });
  return out;
}

export function parseW4(text: string): SeedRef[] {
  const { body } = splitFrontmatter(text);
  const out: SeedRef[] = [];
  const kinly = section(body, /^Kinly \(AI-drevet/);
  for (const t of mdTables(kinly)) {
    for (const r of t.rows) {
      if (!/^\d+$/.test(r[0])) continue;
      out.push({
        extKey: `w4:kinly-${r[0]}`, kind: "inspiration", title: plain(r[1]), body: plain(r[2]), status: "",
        data: { group: "ai-format", code: `AI${r[0]}`, source: "W4" },
      });
    }
  }
  const lab = section(body, /^5\. AI-mærkning/);
  if (lab) out.push({ extKey: "w4:moerkning", kind: "note", title: "AI-mærkning: hvad Meta, TikTok og EU kræver (W4)", body: lab, status: "", data: { section: "ai-moerkning" } });
  return out;
}

export function parseW5(text: string): SeedRef[] {
  const { body } = splitFrontmatter(text);
  const out: SeedRef[] = [];
  const svar = section(body, /^Svar til Lucas/);
  if (svar) out.push({ extKey: "w5:svar", kind: "note", title: "Må vi bruge trending musik? (W5)", body: svar, status: "", data: { section: "musik" } });
  const konti = section(body, /^6\. Anbefalinger pr\. konto/);
  if (konti) out.push({ extKey: "w5:konti", kind: "note", title: "Musik pr. konto (W5)", body: konti, status: "", data: { section: "musik" } });
  return out;
}

// ---------------------------------------------------------------- samling

export function buildSeed(f: SeedFiles): Seed {
  const drafts = parseCouncil(f.council);
  const byId = new Map(drafts.map((d) => [d.extKey, d]));
  const shot = parseShotLists(f.shotLists);
  const refs: SeedRef[] = [];

  // Manus: bundet til rådets række når filens titel nævner KINLY-id'et, ellers egen kladde.
  const names = Object.keys(f.manus).sort();
  const manusNo = (file: string) => /manus-(\d)/.exec(file)?.[1] ?? "";
  for (const file of names) {
    const m = parseManus(file, f.manus[file]);
    const target = m.id ? byId.get(`kinly:${m.id}`) : undefined;
    const shotlist = m.track === "faceless" ? (shot[manusNo(file)] ?? "") : "Se noten «Optagelse, duo» (fælles shot lists for alle tre duo-manus).";
    const patch = {
      script: m.script, caption: m.caption, shotlist, lengthS: m.lengthS,
      musicKind: (m.track === "duo" ? "original-lyd" : "ingen") as "ingen" | "original-lyd",
    };
    if (target) Object.assign(target, patch, { track: m.track === "duo" ? ("duo" as const) : target.track });
    else {
      const d: SeedDraft = {
        extKey: `kinly:manus-${file.replace(/\.md$/, "")}`, track: m.track, title: m.title, hook: "", label: "NU", priority: 1, score: null,
        customerCase: false, risk: "", note: "Samlet manus-fil. Dækker flere af rådets idéer (KINLY-I01, I06, W04 og TEST-skitser). Hook står i manus pr. del.", ...patch,
        lengthS: null, // flere reels i én fil: ingen fælles længde
      };
      drafts.push(d);
    }
  }
  const shotCommon = shot["0"];
  if (shotCommon) refs.push({ extKey: "kinly:shotlist-faelles", kind: "note", title: "Optagelse: fælles opsætning (shot lists)", body: shotCommon, status: "", data: { section: "optagelse" } });
  if (shot["4"]) refs.push({ extKey: "kinly:shotlist-duo", kind: "note", title: "Optagelse, duo (fase 2)", body: shot["4"], status: "", data: { section: "optagelse" } });

  // FORSLAG-TIL-CHARLIE er en NOTE (en besked Lucas selv sender i sine egne ord), ikke en kladde.
  const ch = splitFrontmatter(f.charlie);
  refs.push({ extKey: "kinly:forslag-charlie", kind: "note", title: "Forslag til Charlie (note, ikke en video)", body: ch.body, status: "", data: { section: "charlie" } });

  refs.push(...parseHooksMaster(f.hooksMaster), ...parseAbTests(f.abTest), ...parseW2(f.w2), ...parseW4(f.w4), ...parseW5(f.w5));
  const mal = parseMaaling(f.maalingCsv);
  // Lokale brugerstier (fx en advarsel om "C:\Users\<navn> i sti") skal ikke med i HQ's database.
  const clean = (t: string) => t.replace(/[A-Za-z]:\\Users\\[A-Za-z0-9_.-]+/g, "[brugersti]");
  for (const d of drafts) for (const k of ["title", "hook", "script", "shotlist", "caption", "risk", "note"] as const) d[k] = clean(d[k]);
  for (const r of refs) {
    r.title = clean(r.title);
    r.body = clean(r.body);
  }
  return { drafts, refs, measureHeader: mal.header, measureRowsSkipped: mal.rows };
}

// ---------------------------------------------------------------- sikkerhedstjek før skrivning

/** Findes der noget i seed-data, der aldrig må i HQ's database? Tom liste = ok. */
export function scanSeed(seed: Seed): string[] {
  const hits: string[] = [];
  const texts: Array<[string, string]> = [];
  for (const d of seed.drafts) texts.push([d.extKey, [d.title, d.hook, d.script, d.shotlist, d.caption, d.risk, d.note].join("\n")]);
  for (const r of seed.refs) texts.push([r.extKey, [r.title, r.body, JSON.stringify(r.data)].join("\n")]);
  for (const [key, text] of texts) {
    if (/(?:\+45[ -]?)\d{2}[ -]?\d{2}[ -]?\d{2}[ -]?\d{2}\b/.test(text) || /\b\d{2} \d{2} \d{2} \d{2}\b/.test(text)) hits.push(`${key}: ligner et telefonnummer`);
    if (/[\w.+-]+@[A-Za-z][\w-]*\.[A-Za-z]{2,}/.test(text)) hits.push(`${key}: indeholder en mailadresse`);
    if (/[A-ZÆØÅ][\wæøåÆØÅ]+(vej|gade|allé|vænge|plads)\s+\d+/.test(text)) hits.push(`${key}: ligner en gadeadresse`);
    if (/C:\\Users|\/Users\/|\.env\b.*=|sk-[A-Za-z0-9]{16,}|(api[_-]?key|secret|token)\s*[:=]\s*\S{8,}/i.test(text)) hits.push(`${key}: ligner en sti eller hemmelighed`);
    for (const line of text.split("\n")) {
      if (/salgselev/i.test(line) && !/aldrig|ikke/i.test(line)) hits.push(`${key}: kalder nogen salgselev`);
    }
  }
  return hits;
}

// ---------------------------------------------------------------- skrivning

export interface SeedResult {
  draftsInserted: number;
  draftsTotal: number;
  refsInserted: number;
  refsTotal: number;
}

/** Idempotent: eksisterende ext_key røres ikke. Alle kladder starter som status "kladde". */
export async function seedMarketing(db: Db, seed: Seed): Promise<SeedResult> {
  const findings = scanSeed(seed);
  if (findings.length) throw new Error(`seed afvist:\n${findings.join("\n")}`);
  let draftsInserted = 0;
  for (const d of seed.drafts) {
    const r = await db
      .insert(marketingDraft)
      .values({ ...d, status: "kladde", source: "seed", createdBy: "seed", updatedBy: "seed" })
      .onConflictDoNothing()
      .returning({ id: marketingDraft.id });
    draftsInserted += r.length;
  }
  let refsInserted = 0;
  for (const r of seed.refs) {
    const res = await db
      .insert(marketingRef)
      .values({ ...r, createdBy: "seed" })
      .onConflictDoNothing()
      .returning({ id: marketingRef.id });
    refsInserted += res.length;
  }
  return { draftsInserted, draftsTotal: seed.drafts.length, refsInserted, refsTotal: seed.refs.length };
}
