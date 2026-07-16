// invoices.ts — faktura-datamodel, nummerserie og totals (Task 1).
// Rene funktioner øverst (dato-matematik med Date.UTC, aldrig lokal tid);
// store-funktioner nederst efter mønsteret i queue.ts (import { store }).

import { store } from "./store.ts";

export interface InvoiceLine {
  description: string;
  amount: number; // hele kr
}

export type InvoiceStatus = "kladde" | "sendt" | "betalt" | "forfalden" | "rykket";

export interface Invoice {
  number: string; // "001", "002" — global fortløbende serie, også store-key suffix
  clientName: string; // stabil nøgle (Sheets row-id skifter — brug navn)
  recipient: { name: string; att?: string; address?: string; cvr?: string };
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // issueDate + 14 dage
  lines: InvoiceLine[];
  vatRate: number; // 0 nu
  status: InvoiceStatus;
  sentAt?: string;
  paidAt?: string;
  remindedAt?: string;
  pdfUrl?: string;
  payerType: "privat" | "cvr";
  note?: string;
}

export interface Subscription {
  clientName: string;
  lines: InvoiceLine[];
  dayOfMonth: number;
  active: boolean;
}

export interface BusinessSettings {
  name: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  bankReg: string;
  bankAccount: string;
  cvr?: string;
  payerType: "privat" | "cvr";
}

export function invoiceTotal(
  inv: Pick<Invoice, "lines" | "vatRate">,
): { subtotal: number; vat: number; total: number } {
  const subtotal = inv.lines.reduce((sum, l) => sum + l.amount, 0);
  const vat = Math.round(subtotal * inv.vatRate);
  return { subtotal, vat, total: subtotal + vat };
}

function parseDate(date: string): { y: number; m: number; d: number } {
  const [y, m, d] = date.split("-").map(Number);
  return { y, m, d };
}

function formatDate(ms: number): string {
  const dt = new Date(ms);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: string, days: number): string {
  const { y, m, d } = parseDate(date);
  return formatDate(Date.UTC(y, m - 1, d + days));
}

// Næste dato (>= today) hvor dayOfMonth rammes. Ruller til næste måned hvis
// dagen allerede er passeret i indeværende måned.
export function nextDueDate(sub: Subscription, today: string): string {
  const { y, m, d } = parseDate(today);
  if (sub.dayOfMonth >= d) {
    return formatDate(Date.UTC(y, m - 1, sub.dayOfMonth));
  }
  return formatDate(Date.UTC(y, m, sub.dayOfMonth));
}

// Abonnementer der skal faktureres i dag: aktive, dayOfMonth nået, og ingen
// eksisterende faktura for clientName med issueDate i indeværende måned endnu.
export function subscriptionsDue(subs: Subscription[], existing: Invoice[], today: string): Subscription[] {
  const { y, m, d } = parseDate(today);
  const yearMonth = `${y}-${String(m).padStart(2, "0")}`;
  return subs.filter((sub) => {
    if (!sub.active) return false;
    if (sub.dayOfMonth > d) return false;
    const alreadyInvoiced = existing.some(
      (inv) => inv.clientName === sub.clientName && inv.issueDate.slice(0, 7) === yearMonth,
    );
    return !alreadyInvoiced;
  });
}

// Sendt faktura hvis forfaldsdato er passeret (dueDate < today).
export function isOverdue(inv: Pick<Invoice, "status" | "dueDate">, today: string): boolean {
  return inv.status === "sendt" && inv.dueDate < today;
}

const kr = (n: number) => `${n.toLocaleString("da-DK")} kr`;
const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

// Markdown frem for JSON: writeVaultNote skriver .md, og briefen læses/skrives
// af en LLM der har lettere ved prosa end ved rå JSON.
export function buildStatusNote(invoices: Invoice[], subs: Subscription[], today: string): string {
  const open = invoices.filter((i) => i.status !== "betalt");
  const overdue = open.filter((i) => i.status === "forfalden" || i.status === "rykket");
  const drafts = open.filter((i) => i.status === "kladde");
  const awaiting = open.filter((i) => i.status === "sendt");

  const line = (i: Invoice, extra: string) =>
    `- **${i.number}** · ${i.clientName} · ${kr(invoiceTotal(i).total)} · ${extra}`;

  const sections = [
    `---
title: Faktura-status (auto)
tags: [faktura, auto, data]
date: ${today}
author: lead-system (cron)
---

# Faktura-status — opdateret ${today}

> Auto-genereret af lead-systemets faktura-cron kl. 05:00 UTC. Rør den ikke manuelt —
> den overskrives. Kilde: /fakturaer i Command Center. Er datoen ovenfor gammel,
> er cronen ikke kørt — sig det i briefen frem for at gætte.`,
  ];

  sections.push(
    `## Forfaldne (${overdue.length})`,
    overdue.length
      ? overdue.map((i) => line(i, `**${daysBetween(today, i.dueDate)} dage forfalden** (frist ${i.dueDate})${i.status === "rykket" ? " · rykker sendt" : ""}`)).join("\n")
      : "Ingen. 🎉",
  );

  sections.push(
    `## Kladder klar til send (${drafts.length})`,
    drafts.length ? drafts.map((i) => line(i, `udstedt ${i.issueDate} — **ikke sendt endnu**`)).join("\n") : "Ingen.",
  );

  sections.push(
    `## Sendt, venter betaling (${awaiting.length})`,
    awaiting.length
      ? awaiting.map((i) => {
          const left = daysBetween(i.dueDate, today);
          return line(i, left >= 0 ? `frist ${i.dueDate} (om ${left} dage)` : `frist ${i.dueDate}`);
        }).join("\n")
      : "Ingen.",
  );

  const upcoming = subs
    .filter((s) => s.active)
    .map((s) => ({ s, next: nextDueDate(s, today) }))
    .sort((a, b) => (a.next < b.next ? -1 : 1));
  sections.push(
    `## Abonnementer (${upcoming.length} aktive)`,
    upcoming.length
      ? upcoming
          .map(({ s, next }) => `- **${s.clientName}** · ${kr(invoiceTotal({ lines: s.lines, vatRate: 0 }).total)}/md · næste faktura **${next}** (om ${daysBetween(next, today)} dage)`)
          .join("\n")
      : "Ingen.",
  );

  const paidThisMonth = invoices
    .filter((i) => i.status === "betalt" && i.paidAt?.slice(0, 7) === today.slice(0, 7))
    .reduce((sum, i) => sum + invoiceTotal(i).total, 0);
  sections.push(`## Betalt denne måned\n${kr(paidThisMonth)}`);

  return sections.join("\n\n") + "\n";
}

// --- Store-backed funktioner (import { store } fra "./store.ts") ---

// Lucas' format: "001", "002", ... — global fortløbende serie (matcher faktura 001 sendt 11/6).
// ponytail: lexicographic sortering knækker først ved nr. 1000 — fint for solo-brug.
export async function nextInvoiceNumber(_today: string): Promise<string> {
  const key = "invoice-counter/all";
  const current = (await store.get<number>(key)) ?? 0;
  const next = current + 1;
  await store.put(key, next); // ponytail: read-modify-write, OK for én bruger
  return String(next).padStart(3, "0");
}

export async function saveInvoice(inv: Invoice): Promise<void> {
  await store.put(`invoice/${inv.number}`, inv);
}

export async function getInvoice(number: string): Promise<Invoice | null> {
  return store.get<Invoice>(`invoice/${number}`);
}

export async function listInvoices(): Promise<Invoice[]> {
  const keys = await store.list("invoice/");
  const invoices: Invoice[] = [];
  for (const key of keys) {
    const inv = await store.get<Invoice>(key);
    if (inv) invoices.push(inv);
  }
  invoices.sort((a, b) => (a.number < b.number ? 1 : a.number > b.number ? -1 : 0)); // fast 3-cifret padding sorterer korrekt lexicographic (til nr. 999)
  return invoices;
}

export async function listInvoicesFor(clientName: string): Promise<Invoice[]> {
  const all = await listInvoices();
  return all.filter((inv) => inv.clientName === clientName);
}

export async function getSubscriptions(): Promise<Subscription[]> {
  const subs = await store.get<Subscription[]>("invoice-subscriptions");
  return Array.isArray(subs) ? subs : [];
}

export async function saveSubscriptions(subs: Subscription[]): Promise<void> {
  await store.put("invoice-subscriptions", subs);
}

const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  name: "Lucas Buur",
  address: "Flaskagervej 5",
  city: "7430 Ikast",
  phone: "+45 23 24 24 82",
  email: "buur.aigro@gmail.com",
  bankReg: "2570",
  bankAccount: "5498102702",
  payerType: "privat",
};

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const settings = await store.get<BusinessSettings>("settings/business");
  return settings ?? DEFAULT_BUSINESS_SETTINGS;
}
