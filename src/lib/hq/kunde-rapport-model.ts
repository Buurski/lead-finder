// Den månedlige SEO-rapport til Hjemmesidepas-kunder: ÉN model, to visninger
// (kunde-rapport-html.ts og kunde-rapport-pdf.tsx). Al kundevendt tekst skrives
// HER, så forbudte ord kan testes ét sted og de to visninger ikke kan sige
// noget forskelligt.
//
// Input er motorens JSON (kunde_seo_tjek.py på VPS'en) + evt. Search Console-
// tal fra HQ's gsc_snapshot + månedens "arbejde"-aktiviteter. Motorens egne
// `navn`/`betyder`-tekster bruges IKKE ordret: de indeholder fagord i parentes
// ("(canonical)", "(schema)") og tankestreger. Hvert punkt har sin egen tekst
// i PUNKT herunder. Rækkefølgen af "de vigtigste" tages fra motorens
// `vigtigste` (én rangering, ikke to).
//
// Ren: ingen DB, ingen netværk. Samme input ⇒ samme rapport.

export type Status = "ok" | "obs" | "fejl" | "info" | "ikke_maalt";

export interface MaalePunkt {
  punkt: string;
  navn?: string;
  vaerdi: unknown;
  status: string;
  alvor?: string;
  note?: string | null;
}

/** Den del af motorens JSON rapporten bruger. Valideres ved indgangen (kunde-rapport.ts). */
export interface Maaling {
  navn: string;
  url: string;
  kilde: string; // "direkte" | "ekstern" | "fil"
  maalt: string; // ISO med tidszone
  punkter: MaalePunkt[];
  gsc?: {
    periode?: [string, string];
    sider?: {
      side: string;
      klik: number;
      visninger: number;
      position?: number;
    }[];
  } | null;
  status_flag: string;
  kan_sendes: boolean;
  vigtigste?: { rang: number; punkt: string }[];
  /** Spurgt AI de spørgsmål en kunde ville stille; hvor mange gange blev kunden nævnt. Mangler = ikke målt. */
  ai_naevninger?: AiNaevninger | null;
}

export interface AiNaevninger {
  spurgt: number;
  naevnt: number;
  tjekket: string;
  spoergsmaal: { q: string; naevnt: boolean }[];
}

/** Search Console fra HQ (gsc_snapshot). Kun aggregater. */
export interface GscInput {
  periodStart: string;
  periodEnd: string;
  clicks: number;
  impressions: number;
  topQueries: {
    query: string;
    clicks: number;
    impressions: number;
    position: number;
  }[];
  daily: { date: string; clicks: number; impressions: number }[];
  /** Gennemsnitlig placering over alle søgninger (snapshot). */
  position?: number | null;
}

export interface RapportInput {
  kunde: string;
  maaling: Maaling;
  /** Den måling kunden fik sidste gang (tidligere måned). null = første rapport. */
  forrige: Maaling | null;
  gsc: GscInput | null;
  /** Kundesynligt arbejde i perioden (activity.type = "arbejde"), korte sætninger. */
  arbejde: string[];
  /** Månedens Jev-godkendte nyheder (kunde-rapport.ts henter dem fra seo-opdatering-aktiviteter). */
  nyt?: { titel: string; tekst: string }[];
  /** Fornavn til mailens "Hej ...". Tom = kundens navn. */
  hilsen?: string;
  /** Lucas' personlige linje til kunden denne måned (fra HQ). Tom = ingen. */
  note?: string;
  /** Vi står for hele siden (services: "hjemmeside"). Småfejl er så vores opgave, ikke kundens
   *  læsning: de nævnes ikke, de rettes og står under "Det har vi rettet" næste gang (Lucas 28/9). */
  vedligeholder?: boolean;
  /** Månedens første måling, hvis der er målt igen siden. Rettelser imellem tæller som "rettet". */
  foerstIMaaned?: Maaling | null;
  /** Kundens eget mærke som data-URI (PNG/JPEG). null = kun navnet. */
  logo?: string | null;
  /** Friske Google-anmeldelser (Places). null = ukendt, så nævnes de ikke. */
  anmeldelser?: { rating: number | null; antal: number } | null;
}

export type Pil = "op" | "ned" | "lige";
export type Vurdering = "bedre" | "daarligere" | "uaendret";

export interface Nogletal {
  label: string;
  vaerdi: string;
  forklaring: string;
  pil?: Pil;
  vurdering?: Vurdering;
  foer?: string;
}

export interface Fund {
  titel: string;
  tekst: string;
  betyder: string;
  goer: string;
  alvor: "Tager vi først" | "Kommer snart" | "Lille ting";
  /** Kan kunden se ændringen på selve siden? Kun så giver vi lyd først. */
  synlig?: boolean;
}

/** Punkter hvor rettelsen ændrer det, gæsten ser på siden. Resten (billedbeskrivelser, data til Google) ordner vi bare. */
const SYNLIGE = new Set(["h1", "ordtal", "kontaktlinks", "brudte_links", "viewport", "links"]);

export interface TjekLinje {
  navn: string;
  status: "ok" | "obs" | "ikke_maalt" | "info";
  tekst: string;
}

export interface RapportModel {
  kunde: string;
  /** Kundens eget mærke (data-URI). Mangler i rapporter frosset før 29/9. */
  logo?: string | null;
  domaene: string;
  maaned: string; // YYYY-MM (Europe/Copenhagen) for målingen
  maanedNavn: string; // "oktober 2026"
  maaltDato: string; // "1. oktober 2026"
  variant: "med-adgang" | "uden-adgang";
  nulpunkt: boolean;
  /** Forklaringen første måned. null fra anden rapport. */
  nulpunktTekst: string | null;
  hero: {
    tal: string;
    enhed: string;
    saetning: string;
    pil?: Pil;
    foer?: string;
  };
  vigtigste: Fund[];
  vigtigsteNote: string;
  /** Et fund er "Tager vi først" (fx siden er skjult for Google): står så øverst, ikke efter det gode. */
  haster: boolean;
  rettet: string[];
  arbejde: string[];
  /** "Det har vi gjort": rettet + Lucas' egne linjer + selve gennemgangen. Aldrig tom. */
  gjort: string[];
  /** "Det er nyt siden sidst": ugens Google-ændringer, Jev har vurderet værd at fortælle. */
  nyt: { titel: string; tekst: string }[];
  nogletal: Nogletal[];
  ugeKlik: { uge: string; klik: number }[]; // tom uden Search Console
  soegeord: { tekst: string; klik: number; plads: string }[];
  sider: { side: string; klik: number }[];
  godt: { titel: string; tekst: string }[];
  tjek: { gruppe: string; linjer: TjekLinje[] }[];
  iOrden: { ok: number; ialt: number };
  googleKort: { titel: string; beskrivelse: string; adresse: string } | null;
  naesteGang: string[];
  udenAdgang: string | null;
  maalt: string[];
  mail: { emne: string; tekst: string };
  /** Det personlige: Lucas' egen linje til netop denne kunde denne måned (valgfri) + fast afslutning. */
  personlig: { note: string | null; afslutning: string };
}

/** Lucas' faste afslutning i rapportens kontaktboks. Skrevet én gang, ret den her. */
export const PERSONLIG_AFSLUTNING =
  "Det er mig, der kigger jeres side igennem hver måned. Er der noget, I undrer jer over, så ring eller skriv. Også de små ting.";

// ---------------------------------------------------------------- tekster pr. punkt

interface PunktTekst {
  navn: string;
  gruppe: "google" | "gaester" | "ai";
  betyder: string;
  ok: (v: string) => string;
  problem: (v: string) => string;
  goer: string;
}

const tal = (s: string, re: RegExp): number | null => {
  const m = s.match(re);
  return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : null;
};
const nf = (n: number) => n.toLocaleString("da-DK");

/** Motoren skriver "18 af 30 billeder mangler beskrivelse" osv. — vi trækker kun tallene ud. */
export function tallene(m: Maaling): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of m.punkter) {
    const v =
      typeof p.vaerdi === "string"
        ? p.vaerdi
        : typeof p.vaerdi === "number"
          ? String(p.vaerdi)
          : "";
    if (!v || erIkkeMaalt(p)) continue;
    const put = (k: string, n: number | null) => {
      if (n !== null && Number.isFinite(n)) out[k] = n;
    };
    if (p.punkt === "svartid") put("svartid", tal(v, /(\d+)\s*ms/));
    if (p.punkt === "sidestoerrelse")
      put("sidestoerrelse", tal(v, /(\d+)\s*KB/i));
    if (p.punkt === "ordtal") put("ordtal", tal(v, /(\d+)\s*ord/));
    if (p.punkt === "links") put("links", tal(v, /(\d+)\s*interne/));
    if (p.punkt === "billeder_alt") {
      put("billeder_uden", tal(v, /(\d+)\s*af/));
      put("billeder_ialt", tal(v, /af\s*(\d+)/));
    }
    if (p.punkt === "sitemap")
      put("sitemap_sider", tal(v, /ca\.\s*(\d+)\s*adresser/));
    if (p.punkt === "brudte_links") {
      put("brudte", tal(v, /^(\d+)\s*af/));
      put("links_testet", tal(v, /af\s*(\d+)\s*testede/));
    }
  }
  return out;
}

const PUNKT: Record<string, PunktTekst> = {
  status: {
    navn: "Siden er åben for besøg",
    gruppe: "gaester",
    betyder: "Svarer siden ikke, kan hverken kunder eller Google komme ind.",
    ok: () => "Siden svarede helt normalt, da vi kiggede.",
    problem: () => "Siden svarede ikke normalt, da vi kiggede.",
    goer: "Vi finder ud af hvorfor med det samme.",
  },
  omdirigering: {
    navn: "Adressen fører det rigtige sted hen",
    gruppe: "gaester",
    betyder:
      "Folk skriver adressen på mange måder. Alle veje skal føre ind på siden.",
    ok: () => "Man lander rigtigt, uanset hvordan adressen bliver skrevet.",
    problem: () => "Nogle måder at skrive adressen på fører ikke direkte frem.",
    goer: "Vi retter det, så alle veje fører det samme sted hen.",
  },
  svartid: {
    navn: "Siden åbner hurtigt",
    gruppe: "gaester",
    betyder:
      "Under et sekund føles hurtigt. En langsom side mister besøgende, før de har set noget.",
    ok: (v) => `Den begyndte at vise sig efter ${sek(tal(v, /(\d+)\s*ms/))}.`,
    problem: (v) =>
      `Siden var ${sek(tal(v, /(\d+)\s*ms/))} om at begynde at vise sig. Det er for langsomt.`,
    goer: "Vi gør siden lettere, så den åbner hurtigere.",
  },
  sidestoerrelse: {
    navn: "Siden er let at hente",
    gruppe: "gaester",
    betyder:
      "En let side åbner hurtigt, også på en telefon med dårligt signal.",
    ok: () => "Siden er let og hurtig at hente.",
    problem: () => "Siden er tung at hente på en telefon.",
    goer: "Vi skærer det tunge fra.",
  },
  title: {
    navn: "Overskriften i Google",
    gruppe: "google",
    betyder: "Det er den blå linje, folk ser og klikker på, når de søger.",
    ok: () => "Overskriften er skrevet og har en god længde.",
    problem: () =>
      "Overskriften i Google mangler eller har en længde, der bliver skåret af.",
    goer: "Vi skriver en ny overskrift, der siger hvad I laver, og hvor.",
  },
  meta_description: {
    navn: "Teksten under overskriften i Google",
    gruppe: "google",
    betyder:
      "Den korte tekst skal få folk til at vælge jer frem for dem ved siden af.",
    ok: () => "Teksten er skrevet og passer i længden.",
    problem: () =>
      "Teksten under overskriften mangler, så Google selv vælger noget.",
    goer: "Vi skriver en kort tekst, der får folk til at klikke ind.",
  },
  h1: {
    navn: "Hovedoverskriften på forsiden",
    gruppe: "google",
    betyder: "Den fortæller både gæster og Google med det samme, hvad I laver.",
    ok: () => "Forsiden har en tydelig hovedoverskrift.",
    problem: () => "Forsiden mangler en tydelig hovedoverskrift.",
    goer: "Vi sætter en overskrift ind, der siger hvad I laver.",
  },
  h2: {
    navn: "Mellemoverskrifter",
    gruppe: "google",
    betyder:
      "De gør siden let at skimme og hjælper Google med at forstå indholdet.",
    ok: (v) =>
      `Siden er delt op med ${tal(v, /(\d+)/) ?? "flere"} mellemoverskrifter.`,
    problem: () => "Siden har få eller ingen mellemoverskrifter.",
    goer: "Vi deler teksten op, så den er let at læse.",
  },
  canonical: {
    navn: "Én fast adresse til siden",
    gruppe: "google",
    betyder: "Så jeres side ikke konkurrerer med sig selv i søgningerne.",
    ok: () => "Siden har én fast adresse, så Google ikke tror, den findes flere gange.",
    problem: () =>
      "Siden fortæller ikke Google, hvilken adresse der er den rigtige.",
    goer: "Vi retter det. Det tager få minutter.",
  },
  robots: {
    navn: "Google må vise siden",
    gruppe: "google",
    betyder: "Står den forkert, forsvinder siden helt fra Google.",
    ok: () => "Siden må gerne vises i Google.",
    problem: () =>
      "Siden beder lige nu Google om ikke at vise den, så den bliver ikke fundet i søgninger.",
    goer: "Vi slår det fra med det samme.",
  },
  sprog: {
    navn: "Siden er markeret som dansk",
    gruppe: "google",
    betyder: "Så Google viser siden til folk, der søger på dansk.",
    ok: () => "Google ved, at siden er på dansk.",
    problem: () => "Siden er ikke markeret som dansk.",
    goer: "Vi markerer siden som dansk.",
  },
  viewport: {
    navn: "Siden passer til mobilen",
    gruppe: "gaester",
    betyder:
      "De fleste søger fra telefonen. Siden skal passe til skærmen, ellers går de igen.",
    ok: () => "Siden tilpasser sig telefonens skærm.",
    problem: () => "Siden er ikke sat op til telefoner.",
    goer: "Vi sætter siden op til telefoner.",
  },
  schema: {
    navn: "Google og AI kan læse jeres oplysninger",
    gruppe: "ai",
    betyder:
      "Navn, adresse, åbningstider og ydelser står på en måde, som Google og AI-tjenester som ChatGPT kan aflæse direkte.",
    ok: () => "Jeres oplysninger står klar til Google og AI.",
    problem: () =>
      "Jeres oplysninger står ikke på en måde, Google og AI kan aflæse direkte.",
    goer: "Vi lægger jeres oplysninger ind, så de kan aflæses.",
  },
  open_graph: {
    navn: "Pænt billede når siden deles",
    gruppe: "gaester",
    betyder:
      "Deler nogen siden på Facebook eller Messenger, vises et billede og en kort tekst.",
    ok: () => "Deles siden, vises et billede og en tekst.",
    problem: () =>
      "Deles siden, vises der intet billede eller en tilfældig tekst.",
    goer: "Vi vælger et billede og en tekst til deling.",
  },
  billeder_alt: {
    navn: "Billedbeskrivelser",
    gruppe: "gaester",
    betyder:
      "Google kan ikke se billeder, kun læse en kort beskrivelse. Svagtseende får den læst op.",
    ok: (v) => {
      const n = tal(v, /af\s*(\d+)/);
      return n
        ? `Alle ${nf(n)} billeder har en beskrivelse.`
        : "Billederne har beskrivelser.";
    },
    problem: (v) => {
      const x = tal(v, /(\d+)\s*af/);
      const n = tal(v, /af\s*(\d+)/);
      return x !== null && n !== null
        ? `${nf(x)} af ${nf(n)} billeder mangler en kort beskrivelse.`
        : "Nogle billeder mangler en kort beskrivelse.";
    },
    goer: "Vi skriver beskrivelserne. I skal ikke gøre noget.",
  },
  kontaktlinks: {
    navn: "Telefon og mail virker med ét tryk",
    gruppe: "gaester",
    betyder:
      "Fra telefonen skal man kunne ringe eller skrive direkte fra siden.",
    ok: () => "Telefonnummer og mail kan trykkes på og virker.",
    problem: () =>
      "Telefonnummer eller mail kan ikke trykkes på fra en telefon.",
    goer: "Vi gør nummer og mail trykbare.",
  },
  links: {
    navn: "Man kan klikke videre rundt",
    gruppe: "gaester",
    betyder:
      "Gode veje videre holder gæster på siden og hjælper Google med at finde alle jeres sider.",
    ok: (v) => `Der er ${tal(v, /(\d+)/) ?? "flere"} veje videre fra forsiden.`,
    problem: () => "Der er få veje videre fra forsiden.",
    goer: "Vi laver flere veje videre til jeres vigtigste sider.",
  },
  robots_txt: {
    navn: "Google har adgang til hele siden",
    gruppe: "google",
    betyder: "En lille fil bestemmer, hvad Google må kigge på.",
    ok: () => "Google har adgang til det, den skal se.",
    problem: () =>
      "Filen, der bestemmer Googles adgang, mangler eller står forkert.",
    goer: "Vi lægger filen ind, så Google har fri adgang.",
  },
  sitemap: {
    navn: "Google har en liste over jeres sider",
    gruppe: "google",
    betyder: "Så nye sider bliver fundet hurtigt i stedet for om flere uger.",
    ok: (v) => {
      const n = tal(v, /ca\.\s*(\d+)\s*adresser/);
      return n
        ? `Listen har ${nf(n)} sider og er opdateret.`
        : "Listen findes og er opdateret.";
    },
    problem: () => "Der er ingen liste over jeres sider til Google.",
    goer: "Vi laver listen og giver den til Google.",
  },
  brudte_links: {
    navn: "Ingen døde links",
    gruppe: "gaester",
    betyder:
      "Et link, der ikke virker, irriterer gæster og koster tillid hos Google.",
    ok: (v) => {
      const n = tal(v, /af\s*(\d+)\s*testede/);
      return n
        ? `Vi prøvede ${nf(n)} links. Alle virker.`
        : "De links vi prøvede, virker.";
    },
    problem: (v) => {
      const x = tal(v, /^(\d+)\s*af/);
      return x
        ? `${nf(x)} links fører til en side, der ikke findes.`
        : "Nogle links fører til en side, der ikke findes.";
    },
    goer: "Vi retter de døde links.",
  },
  llms_txt: {
    navn: "Kort beskrivelse til AI",
    gruppe: "ai",
    betyder:
      "En lille ekstra fil, der hjælper AI-tjenester med at læse siden. Ikke et krav, men et lille forspring.",
    ok: () => "Der ligger en kort tekst på siden kun til AI-søgninger, så de gengiver jer rigtigt.",
    problem: () => "Der ligger endnu ingen kort tekst til AI-søgninger på siden.",
    goer: "Vi kan lægge én ind, hvis I vil.",
  },
  ordtal: {
    navn: "Der er nok tekst på forsiden",
    gruppe: "ai",
    betyder:
      "Kort tekst er svær at finde i Google og bliver sjældent nævnt af AI.",
    ok: (v) => `Forsiden har ${nf(tal(v, /(\d+)\s*ord/) ?? 0)} ord tekst.`,
    problem: (v) =>
      `Forsiden har kun ${nf(tal(v, /(\d+)\s*ord/) ?? 0)} ord tekst.`,
    goer: "Vi skriver mere om det, I laver, i jeres egne ord.",
  },
  qa_schema: {
    navn: "Spørgsmål og svar",
    gruppe: "ai",
    betyder:
      "Spørgsmål og svar på siden er den slags tekst, AI-svar oftest gengiver.",
    ok: () => "Siden har spørgsmål og svar, som AI kan bruge.",
    problem: () => "Siden har ingen spørgsmål og svar endnu.",
    goer: "Vi kan skrive de spørgsmål, jeres kunder oftest stiller.",
  },
  citerbar_data: {
    navn: "AI kan finde jeres kontaktoplysninger",
    gruppe: "ai",
    betyder: "AI kan kun gengive det, den kan læse direkte på siden.",
    ok: (v) => {
      const liste = v.replace(/^i teksten:\s*/i, "").trim();
      return liste && liste !== "ingen"
        ? `${stort(liste.replace(/, ([^,]+)$/, " og $1"))} står som almindelig tekst.`
        : "Kontaktoplysningerne står som almindelig tekst.";
    },
    problem: () =>
      "Telefon, adresse og åbningstider står ikke som almindelig tekst.",
    goer: "Vi skriver dem ind som almindelig tekst.",
  },
};

const GRUPPE_NAVN: Record<PunktTekst["gruppe"], string> = {
  google: "Kan folk finde jer i Google",
  gaester: "Virker siden for jeres gæster",
  ai: "Kan AI forstå jer",
};

// Kilder, ikke tjek: tæller ikke med i "i orden".
const IKKE_TJEK = new Set(["gsc"]);
// Ekstra-punkter: "findes ikke" er ikke en fejl.
const BONUS = new Set(["llms_txt", "qa_schema"]);

const sek = (ms: number | null) =>
  ms === null
    ? "et øjeblik"
    : ms < 1000
      ? `${(ms / 1000).toLocaleString("da-DK", { maximumFractionDigits: 2 })} sekund`
      : `${(ms / 1000).toLocaleString("da-DK", { maximumFractionDigits: 1 })} sekunder`;
const stort = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function erIkkeMaalt(p: MaalePunkt): boolean {
  const s =
    `${typeof p.vaerdi === "string" ? p.vaerdi : ""} ${p.note ?? ""}`.toLowerCase();
  return p.status === "ikke_maalt" || s.includes("ikke målt");
}

function status(p: MaalePunkt): Status {
  if (erIkkeMaalt(p)) return "ikke_maalt";
  if (p.status === "ok" || p.status === "obs" || p.status === "fejl")
    return p.status;
  return "info";
}

function vaerdiTekst(p: MaalePunkt): string {
  return typeof p.vaerdi === "string"
    ? p.vaerdi
    : typeof p.vaerdi === "number"
      ? String(p.vaerdi)
      : "";
}

/** Info-punkter (bonus) tæller som "ok" når de findes, ellers som et forslag. */
function bonusFindes(p: MaalePunkt): boolean {
  const v = vaerdiTekst(p).toLowerCase();
  return !(v.includes("findes ikke") || v.startsWith("ingen"));
}

// ---------------------------------------------------------------- dato og tal

const MAANEDER = [
  "januar",
  "februar",
  "marts",
  "april",
  "maj",
  "juni",
  "juli",
  "august",
  "september",
  "oktober",
  "november",
  "december",
];

/** YYYY-MM for et tidspunkt i dansk tid (månedsgrænsen er Lucas' kalender, ikke UTC). */
export function maanedFor(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`ugyldigt tidspunkt: ${iso}`);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(d);
  return `${p.find((x) => x.type === "year")!.value}-${p.find((x) => x.type === "month")!.value}`;
}

export function maanedNavn(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${MAANEDER[m - 1]} ${y}`;
}

function datoLang(iso: string): string {
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Copenhagen",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const g = (t: string) => Number(p.find((x) => x.type === t)!.value);
  return `${g("day")}. ${MAANEDER[g("month") - 1]} ${g("year")}`;
}

function datoKort(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return `${d}. ${MAANEDER[m - 1].slice(0, 3)}.`;
}

export function hostAf(url: string): string {
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

function pil(nu: number, foer: number): Pil {
  return nu > foer ? "op" : nu < foer ? "ned" : "lige";
}
function vurder(p: Pil, hoejtErGodt: boolean): Vurdering {
  if (p === "lige") return "uaendret";
  return (p === "op") === hoejtErGodt ? "bedre" : "daarligere";
}

// ---------------------------------------------------------------- Search Console

const DAG = 86_400_000;
const isoDag = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Klik i de 28 dage før vinduet (fra de daglige tal). null hvis dagene ikke dækker hele perioden. */
export function forrigeVindue(
  g: GscInput,
): { klik: number; visninger: number } | null {
  const start = Date.parse(`${g.periodStart}T12:00:00Z`);
  const fra = isoDag(start - 28 * DAG);
  const til = isoDag(start - DAG);
  const dage = g.daily.filter((d) => d.date >= fra && d.date <= til);
  if (dage.length < 26) return null; // GSC springer enkelte tomme dage over; et halvt vindue er ikke en sammenligning
  return {
    klik: dage.reduce((s, d) => s + d.clicks, 0),
    visninger: dage.reduce((s, d) => s + d.impressions, 0),
  };
}

/** 90 dages daglige klik → hele uger (mandag-søndag), ældste først. Delvise uger i kanterne droppes. */
export function ugeKlik(
  daily: GscInput["daily"],
): { uge: string; klik: number }[] {
  const uger = new Map<string, { klik: number; dage: number }>();
  for (const d of daily) {
    const t = Date.parse(`${d.date}T12:00:00Z`);
    const man = isoDag(t - ((new Date(t).getUTCDay() + 6) % 7) * DAG);
    const u = uger.get(man) ?? { klik: 0, dage: 0 };
    u.klik += d.clicks;
    u.dage += 1;
    uger.set(man, u);
  }
  const alle = [...uger.entries()].sort(([a], [b]) => a.localeCompare(b));
  // Første/sidste uge kan være delvis (vinduet starter midt i en uge). GSC udelader
  // dage uden visninger, så "delvis" = uden for vinduets datoer, ikke færre rækker.
  const foerste = daily.length
    ? daily.reduce((m, d) => (d.date < m ? d.date : m), daily[0].date)
    : "";
  const sidste = daily.length
    ? daily.reduce((m, d) => (d.date > m ? d.date : m), daily[0].date)
    : "";
  return alle
    .filter(
      ([man]) =>
        man >= foerste &&
        isoDag(Date.parse(`${man}T12:00:00Z`) + 6 * DAG) <= sidste,
    )
    .map(([man, u]) => ({ uge: datoKort(man), klik: u.klik }));
}

function stiAf(url: string): string {
  try {
    const p = new URL(url).pathname.replace(/\/$/, "");
    // "/service/serviceeftersyn" → "Serviceeftersyn": kunden kender sine sider på navn, ikke adresse.
    const sidste = p.split("/").pop() ?? "";
    return sidste
      ? stort(decodeURIComponent(sidste).replace(/-/g, " "))
      : "Forsiden";
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- selve rapporten

const ALVOR: Record<string, Fund["alvor"]> = {
  hoej: "Tager vi først",
  mellem: "Kommer snart",
  lav: "Lille ting",
};

export function byggRapport(input: RapportInput): RapportModel {
  const { maaling: m, forrige, gsc, kunde } = input;
  const domaene = hostAf(m.url);
  const maaned = maanedFor(m.maalt);
  const nulpunkt = forrige === null;
  const efter = new Map(m.punkter.map((p) => [p.punkt, p]));

  // Alle kendte tjek i kundens sprog, grupperet.
  const tjek: RapportModel["tjek"] = (["google", "gaester", "ai"] as const).map(
    (g) => ({ gruppe: GRUPPE_NAVN[g], linjer: [] as TjekLinje[] }),
  );
  let ok = 0;
  let ialt = 0;
  for (const p of m.punkter) {
    const t = PUNKT[p.punkt];
    if (!t || IKKE_TJEK.has(p.punkt)) continue;
    const s = status(p);
    const v = vaerdiTekst(p);
    let linje: TjekLinje;
    if (s === "ikke_maalt")
      linje = {
        navn: t.navn,
        status: "ikke_maalt",
        tekst: "Ikke målt denne gang. Vi gætter ikke.",
      };
    else if (BONUS.has(p.punkt))
      linje = bonusFindes(p)
        ? { navn: t.navn, status: "ok", tekst: t.ok(v) }
        : { navn: t.navn, status: "info", tekst: t.problem(v) };
    else if (s === "ok") linje = { navn: t.navn, status: "ok", tekst: t.ok(v) };
    else linje = { navn: t.navn, status: "obs", tekst: t.problem(v) };
    if (input.vedligeholder && linje.status !== "ok") continue;
    tjek[["google", "gaester", "ai"].indexOf(t.gruppe)].linjer.push(linje);
    if (linje.status === "ok" || linje.status === "obs") {
      ialt += 1;
      if (linje.status === "ok") ok += 1;
    }
  }

  // De vigtigste: motorens rangering, vores ord.
  const vigtigste: Fund[] = [];
  for (const v of [...(m.vigtigste ?? [])].sort((a, b) => a.rang - b.rang)) {
    const p = efter.get(v.punkt);
    const t = PUNKT[v.punkt];
    if (!p || !t || vigtigste.length >= 3) continue;
    if (input.vedligeholder && ALVOR[p.alvor ?? ""] !== "Tager vi først") continue;
    vigtigste.push({
      titel: t.navn,
      tekst: t.problem(vaerdiTekst(p)),
      betyder: t.betyder,
      goer: t.goer,
      alvor: ALVOR[p.alvor ?? ""] ?? "Lille ting",
      synlig: SYNLIGE.has(v.punkt),
    });
  }
  const vigtigsteNote = input.vedligeholder && vigtigste.length === 0
    ? "" // sektionen udelades; småting retter vi uden at gøre dem til kundens problem
    : vigtigste.length === 0
      ? "Vi fandt ikke noget, der skal rettes denne gang. Det er sådan, det skal være."
      : vigtigste.length < 3
        ? `Kun ${vigtigste.length === 1 ? "én ting" : "to ting"} kræver noget denne gang. Vi finder ikke på flere for at fylde op.`
        : "";

  // Rettet siden sidst: problem sidste gang, i orden nu. Det er synligt arbejde.
  const rettet: string[] = [];
  for (const kilde of [forrige, input.foerstIMaaned ?? null]) {
    if (!kilde) continue;
    const fm = new Map(kilde.punkter.map((p) => [p.punkt, p]));
    for (const [k, p] of efter) {
      const f = fm.get(k);
      const t = PUNKT[k];
      if (!t || !f || IKKE_TJEK.has(k) || BONUS.has(k)) continue;
      const linje = `${t.navn}: ${t.ok(vaerdiTekst(p))}`;
      if ((status(f) === "obs" || status(f) === "fejl") && status(p) === "ok" && !rettet.includes(linje))
        rettet.push(linje);
    }
  }

  // Nøgletal med retning mod sidste rapport (aldrig mod en kørsel samme dag).
  const nu = tallene(m);
  const da = forrige ? tallene(forrige) : {};
  const nogletal: Nogletal[] = [];
  const add = (
    key: string,
    label: string,
    fmt: (n: number) => string,
    forklaring: string,
    hoejtErGodt: boolean,
  ) => {
    if (nu[key] === undefined) return;
    // Vi står for siden: et dårligt tal her er vores opgave, ikke noget kunden skal læse.
    if (input.vedligeholder && key === "billeder_uden" && nu[key] > 0) return;
    const n: Nogletal = { label, vaerdi: fmt(nu[key]), forklaring };
    if (!nulpunkt && da[key] !== undefined) {
      n.pil = pil(nu[key], da[key]);
      n.vurdering = vurder(n.pil, hoejtErGodt);
      n.foer = fmt(da[key]);
    }
    nogletal.push(n);
  };

  // Search Console (variant A).
  let hero: RapportModel["hero"];
  let soegeord: RapportModel["soegeord"] = [];
  let sider: RapportModel["sider"] = [];
  let uger: RapportModel["ugeKlik"] = [];
  const engineGsc = m.gsc?.sider?.length ? m.gsc : null;
  const variant: RapportModel["variant"] =
    gsc || engineGsc ? "med-adgang" : "uden-adgang";

  if (gsc) {
    const prev = forrigeVindue(gsc);
    hero = {
      tal: nf(gsc.clicks),
      enhed: "besøg fra Google",
      saetning: `Så mange klikkede sig ind på jeres side fra Google mellem ${datoLang(gsc.periodStart)} og ${datoLang(gsc.periodEnd)}.`,
      ...(prev ? { pil: pil(gsc.clicks, prev.klik), foer: nf(prev.klik) } : {}),
    };
    nogletal.push({
      label: "Vist i Google",
      vaerdi: `${nf(gsc.impressions)} gange`,
      forklaring:
        "Så mange gange stod jeres side i søgeresultaterne, når nogen søgte.",
      ...(prev
        ? {
            pil: pil(gsc.impressions, prev.visninger),
            vurdering: vurder(pil(gsc.impressions, prev.visninger), true),
            foer: nf(prev.visninger),
          }
        : {}),
    });
    if (gsc.impressions > 0) {
      const andel = (gsc.clicks / gsc.impressions) * 100;
      nogletal.push({
        label: "Hvor mange der valgte jer",
        vaerdi: `${andel.toLocaleString("da-DK", { maximumFractionDigits: 1 })} %`,
        forklaring: `Cirka 1 ud af ${Math.round(100 / Math.max(andel, 0.1))}, der så jer i Google, klikkede ind på jeres side.`,
      });
    }
    soegeord = gsc.topQueries
      .filter((q) => q.clicks > 0)
      .slice(0, 5)
      .map((q) => ({
        tekst: q.query,
        klik: q.clicks,
        plads: q.position
          ? `typisk nr. ${Math.max(1, Math.round(q.position))}`
          : "",
      }));
    uger = ugeKlik(gsc.daily);
  } else if (engineGsc) {
    const klik = engineGsc.sider!.reduce((s, x) => s + x.klik, 0);
    const vis = engineGsc.sider!.reduce((s, x) => s + x.visninger, 0);
    const [fra, til] = engineGsc.periode ?? ["", ""];
    hero = {
      tal: nf(klik),
      enhed: "besøg fra Google",
      saetning:
        fra && til
          ? `Så mange klikkede sig ind på jeres side fra Google mellem ${datoLang(fra)} og ${datoLang(til)}.`
          : "Så mange klikkede sig ind på jeres side fra Google de seneste fire uger.",
    };
    nogletal.push({
      label: "Vist i Google",
      vaerdi: `${nf(vis)} gange`,
      forklaring:
        "Så mange gange stod jeres side i søgeresultaterne, når nogen søgte.",
    });
    sider = [...engineGsc.sider!]
      .sort((a, b) => b.klik - a.klik)
      // Kunderådet: "Fortrolighedspolitik 2 besøg" er støj. Under 3 besøg vises ikke (den største altid).
      .filter((s, i) => s.klik > 0 && (s.klik >= 3 || i === 0))
      .slice(0, 5)
      .map((s) => ({ side: stiAf(s.side), klik: s.klik }));
  } else {
    // Kunderådet 28/9: "14 af 22" lød som en karakterbog. Vi tæller det, der er på plads.
    hero = input.vedligeholder && (m.vigtigste?.length ?? 0) > vigtigste.length ? {
      tal: `${ok}`,
      enhed: "ting er på plads",
      saetning: "Vi har gennemgået jeres side på alt det, der afgør om folk kan finde jer og kontakte jer. Småting retter vi løbende, så snart vi ser dem.",
    } : {
      tal: ok === ialt ? "Alle" : `${ok}`,
      enhed: ok === ialt ? `${ialt} ting er på plads` : "ting er allerede på plads",
      saetning:
        ok === ialt
          ? "Vi har gennemgået jeres side på alt det, der afgør om folk kan finde jer og kontakte jer. Det hele sidder, som det skal."
          : `Vi har gennemgået jeres side på ${ialt} punkter. ${ialt - ok === 1 ? "Én ting" : `${ialt - ok} ting`} kan gøres endnu bedre, og dem tager vi os af.`,
    };
  }

  if (m.ai_naevninger && m.ai_naevninger.spurgt > 0) {
    const a = m.ai_naevninger;
    const f = forrige?.ai_naevninger;
    const n: Nogletal = {
      label: "Nævnt når man spørger AI",
      vaerdi: `${a.naevnt} af ${a.spurgt}`,
      forklaring: "Vi stiller AI som ChatGPT de spørgsmål, en kunde ville stille. Så mange gange nævnte den jer.",
    };
    if (!nulpunkt && f && f.spurgt === a.spurgt) {
      n.pil = pil(a.naevnt, f.naevnt);
      n.vurdering = vurder(n.pil, true);
      n.foer = `${f.naevnt} af ${f.spurgt}`;
    }
    nogletal.push(n);
  }
  add(
    "svartid",
    "Så hurtigt åbner siden",
    (n) => sek(n),
    "Under et sekund føles hurtigt for gæsten.",
    false,
  );
  add(
    "ordtal",
    "Ord på forsiden",
    (n) => nf(n),
    "Mere tekst om det I laver, gør jer lettere at finde.",
    true,
  );
  add(
    "billeder_uden",
    "Billeder uden beskrivelse",
    (n) => nf(n),
    "Jo færre, jo bedre. Google læser beskrivelsen, ikke billedet.",
    false,
  );
  add(
    "sitemap_sider",
    "Sider Google kender til",
    (n) => nf(n),
    "Alle de sider, vi har givet Google en liste over.",
    true,
  );

  // Det går godt: det kunden skal læse først (Lucas 28/9: "sig de gode ting mest").
  // Google-tal først, fordi de er dem kunden selv kan mærke; derefter sidens egne styrker.
  const godt: RapportModel["godt"] = [];
  // Nye søgninger er den mest konkrete nyhed for kunden; derfor først.
  const NYT_ORDEN = ["Nye søgninger finder jer", "Flere besøg fra Google", "I står højere i Google", "I bliver set oftere"];
  const nyt = [...(input.nyt ?? [])].sort((a, b) => (NYT_ORDEN.indexOf(a.titel) + 99) % 99 - (NYT_ORDEN.indexOf(b.titel) + 99) % 99).slice(0, 3);
  // Placering: kunderådet savnede gennemsnittet ved siden af navnesøgningen. Ærligt, men rolig tone.
  if (gsc?.position && gsc.position > 0)
    nogletal.push({
      label: "Typisk placering i Google",
      vaerdi: `nr. ${Math.max(1, Math.round(gsc.position))}`,
      forklaring: "I snit over alle søgninger, hvor I blev vist. De brede søgninger trækker ned, og det er dem, vi arbejder på at rykke.",
    });
  if (hero.pil === "op" && hero.foer && !nyt.some((n) => n.titel === "Flere besøg fra Google"))
    godt.push({
      titel: "Flere finder jer",
      tekst: `${hero.tal} ${hero.enhed} mod ${hero.foer} i perioden før.`,
    });
  const navnSoeg = gsc?.topQueries.find(
    (q) => q.clicks > 0 && q.position > 0 && q.position < 3.5,
  );
  if (navnSoeg)
    godt.push({
      titel: "I ligger helt i toppen",
      tekst: `Søger man "${navnSoeg.query}", står I typisk som nr. ${Math.max(1, Math.round(navnSoeg.position))}. Det gav ${nf(navnSoeg.clicks)} besøg.`,
    });
  // Uden Google-tal siger hero'en allerede det samme; så gentager kortet det ikke.
  if (ialt > 0 && ok / ialt >= 0.8 && variant === "med-adgang")
    godt.push({
      titel: ok === ialt ? `Alle ${ialt} ting er på plads` : input.vedligeholder ? `${ok} ting er på plads` : `${ok} af ${ialt} ting er på plads`,
      tekst: "Det er alt det, der afgør om folk kan finde jer og kontakte jer.",
    });
  const ai = m.ai_naevninger;
  if (ai && ai.spurgt > 0 && ai.naevnt / ai.spurgt >= 0.6 && godt.length < 4) {
    const eks = ai.spoergsmaal.find((x) => x.naevnt)?.q;
    godt.push({
      titel: ai.naevnt === ai.spurgt ? "AI anbefaler jer" : "AI kender jer",
      tekst: `Vi spurgte AI som ChatGPT ${ai.spurgt} ting, en kunde kunne spørge om${eks ? `, fx "${eks}"` : ""}. I blev nævnt ${ai.naevnt} af ${ai.spurgt} gange.`,
    });
  }
  const anm = input.anmeldelser;
  if (anm?.rating && anm.rating >= 4.5 && anm.antal >= 20 && godt.length < 4)
    godt.push({
      titel: "Kunderne er glade",
      tekst: `${komma(anm.rating)} stjerner i snit fra ${nf(anm.antal)} anmeldelser på Google.`,
    });
  for (const k of [
    "svartid",
    "viewport",
    "brudte_links",
    "schema",
    "kontaktlinks",
    "sitemap",
    "billeder_alt",
  ]) {
    const p = efter.get(k);
    const t = PUNKT[k];
    if (!p || !t || status(p) !== "ok" || godt.length >= 4) continue;
    godt.push({ titel: t.navn, tekst: t.ok(vaerdiTekst(p)) });
  }

  // Det har vi gjort: aldrig tomt, aldrig "vi har ikke ændret noget". Kun ting der er sket.
  const gjort = [
    ...rettet,
    ...input.arbejde.filter((s) => s.trim()).slice(0, 8),
    ...gjortOversigt(m),
    ...(m.ai_naevninger?.spurgt
      ? [`Spurgt AI ${m.ai_naevninger.spurgt} spørgsmål, som jeres kunder kunne stille, og set om I blev nævnt.`]
      : []),
    ...(variant === "med-adgang"
      ? [
          "Fulgt jeres tal fra Google: hvor mange der ser jer, klikker ind, og hvad de søger på.",
        ]
      : []),
  ];

  // Næste gang: resten af problemerne + manglende ekstra-punkter. Uden pres.
  const iVigtigste = new Set(
    (m.vigtigste ?? []).slice(0, 3).map((v) => v.punkt),
  );
  const naesteGang: string[] = [];
  for (const p of m.punkter) {
    const t = PUNKT[p.punkt];
    if (!t || input.vedligeholder || iVigtigste.has(p.punkt) || naesteGang.length >= 3) continue;
    const s = status(p);
    if (
      BONUS.has(p.punkt)
        ? s !== "ikke_maalt" && !bonusFindes(p)
        : s === "obs" || s === "fejl"
    )
      naesteGang.push(`${t.navn}: ${t.goer}`);
  }

  const ide = anmeldelsesIde(anm);
  if (ide) naesteGang.unshift(ide);
  if (ai && ai.spurgt > 0 && ai.naevnt / ai.spurgt < 0.6)
    naesteGang.unshift(
      `Bliv nævnt oftere, når folk spørger AI: I blev nævnt ${ai.naevnt} af ${ai.spurgt} gange. Flere folk spørger ChatGPT i stedet for at google. Vi kan arbejde med, hvad AI læser om jer.`,
    );

  const googleKort = (() => {
    const tt = efter.get("title");
    const md = efter.get("meta_description");
    const citat = (p?: MaalePunkt) => {
      const mm = p ? vaerdiTekst(p).match(/^"(.*)"\s*\(\d+ tegn\)$/) : null;
      return mm ? mm[1] : "";
    };
    const titel = citat(tt);
    return titel ? { titel, beskrivelse: citat(md), adresse: domaene } : null;
  })();

  const kilde =
    m.kilde === "direkte"
      ? `Vi har målt jeres forside ${datoLang(m.maalt)} direkte fra vores egen server.`
      : `Vi har målt jeres forside ${datoLang(m.maalt)}. Jeres side afviste vores server den dag, så teksten blev læst gennem en uafhængig læser, og hastigheden står som ikke målt.`;
  const maalt = [
    kilde,
    variant === "med-adgang"
      ? "Tallene for besøg og søgninger kommer direkte fra Google. Google er et par dage bagud, derfor slutter perioden lidt før i dag."
      : "Tallene for besøg fra Google er ikke med, fordi vi ikke har adgang til dem.",
    "Kan vi ikke måle noget, står der ikke målt. Vi gætter aldrig et tal.",
  ];

  const udenAdgang =
    variant === "uden-adgang"
      ? "Giver I os lov til at se jeres tal fra Google, kommer der også med, hvor mange der finder jer, og hvad de søger på. Det kræver to minutter hos jer, og I kan altid trække det tilbage."
      : null;

  return {
    kunde,
    logo: input.logo ?? null,
    domaene,
    maaned,
    maanedNavn: maanedNavn(maaned),
    maaltDato: datoLang(m.maalt),
    variant,
    nulpunkt,
    nulpunktTekst: nulpunkt
      ? hero.pil
        ? "Det er første gang, vi måler jeres side sådan her. Besøgene fra Google kan vi sammenligne med perioden før, fordi Google gemmer tallene. Alt det andet får pile fra næste måned."
        : "Det er første gang, vi måler jeres side sådan her. Fra næste måned viser pilene, om tallene går op eller ned."
      : null,
    hero,
    vigtigste,
    vigtigsteNote,
    haster: vigtigste.some((f) => f.alvor === "Tager vi først"),
    rettet,
    arbejde: input.arbejde.filter((s) => s.trim()).slice(0, 8),
    gjort,
    nyt,
    nogletal,
    ugeKlik: uger,
    soegeord,
    sider,
    godt,
    tjek: tjek.filter((g) => g.linjer.length),
    iOrden: { ok, ialt: input.vedligeholder ? ok : ialt },
    googleKort,
    naesteGang,
    udenAdgang,
    maalt,
    personlig: { note: input.note?.trim() || null, afslutning: PERSONLIG_AFSLUTNING },
    mail: mailTekst(
      input.hilsen?.trim() || kunde,
      domaene,
      maanedNavn(maaned),
      vigtigste,
      nulpunkt,
      godt,
      [...rettet, ...input.arbejde.filter((s) => s.trim()).slice(0, 8)],
      nyt,
      input.note?.trim() || "",
      hero.enhed === "besøg fra Google" ? hero.tal : null,
      // Skjulte småfejl: mailen må så ikke sige "alt var i orden".
      !!input.vedligeholder && (m.vigtigste?.length ?? 0) > vigtigste.length,
    ),
  };
}

const komma = (n: number) => n.toLocaleString("da-DK", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** "Det har vi gjort": hvad månedens tjek dækkede, i hverdagssprog. Kun grupper med målte punkter. */
function gjortOversigt(m: Maaling): string[] {
  const maalt = new Set(m.punkter.filter((p) => PUNKT[p.punkt] && status(p) !== "ikke_maalt").map((p) => PUNKT[p.punkt].gruppe));
  const dato = datoLang(m.maalt);
  return [
    maalt.has("google") && `Tjekket at Google kan finde, læse og vise jeres sider (${dato}).`,
    maalt.has("ai") && "Tjekket at AI som ChatGPT og Googles AI-svar kan finde og forstå jer.",
    maalt.has("gaester") && "Målt hvor hurtigt siden åbner, og prøvet links og kontaktknapper af på mobil.",
  ].filter((s): s is string => !!s);
}

/** Idé kunden selv kan mærke og vi kan hjælpe med: flere/bedre Google-anmeldelser. */
export function anmeldelsesIde(a: RapportInput["anmeldelser"]): string | null {
  if (!a) return null;
  const snit = a.rating ? ` med ${komma(a.rating)} stjerner i snit` : "";
  if (a.antal < 50)
    return `Flere anmeldelser på Google: I har ${nf(a.antal)} anmeldelser${snit}. Anmeldelser er noget af det, der får flest til at vælge jer frem for andre. Vi kan sætte en nem måde op, så kunderne bliver spurgt, når de er glade.`;
  if (a.rating && a.rating < 4.3)
    return `Svar på anmeldelserne på Google: I har ${nf(a.antal)} anmeldelser${snit}. Nye kunder læser svarene, også på de sure. Vi kan hjælpe med at skrive dem.`;
  return null;
}

function mailTekst(
  hilsen: string,
  domaene: string,
  maaned: string,
  vigtigste: Fund[],
  nulpunkt: boolean,
  godt: RapportModel["godt"],
  lavet: string[],
  nyt: RapportModel["nyt"],
  note = "",
  besoeg: string | null = null,
  smaating = false,
): RapportModel["mail"] {
  const mdr = maaned.split(" ")[0];
  const haster = vigtigste.some((f) => f.alvor === "Tager vi først");
  // Emnet er grunden til at åbne mailen: det nye først, så det gode. Aldrig samme emne hver måned.
  // Kunderådet: besøgstallet er det, en ejer går op i. Det slår en tjekliste i emnet.
  const krog = nyt[0]?.titel ?? (besoeg && besoeg !== "0" ? `${besoeg} fandt jer via Google` : godt[0]?.titel);
  const emne = haster
    ? `Jeres side i ${mdr}: det har vi allerede gang i`
    : `Jeres side i ${mdr}: ${krog ? krog[0].toLowerCase() + krog.slice(1) : "alt i orden"}`;
  const nyhed = nyt.length ? `Det er nyt siden sidst:\n${nyt.map((n) => `${n.titel}. ${n.tekst}`).join("\n")}\n\n` : "";
  const punkter = vigtigste
    .map((f, i) => `${i + 1}) ${f.tekst} ${f.goer}`)
    .join("\n");
  const start = nulpunkt
    ? `Hej ${hilsen}. Her er den første månedsrapport for ${domaene}. Den er vores nulpunkt, så næste måned kan I se, hvordan tallene flytter sig.`
    : `Hej ${hilsen}. Jeg har kigget ${domaene} igennem, som jeg plejer.`;
  const besoegLinje = besoeg && besoeg !== "0" ? `${besoeg} fandt jer via Google de seneste fire uger.\n\n` : "";
  // Det gode først, så det der kan blive bedre (Lucas 28/9). Haster noget, siges det lige ud.
  const gode = godt
    .slice(0, 2)
    .map((g) => `${g.titel}. ${g.tekst}`)
    .join("\n");
  const bedre = vigtigste.length
    ? `${haster ? "Det tager vi os af først" : vigtigste.length === 1 ? "Én ting kan blive endnu bedre" : "Et par ting kan blive endnu bedre"}:\n${punkter}${haster ? "\nDen første er den vigtigste, så den går vi i gang med nu." : ""}`
    : smaating
      ? "Vi holder løbende øje med siden og retter småting, så snart vi ser dem."
      : "Alt, vi tjekker, var i orden denne gang.";
  const midt = haster
    ? `${bedre}\n\n${gode ? `Det gode:\n${gode}` : ""}`
    : `${gode ? `Det går godt:\n${gode}\n\n` : ""}${bedre}`;
  // Det vi faktisk har lavet (rettet siden sidst + Lucas' egne linjer): det er dét, der gør 999 kr synlige.
  const gjort = lavet.length ? `\n\nDet har vi lavet siden sidst:\n${lavet.map((l) => `- ${l}`).join("\n")}` : "";
  // Kunderådet: "I skal ikke gøre noget" må ikke læses som "vi ændrer uden at spørge".
  const lyd = vigtigste.some((f) => f.synlig) ? "\n\nVi giver lige lyd, før vi ændrer noget, I kan se på siden." : "";
  const tekst = `${start}\n\n${besoegLinje}${nyhed}${midt.trim()}${lyd}${gjort}${note ? `\n\n${note}` : ""}\n\nResten står i den vedhæftede rapport. Sig endelig til, hvis der er noget, I vil have mig til at kigge på. Ingen pres.\n\nLucas`;
  return { emne, tekst };
}

// ---------------------------------------------------------------- sprogvagt

/** Fagord og tegn der aldrig må stå i kundens rapport (Lucas 28/9). */
export const FORBUDT =
  /\b(canonical|schema|markup|crawl\w*|kravl\w*|indekser\w*|ctr|impressions?|snippet|serp|geo|aeo|sitemap|robots|meta|h1|h2|alt-tekst|llms|json|search console|seo)\b|—|–/i;

/** Al tekst vi selv har skrevet i modellen (ikke kundens egne citater i googleKort, ikke søgeord). */
export function voresTekst(r: RapportModel): string[] {
  const out: string[] = [
    r.nulpunktTekst ?? "",
    r.hero.enhed,
    r.hero.saetning,
    r.vigtigsteNote,
    r.udenAdgang ?? "",
    r.mail.emne,
    r.mail.tekst,
    ...r.rettet,
    ...r.gjort,
    ...r.nyt.flatMap((n) => [n.titel, n.tekst]),
    ...r.naesteGang,
    ...r.maalt,
  ];
  for (const f of r.vigtigste)
    out.push(f.titel, f.tekst, f.betyder, f.goer, f.alvor);
  for (const n of r.nogletal) out.push(n.label, n.forklaring);
  for (const g of r.godt) out.push(g.titel, g.tekst);
  for (const g of r.tjek)
    for (const l of g.linjer) out.push(g.gruppe, l.navn, l.tekst);
  return out.filter(Boolean);
}

export function sprogFejl(r: RapportModel): string[] {
  return voresTekst(r).filter((t) => FORBUDT.test(t));
}
