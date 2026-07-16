import { NextResponse } from "next/server";
import {
  getSubscriptions, listInvoices, saveInvoice, nextInvoiceNumber, addDays,
  getBusinessSettings, subscriptionsDue, isOverdue, buildStatusNote,
} from "@/lib/invoices.ts";
import { writeVaultNote } from "@/lib/vault.ts";

// GET /api/cron/invoices — daglig cron (vercel.json, 05:00 UTC):
//   (a) opretter kladder for abonnementer der er due (subscriptionsDue)
//   (b) markerer sendte fakturaer med passeret dueDate som "forfalden"
//   (c) skriver status til vaulten, så morgen-briefen kan læse den uden
//       API-adgang/creds (samme kanal som resten af vault-data)
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization") || "";
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const [subs, invoices, biz] = await Promise.all([getSubscriptions(), listInvoices(), getBusinessSettings()]);

  const due = subscriptionsDue(subs, invoices, today);
  const created: string[] = [];
  for (const sub of due) {
    // Genbrug recipient fra seneste eksisterende faktura for samme kunde, så
    // stamdata (adresse, CVR, ATT) følger med i den nye kladde.
    const previous = invoices.find((inv) => inv.clientName === sub.clientName);
    const recipient = previous?.recipient ?? { name: sub.clientName };

    const number = await nextInvoiceNumber(today);
    await saveInvoice({
      number,
      clientName: sub.clientName,
      recipient,
      issueDate: today,
      dueDate: addDays(today, 14),
      lines: sub.lines,
      vatRate: 0,
      status: "kladde",
      payerType: biz.payerType,
    });
    created.push(number);
  }

  const overdue: string[] = [];
  for (const inv of invoices) {
    if (isOverdue(inv, today)) {
      await saveInvoice({ ...inv, status: "forfalden" });
      overdue.push(inv.number);
    }
  }

  // Frisk læsning: created/overdue ovenfor har ændret state.
  const current = await listInvoices();
  const vault = await writeVaultNote(
    "data/faktura-status",
    buildStatusNote(current, subs, today),
    `faktura-status ${today} (auto)`,
  );

  return NextResponse.json({ ok: true, created, overdue, vault });
}
