// Nyhedsbreve pr. kunde (og Kinlys eget): kun aggregater fra Brevo, aldrig modtagere.
// Snapshots skubbes ind via /api/agent/newsletter-snapshot (HMAC) af et job der selv
// holder Brevo-nøglen — HQ ser aldrig nøglen og kan ikke sende noget.

// Typen står som præfiks i kampagnenavnet i Brevo: "[seo] …", "[nyhedsbrev] …", "[service] …".
export type CampaignType = "seo" | "nyhedsbrev" | "service" | "andet";

export interface CampaignStat {
  id: number;
  name: string;
  type: CampaignType;
  status: "draft" | "scheduled" | "sent" | "other";
  sentAt: string | null; // ISO
  scheduledAt: string | null;
  recipients: number;
  opens: number; // unikke
  clicks: number; // unikke
  unsubscribes: number;
  hardBounces: number;
  softBounces: number;
  complaints: number;
}

export interface NewsletterSnapshotInput {
  account: string;
  companyId: string | null;
  lists: { id: number; name: string; subscribers: number }[];
  campaigns: CampaignStat[];
  domain: { name: string; authenticated: boolean; dkim?: boolean; dmarc?: boolean } | null;
}

// Regler fra nyhedsbrevs-principperne (wiki/os/nyhedsbrev-til-kunder-regler): maks 4-6 om året.
export const MAX_PER_YEAR = 6;
export const MIN_DAYS_BETWEEN = 30;
const UNSUB_FLAG = 0.005; // 0,5 %
const BOUNCE_FLAG = 0.02; // 2 %
const COMPLAINT_FLAG = 0.001; // 0,1 % (Gmail/Yahoo-grænsen er 0,3 %)

export class NewsletterInputError extends Error {}

const EMAIL_RE = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const TYPES: CampaignType[] = ["seo", "nyhedsbrev", "service", "andet"];
const STATUSES = ["draft", "scheduled", "sent", "other"] as const;

function int(v: unknown, label: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0 || v > 10_000_000) throw new NewsletterInputError(`${label} skal være et ikke-negativt heltal`);
  return v;
}
function text(v: unknown, label: string, max: number): string {
  if (typeof v !== "string") throw new NewsletterInputError(`${label} skal være tekst`);
  const t = v.replace(/[\r\n]+/g, " ").trim().slice(0, max);
  // Persondata-værn: et navn på en liste/kampagne må ikke indeholde en mailadresse.
  if (EMAIL_RE.test(t)) throw new NewsletterInputError(`${label} må ikke indeholde en mailadresse`);
  return t;
}
function iso(v: unknown, label: string): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v !== "string" || Number.isNaN(Date.parse(v))) throw new NewsletterInputError(`${label} skal være en dato`);
  return new Date(v).toISOString();
}

/**
 * Streng validering af et snapshot. Ukendte felter afvises (så en fejl i sync-jobbet
 * ikke kan smugle modtagerlister ind), og ingen tekst må ligne en mailadresse.
 */
export function parseSnapshot(raw: unknown): NewsletterSnapshotInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new NewsletterInputError("snapshot skal være et objekt");
  const r = raw as Record<string, unknown>;
  for (const k of Object.keys(r)) if (!["account", "companyId", "lists", "campaigns", "domain", "generatedAt"].includes(k)) throw new NewsletterInputError(`ukendt felt "${k}"`);
  const account = text(r.account, "account", 40).toLowerCase();
  if (!/^[a-z0-9-]{2,40}$/.test(account)) throw new NewsletterInputError("account skal være et kort id (a-z, 0-9, -)");
  const companyId = r.companyId === null || r.companyId === undefined ? null : text(r.companyId, "companyId", 40);
  if (companyId && !/^[0-9a-f-]{36}$/.test(companyId)) throw new NewsletterInputError("companyId skal være en uuid");
  if (!Array.isArray(r.lists) || r.lists.length > 200) throw new NewsletterInputError("lists skal være en liste (maks 200)");
  if (!Array.isArray(r.campaigns) || r.campaigns.length > 500) throw new NewsletterInputError("campaigns skal være en liste (maks 500)");
  const lists = r.lists.map((l, i) => {
    const o = (l ?? {}) as Record<string, unknown>;
    for (const k of Object.keys(o)) if (!["id", "name", "subscribers"].includes(k)) throw new NewsletterInputError(`lists[${i}]: ukendt felt "${k}"`);
    return { id: int(o.id, `lists[${i}].id`), name: text(o.name, `lists[${i}].name`, 120), subscribers: int(o.subscribers, `lists[${i}].subscribers`) };
  });
  const campaigns = r.campaigns.map((c, i): CampaignStat => {
    const o = (c ?? {}) as Record<string, unknown>;
    const allowed = ["id", "name", "type", "status", "sentAt", "scheduledAt", "recipients", "opens", "clicks", "unsubscribes", "hardBounces", "softBounces", "complaints"];
    for (const k of Object.keys(o)) if (!allowed.includes(k)) throw new NewsletterInputError(`campaigns[${i}]: ukendt felt "${k}"`);
    const type = TYPES.includes(o.type as CampaignType) ? (o.type as CampaignType) : "andet";
    const status = STATUSES.includes(o.status as (typeof STATUSES)[number]) ? (o.status as CampaignStat["status"]) : "other";
    const n = (k: string) => (o[k] === undefined ? 0 : int(o[k], `campaigns[${i}].${k}`));
    return {
      id: int(o.id, `campaigns[${i}].id`),
      name: text(o.name, `campaigns[${i}].name`, 160),
      type,
      status,
      sentAt: iso(o.sentAt, `campaigns[${i}].sentAt`),
      scheduledAt: iso(o.scheduledAt, `campaigns[${i}].scheduledAt`),
      recipients: n("recipients"),
      opens: n("opens"),
      clicks: n("clicks"),
      unsubscribes: n("unsubscribes"),
      hardBounces: n("hardBounces"),
      softBounces: n("softBounces"),
      complaints: n("complaints"),
    };
  });
  let domain: NewsletterSnapshotInput["domain"] = null;
  if (r.domain !== null && r.domain !== undefined) {
    const d = r.domain as Record<string, unknown>;
    domain = { name: text(d.name, "domain.name", 120), authenticated: d.authenticated === true, dkim: d.dkim === true, dmarc: d.dmarc === true };
  }
  return { account, companyId, lists, campaigns, domain };
}

export interface NewsletterInsight {
  subscribers: number;
  sentLastYear: number;
  lastSentAt: string | null;
  daysSinceLast: number | null;
  nextAllowedAt: string | null; // tidligste dato der overholder både 30-dages-afstand og 6/år
  drafts: CampaignStat[];
  scheduled: CampaignStat[];
  sent: (CampaignStat & { openRate: number; clickRate: number; unsubRate: number; bounceRate: number })[];
  flags: { level: "haster" | "obs"; text: string }[];
  byType: Record<CampaignType, number>;
}

const DAY = 86_400_000;
// Batch-lister er delmængder af hovedlisten, og Brevos egne standardlister er støj — tælles ikke med (ellers dobbelttælling).
export const isAudienceList = (name: string) => !/\bbatch\s*\d+\s*$/i.test(name) && !/^(identified_contacts|your first list)$/i.test(name.trim());
const rate = (n: number, d: number) => (d > 0 ? n / d : 0);

export function newsletterInsights(s: Pick<NewsletterSnapshotInput, "lists" | "campaigns" | "domain">, now = new Date()): NewsletterInsight {
  const sent = s.campaigns
    .filter((c) => c.status === "sent" && c.sentAt)
    .sort((a, b) => b.sentAt!.localeCompare(a.sentAt!))
    .map((c) => ({
      ...c,
      openRate: rate(c.opens, c.recipients),
      clickRate: rate(c.clicks, c.recipients),
      unsubRate: rate(c.unsubscribes, c.recipients),
      bounceRate: rate(c.hardBounces + c.softBounces, c.recipients),
    }));
  const yearAgo = now.getTime() - 365 * DAY;
  const lastYear = sent.filter((c) => Date.parse(c.sentAt!) >= yearAgo);
  const last = sent[0]?.sentAt ?? null;
  const daysSinceLast = last ? Math.floor((now.getTime() - Date.parse(last)) / DAY) : null;
  // Næste tilladte: 30 dage efter seneste, og — er der allerede 6 på et år — når den ældste af dem fylder et år.
  let next = last ? Date.parse(last) + MIN_DAYS_BETWEEN * DAY : now.getTime();
  if (lastYear.length >= MAX_PER_YEAR) next = Math.max(next, Date.parse(lastYear[MAX_PER_YEAR - 1].sentAt!) + 365 * DAY);
  const flags: NewsletterInsight["flags"] = [];
  const scheduled = s.campaigns.filter((c) => c.status === "scheduled");
  for (const c of scheduled) {
    if (c.scheduledAt && Date.parse(c.scheduledAt) < next) flags.push({ level: "haster", text: `"${c.name}" er planlagt før næste tilladte dato (maks ${MAX_PER_YEAR}/år, ${MIN_DAYS_BETWEEN} dage imellem)` });
  }
  if (lastYear.length > MAX_PER_YEAR) flags.push({ level: "haster", text: `${lastYear.length} udsendelser det seneste år — over grænsen på ${MAX_PER_YEAR}` });
  for (const c of sent.slice(0, 3)) {
    if (c.recipients < 20) continue; // for små tal til at sige noget
    if (rate(c.complaints, c.recipients) > COMPLAINT_FLAG) flags.push({ level: "haster", text: `"${c.name}": ${c.complaints} spamklager — stop og tjek listen` });
    if (c.bounceRate > BOUNCE_FLAG) flags.push({ level: "haster", text: `"${c.name}": ${(c.bounceRate * 100).toFixed(1)} % bounce — listen skal renses` });
    if (c.unsubRate > UNSUB_FLAG) flags.push({ level: "obs", text: `"${c.name}": ${(c.unsubRate * 100).toFixed(1)} % afmeldte sig` });
  }
  if (s.domain && !s.domain.authenticated) flags.push({ level: "haster", text: `Domænet ${s.domain.name} er ikke godkendt i Brevo (DKIM/DMARC) — send intet før det er på plads` });
  const byType = { seo: 0, nyhedsbrev: 0, service: 0, andet: 0 } as Record<CampaignType, number>;
  for (const c of lastYear) byType[c.type]++;
  return {
    subscribers: s.lists.filter((l) => isAudienceList(l.name)).reduce((sum, l) => sum + l.subscribers, 0),
    sentLastYear: lastYear.length,
    lastSentAt: last,
    daysSinceLast,
    nextAllowedAt: last || lastYear.length ? new Date(next).toISOString() : null,
    drafts: s.campaigns.filter((c) => c.status === "draft"),
    scheduled,
    sent,
    flags,
    byType,
  };
}
