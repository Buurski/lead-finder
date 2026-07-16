import { NextResponse } from "next/server";
import {
  listInvoices, getSubscriptions, nextDueDate, isOverdue, invoiceTotal,
} from "@/lib/invoices.ts";

// GET /api/invoices/brief — aggregering til morgen-briefen i vaulten.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const today = new Date().toISOString().slice(0, 10);
  const [invoices, subs] = await Promise.all([listInvoices(), getSubscriptions()]);

  const dueToday = [
    ...subs
      .filter((sub) => sub.active && nextDueDate(sub, today) === today)
      .map((sub) => ({ clientName: sub.clientName, total: invoiceTotal({ lines: sub.lines, vatRate: 0 }).total })),
    ...invoices
      .filter((inv) => inv.status === "kladde" && inv.issueDate === today)
      .map((inv) => ({ clientName: inv.clientName, total: invoiceTotal(inv).total })),
  ];

  // isOverdue matcher kun "sendt" — men cron flipper til "forfalden" (og Lucas til "rykket");
  // de skal blive i listen til de er betalt.
  const overdue = invoices
    .filter((inv) => isOverdue(inv, today) || inv.status === "forfalden" || inv.status === "rykket")
    .map((inv) => {
      const daysOverdue = Math.round(
        (Date.parse(today) - Date.parse(inv.dueDate)) / 86_400_000,
      );
      return { number: inv.number, clientName: inv.clientName, total: invoiceTotal(inv).total, daysOverdue };
    });

  const upcoming = subs
    .filter((sub) => sub.active)
    .map((sub) => ({ clientName: sub.clientName, nextDue: nextDueDate(sub, today) }))
    .sort((a, b) => (a.nextDue < b.nextDue ? -1 : a.nextDue > b.nextDue ? 1 : 0));

  return NextResponse.json({ dueToday, overdue, upcoming });
}
