// Delt mellem alle Indbakke-komponenter. Mirror af QueueDraft (src/lib/queue.ts)
// — holdt lokal så disse client-komponenter ikke trækker server-only imports.
// INGEN ændringer i felter/betydning ift. det gamle /approve — kun UI'et er nyt.

export interface Demo {
  label: string;
  url: string;
}

export type DraftStatus = "pending" | "approved" | "edited" | "rejected" | "sending" | "sent";

export interface QueueDraft {
  id: string;
  leadId: string;
  name: string;
  branch: string;
  city: string;
  hooks: string[];
  demoPair: Demo[];
  professionalism: string;
  subject: string;
  body: string;
  status: DraftStatus;
  recipientEmail?: string;
  source: string;
  createdAt: string;
  updatedAt: string;
  sender?: "lucas" | "charlie";
  sentBy?: "lucas" | "charlie";
  jev?: {
    lead: number | null;
    draft: number | null;
    flags: string[];
    grade?: "A" | "B" | "C" | "?";
    priority?: number | null;
    links?: { kind: "web" | "maps" | "facebook" | "instagram" | "mail"; label: string; href: string }[];
    facts?: string[];
    followers?: string | null;
  };
  history?: {
    seenBefore: boolean;
    reason: string;
    lastContactAt?: string | null;
    daysSince?: number | null;
    replied?: "ja" | "nej" | "aldrig";
    warmth?: "varm" | "lun" | "kold" | "død";
  };
  // Opfølgnings-sekvenser (spec §11, backend landet 2026-09-22). Findes ikke
  // i ældre kladder/lokal DB endnu — altid valgfrie, UI'et virker uden dem.
  // source === "opfoelgning" identificerer en opfølgnings-kladde; step er
  // 2..5 (trin 1 er selve den første kolde mail, ikke en opfølgning).
  step?: number;
  angle?: "gratis_udkast" | "seo_tjek" | "eksempel" | "sidste";
  stoppedReason?: string;
  /** Modtageren send-ruten vil bruge ("" = mangler mail). Sat af GET /api/approve/queue. */
  to?: string;
}

// De 5 faner i det nye mail-app-layout. Opfølgnings-trin/vinkel-tekst
// ("Opfølgning 2/5 · Gratis udkast") kommer allerede færdigformateret fra
// backend i draft.professionalism (followUpDraft() i src/lib/hq/sequence.ts)
// — ingen lokal konstant til at genopbygge den streng.
export type Tab = "pending" | "approved" | "followups" | "sent" | "rejected";

// Rækkefølge + navne som Lucas bad om (opgave-kontrakt 23/9): Til godkendelse
// · Opfølgninger · Godkendt · Sendt · Stoppet. "Stoppet" dækker BÅDE manuelt
// afviste kladder og sekvenser systemet selv stoppede (stoppedReason, spec §11)
// — begge betyder "ikke længere aktiv", som er hvad fanen faktisk viser.
export const TAB_ORDER: Tab[] = ["pending", "followups", "approved", "sent", "rejected"];
export const TAB_META: Record<Tab, string> = {
  pending: "Til godkendelse",
  followups: "Opfølgninger",
  approved: "Godkendt",
  sent: "Sendt",
  rejected: "Stoppet",
};

// Jev-prioritet: kladde-kvalitet vejer tungest, lead-attraktivitet er
// sekundær. Ingen vurdering endnu (null) → -1 så uvurderede lægger sig
// sidst, ikke midt i feltet (vi VED ikke at de er gennemsnitlige).
export function jevPriority(d: QueueDraft): number {
  return d.jev?.priority ?? -1;
}

export const WARMTH_META: Record<string, { label: string; fg: string; bg: string }> = {
  varm: { label: "varm", fg: "var(--amber)", bg: "var(--amber-dim)" },
  lun: { label: "lun", fg: "var(--text-muted)", bg: "var(--bg-3)" },
  kold: { label: "kold", fg: "var(--blue)", bg: "var(--blue-dim)" },
  død: { label: "✕ svarede nej", fg: "var(--red)", bg: "var(--red-dim)" },
};

export const GRADE_META: Record<string, { fg: string; bg: string; border: string }> = {
  A: { fg: "var(--green)", bg: "var(--bg-2)", border: "var(--green)" },
  B: { fg: "var(--amber)", bg: "var(--amber-dim)", border: "var(--amber)" },
  C: { fg: "var(--text-muted)", bg: "var(--bg-3)", border: "var(--border)" },
  "?": { fg: "var(--text-dim)", bg: "transparent", border: "var(--border)" },
};

export const STATUS_META: Record<DraftStatus, { label: string; fg: string; bg: string }> = {
  pending: { label: "afventer", fg: "var(--amber)", bg: "var(--amber-dim)" },
  approved: { label: "godkendt · klar", fg: "var(--green)", bg: "var(--bg-2)" },
  edited: { label: "redigeret · godkendt", fg: "var(--blue)", bg: "var(--blue-dim)" },
  rejected: { label: "afvist", fg: "var(--red)", bg: "var(--red-dim)" },
  sending: { label: "afstem — tjek Gmail Sendt", fg: "var(--amber)", bg: "var(--amber-dim)" },
  sent: { label: "sendt (test)", fg: "var(--blue)", bg: "var(--blue-dim)" },
};

export function prettyUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export type ActAction = "approve" | "edit" | "reject" | "unapprove" | "set-demos" | "set-sender" | "set-recipient";
export type ActPayload = { subject?: string; body?: string; demoPair?: Demo[]; sender?: "lucas" | "charlie"; recipientEmail?: string };
export type ActFn = (id: string, action: ActAction, payload?: ActPayload) => Promise<{ ok: boolean; violations?: string[] }>;
