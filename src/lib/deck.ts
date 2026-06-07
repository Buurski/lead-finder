// deck.ts — the read model behind Mission Control (Fase A).
//
// One pure-ish builder that composes the "what needs me today" picture from the
// data layers that already exist: Google Sheets (leads + clients) and the local
// approval queue. It NEVER sends or mutates anything — read-only by design.
//
// Offline-safe: every Sheets read is wrapped, so with no creds / no network the
// summary degrades to whatever the local queue knows, and the UI renders calm
// empty states instead of crashing. That keeps Mission Control instant: it shows
// a stale-but-real value first and never blocks on the network.

import { getLeads, getClients } from "./sheets.ts";
import type { Lead, Client } from "./sheets.ts";
import { readQueue } from "./queue.ts";
import type { QueueDraft } from "./queue.ts";
import { loadDigest, summarizeDigest } from "./inbox-digest.ts";
import { getSuppressed, isSuppressed } from "./today-overrides.ts";
import { isUnworkedStatus } from "./leads/pick-filter.ts";
import { isContactable } from "./leads/contactable.ts";

export interface DeckNumbers {
  newLeads: number;
  // Leads we can actually approach now: un-worked status AND never contacted
  // (isContactable). This is the meaningful "klar at kontakte" number — matches
  // the /lead-gen feed's semantics, unlike raw newLeads (status==="new" only).
  contactable: number;
  sentToday: number;     // mails actually sent today (real — from emailSentAt date)
  repliesPending: number; // leads with a reply awaiting follow-up (Sheets has no
                          // reply timestamp, so this is NOT "today" — labelled honestly)
  wonThisWeek: number;
}

export interface Revenue {
  monthlyDKK: number; // sum of client monthly fees
  setupDKK: number;   // sum of client setup fees
  clientCount: number;     // all rows in the Clients tab (CRM total)
  payingClientCount: number; // only rows with a monthly fee > 0 (real paying)
  goalMonthlyDKK: number; // 90-day target (from roadmap / priser)
}

export interface NeedsYouItem {
  leadId: string;
  name: string;
  branch: string;
  kind: "reply" | "callback" | "interested";
  why: string;
}

export interface QueuePeek {
  count: number;
  pending: number;
  top: Array<Pick<QueueDraft, "id" | "name" | "branch" | "city" | "subject" | "status">>;
}

export interface PipelineStatus {
  totalDrafts: number;
  pending: number;
  approved: number;
  rejected: number;
  lastRunAt: string | null; // ISO of newest draft, our best proxy for "last engine run"
  source: "queue";
}

export interface PulseClient {
  id: string;
  name: string;
  branch: string;
  reason: string;
  stage: "demo" | "in progress" | "live" | string;
}

export interface DailySent {
  date: string; // YYYY-MM-DD
  count: number; // mails sent that day
  replies: number; // replies attributed to that day (by send date — no reply ts)
}

export interface DeckSummary {
  generatedAt: string;
  ok: boolean; // false when Sheets was unreachable (queue-only view)
  numbers: DeckNumbers;
  needsYou: NeedsYouItem[];
  queue: QueuePeek;
  pipeline: PipelineStatus;
  pulse: PulseClient[];
  dailySent: DailySent[]; // last 14 days, oldest -> newest (for the usage sparkline)
  revenue: Revenue;
  // 7-bucket coverage tags so Mission Control can prove nothing is missing.
  buckets: Record<
    "indtjening" | "kunder" | "kalender" | "kommunikation" | "opgaver" | "moeder" | "viden",
    boolean
  >;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Sheets status/emailStatus values arrive with stray whitespace/casing, so every
// equality comparison here normalizes first — otherwise a "replied " value
// silently hides a real reply from Mission Control (the wrong-number class Lucas
// flagged). Whitespace+case only; it never reclassifies a genuinely different
// status.
const norm = (s: string | undefined): string => (s ?? "").trim().toLowerCase();

function isWithinDays(iso: string, days: number): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 86_400_000;
}

export function buildNeedsYou(leads: Lead[]): NeedsYouItem[] {
  const today = todayISO();
  const items: NeedsYouItem[] = [];

  for (const l of leads) {
    // NB: replies are deliberately NOT listed per-lead here anymore — they
    // flooded Morning Coffee with the same row 15×. They're surfaced as ONE
    // consolidated pointer ("X svar at besvare → /replies") in the UI instead.
    // This list is only the genuinely individual, date-specific actions.
    // Callback due today (column U).
    if (l.callbackDate && l.callbackDate.slice(0, 10) <= today) {
      items.push({
        leadId: l.id,
        name: l.name,
        branch: l.branch,
        kind: "callback",
        why: l.callbackDate.slice(0, 10) < today ? "Opkald er forsinket" : "Ring tilbage i dag",
      });
      continue;
    }
    // NB: "interested" leads (a draft was approved + sent, now waiting) are
    // deliberately NOT listed here — they cluttered Dagens opgaver with
    // "følg op mens det er varmt" for every sent lead. They resurface only when
    // they REPLY (via the consolidated "X svar at besvare → /replies" pointer).
  }

  // Overdue callbacks first, then due. Cap for calm.
  const rank = { reply: 0, callback: 1, interested: 2 } as const;
  items.sort((a, b) => rank[a.kind] - rank[b.kind]);
  return items.slice(0, 8);
}

export function buildQueuePeek(queue: QueueDraft[]): QueuePeek {
  const pending = queue.filter((d) => d.status === "pending");
  const top = pending
    .slice()
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
    .slice(0, 3)
    .map((d) => ({ id: d.id, name: d.name, branch: d.branch, city: d.city, subject: d.subject, status: d.status }));
  return { count: queue.length, pending: pending.length, top };
}

export function buildPipeline(queue: QueueDraft[]): PipelineStatus {
  let lastRunAt: string | null = null;
  for (const d of queue) {
    if (d.createdAt && (!lastRunAt || d.createdAt > lastRunAt)) lastRunAt = d.createdAt;
  }
  return {
    totalDrafts: queue.length,
    pending: queue.filter((d) => d.status === "pending").length,
    approved: queue.filter((d) => d.status === "approved" || d.status === "edited").length,
    rejected: queue.filter((d) => d.status === "rejected").length,
    lastRunAt,
    source: "queue",
  };
}

export function buildPulse(clients: Client[]): PulseClient[] {
  const out: PulseClient[] = [];
  for (const c of clients) {
    if (c.websiteStatus !== "live") {
      out.push({
        id: c.id,
        name: c.name,
        branch: c.branch,
        stage: c.websiteStatus,
        reason: c.websiteStatus === "demo" ? "Demo sendt — venter på grønt lys" : "Under bygning — hold fremdrift",
      });
    } else if (!c.briefFilled) {
      out.push({ id: c.id, name: c.name, branch: c.branch, stage: c.websiteStatus, reason: "Live, men brief mangler udfyldning" });
    }
  }
  return out.slice(0, 6);
}

// Mails-per-day for the last `days` days, with replies attributed to the send
// date (Sheets has no reply timestamp). Oldest -> newest, gaps filled with zeros.
export function buildDailySent(leads: Lead[], days = 14): DailySent[] {
  const byDate = new Map<string, { count: number; replies: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    byDate.set(d, { count: 0, replies: 0 });
  }
  for (const l of leads) {
    if (!l.emailSentAt) continue;
    const d = l.emailSentAt.slice(0, 10);
    const bucket = byDate.get(d);
    if (!bucket) continue; // outside the window
    bucket.count += 1;
    if (norm(l.emailStatus) === "replied") bucket.replies += 1;
  }
  return [...byDate.entries()].map(([date, v]) => ({ date, count: v.count, replies: v.replies }));
}

// Real revenue from the confirmed clients (Clients tab). Goal default 10.000 kr/md
// (90-day roadmap) unless an override is passed from the vault priser/roadmap.
export function buildRevenue(clients: Client[], goalMonthlyDKK = 10000): Revenue {
  const num = (s: string) => {
    const n = parseFloat(String(s ?? "").replace(/[^\d.,]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  };
  return {
    monthlyDKK: clients.reduce((a, c) => a + num(c.monthlyFee), 0),
    setupDKK: clients.reduce((a, c) => a + num(c.setupFee), 0),
    clientCount: clients.length,
    payingClientCount: clients.filter((c) => num(c.monthlyFee) > 0).length,
    goalMonthlyDKK,
  };
}

export function buildNumbers(leads: Lead[]): DeckNumbers {
  const today = todayISO();
  return {
    newLeads: leads.filter((l) => norm(l.status) === "new").length,
    contactable: leads.filter((l) => isUnworkedStatus(l.status) && isContactable(l)).length,
    // Real "today": count mails whose emailSentAt falls on today's date. (Was
    // "emails fundet" = all-time withEmail ~937, which is stale old-batch data.)
    sentToday: leads.filter((l) => (l.emailSentAt || "").slice(0, 10) === today).length,
    // Total replies awaiting a follow-up — NOT "today" (no reply ts in Sheets).
    repliesPending: leads.filter((l) => norm(l.emailStatus) === "replied").length,
    wonThisWeek: leads.filter((l) => norm(l.status) === "client" && isWithinDays(l.lastUpdated, 7)).length,
  };
}

export async function buildDeckSummary(): Promise<DeckSummary> {
  const queue = await readQueue();

  let leads: Lead[] = [];
  let clients: Client[] = [];
  let ok = true;
  try {
    leads = await getLeads();
  } catch {
    ok = false;
  }
  try {
    clients = await getClients();
  } catch {
    ok = false;
  }

  const queuePeek = buildQueuePeek(queue);
  const pipeline = buildPipeline(queue);
  let needsYou = buildNeedsYou(leads);
  let pulse = buildPulse(clients);

  // Chat-driven "fjern X fra i dag" overrides: hide suppressed businesses from the
  // today lists (without touching layout).
  try {
    const suppressed = await getSuppressed();
    if (suppressed.size > 0) {
      needsYou = needsYou.filter((i) => !isSuppressed(suppressed, i.name));
      pulse = pulse.filter((c) => !isSuppressed(suppressed, c.name));
    }
  } catch {
    /* no overrides */
  }

  const numbers = buildNumbers(leads);
  // Prefer the inbox-triage digest's "needs reply" count when a digest exists —
  // it reflects what actually needs answering (incl. non-lead mail), not just the
  // Sheets "replied" flag. Falls back to the Sheets count when no digest yet.
  try {
    const dg = summarizeDigest(await loadDigest());
    if (dg.total > 0) numbers.repliesPending = dg.needsReply;
  } catch {
    /* keep the Sheets-derived count */
  }

  return {
    generatedAt: new Date().toISOString(),
    ok,
    numbers,
    needsYou,
    queue: queuePeek,
    pipeline,
    pulse,
    dailySent: buildDailySent(leads),
    revenue: buildRevenue(clients),
    buckets: {
      indtjening: clients.length > 0,
      kunder: clients.length > 0 || leads.some((l) => norm(l.status) === "client"),
      kalender: leads.some((l) => l.callbackDate),
      kommunikation: needsYou.length > 0 || queuePeek.count > 0,
      opgaver: queuePeek.pending > 0 || needsYou.length > 0,
      moeder: leads.some((l) => l.callbackDate),
      viden: true, // vault/Build Guide always present
    },
  };
}
