// annonce-studie-types.ts — rene regler for Annonce-studiet (/marketing/annoncer): kunde-ja, tekster, A/B-tests og
// bestillinger. Alt gemmes som append-only logs i `store` (KV på Vercel, .send_queue/ lokalt), så ingen DB-migration.
// Ingen server-only: klient-komponenten bruger de samme regler til at vise fejl, før noget sendes.
// HQ poster, betaler og ændrer intet i Meta. Lucas sætter annoncerne op selv.
import { CUSTOMER_NAMES } from "./marketing-types.ts";
import { HEADLINE_MAX, PRIMARY_MAX, type Annonce, type AnnonceBeslutning } from "./annoncer-types.ts";

export class StudieInputError extends Error {}

// ---------------------------------------------------------------- kunde-ja
export interface KundeJa { kunde: string; ja: boolean; note: string; by: string; at: string }
export type KundeJaMap = Record<string, KundeJa>;

export function foldKundeJa(rows: unknown[]): KundeJaMap {
  const out: KundeJaMap = {};
  for (const r of rows) {
    const x = r as Partial<KundeJa> | null;
    if (!x || typeof x.kunde !== "string" || typeof x.ja !== "boolean" || typeof x.by !== "string" || typeof x.at !== "string") continue;
    out[x.kunde] = { kunde: x.kunde, ja: x.ja, note: typeof x.note === "string" ? x.note : "", by: x.by, at: x.at };
  }
  return out;
}

/** Kunder/emner, hvis side kan ses i annoncen, og som ikke har sagt skriftligt ja. Tom liste = må bruges. */
export function manglerJa(a: Pick<Annonce, "kunder">, ja: KundeJaMap): string[] {
  return a.kunder.filter((k) => !ja[k]?.ja);
}

// ---------------------------------------------------------------- fakta til tekster (lukket liste)
// Kun nuværende, godkendte fakta. IKKE hele priser.md (den har udgåede pakker og kundeaftaler). Kilde = fil:linje i vaulten.
export interface AdFakta { id: string; tekst: string; kilde: string }
export const AD_FAKTA: AdFakta[] = [
  { id: "forside", tekst: "Forside 3.997 kr. ekskl. moms (engangsbeløb), designet og kodet fra bunden, gratis demo før betaling", kilde: "KnowledgeOS/context/priser.md:21" },
  { id: "undersider", tekst: "Forside + op til 3 undersider 4.997 kr. ekskl. moms (engangsbeløb), SEO indbygget", kilde: "KnowledgeOS/context/priser.md:22" },
  { id: "webshop", tekst: "Webshop fra 8.449 kr. ekskl. moms (engangsbeløb)", kilde: "KnowledgeOS/context/priser.md:23" },
  { id: "ejer", tekst: "Kodet til kunden, ingen skabelon, kunden ejer koden 100 %", kilde: "KnowledgeOS/context/priser.md:25" },
  { id: "moms", tekst: "Alle priser er ekskl. moms", kilde: "KnowledgeOS/context/priser.md:46" },
  { id: "skrift", tekst: "Endelig pris bekræftes på skrift, før kunden siger ja", kilde: "KnowledgeOS/context/priser.md:48" },
  { id: "regning", tekst: "Regningen kommer først, når siden er godkendt og klar", kilde: "KnowledgeOS/context/priser.md:49" },
  { id: "herning", tekst: "Lucas og Charlie, to i Herning, der koder hjemmesider til danske virksomheder", kilde: "KnowledgeOS/AGENTS.md:25" },
];
const FAKTA_IDS = new Set(AD_FAKTA.map((f) => f.id));
/** Tal der må stå i en annoncetekst: kun dem i fakta-listen (3.997, 4.997, 8.449, 100 %, 3 undersider). */
export const TILLADTE_TAL = new Set(["3.997", "4.997", "8.449", "100", "3"]);
const FORBUDT = [/\bgaranti/i, /\bbedst/i, /\bbilligst/i, /\bnr\.? ?1\b/i, /\bbinding/i, /\b1[-–]2 uger\b/i, /\bhurtigst/i];

export interface TekstSaet {
  gruppe: string;
  overskrifter: string[];
  primaere: string[];
  fakta_id: string[];
  kilde: "ai" | "manuel";
  by: string;
  at: string;
}

/** Fejl i én tekst (tom liste = ok). Samme regler i UI og på serveren. */
export function tekstFejl(t: string, max: number): string[] {
  const f: string[] = [];
  if (!t.trim()) f.push("tom");
  if (t.length > max) f.push(`${t.length} af ${max} tegn`);
  if (/[—–]/.test(t)) f.push("tankestreg");
  if (t.includes("!")) f.push("udråbstegn");
  for (const re of FORBUDT) if (re.test(t)) f.push(`"${t.match(re)![0]}" må ikke bruges`);
  for (const n of t.match(/\d+(?:\.\d{3})*/g) ?? []) if (!TILLADTE_TAL.has(n)) f.push(`tallet ${n} har ingen kilde`);
  if (/\bkr\b/i.test(t) && !/ekskl\.? moms/i.test(t)) f.push('pris uden "ekskl. moms"');
  const lav = ` ${t.toLowerCase()} `;
  for (const n of CUSTOMER_NAMES) if (lav.includes(` ${n.toLowerCase()}`)) f.push(`nævner kunden ${n}`);
  return f;
}

/** Validerer et tekstsæt fra UI eller AI. Kaster StudieInputError med første fejl. */
export function validerTekster(input: { overskrifter: unknown; primaere: unknown; fakta_id?: unknown }): Pick<TekstSaet, "overskrifter" | "primaere" | "fakta_id"> {
  const liste = (v: unknown, navn: string, max: number) => {
    if (!Array.isArray(v) || v.length < 1 || v.length > 5) throw new StudieInputError(`${navn}: 1 til 5 tekster`);
    const ud = v.map((x) => (typeof x === "string" ? x.trim().replace(/\s+/g, " ") : ""));
    ud.forEach((t, i) => {
      const f = tekstFejl(t, max);
      if (f.length) throw new StudieInputError(`${navn} ${i + 1}: ${f.join(", ")}`);
    });
    if (new Set(ud.map((t) => t.toLowerCase())).size !== ud.length) throw new StudieInputError(`${navn}: to ens tekster`);
    return ud;
  };
  const fakta = Array.isArray(input.fakta_id) ? input.fakta_id.filter((x): x is string => typeof x === "string" && FAKTA_IDS.has(x)) : [];
  return { overskrifter: liste(input.overskrifter, "Overskrift", HEADLINE_MAX), primaere: liste(input.primaere, "Primær tekst", PRIMARY_MAX), fakta_id: [...new Set(fakta)] };
}

export function foldTekster(rows: unknown[]): Record<string, TekstSaet> {
  const out: Record<string, TekstSaet> = {};
  for (const r of rows) {
    const x = r as Partial<TekstSaet> | null;
    if (!x || typeof x.gruppe !== "string" || !Array.isArray(x.overskrifter) || !Array.isArray(x.primaere) || typeof x.at !== "string") continue;
    out[x.gruppe] = { gruppe: x.gruppe, overskrifter: x.overskrifter, primaere: x.primaere, fakta_id: Array.isArray(x.fakta_id) ? x.fakta_id : [],
      kilde: x.kilde === "ai" ? "ai" : "manuel", by: typeof x.by === "string" ? x.by : "?", at: x.at };
  }
  return out;
}

/** Standardtekst (fra annoncer.json), når gruppen ikke har et gemt sæt. */
export function teksterFor(a: Pick<Annonce, "gruppe" | "overskrift" | "primaer_tekst">, gemt: Record<string, TekstSaet>): { overskrifter: string[]; primaere: string[]; at: string | null } {
  const t = gemt[a.gruppe];
  return t ? { overskrifter: t.overskrifter, primaere: t.primaere, at: t.at } : { overskrifter: [a.overskrift], primaere: [a.primaer_tekst], at: null };
}

/** Versionen af det, der godkendes: billede + tekster + knap. Ændres én af dem, skal annoncen godkendes igen. */
export function versionAf(a: Pick<Annonce, "billede_hash" | "cta" | "gruppe">, gemt: Record<string, TekstSaet>): string {
  return `${a.billede_hash}:${gemt[a.gruppe]?.at ?? "std"}:${a.cta}`;
}
export function erGodkendt(b: AnnonceBeslutning | undefined, version: string): boolean {
  return b?.status === "godkendt" && b.version === version;
}

// ---------------------------------------------------------------- A/B-tests
export interface ResultatInput { fra: string; til: string; forbrug: number; visninger: number; klik: number; leads: number; kvalificerede: number; kunder: number }
export interface Resultat extends ResultatInput { rid: string; slug: string; by: string; at: string }
export interface Arm { slug: string; forbrug: number; visninger: number; klik: number; leads: number; kvalificerede: number; kunder: number }
export interface AbTest {
  id: string;
  navn: string;
  hypotese: string;
  arme: string[];
  start: string;
  status: "kører" | "afsluttet";
  vinder: string | null;
  slutnote: string;
  resultater: Resultat[];
  by: string;
  at: string;
}

type TestEvent =
  | { type: "opret"; id: string; navn: string; hypotese: string; arme: string[]; start: string; by: string; at: string }
  | ({ type: "resultat"; id: string } & Resultat)
  | { type: "fortryd"; id: string; rid: string; by: string; at: string }
  | { type: "afslut"; id: string; vinder: string | null; note: string; by: string; at: string };

export function foldTests(rows: unknown[]): AbTest[] {
  const tests = new Map<string, AbTest>();
  for (const r of rows) {
    const e = r as TestEvent | null;
    if (!e || typeof e !== "object" || typeof e.id !== "string") continue;
    if (e.type === "opret" && Array.isArray(e.arme)) {
      tests.set(e.id, { id: e.id, navn: e.navn, hypotese: e.hypotese ?? "", arme: e.arme, start: e.start, status: "kører", vinder: null, slutnote: "", resultater: [], by: e.by, at: e.at });
      continue;
    }
    const t = tests.get(e.id);
    if (!t) continue;
    if (e.type === "resultat" && t.arme.includes(e.slug)) t.resultater.push({ rid: e.rid, slug: e.slug, fra: e.fra, til: e.til, forbrug: e.forbrug, visninger: e.visninger, klik: e.klik, leads: e.leads, kvalificerede: e.kvalificerede, kunder: e.kunder, by: e.by, at: e.at });
    else if (e.type === "fortryd") t.resultater = t.resultater.filter((x) => x.rid !== e.rid);
    else if (e.type === "afslut") Object.assign(t, { status: "afsluttet", vinder: e.vinder, slutnote: e.note });
  }
  return [...tests.values()].sort((a, b) => b.at.localeCompare(a.at));
}

export function arme(t: AbTest): Arm[] {
  return t.arme.map((slug) => {
    const rs = t.resultater.filter((r) => r.slug === slug);
    const sum = (k: keyof ResultatInput) => rs.reduce((n, r) => n + (r[k] as number), 0);
    return { slug, forbrug: sum("forbrug"), visninger: sum("visninger"), klik: sum("klik"), leads: sum("leads"), kvalificerede: sum("kvalificerede"), kunder: sum("kunder") };
  });
}

// Stopregler fra trin 1-planen (annoncer-types PLAN, gruppe "stop"): 600 kr uden henvendelse, 1.200 kr med højst én.
export const STOP_UDEN_LEAD = 600;
export const STOP_EN_LEAD = 1200;
/** Før hver arm har brugt så meget, siger HQ ikke, hvem der fører (for få henvendelser til at betyde noget). */
export const MIN_FORBRUG_FOER_DOM = 600;

/** Tosidet binomial-test: givet n henvendelser i alt, er fordelingen mellem to arme usandsynlig, hvis de koster det samme pr. henvendelse? */
export function pVaerdi(leadsA: number, leadsB: number, forbrugA: number, forbrugB: number): number {
  const n = leadsA + leadsB;
  if (n === 0 || forbrugA <= 0 || forbrugB <= 0) return 1;
  const p = forbrugA / (forbrugA + forbrugB);
  const pmf = (k: number) => {
    let c = 1;
    for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
    return c * p ** k * (1 - p) ** (n - k);
  };
  const obs = pmf(leadsA);
  let sum = 0;
  for (let k = 0; k <= n; k++) {
    const v = pmf(k);
    if (v <= obs * (1 + 1e-9)) sum += v;
  }
  return Math.min(1, sum);
}

export interface ArmVurdering extends Arm { cpl: number | null; ctr: number | null; stop: string | null }
export interface TestVurdering { arme: ArmVurdering[]; fører: string | null; sikker: boolean; tekst: string }

const kr = (n: number) => `${Math.round(n).toLocaleString("da-DK")} kr`;

/** Vurdering i hverdagssprog. Siger kun "fører tydeligt" ved p < 0,1 og mindst 6 henvendelser; ellers "for tidligt". */
export function vurderTest(t: AbTest): TestVurdering {
  const vs: ArmVurdering[] = arme(t).map((a) => ({
    ...a,
    cpl: a.leads > 0 ? a.forbrug / a.leads : null,
    ctr: a.visninger > 0 ? a.klik / a.visninger : null,
    stop: a.leads === 0 && a.forbrug >= STOP_UDEN_LEAD ? `Har brugt ${kr(a.forbrug)} uden en eneste henvendelse: sæt den på pause.`
      : a.leads <= 1 && a.forbrug >= STOP_EN_LEAD ? `Har brugt ${kr(a.forbrug)} og højst én henvendelse: sæt den på pause.` : null,
  }));
  if (vs.some((a) => a.forbrug < MIN_FORBRUG_FOER_DOM)) {
    const mangler = vs.filter((a) => a.forbrug < MIN_FORBRUG_FOER_DOM).length;
    return { arme: vs, fører: null, sikker: false, tekst: `For tidligt: ${mangler} af ${vs.length} annoncer har brugt under ${kr(MIN_FORBRUG_FOER_DOM)}. Lad dem køre.` };
  }
  // Bedst = lavest pris pr. henvendelse (uden henvendelser = uendelig); lige = flest henvendelser.
  const rang = [...vs].sort((a, b) => (a.cpl ?? Infinity) - (b.cpl ?? Infinity) || b.leads - a.leads);
  const [bedst, næst] = rang;
  if (bedst.leads === 0) return { arme: vs, fører: null, sikker: false, tekst: "Ingen af annoncerne har givet en henvendelse endnu." };
  const p = pVaerdi(bedst.leads, næst.leads, bedst.forbrug, næst.forbrug);
  const n = bedst.leads + næst.leads;
  const sikker = p < 0.1 && n >= 6;
  const cpl = `${kr(bedst.cpl!)} pr. henvendelse`;
  return {
    arme: vs, fører: bedst.slug, sikker,
    tekst: sikker
      ? `Fører tydeligt: ${cpl}. Forskellen er næppe tilfældig (p = ${p.toFixed(2)}). Overvej at stoppe de andre.`
      : `Fører lige nu: ${cpl}, men med ${n} henvendelser kan det sagtens være tilfældigt. Lad dem køre videre.`,
  };
}

// ---------------------------------------------------------------- bestillinger ("lav en ny variant")
export const BESTILLING_STATUSES = ["ny", "lavet", "afvist"] as const;
export type BestillingStatus = (typeof BESTILLING_STATUSES)[number];
export interface Bestilling { id: string; gruppe: string; skaerme: string[]; onske: string; status: BestillingStatus; note: string; by: string; at: string; opdateret: string }

export function foldBestillinger(rows: unknown[]): Bestilling[] {
  const out = new Map<string, Bestilling>();
  for (const r of rows) {
    const e = r as (Partial<Bestilling> & { type?: string }) | null;
    if (!e || typeof e.id !== "string" || typeof e.at !== "string") continue;
    if (e.type === "ny" && typeof e.gruppe === "string") {
      out.set(e.id, { id: e.id, gruppe: e.gruppe, skaerme: Array.isArray(e.skaerme) ? e.skaerme : [], onske: e.onske ?? "", status: "ny", note: "", by: e.by ?? "?", at: e.at, opdateret: e.at });
    } else if (e.type === "status" && out.has(e.id) && (BESTILLING_STATUSES as readonly unknown[]).includes(e.status)) {
      Object.assign(out.get(e.id)!, { status: e.status, note: e.note ?? "", opdateret: e.at });
    }
  }
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at));
}
