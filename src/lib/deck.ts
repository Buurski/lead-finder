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

export interface DeckNumbers {
  newLeads: number;
  withEmail: number;
  repliesToday: number;
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
    // A reply landed — highest urgency.
    if (l.emailStatus === "replied") {
      items.push({
        leadId: l.id,
        name: l.name,
        branch: l.branch,
        kind: "reply",
        why: "Svar modtaget — vil have et personligt svar",
      });
      continue;
    }
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
    // Marked interested but no reply yet — warm, needs a nudge.
    if (l.status === "interested") {
      items.push({
        leadId: l.id,
        name: l.name,
        branch: l.branch,
        kind: "interested",
        why: "Interesseret — følg op mens det er varmt",
      });
    }
  }

  // Replies first, then overdue callbacks, then warm leads. Cap for calm.
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
    if (l.emailStatus === "replied") bucket.replies += 1;
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
  return {
    newLeads: leads.filter((l) => l.status === "new").length,
    withEmail: leads.filter((l) => l.email).length,
    repliesToday: leads.filter((l) => l.emailStatus === "replied").length,
    wonThisWeek: leads.filter((l) => l.status === "client" && isWithinDays(l.lastUpdated, 7)).length,
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
  const needsYou = buildNeedsYou(leads);

  return {
    generatedAt: new Date().toISOString(),
    ok,
    numbers: buildNumbers(leads),
    needsYou,
    queue: queuePeek,
    pipeline,
    pulse: buildPulse(clients),
    dailySent: buildDailySent(leads),
    revenue: buildRevenue(clients),
    buckets: {
      indtjening: clients.length > 0,
      kunder: clients.length > 0 || leads.some((l) => l.status === "client"),
      kalender: leads.some((l) => l.callbackDate),
      kommunikation: needsYou.length > 0 || queuePeek.count > 0,
      opgaver: queuePeek.pending > 0 || needsYou.length > 0,
      moeder: leads.some((l) => l.callbackDate),
      viden: true, // vault/Build Guide always present
    },
  };
}
