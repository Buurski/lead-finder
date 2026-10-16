// annoncer-types.ts — rene typer, trin 1-planen og beslutnings-fold til /marketing/annoncer
// (ingen server-only: klient-komponenten må importere den). Stillsene selv ligger i
// src/data/annoncer.json og bygges af scripts/annonce-stills.mjs. HQ betaler og poster intet.

export const META_CTA = ["Få tilbud", "Send besked", "Læs mere"] as const;
export const HEADLINE_MAX = 40;
export const PRIMARY_MAX = 125;

export interface AnnonceFakta {
  /** Fil og linjenummer i vaulten, fx "KnowledgeOS/context/priser.md:21". */
  fil: string;
  fakta: string;
}

/** Én række i annoncer.json = ét billede i ét format. Teksten er ens for begge formater af samme slug. */
export interface Annonce {
  id: string;
  slug: string;
  format: string;
  billede: string;
  overskrift: string;
  primaer_tekst: string;
  beskrivelse: string;
  cta: (typeof META_CTA)[number];
  still_tekst: string;
  kilde_fakta: AnnonceFakta[];
  billede_kilder: string[];
  kunde: string | null;
  kunde_ja: boolean;
  skabelon: string;
  test_celle: string;
  koncept: string;
  anbefalet_start: boolean;
  advarsler: string[];
}

/** Et motiv (slug) med dets formater. Beslutningen gælder motivet, ikke det enkelte format. */
export interface AnnonceMotiv {
  slug: string;
  tekst: Annonce;
  formater: Array<{ format: string; billede: string }>;
}

export function motiver(rows: Annonce[]): AnnonceMotiv[] {
  const out = new Map<string, AnnonceMotiv>();
  for (const r of rows) {
    const m = out.get(r.slug) ?? { slug: r.slug, tekst: r, formater: [] };
    m.formater.push({ format: r.format, billede: r.billede });
    out.set(r.slug, m);
  }
  return [...out.values()];
}

/** Må motivet bruges i en annonce? Nej, så længe en kunde er med og ikke har sagt ja. */
export const venterPaaKunde = (a: Pick<Annonce, "kunde" | "kunde_ja">) => a.kunde !== null && !a.kunde_ja;
/** Mærket på kladden og i rapporten, så længe kundens skriftlige ja mangler. */
export const kundeOkMaerke = (a: Pick<Annonce, "kunde" | "kunde_ja">) => (venterPaaKunde(a) ? `KRÆVER KUNDE-OK (${a.kunde})` : null);

export const ANNONCE_STATUSES = ["godkendt", "droppet", "afventer"] as const;
export type AnnonceStatus = (typeof ANNONCE_STATUSES)[number];
export interface AnnonceBeslutning {
  slug: string;
  status: AnnonceStatus;
  by: string;
  at: string;
}

/** Folder beslutnings-loggen: sidste række pr. slug vinder. Ugyldige rækker springes over, resten overlever. */
export function foldBeslutninger(rows: unknown[]): Record<string, AnnonceBeslutning> {
  const out: Record<string, AnnonceBeslutning> = {};
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const x = r as Record<string, unknown>;
    if (typeof x.slug !== "string" || typeof x.by !== "string" || typeof x.at !== "string") continue;
    if (!(ANNONCE_STATUSES as readonly unknown[]).includes(x.status)) continue;
    out[x.slug] = { slug: x.slug, status: x.status as AnnonceStatus, by: x.by, at: x.at };
  }
  return out;
}

// ---------------------------------------------------------------- trin 1 i hverdagssprog
// Kilde: KnowledgeOS/wiki/vaekst/ads-system-2026-10/10-PLANER-KINLY-OG-PLANUKO.md (K0 og K1, Lucas' beslutning 16/10)
// og 09-BUDGET-VEJLEDNING.md. Intet her sætter noget op i Meta. Lucas gør det selv.

export const PLAN_TAL = [
  { n: "150 kr", l: "om dagen" },
  { n: "4 uger", l: "ca. 4.200 kr i alt" },
  { n: "4.500 kr", l: "kontoloft i Meta" },
  { n: "300 kr", l: "mål pr. henvendelse" },
] as const;

export interface PlanPunkt {
  id: string;
  tekst: string;
  /** Hverdagsforklaring af et fagord i punktet (vises bag ⓘ). */
  info?: string;
}
export interface PlanGruppe {
  id: string;
  titel: string;
  note?: string;
  punkter: PlanPunkt[];
}

export const PLAN: PlanGruppe[] = [
  {
    id: "foer",
    titel: "Før første annonce (koster 0 kr)",
    note: "Det her gør du selv i Meta. HQ lægger ikke noget ud og betaler ikke noget.",
    punkter: [
      { id: "side", tekst: "Kinlys side på Facebook og Instagram uden din privatadresse." },
      {
        id: "loft",
        tekst: "Annoncekonto med et kontoloft på 4.500 kr, sat før den første annonce.",
        info: "Kontoloftet (Metas \"spending limit\") er en grænse, du selv sætter. Når kontoen har brugt så meget, stopper alle annoncer af sig selv. Det er din sikkerhed mod en regning, der løber løbsk.",
      },
      {
        id: "form",
        tekst: "Formular i annoncen med tre spørgsmål: Har du en virksomhed med CVR? Har du en hjemmeside i dag? Hvornår skal du bruge en ny?",
        info: "Det er Metas færdige tilmeldingsformular (Instant Form). Den, der trykker på annoncen, udfylder den uden at forlade Facebook eller Instagram. Du får et navn og en kontaktmulighed.",
      },
      { id: "privat", tekst: "Formularen linker til privatlivspolitikken og siger, hvad svaret bruges til, og hvornår det slettes." },
      { id: "steder", tekst: "Kun Facebook og Instagram. Slå Audience Network og \"creative enhancements\" fra." },
      { id: "ja", tekst: "Kun billeder uden kunde, før kunden har sagt ja skriftligt. Se advarslerne på hvert billede." },
    ],
  },
  {
    id: "koerer",
    titel: "Mens det kører (4 uger)",
    punkter: [
      { id: "dag", tekst: "150 kr om dagen i 4 uger. Én kampagne, ét bredt målgruppe-sæt, hele Danmark. \"Fra Herning\" må stå i teksten, aldrig adressen." },
      { id: "syv", tekst: "Ret ikke i budgettet de første 7 dage. Eneste undtagelse er at sætte kampagnen på pause." },
      { id: "svar", tekst: "Svar på hver henvendelse inden for 24 timer. Ligger der flere ubesvarede, end du kan nå (4), sætter du kampagnen på pause." },
      {
        id: "vinkler",
        tekst: "Start med 4 til 5 helt forskellige annoncer. Skift de dårligste ud efter 7 til 10 dage, og tilføj 1 til 2 nye om ugen.",
        info: "Hver slags annonce her er en test (K1 til K6). Meta viser den, der får flest henvendelser, mest. Derfor virker det bedre med få, forskellige annoncer end mange næsten ens.",
      },
    ],
  },
  {
    id: "stop",
    titel: "Sæt en annonce på pause, hvis",
    note: "Mål pr. henvendelse er 300 kr (i fagsprog CPL, pris pr. lead).",
    punkter: [
      {
        id: "k600",
        tekst: "Den har brugt 600 kr og ikke givet en eneste henvendelse.",
        info: "600 kr er det dobbelte af målet på 300 kr pr. henvendelse. Regnet efter kan en god annonce få pause med uret ca. 13 gange ud af 100. Det accepterer vi, for ellers brænder dårlige annoncer en fjerdedel af loftet af.",
      },
      { id: "k1200", tekst: "Den har brugt 1.200 kr og højst givet én henvendelse." },
    ],
  },
  {
    id: "dom",
    titel: "Når de 4 uger er gået",
    note: "Mål: højst 1.500 kr i annoncepenge pr. ny kunde. Med 4.500 kr kræver det 3 kunder.",
    punkter: [
      { id: "d3", tekst: "3 kunder eller flere: gå videre og vokse." },
      { id: "d12", tekst: "1 til 2 kunder: én runde mere med det bedste tilbud (nyt loft = forbrug + 4.500 kr)." },
      { id: "dstop", tekst: "Over 600 kr pr. henvendelse og under 30 % af dem er rigtige emner, eller 0 kunder efter to runder: stop Meta for Kinly." },
    ],
  },
];
