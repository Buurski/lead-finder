// marketing-types.ts — rene typer og konstanter til /marketing (ingen db, ingen server-only:
// klient-komponenter må importere den).

export const TRACKS = ["faceless", "duo", "dag-n"] as const;
export type Track = (typeof TRACKS)[number];
export const TRACK_LABEL: Record<Track, string> = {
  faceless: "Faceless / AI",
  duo: "Lucas + Charlie",
  "dag-n": "Dag N af at bygge Kinly",
};
export const TRACK_NOTE: Record<Track, string> = {
  faceless: "Hovedsporet nu: ingen ansigter, kun tekst, vores egen side og AI.",
  duo: "Fase 2. Kræver Charlies ja, før noget optages eller godkendes.",
  "dag-n": "Byg offentligt: hver dag hænger på ét synligt resultat.",
};

export const DRAFT_STATUSES = ["kladde", "godkendt", "postet", "droppet"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];
export const STATUS_LABEL: Record<DraftStatus, string> = {
  kladde: "Kladde",
  godkendt: "Godkendt",
  postet: "Postet",
  droppet: "Droppet",
};

export const LABELS = ["", "NU", "TEST", "SENERE"] as const;
export const PRIORITY_LABEL: Record<number, string> = { 1: "Høj", 2: "Mellem", 3: "Lav" };

// Musik: Kinly er en erhvervskonto. Trending lyd findes ikke som valg (W5, Lucas 10/10).
export const MUSIC_KINDS = ["ingen", "original-lyd", "licenseret"] as const;
export type MusicKind = (typeof MUSIC_KINDS)[number];
export const MUSIC_LABEL: Record<MusicKind, string> = {
  ingen: "Lydløs / ingen musik",
  "original-lyd": "Original lyd (egen stemme eller stille)",
  licenseret: "Licenseret musik",
};
export const MUSIC_LICENSE_OK = "erhverv-ok";

export interface DraftDto {
  id: string;
  extKey: string | null;
  track: Track;
  title: string;
  hook: string;
  script: string;
  shotlist: string;
  caption: string;
  label: string;
  priority: number;
  score: number | null;
  status: DraftStatus;
  plannedFor: string | null;
  lengthS: number | null;
  musicKind: MusicKind;
  musicLicense: string;
  musicNote: string;
  customerCase: boolean;
  customerOk: boolean;
  charlieOk: boolean;
  trueCheckedOn: string | null;
  /** Link til det rigtige opslag (skrives, når kladden markeres postet). Tom = ikke gemt. */
  postUrl: string;
  risk: string;
  note: string;
  source: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export type RefKind = "hook" | "ab" | "inspiration" | "note";
export interface RefDto {
  id: string;
  extKey: string | null;
  kind: RefKind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: string;
  createdBy: string;
  createdAt: string;
}

export interface MeasureDto {
  id: string;
  postedOn: string;
  draftId: string | null;
  abId: string | null;
  arm: string;
  parId: string;
  armAssigned: string;
  postUrl: string;
  views: number | null;
  saves: number | null;
  shares: number | null;
  newFollowers: number | null;
  profileVisits: number | null;
  linkClicks: number | null;
  inquiries: number | null;
  skipPct: number | null;
  fullViewPct: number | null;
  watchS: number | null;
  note: string;
  createdBy: string;
  createdAt: string;
}

export const AB_STATUSES = ["planlagt", "kører", "afsluttet"] as const;

/** Hvad der mangler, før en kladde må godkendes. Hver mangel har en nøgle, så UI'et kan vise det rigtige felt lige ved knappen. */
export type ApprovalKey = "hook" | "placeholder" | "charlie" | "customer" | "true" | "license";
export interface ApprovalIssue {
  key: ApprovalKey;
  text: string;
}
export function approvalIssues(d: Pick<DraftDto, "hook" | "track" | "charlieOk" | "customerCase" | "customerOk" | "musicKind" | "musicLicense" | "trueCheckedOn">): ApprovalIssue[] {
  const out: ApprovalIssue[] = [];
  if (!d.hook.trim()) out.push({ key: "hook", text: "Hooket mangler." });
  else if (hasPlaceholder(d.hook)) out.push({ key: "placeholder", text: "Hooket har en pladsholder som [N]. Fyld det rigtige tal i først." });
  if (d.track === "duo" && !d.charlieOk) out.push({ key: "charlie", text: "Charlie skal have sagt ja (skriftligt) til ansigt, navn og ord." });
  if (d.customerCase && !d.customerOk) out.push({ key: "customer", text: "Kundens skriftlige ok mangler." });
  if (!d.trueCheckedOn) out.push({ key: "true", text: "Sæt en dato under \"Sandt i dag?\", når du har tjekket, at alt i videoen er sandt." });
  if (d.musicKind === "licenseret" && d.musicLicense !== MUSIC_LICENSE_OK) out.push({ key: "license", text: `Musikken skal have licensen "${MUSIC_LICENSE_OK}".` });
  return out;
}
/** Samme regler som approvalIssues, kun som tekst (serveren og de gamle kald). Tom liste = klar. */
export function approvalBlockers(d: Parameters<typeof approvalIssues>[0]): string[] {
  return approvalIssues(d).map((i) => i.text);
}
/** "[N]" / "[målt tal]" i en hook må aldrig renderes ufyldt. */
const PLACEHOLDER = /\[[^\]\n]{1,24}\]/;
export const hasPlaceholder = (t: string) => PLACEHOLDER.test(t);
/** Alle pladsholdere i en tekst, i rækkefølge ("[N]", "[målt tal]"). */
export const placeholders = (t: string): string[] => t.match(new RegExp(PLACEHOLDER, "g")) ?? [];
/** Erstatter pladsholderne én for én med de tal, der er skrevet. En pladsholder uden tal bliver stående. */
export function fillPlaceholders(t: string, values: string[]): string {
  let i = 0;
  return t.replace(new RegExp(PLACEHOLDER, "g"), (m) => {
    const v = (values[i++] ?? "").trim();
    return v === "" ? m : v;
  });
}

// ---------------------------------------------------------------- kundecase

/** Kunder og eksempler, vi kender. Nævner en kladde et af navnene, er den en kundecase og kræver kundens ja. */
export const CUSTOMER_NAMES = [
  "VIDA", "Ikast Autoservice", "Ikast Auto Service", "Ikastautoservice", "Jernbanecafeen", "Jernbane Cafe", "Lej en Kok",
  "KT VVS", "Den Lille Maler", "Zappa", "Salon Artec", "Street Cut", "MidtAdvokaterne",
] as const;
/** Små bogstaver, uden accenter og tegnsætning: "Jernbanecaféen!" og "jernbanecafeen" er det samme. */
const norm = (t: string) => t.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
/** Nævner teksten en kunde? Hele navne som hele ord ("vida-klinik.dk" tæller, "evidans" gør ikke). */
export function mentionsCustomer(...parts: Array<string | undefined | null>): boolean {
  const text = ` ${norm(parts.filter(Boolean).join(" "))} `;
  return CUSTOMER_NAMES.some((n) => text.includes(` ${norm(n)} `));
}

// ---------------------------------------------------------------- dublet-tjek (hooks → kladde)

/** Findes der allerede en kladde med samme hook? Sammenlignes uden store/små bogstaver, citationstegn og tegnsætning. */
export function findDraftByHook<T extends { hook: string }>(drafts: T[], hook: string): T | undefined {
  const k = norm(hook);
  if (!k) return undefined;
  return drafts.find((d) => norm(d.hook) === k);
}

/** Hverdagsforklaringer til fagord (ⓘ i UI'et). Intet internt: ingen datoer for beslutninger, ingen interne koder. */
export const EXPLAIN = {
  label: "NU, TEST og SENERE er det første forslag til rækkefølge. NU: tag den først. TEST: prøv den som en test. SENERE: lad den vente. Prioritet (Høj, Mellem, Lav) er din egen rækkefølge, og det er den, der bestemmer, hvad der står øverst.",
  skaer: "Skær betyder, at vi stopper den dårligste udgave og beholder den bedste. Det sker først, når der er mindst 5 opslag på hver side, og den ene er mindst 25 % dårligere.",
  median: "Median er midtertallet. Sorterer du alle opslagenes tal fra lavest til højest, er medianen det i midten. Ét heldigt opslag flytter den næsten ikke, i modsætning til et gennemsnit.",
  moenster: "Et mønster er den opskrift, et hook følger, fx P2. Opskrifterne står under Inspiration, med belæg for, hvor godt de har klaret sig.",
  belaeg: "Belæg viser, hvor godt et mønster er dokumenteret i videoer, der har klaret sig. A er stærkest: mindst to opslag over 100.000 visninger på mindst to konti. B: ét opslag over 100.000 eller stabilt på én konto. C: kun små tal. U: ingen tal, kun en beskrivelse.",
  dagN: "Dag N betyder dag nummer N i en serie, hvor vi hver dag viser ét synligt resultat fra at bygge Kinly. N skiftes ud med dagens nummer.",
} as const;

/** To personer rettede samme kladde samtidig. Mappes til HTTP 409. */
export class MarketingConflictError extends Error {}
