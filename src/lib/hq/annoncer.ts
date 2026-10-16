// annoncer.ts — Annonce-studiet på serveren: stills (src/data/annoncer.json, bygges af scripts/annonce-stills.mjs),
// godkend/drop, kunde-ja, tekster, A/B-tests og bestillinger. Alt er append-only logs i `store` (lokalt .send_queue/,
// på Vercel KV), så to personer aldrig overskriver hinanden og intet kræver en DB-migration. HQ poster og betaler intet.
import "server-only";
import crypto from "node:crypto";
import { store } from "../store.ts";
import data from "../../data/annoncer.json" with { type: "json" };
import { ANNONCE_STATUSES, foldBeslutninger, type Annonce, type AnnonceBeslutning, type AnnonceStatus } from "./annoncer-types.ts";
import {
  BESTILLING_STATUSES, StudieInputError, foldBestillinger, foldKundeJa, foldTekster, foldTests, manglerJa, validerTekster, versionAf, erGodkendt, vurderTest,
  type AbTest, type Bestilling, type KundeJaMap, type ResultatInput, type TekstSaet,
} from "./annonce-studie-types.ts";

export const BESLUTNING_KEY = "marketing-annoncer-beslutninger";
export const KUNDE_JA_KEY = "marketing-annoncer-kunde-ja";
export const TEKST_KEY = "marketing-annoncer-tekster";
export const TEST_KEY = "marketing-annonce-tests";
export const BESTILLING_KEY = "marketing-annonce-bestillinger";

export const loadAnnoncer = (): Annonce[] => data as Annonce[];
const motivAf = (slug: unknown): Annonce => {
  const m = typeof slug === "string" ? loadAnnoncer().find((a) => a.slug === slug) : undefined;
  if (!m) throw new StudieInputError("Ukendt annonce.");
  return m;
};
const grupper = () => new Set(loadAnnoncer().map((a) => a.gruppe));
const nu = () => new Date().toISOString();
const tekst = (v: unknown, navn: string, max: number, kraevet = false): string => {
  if (v === undefined || v === null || v === "") {
    if (kraevet) throw new StudieInputError(`${navn} mangler`);
    return "";
  }
  if (typeof v !== "string") throw new StudieInputError(`${navn} skal være tekst`);
  const t = v.trim();
  if (t.length > max) throw new StudieInputError(`${navn}: højst ${max} tegn`);
  if (kraevet && !t) throw new StudieInputError(`${navn} mangler`);
  return t;
};
const heltal = (v: unknown, navn: string, max: number): number => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v.replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max) throw new StudieInputError(`${navn}: et tal mellem 0 og ${max}`);
  return Math.round(n);
};
const dato = (v: unknown, navn: string): string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new StudieInputError(`${navn}: dato som ÅÅÅÅ-MM-DD`);
  return v;
};

// ---------------------------------------------------------------- læs alt (én tur til KV pr. log)
export interface StudieState {
  beslutninger: Record<string, AnnonceBeslutning>;
  kundeJa: KundeJaMap;
  tekster: Record<string, TekstSaet>;
  tests: AbTest[];
  bestillinger: Bestilling[];
}
export async function loadStudie(): Promise<StudieState> {
  const [b, k, t, ab, best] = await Promise.all([BESLUTNING_KEY, KUNDE_JA_KEY, TEKST_KEY, TEST_KEY, BESTILLING_KEY].map((key) => store.readAll(key)));
  return { beslutninger: foldBeslutninger(b), kundeJa: foldKundeJa(k), tekster: foldTekster(t), tests: foldTests(ab), bestillinger: foldBestillinger(best) };
}
export const listBeslutninger = async () => foldBeslutninger(await store.readAll(BESLUTNING_KEY));

// ---------------------------------------------------------------- godkend / drop (bundet til version)
export async function setBeslutning(slug: unknown, status: unknown, actor: string): Promise<Record<string, AnnonceBeslutning>> {
  const motiv = motivAf(slug);
  if (typeof status !== "string" || !(ANNONCE_STATUSES as readonly string[]).includes(status)) throw new StudieInputError("Ukendt status.");
  const s = await loadStudie();
  // en annonce med en kundes side kan aldrig blive klar, før hver kunde i billedet har sagt ja skriftligt
  const mangler = manglerJa(motiv, s.kundeJa);
  if (status === "godkendt" && mangler.length) throw new StudieInputError(`KRÆVER KUNDE-OK (${mangler.join(", ")}): kan ikke godkendes uden kundens skriftlige ja.`);
  const row: AnnonceBeslutning = { slug: motiv.slug, status: status as AnnonceStatus, version: versionAf(motiv, s.tekster), by: actor, at: nu() };
  await store.append(BESLUTNING_KEY, row);
  return listBeslutninger();
}

// ---------------------------------------------------------------- kunde-ja (skriftligt ja fra kunden, registreret af Lucas/Charlie)
export async function setKundeJa(kunde: unknown, ja: unknown, note: unknown, actor: string): Promise<KundeJaMap> {
  const kendte = new Set(loadAnnoncer().flatMap((a) => a.kunder));
  if (typeof kunde !== "string" || !kendte.has(kunde)) throw new StudieInputError("Ukendt kunde.");
  if (typeof ja !== "boolean") throw new StudieInputError("ja skal være sand eller falsk.");
  const n = tekst(note, "Note", 300, ja); // ja kræver en note: hvem sagde ja, hvordan og hvornår
  await store.append(KUNDE_JA_KEY, { kunde, ja, note: n, by: actor, at: nu() });
  return foldKundeJa(await store.readAll(KUNDE_JA_KEY));
}

// ---------------------------------------------------------------- tekster pr. koncept-gruppe
export async function gemTekster(gruppe: unknown, input: Record<string, unknown>, kilde: "ai" | "manuel", actor: string): Promise<Record<string, TekstSaet>> {
  if (typeof gruppe !== "string" || !grupper().has(gruppe)) throw new StudieInputError("Ukendt koncept.");
  const v = validerTekster({ overskrifter: input.overskrifter, primaere: input.primaere, fakta_id: input.fakta_id });
  await store.append(TEKST_KEY, { gruppe, ...v, kilde, by: actor, at: nu() });
  return foldTekster(await store.readAll(TEKST_KEY));
}

// ---------------------------------------------------------------- A/B-tests (kun godkendte annoncer, max 3 arme)
export async function opretTest(input: Record<string, unknown>, actor: string): Promise<AbTest[]> {
  const navn = tekst(input.navn, "Navn", 80, true);
  const hypotese = tekst(input.hypotese, "Hvad tester I", 300);
  const start = dato(input.start, "Startdato");
  const slugs = Array.isArray(input.arme) ? [...new Set(input.arme.filter((x): x is string => typeof x === "string"))] : [];
  if (slugs.length < 2 || slugs.length > 3) throw new StudieInputError("Vælg 2 eller 3 annoncer. Flere kan vores budget ikke skelne imellem.");
  const s = await loadStudie();
  for (const slug of slugs) {
    const m = motivAf(slug);
    if (!erGodkendt(s.beslutninger[slug], versionAf(m, s.tekster))) throw new StudieInputError(`"${m.koncept} · ${m.skaerm}" er ikke godkendt i den nuværende version. Godkend den først.`);
  }
  if (s.tests.some((t) => t.status === "kører" && t.arme.some((a) => slugs.includes(a)))) throw new StudieInputError("En af annoncerne er allerede med i en test, der kører.");
  await store.append(TEST_KEY, { type: "opret", id: crypto.randomUUID(), navn, hypotese, arme: slugs, start, by: actor, at: nu() });
  return foldTests(await store.readAll(TEST_KEY));
}

const aktivTest = async (id: unknown): Promise<AbTest> => {
  const t = (await loadStudie()).tests.find((x) => x.id === id);
  if (!t) throw new StudieInputError("Ukendt test.");
  if (t.status !== "kører") throw new StudieInputError("Testen er afsluttet.");
  return t;
};

export async function tilfoejResultat(input: Record<string, unknown>, actor: string): Promise<AbTest[]> {
  const t = await aktivTest(input.id);
  if (typeof input.slug !== "string" || !t.arme.includes(input.slug)) throw new StudieInputError("Annoncen er ikke med i testen.");
  const r: ResultatInput = {
    fra: dato(input.fra, "Fra"), til: dato(input.til, "Til"),
    forbrug: heltal(input.forbrug, "Forbrug (kr)", 100_000), visninger: heltal(input.visninger ?? 0, "Visninger", 10_000_000),
    klik: heltal(input.klik ?? 0, "Klik", 1_000_000), leads: heltal(input.leads, "Henvendelser", 10_000),
    kvalificerede: heltal(input.kvalificerede ?? 0, "Rigtige emner", 10_000), kunder: heltal(input.kunder ?? 0, "Nye kunder", 1_000),
  };
  if (r.til < r.fra) throw new StudieInputError("Til-datoen er før fra-datoen.");
  if (r.kvalificerede > r.leads || r.kunder > r.leads) throw new StudieInputError("Rigtige emner og kunder kan ikke være flere end henvendelserne.");
  if (r.klik > r.visninger && r.visninger > 0) throw new StudieInputError("Flere klik end visninger.");
  await store.append(TEST_KEY, { type: "resultat", id: t.id, rid: crypto.randomUUID(), slug: input.slug, ...r, by: actor, at: nu() });
  return foldTests(await store.readAll(TEST_KEY));
}

export async function fortrydResultat(id: unknown, rid: unknown, actor: string): Promise<AbTest[]> {
  const t = await aktivTest(id);
  if (!t.resultater.some((r) => r.rid === rid)) throw new StudieInputError("Ukendt resultat.");
  await store.append(TEST_KEY, { type: "fortryd", id: t.id, rid, by: actor, at: nu() });
  return foldTests(await store.readAll(TEST_KEY));
}

export async function afslutTest(id: unknown, vinder: unknown, note: unknown, actor: string): Promise<AbTest[]> {
  const t = await aktivTest(id);
  if (vinder !== null && (typeof vinder !== "string" || !t.arme.includes(vinder))) throw new StudieInputError("Vinderen skal være en af annoncerne i testen (eller ingen).");
  await store.append(TEST_KEY, { type: "afslut", id: t.id, vinder, note: tekst(note, "Note", 500), by: actor, at: nu() });
  return foldTests(await store.readAll(TEST_KEY));
}

// ---------------------------------------------------------------- bestillinger ("lav en ny variant med denne side")
export async function bestil(input: Record<string, unknown>, actor: string): Promise<Bestilling[]> {
  const gruppe = input.gruppe;
  if (typeof gruppe !== "string" || !(grupper().has(gruppe) || gruppe === "ny")) throw new StudieInputError("Vælg et koncept, eller 'ny'.");
  const skaerme = Array.isArray(input.skaerme) ? input.skaerme.map((x, i) => tekst(x, `Skærm ${i + 1}`, 200)).filter(Boolean) : [];
  if (skaerme.length > 3) throw new StudieInputError("Højst 3 skærme.");
  const onske = tekst(input.onske, "Ønske", 600);
  if (!skaerme.length && !onske) throw new StudieInputError("Skriv hvilken side der skal på, eller et ønske.");
  await store.append(BESTILLING_KEY, { type: "ny", id: crypto.randomUUID(), gruppe, skaerme, onske, by: actor, at: nu() });
  return foldBestillinger(await store.readAll(BESTILLING_KEY));
}

export async function setBestillingStatus(id: unknown, status: unknown, note: unknown, actor: string): Promise<Bestilling[]> {
  const alle = foldBestillinger(await store.readAll(BESTILLING_KEY));
  if (!alle.some((b) => b.id === id)) throw new StudieInputError("Ukendt bestilling.");
  if (typeof status !== "string" || !(BESTILLING_STATUSES as readonly string[]).includes(status)) throw new StudieInputError("Ukendt status.");
  await store.append(BESTILLING_KEY, { type: "status", id, status, note: tekst(note, "Note", 300), by: actor, at: nu() });
  return foldBestillinger(await store.readAll(BESTILLING_KEY));
}

// ---------------------------------------------------------------- oversigt til Hermes og Lucas OS (kun tal og navne, ingen noter)
export async function studieOversigt() {
  const s = await loadStudie();
  const alle = loadAnnoncer();
  const navn = (slug: string) => {
    const a = alle.find((x) => x.slug === slug);
    return a ? `${a.koncept} · ${a.skaerm}` : slug;
  };
  const godkendte = [...new Set(alle.map((a) => a.slug))].filter((slug) => {
    const a = alle.find((x) => x.slug === slug)!;
    return erGodkendt(s.beslutninger[slug], versionAf(a, s.tekster));
  });
  return {
    godkendte: godkendte.map((slug) => ({ slug, navn: navn(slug) })),
    tests: s.tests.map((t) => {
      const v = vurderTest(t);
      return { id: t.id, navn: t.navn, hypotese: t.hypotese, start: t.start, status: t.status, vinder: t.vinder, vurdering: v.tekst, foerer: v.fører, sikker: v.sikker,
        arme: v.arme.map((a) => ({ slug: a.slug, navn: navn(a.slug), forbrug: a.forbrug, visninger: a.visninger, klik: a.klik, leads: a.leads, kvalificerede: a.kvalificerede, kunder: a.kunder, cpl: a.cpl, ctr: a.ctr, stop: a.stop })),
        sidstIndtastet: t.resultater.reduce<string | null>((m, r) => (m && m > r.til ? m : r.til), null) };
    }),
    bestillinger: s.bestillinger.filter((b) => b.status === "ny").map((b) => ({ id: b.id, gruppe: b.gruppe, skaerme: b.skaerme, onske: b.onske, at: b.at })),
  };
}
