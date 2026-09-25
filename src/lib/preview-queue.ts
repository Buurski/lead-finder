import { store } from "./store.ts";
import { withLock } from "./send-safety.ts";

export const PREVIEW_STATUSES = [
  "ny",
  "researcher",
  "bygger",
  "preview klar",
  "godkendt",
  "kladde klar",
  "afvist",
  "sendt/lukket",
] as const;
export type PreviewStatus = (typeof PREVIEW_STATUSES)[number];
export type PreviewChannel = "formular" | "mail";

export interface PreviewRequestInput {
  company: string;
  channel: PreviewChannel;
  email: string;
  website?: string;
  /** Telefon fra kinly.dk (fx SEO-tjek-formularen). Valideret af sitet; her kun trimmet. */
  phone?: string;
  contactName?: string;
  branch?: string;
  questionnaire?: string;
  sourceMessageId?: string;
  demoKey?: string;
  /** Resultatet af det gratis SEO-tjek på kinly.dk (struktureret; bruges i rapport-mailen). */
  seoTjek?: SeoTjekResult;
  /** Samtykkebevis til nyhedsbrevet. Tilmelder IKKE: det sker først efter double opt-in i Brevo. */
  newsletterConsent?: NewsletterConsent;
}

export interface SeoTjekResult {
  host: string;
  score: number;
  mangler: string[];
}

export interface NewsletterConsent {
  at: string;
  source: string;
  textVersion: string;
  ipHash: string;
}

const HOST_RE = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const s = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\r\n]+/g, " ").trim().slice(0, max) : "");

function hostOf(url: string | undefined): string {
  try {
    return url ? new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase() : "";
  } catch {
    return "";
  }
}

/** Kun et gyldigt resultat slipper igennem (offentlig formular bag en delt hemmelighed). */
export function cleanSeoTjek(v: unknown): SeoTjekResult | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const host = s(r.host, 100).toLowerCase();
  const score = typeof r.score === "number" && Number.isFinite(r.score) ? Math.round(r.score) : NaN;
  if (!HOST_RE.test(host) || !(score >= 0 && score <= 100)) return undefined;
  const mangler = (Array.isArray(r.mangler) ? r.mangler : []).map((m) => s(m, 120)).filter(Boolean).slice(0, 8);
  return { host, score, mangler };
}

export function cleanNewsletterConsent(v: unknown): NewsletterConsent | undefined {
  if (!v || typeof v !== "object") return undefined;
  const r = v as Record<string, unknown>;
  const at = s(r.at, 40);
  const textVersion = s(r.textVersion, 60);
  const ipHash = s(r.ipHash, 64);
  if (!at || Number.isNaN(Date.parse(at)) || !/^nb-v\d+/.test(textVersion) || !/^[0-9a-f]{16,64}$/.test(ipHash)) return undefined;
  return { at, source: s(r.source, 60) || "kinly.dk", textVersion, ipHash };
}

export interface PreviewRequest extends PreviewRequestInput {
  id: string;
  status: PreviewStatus;
  noindex: true;
  createdAt: string;
  updatedAt: string;
  research?: string;
  previewUrl?: string;
  screenshotUrl?: string;
  mailDraft?: string;
  approvedAt?: string;
  rejectedAt?: string;
  // Human-review feedback fra Lucas/Charlie på previewet (reel-idé DcWsaXfgKiW,
  // minimal udgave: fritekst i stedet for inline-kommentarer på siden).
  reviewNotes?: string;
  // Jev-profil (stil/størrelse/ambition) til Hermes' valg af referencer — se hq/draft-profile.ts.
  profile?: import("./hq/draft-profile.ts").DraftProfile;
}

const KEY = "preview-requests";

function id(): string {
  return `preview_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function demoKey(): string {
  return `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
}

// Nødlog: kan køens lås ikke tages (Postgres nede), lægges henvendelsen her med atomisk append
// og foldes ind i arrayet ved næste låste skrivning. Arrayets version vinder altid (Sol R8-03, R9-01).
const FALLBACK = "preview-requests-fallback";

/** Lageret kunne ikke tage imod henvendelsen — ruten svarer 503 (prøv igen), ikke 400. */
export class PreviewStorageError extends Error {}

export async function readPreviewRequests(): Promise<PreviewRequest[]> {
  const value = await store.get<PreviewRequest[]>(KEY);
  const records = Array.isArray(value) ? value : [];
  // Fejl ved læsning af nødloggen kastes — et delvist svar ville skjule henvendelser (Sol R10-01).
  const extra = (await store.readAll(FALLBACK)) as PreviewRequest[];
  const known = new Set(records.map((r) => r.id));
  return [...records, ...extra.filter((r) => r && typeof r.id === "string" && !known.has(r.id))];
}

// Alle læs-ændr-skriv af KV-arrayet sker under én lås, så samtidige henvendelser ikke
// overskriver hinanden (Sol R7-03). ponytail: global lås; nøgle pr. id hvis trafikken vokser.
const QUEUE_LOCK = "preview-queue";

export async function createPreviewRequest(input: PreviewRequestInput): Promise<PreviewRequest> {
  const company = input.company.trim();
  const email = input.email.trim().toLowerCase();
  if (!company || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("company og gyldig email er påkrævet");
  }
  const now = new Date().toISOString();
  const record: PreviewRequest = {
    id: id(),
    company,
    channel: input.channel,
    email,
    website: input.website?.trim() || undefined,
    phone: input.phone?.trim().slice(0, 40) || undefined,
    contactName: input.contactName?.trim() || undefined,
    branch: input.branch?.trim() || undefined,
    questionnaire: input.questionnaire?.trim() || undefined,
    sourceMessageId: input.sourceMessageId?.trim() || undefined,
    demoKey: input.demoKey?.trim() || demoKey(),
    // Resultatet skal høre til den side henvendelsen handler om (Sol w4a R2) — ellers droppes det.
    seoTjek: ((r) => (r && hostOf(input.website) === hostOf(r.host) ? r : undefined))(cleanSeoTjek(input.seoTjek)),
    newsletterConsent: cleanNewsletterConsent(input.newsletterConsent),
    status: "ny",
    noindex: true,
    createdAt: now,
    updatedAt: now,
  };
  const append = async () => {
    const records = await readPreviewRequests();
    await store.put(KEY, [...records, record]);
  };
  // En henvendelse må aldrig tabes fordi låsen (Postgres) er nede: så atomisk append til nødloggen.
  // Fejler også den, kaster vi — ruten svarer fejl, og formularen beder om at prøve igen.
  await withLock(QUEUE_LOCK, append).catch(async (error) => {
    console.error(JSON.stringify({ evt: "preview.queue_lock_failed", error: String(error).slice(0, 200) }));
    await store.append(FALLBACK, record).catch((e) => {
      throw new PreviewStorageError(`kunne ikke gemme henvendelsen: ${String(e).slice(0, 120)}`);
    });
  });
  return record;
}

export async function updatePreviewStatus(
  requestId: string,
  status: PreviewStatus,
  fields: Partial<Pick<PreviewRequest, "research" | "previewUrl" | "screenshotUrl" | "mailDraft" | "contactName" | "branch" | "questionnaire" | "company" | "demoKey" | "reviewNotes">> = {},
): Promise<PreviewRequest | null> {
  return withLock(QUEUE_LOCK, async () => {
    const records = await readPreviewRequests();
    const index = records.findIndex((item) => item.id === requestId);
    if (index < 0) return null;
    const current = records[index];
    const definedFields = Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ) as Partial<Pick<PreviewRequest, "research" | "previewUrl" | "screenshotUrl" | "mailDraft" | "contactName" | "branch" | "questionnaire" | "company" | "demoKey" | "reviewNotes">>;
    const next: PreviewRequest = {
      ...current,
      ...definedFields,
      status,
      ...(status === "godkendt" ? { approvedAt: new Date().toISOString() } : {}),
      ...(status === "afvist" ? { rejectedAt: new Date().toISOString() } : {}),
      updatedAt: new Date().toISOString(),
    };
    records[index] = next;
    await store.put(KEY, records);
    return next;
  });
}

/** Gem Jev-profilen uden at røre status. */
export async function setPreviewProfile(requestId: string, profile: NonNullable<PreviewRequest["profile"]>): Promise<void> {
  await withLock(QUEUE_LOCK, async () => {
    const records = await readPreviewRequests();
    const r = records.find((item) => item.id === requestId);
    if (!r) return;
    r.profile = profile;
    await store.put(KEY, records);
  });
}
