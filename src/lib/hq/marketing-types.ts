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
  faceless: "Hovedsporet nu: ingen ansigter, kun tekst, vores egen side og AI. Valgt 10/10.",
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

/** Hvad der mangler, før en kladde må godkendes. Tom liste = klar. Samme regler på server og i UI. */
export function approvalBlockers(d: Pick<DraftDto, "hook" | "track" | "charlieOk" | "customerCase" | "customerOk" | "musicKind" | "musicLicense" | "trueCheckedOn">): string[] {
  const out: string[] = [];
  if (!d.hook.trim()) out.push("Hooket mangler.");
  else if (hasPlaceholder(d.hook)) out.push("Hooket har en pladsholder som [N]. Fyld det rigtige tal i først.");
  if (d.track === "duo" && !d.charlieOk) out.push("Charlie skal have sagt ja (skriftligt) til ansigt, navn og ord.");
  if (d.customerCase && !d.customerOk) out.push("Kundens skriftlige ok mangler.");
  if (!d.trueCheckedOn) out.push("Sæt en dato under \"Sandt i dag?\", når du har tjekket, at alt i videoen er sandt.");
  if (d.musicKind === "licenseret" && d.musicLicense !== MUSIC_LICENSE_OK) out.push(`Musikken skal have licensen "${MUSIC_LICENSE_OK}".`);
  return out;
}
/** "[N]" / "[målt tal]" i en hook må aldrig renderes ufyldt. */
export const hasPlaceholder = (t: string) => /\[[^\]\n]{1,24}\]/.test(t);

/** To personer rettede samme kladde samtidig. Mappes til HTTP 409. */
export class MarketingConflictError extends Error {}
