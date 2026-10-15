// Marketing (/marketing): kladder, hooks, A/B-tests, manuel måling. Al skrivning går
// gennem denne fil, så reglerne (hvem må hvad, hvornår må en kladde godkendes) kun
// findes ét sted. Mønster: hq/posts.ts (Drizzle) + competitors.ts (valideringshjælpere).
// HQ poster, sender og køber intet: "postet" er et menneskes egen markering.
import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import type { Db } from "../db/client.ts";
import { marketingDraft, marketingMeasure, marketingRef } from "../db/schema.ts";
import { CompetitorInputError, bool, enumOf, int, noUnknownKeys, num, obj, str } from "./competitors.ts";
import { abVerdict, savesSharesPer1000, type AbCall } from "./marketing-calc.ts";
import {
  AB_STATUSES, LABELS, MUSIC_KINDS, MUSIC_LICENSE_OK, TRACKS,
  type DraftDto, type DraftStatus, type MeasureDto, type MusicKind, type RefDto, type RefKind, type Track,
} from "./marketing-types.ts";

export { CompetitorInputError as MarketingInputError };

type DraftRow = typeof marketingDraft.$inferSelect;
type RefRow = typeof marketingRef.$inferSelect;
type MeasureRow = typeof marketingMeasure.$inferSelect;

const fail = (msg: string): never => {
  throw new CompetitorInputError(msg);
};

// ---------------------------------------------------------------- DTO'er

const iso = (d: Date) => d.toISOString();
export const toDraft = (r: DraftRow): DraftDto => ({
  id: r.id, extKey: r.extKey, track: r.track as Track, title: r.title, hook: r.hook, script: r.script,
  shotlist: r.shotlist, caption: r.caption, label: r.label, priority: r.priority, score: r.score,
  status: r.status as DraftStatus, plannedFor: r.plannedFor, lengthS: r.lengthS, musicKind: r.musicKind as MusicKind,
  musicLicense: r.musicLicense, musicNote: r.musicNote, customerCase: r.customerCase, customerOk: r.customerOk,
  charlieOk: r.charlieOk, trueCheckedOn: r.trueCheckedOn, risk: r.risk, note: r.note, source: r.source,
  createdBy: r.createdBy, updatedBy: r.updatedBy, createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt),
});
export const toRef = (r: RefRow): RefDto => ({
  id: r.id, extKey: r.extKey, kind: r.kind as RefKind, title: r.title, body: r.body,
  data: (r.data ?? {}) as Record<string, unknown>, status: r.status, createdBy: r.createdBy, createdAt: iso(r.createdAt),
});
export const toMeasure = (r: MeasureRow): MeasureDto => ({
  id: r.id, postedOn: r.postedOn, draftId: r.draftId, abId: r.abId, arm: r.arm, parId: r.parId,
  armAssigned: r.armAssigned, postUrl: r.postUrl, views: r.views, saves: r.saves, shares: r.shares,
  newFollowers: r.newFollowers, profileVisits: r.profileVisits, linkClicks: r.linkClicks, inquiries: r.inquiries,
  skipPct: r.skipPct, fullViewPct: r.fullViewPct, watchS: r.watchS, note: r.note, createdBy: r.createdBy,
  createdAt: iso(r.createdAt),
});

// ---------------------------------------------------------------- validering

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function uuid(v: unknown, label = "id"): string {
  if (typeof v !== "string" || !UUID.test(v)) fail(`ugyldigt ${label}`);
  return v as string;
}
function day(v: unknown, label: string, required = false): string | null | undefined {
  if (v === undefined) {
    if (required) fail(`${label} mangler`);
    return undefined;
  }
  if (v === null || v === "") {
    if (required) fail(`${label} mangler`);
    return null;
  }
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(v + "T00:00:00Z").getTime())) {
    fail(`${label} skal være en dato (ÅÅÅÅ-MM-DD)`);
  }
  return v as string;
}
function httpUrl(v: unknown, label: string): string | undefined {
  const t = str(v, label, 2000);
  if (!t) return undefined;
  if (!/^https?:\/\/\S+$/i.test(t)) fail(`${label} skal være en http(s)-adresse`);
  return t;
}
function musicKind(v: unknown): MusicKind | undefined {
  if (typeof v === "string" && /trend/i.test(v)) fail("Trending lyd bruges ikke på Kinlys erhvervskonto. Vælg lydløs, original lyd eller licenseret musik (erhverv-ok).");
  return enumOf(v, "musicKind", MUSIC_KINDS);
}

// Felter der ændrer selve videoen: ændres de på en godkendt kladde, skal den godkendes igen.
const CONTENT_KEYS = ["track", "title", "hook", "script", "shotlist", "caption", "lengthS", "musicKind", "musicLicense", "musicNote", "customerCase"] as const;
const META_KEYS = ["label", "priority", "plannedFor", "note", "risk"] as const;
// Agenten (Hermes) må kun skrive indholdet — aldrig prioritet, dato, godkendelser eller status.
const AGENT_KEYS = ["track", "title", "hook", "script", "shotlist", "caption", "lengthS", "musicKind", "musicLicense", "musicNote", "customerCase", "label", "note", "risk"] as const;
const HUMAN_KEYS = [...CONTENT_KEYS, ...META_KEYS] as const;

type DraftPatch = Partial<{
  track: Track; title: string; hook: string; script: string; shotlist: string; caption: string; lengthS: number | null;
  musicKind: MusicKind; musicLicense: string; musicNote: string; customerCase: boolean; label: string; priority: number;
  plannedFor: string | null; note: string; risk: string;
}>;

function parseDraftPatch(o: Record<string, unknown>, required: boolean): DraftPatch {
  const p: DraftPatch = {};
  const track = enumOf(o.track, "track", TRACKS);
  if (track) p.track = track;
  const title = str(o.title, "title", 300, required);
  if (title !== undefined) p.title = title;
  for (const [k, max] of [["hook", 600], ["script", 60_000], ["shotlist", 40_000], ["caption", 4000], ["musicNote", 500], ["musicLicense", 60], ["note", 2000], ["risk", 2000]] as const) {
    const v = str(o[k], k, max);
    if (v !== undefined) p[k] = v;
  }
  if (o.lengthS === null) p.lengthS = null;
  else {
    const n = int(o.lengthS, "lengthS", 5);
    if (n !== undefined) {
      if (n > 300) fail("lengthS skal være højst 300 sekunder");
      p.lengthS = n;
    }
  }
  const mk = musicKind(o.musicKind);
  if (mk) p.musicKind = mk;
  const cc = bool(o.customerCase, "customerCase");
  if (cc !== undefined) p.customerCase = cc;
  const label = o.label === undefined || o.label === null ? undefined : enumOf(o.label, "label", LABELS);
  if (label !== undefined) p.label = label;
  const pr = int(o.priority, "priority", 1);
  if (pr !== undefined) {
    if (pr > 3) fail("priority skal være 1, 2 eller 3");
    p.priority = pr;
  }
  const pf = day(o.plannedFor, "plannedFor");
  if (pf !== undefined) p.plannedFor = pf;
  return p;
}

// ---------------------------------------------------------------- kladder

const TRACK_ORDER: Record<string, number> = { faceless: 0, duo: 1, "dag-n": 2 };

export async function listDrafts(db: Db): Promise<DraftDto[]> {
  const rows = await db.select().from(marketingDraft).orderBy(asc(marketingDraft.priority), desc(marketingDraft.score), asc(marketingDraft.createdAt));
  return rows.map(toDraft).sort((a, b) => a.priority - b.priority || (TRACK_ORDER[a.track] ?? 9) - (TRACK_ORDER[b.track] ?? 9));
}

async function getRow(db: Db, id: unknown): Promise<DraftRow> {
  const [row] = await db.select().from(marketingDraft).where(eq(marketingDraft.id, uuid(id)));
  if (!row) fail("kladden findes ikke");
  return row!;
}
export async function getDraft(db: Db, id: unknown): Promise<DraftDto> {
  return toDraft(await getRow(db, id));
}

/** Ny kladde. status er ALTID "kladde" — ingen vej herfra til godkendt/postet. */
export async function createDraft(db: Db, raw: unknown, actor: string, via: "human" | "agent" = "human"): Promise<DraftDto> {
  const o = obj(raw, "kladde");
  noUnknownKeys(o, via === "agent" ? AGENT_KEYS : HUMAN_KEYS, "kladde");
  const p = parseDraftPatch(o, true);
  const [row] = await db
    .insert(marketingDraft)
    .values({ ...p, status: "kladde", source: via === "agent" ? "agent" : "manuel", createdBy: actor, updatedBy: actor })
    .returning();
  return toDraft(row);
}

/** Ret (menneske): et ændret indhold på en godkendt kladde sender den tilbage til kladde. */
export async function updateDraft(db: Db, id: unknown, raw: unknown, actor: string): Promise<DraftDto> {
  const row = await getRow(db, id);
  const o = obj(raw, "kladde");
  noUnknownKeys(o, HUMAN_KEYS, "kladde");
  const p = parseDraftPatch(o, false);
  if (p.title === "") fail("title mangler");
  const cur = row as unknown as Record<string, unknown>;
  const changedContent = CONTENT_KEYS.some((k) => k in p && (p as Record<string, unknown>)[k] !== cur[k]);
  const status = row.status === "godkendt" && changedContent ? "kladde" : row.status;
  const [next] = await db
    .update(marketingDraft)
    .set({ ...p, status, updatedBy: actor, updatedAt: new Date() })
    .where(eq(marketingDraft.id, row.id))
    .returning();
  return toDraft(next);
}

/** Hvad der mangler, før en kladde må godkendes. Tom liste = klar. */
export function approvalBlockers(d: Pick<DraftDto, "hook" | "track" | "charlieOk" | "customerCase" | "customerOk" | "musicKind" | "musicLicense">): string[] {
  const out: string[] = [];
  if (!d.hook.trim()) out.push("Hooket mangler.");
  else if (/\[[^\]\n]{1,24}\]/.test(d.hook)) out.push("Hooket har en pladsholder som [N]. Fyld det rigtige tal i først.");
  if (d.track === "duo" && !d.charlieOk) out.push("Charlie skal have sagt ja (skriftligt) til ansigt, navn og ord.");
  if (d.customerCase && !d.customerOk) out.push("Kundens skriftlige ok mangler.");
  if (d.musicKind === "licenseret" && d.musicLicense !== MUSIC_LICENSE_OK) out.push(`Musikken skal have licensen "${MUSIC_LICENSE_OK}".`);
  return out;
}

export type DraftAction = "approve" | "drop" | "restore" | "posted";

/** Godkend / drop / tilbage til kladde / markér postet. Drop er en status — intet slettes. */
export async function draftAction(db: Db, id: unknown, action: unknown, actor: string): Promise<DraftDto> {
  const row = await getRow(db, id);
  const a = enumOf(action, "action", ["approve", "drop", "restore", "posted"] as const, true)!;
  const d = toDraft(row);
  let status: DraftStatus;
  switch (a) {
    case "approve": {
      if (d.status !== "kladde") fail(`Kun en kladde kan godkendes (den står som "${d.status}").`);
      const blockers = approvalBlockers(d);
      if (blockers.length) fail(`Kan ikke godkendes endnu. ${blockers.join(" ")}`);
      status = "godkendt";
      break;
    }
    case "drop":
      if (d.status === "postet") fail("En postet video kan ikke droppes.");
      status = "droppet";
      break;
    case "restore":
      if (d.status !== "droppet") fail("Kun en droppet kladde kan hentes tilbage.");
      status = "kladde";
      break;
    case "posted":
      if (d.status !== "godkendt") fail("Kun en godkendt kladde kan markeres som postet.");
      status = "postet";
      break;
  }
  const [next] = await db.update(marketingDraft).set({ status, updatedBy: actor, updatedAt: new Date() }).where(eq(marketingDraft.id, row.id)).returning();
  return toDraft(next);
}

/** Menneskets egne tjek: Charlies ja, kundens ok og "sandt pr. dato". Agenten kan aldrig sætte dem. */
export async function setChecks(db: Db, id: unknown, raw: unknown, actor: string): Promise<DraftDto> {
  const row = await getRow(db, id);
  const o = obj(raw, "tjek");
  noUnknownKeys(o, ["charlieOk", "customerOk", "trueCheckedOn"], "tjek");
  const set: Partial<typeof marketingDraft.$inferInsert> = {};
  const c = bool(o.charlieOk, "charlieOk");
  if (c !== undefined) set.charlieOk = c;
  const k = bool(o.customerOk, "customerOk");
  if (k !== undefined) set.customerOk = k;
  const t = day(o.trueCheckedOn, "trueCheckedOn");
  if (t !== undefined) set.trueCheckedOn = t;
  const [next] = await db.update(marketingDraft).set({ ...set, updatedBy: actor, updatedAt: new Date() }).where(eq(marketingDraft.id, row.id)).returning();
  return toDraft(next);
}

// ---------------------------------------------------------------- hooks, tests, inspiration

export async function listRefs(db: Db, kind: RefKind): Promise<RefDto[]> {
  const rows = await db.select().from(marketingRef).where(eq(marketingRef.kind, kind)).orderBy(asc(marketingRef.createdAt), asc(marketingRef.title));
  return rows.map(toRef);
}

export async function addInspiration(db: Db, raw: unknown, actor: string): Promise<RefDto> {
  const o = obj(raw, "inspiration");
  noUnknownKeys(o, ["title", "url", "why"], "inspiration");
  const url = httpUrl(o.url, "url");
  const [row] = await db
    .insert(marketingRef)
    .values({ kind: "inspiration", title: str(o.title, "title", 200, true)!, body: str(o.why, "why", 2000) ?? "", data: { group: "link", ...(url ? { url } : {}) }, createdBy: actor })
    .returning();
  return toRef(row);
}

export async function createAb(db: Db, raw: unknown, actor: string): Promise<RefDto> {
  const o = obj(raw, "test");
  noUnknownKeys(o, ["title", "armA", "armB", "metric"], "test");
  const [row] = await db
    .insert(marketingRef)
    .values({
      kind: "ab",
      title: str(o.title, "title", 200, true)!,
      status: "planlagt",
      data: {
        code: "",
        brand: "Kinly",
        arms: { A: str(o.armA, "armA", 600, true)!, B: str(o.armB, "armB", 600, true)! },
        metric: str(o.metric, "metric", 200) || "Gem + delinger pr. 1000 visninger",
      },
      createdBy: actor,
    })
    .returning();
  return toRef(row);
}

export async function setAbStatus(db: Db, id: unknown, status: unknown): Promise<RefDto> {
  const s = enumOf(status, "status", AB_STATUSES, true)!;
  const key = uuid(id);
  const [row] = await db.select().from(marketingRef).where(eq(marketingRef.id, key));
  if (!row || row.kind !== "ab") fail("testen findes ikke");
  const [next] = await db.update(marketingRef).set({ status: s, updatedAt: new Date() }).where(eq(marketingRef.id, key)).returning();
  return toRef(next);
}

export interface AbBoardItem {
  test: RefDto;
  call: AbCall;
  /** Tal pr. opslag pr. arm (gem + delinger pr. 1000), til visning. */
  values: { A: number[]; B: number[] };
}

/** Dommen pr. test: opslag uden visninger tæller ikke med (kan ikke regnes pr. 1000). */
export function abBoard(tests: RefDto[], measures: MeasureDto[]): AbBoardItem[] {
  return tests.map((test) => {
    const mine = measures.filter((m) => m.abId === test.id);
    const pick = (arm: string) => mine.filter((m) => m.arm === arm).map(savesSharesPer1000).filter((x): x is number => x != null);
    const values = { A: pick("A"), B: pick("B") };
    return { test, values, call: abVerdict(values.A, values.B) };
  });
}

// ---------------------------------------------------------------- manuel måling

const NUM_KEYS = ["views", "saves", "shares", "newFollowers", "profileVisits", "linkClicks", "inquiries"] as const;

export async function addMeasure(db: Db, raw: unknown, actor: string): Promise<MeasureDto> {
  const o = obj(raw, "måling");
  noUnknownKeys(o, ["postedOn", "draftId", "abId", "arm", "parId", "armAssigned", "postUrl", ...NUM_KEYS, "skipPct", "fullViewPct", "watchS", "note"], "måling");
  const set: Partial<typeof marketingMeasure.$inferInsert> = {};
  for (const k of NUM_KEYS) {
    const v = o[k] === "" ? undefined : int(o[k], k, 0);
    if (v !== undefined) set[k] = v;
  }
  for (const k of ["skipPct", "fullViewPct"] as const) {
    const v = o[k] === "" ? undefined : num(o[k], k, 0, 100);
    if (v !== undefined) set[k] = v;
  }
  const w = o.watchS === "" ? undefined : num(o.watchS, "watchS", 0, 3600);
  if (w !== undefined) set.watchS = w;
  const arm = o.arm === undefined || o.arm === null || o.arm === "" ? "" : enumOf(o.arm, "arm", ["A", "B"] as const)!;

  let abId: string | undefined;
  if (o.abId !== undefined && o.abId !== null && o.abId !== "") {
    abId = uuid(o.abId, "abId");
    const [t] = await db.select().from(marketingRef).where(eq(marketingRef.id, abId));
    if (!t || t.kind !== "ab") fail("testen findes ikke");
    if (!arm) fail("vælg A eller B, når målingen hører til en test");
  } else if (arm) fail("A/B hører kun til en måling, der er koblet til en test");

  let draftId: string | undefined;
  if (o.draftId !== undefined && o.draftId !== null && o.draftId !== "") {
    draftId = (await getRow(db, o.draftId)).id;
  }
  const [row] = await db
    .insert(marketingMeasure)
    .values({
      ...set,
      postedOn: day(o.postedOn, "postedOn", true) as string,
      draftId: draftId ?? null,
      abId: abId ?? null,
      arm,
      parId: str(o.parId, "parId", 40) ?? "",
      armAssigned: str(o.armAssigned, "armAssigned", 120) ?? "",
      postUrl: httpUrl(o.postUrl, "postUrl") ?? "",
      note: str(o.note, "note", 1000) ?? "",
      createdBy: actor,
    })
    .returning();
  return toMeasure(row);
}

export async function listMeasures(db: Db): Promise<MeasureDto[]> {
  const rows = await db.select().from(marketingMeasure).orderBy(desc(marketingMeasure.postedOn), desc(marketingMeasure.createdAt));
  return rows.map(toMeasure);
}
